/**
 * The sync engine sends the outbox to the server (POST /api/sync), in recording order, and
 * records each outcome. It runs in the page (one tab at a time, thanks to a Web Lock) and wakes up:
 *   - as soon as something is recorded,
 *   - when the connection comes back (browser "online" event, confirmed by /api/health),
 *   - when the tab becomes visible again,
 *   - every 20 seconds while something is waiting (with growing pauses after failures).
 *
 * Guarantees (together with lib/operations/execute on the server):
 *   - nothing is lost: an operation stays in the outbox until the server answered for it;
 *   - nothing is recorded twice: every operation has a key; resending returns the first result;
 *   - order is kept: an operation is sent only after every earlier one was answered;
 *   - a refused operation (a rule said no) is shown as "needs attention" with the reason, and
 *     operations that depend on it are held back with it.
 */
import { STATUS, getSnapshot, getOperation, subscribe, updateOperation, getBlob, deleteBlob, outboxUserId } from "./outbox";
import { checkConnectivity, isNetworkError, isOnline, reportNetworkFailure, reportNetworkSuccess, startConnectivity, subscribeConnectivity } from "./connectivity";

const BATCH_SIZE = 20;
const SEND_TIMEOUT_MS = 30000;
const TICK_MS = 20000;
const BACKOFF_MS = [2000, 4000, 8000, 15000, 30000, 60000];
const TERMINAL = [STATUS.APPLIED, STATUS.REJECTED];

function withTimeout(ms) {
  if (typeof AbortController === "undefined") return { signal: undefined, clear: () => {} };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(t) };
}

class SyncEngine {
  constructor() {
    this.userId = null;
    this.upload = null;
    this.onApplied = null;
    this.listeners = new Set();
    this.waiters = new Map();
    this.failures = 0;
    this.retryTimer = null;
    this.tickTimer = null;
    this.flushing = null;
    this.again = false;
    this.state = { syncing: false, online: isOnline(), authRequired: false, lastSyncAt: null, lastError: null, nextRetryAt: null };
    this.unsubscribe = [];
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  /**
   * Starts the engine for the signed-in person.
   * `upload(file, departmentId)` sends a proof file and returns its id (or throws);
   * `onApplied(ops)` is told when operations reached the server (refresh the page, warm caches).
   */
  start({ userId, upload, onApplied }) {
    this.upload = upload || this.upload;
    this.onApplied = onApplied || this.onApplied;
    if (this.userId === userId && this.tickTimer) return;
    this.stop();
    this.userId = userId;
    startConnectivity();
    this.unsubscribe.push(subscribe(() => this.checkWaiters()));
    this.unsubscribe.push(
      subscribeConnectivity((online) => {
        this.setState({ online });
        if (online) this.flush();
      })
    );
    if (typeof document !== "undefined") {
      const onVisible = () => document.visibilityState === "visible" && this.flush();
      document.addEventListener("visibilitychange", onVisible);
      this.unsubscribe.push(() => document.removeEventListener("visibilitychange", onVisible));
    }
    this.tickTimer = setInterval(() => {
      if (this.pending().length && !this.retryTimer) this.flush();
    }, TICK_MS);
    this.recoverInterrupted().then(() => this.flush());
  }

  stop() {
    for (const u of this.unsubscribe.splice(0)) u();
    clearInterval(this.tickTimer);
    clearTimeout(this.retryTimer);
    this.tickTimer = null;
    this.retryTimer = null;
    this.userId = null;
  }

  /** Operations left "sending" by a tab that closed mid-way are sent again (safe: idempotent). */
  async recoverInterrupted() {
    const stuck = getSnapshot().filter((op) => op.userId === this.userId && op.status === STATUS.SENDING);
    for (const op of stuck) await updateOperation(op.key, { status: STATUS.PENDING });
  }

  // ─── state for the UI ─────────────────────────────────────────────────────

  getState = () => this.state;

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setState(patch) {
    const next = { ...this.state, ...patch };
    if (Object.keys(patch).every((k) => this.state[k] === next[k])) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  pending() {
    return getSnapshot().filter((op) => op.userId === this.userId && op.status === STATUS.PENDING);
  }

  // ─── waiting for one operation (the form that recorded it) ───────────────

  /** Resolves with the operation once the server answered for it, or after `ms` (still waiting). */
  waitFor(key, ms) {
    const op = getOperation(key);
    if (op && TERMINAL.includes(op.status)) return Promise.resolve(op);
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        const list = (this.waiters.get(key) || []).filter((w) => w !== done);
        if (list.length) this.waiters.set(key, list);
        else this.waiters.delete(key);
        resolve(value);
      };
      const timer = setTimeout(() => done(getOperation(key)), ms);
      this.waiters.set(key, [...(this.waiters.get(key) || []), done]);
    });
  }

  checkWaiters() {
    for (const [key, list] of this.waiters) {
      const op = getOperation(key);
      if (!op || TERMINAL.includes(op.status)) for (const w of [...list]) w(op);
    }
  }

  // ─── sending ──────────────────────────────────────────────────────────────

  /** Sends what is waiting (now). Concurrent calls share one run. */
  flush() {
    if (!this.userId || this.userId !== outboxUserId()) return Promise.resolve();
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.again = false;
          await this.withLock(() => this.drain());
        } while (this.again);
      } catch (error) {
        this.setState({ lastError: error?.message || String(error) });
        this.scheduleRetry();
      } finally {
        this.flushing = null;
        this.setState({ syncing: false });
      }
    })();
    return this.flushing;
  }

  withLock(fn) {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      // Another tab is sending: it will do it (and every tab sees the outcome).
      return navigator.locks.request("sf-sync", { ifAvailable: true }, (lock) => (lock ? fn() : null));
    }
    return fn();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const base = BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length - 1)];
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.failures += 1;
    this.setState({ nextRetryAt: Date.now() + delay });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flush();
    }, delay);
  }

  succeeded() {
    this.failures = 0;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.setState({ nextRetryAt: null, lastError: null, authRequired: false, lastSyncAt: Date.now() });
  }

  /** Holds back operations that refer to a refused one. */
  async blockDependents() {
    for (const op of this.pending()) {
      const failed = (op.deps || []).map((k) => getOperation(k)).find((d) => d && d.status === STATUS.REJECTED);
      if (failed) {
        await updateOperation(op.key, {
          status: STATUS.REJECTED,
          code: "DEPENDENCY",
          error: `Not sent: it depends on "${failed.label || "an earlier record"}", which needs attention.`,
        });
      }
    }
  }

  /** Uploads the proof files of an operation; returns the input to send. */
  async uploadFiles(op) {
    const files = (op.attachments || []).filter((a) => !a.attachmentId && !a.dropped);
    if (!files.length || !this.upload) return op;
    let next = op;
    for (const file of files) {
      const stored = await getBlob(file.localId);
      if (!stored?.blob) {
        next = await updateOperation(op.key, (o) => ({ attachments: o.attachments.map((a) => (a.localId === file.localId ? { ...a, dropped: true, warning: "The file was no longer on this device." } : a)) }));
        continue;
      }
      try {
        const fileObj = stored.blob instanceof File ? stored.blob : new File([stored.blob], stored.name || "proof", { type: stored.type });
        const attachmentId = await this.upload(fileObj, op.departmentId);
        await deleteBlob(file.localId).catch(() => {});
        next = await updateOperation(op.key, (o) => ({
          attachments: o.attachments.map((a) => (a.localId === file.localId ? { ...a, attachmentId } : a)),
          input: { ...o.input, attachmentIds: [...(o.input.attachmentIds || []), attachmentId] },
        }));
      } catch (error) {
        if (isNetworkError(error) || error?.authRequired) throw error;
        // The file itself was refused (type, size): the record is still sent, without it.
        next = await updateOperation(op.key, (o) => ({ attachments: o.attachments.map((a) => (a.localId === file.localId ? { ...a, dropped: true, warning: error?.message || "The file could not be sent." } : a)) }));
      }
    }
    return next;
  }

  async drain() {
    this.setState({ syncing: true });
    for (;;) {
      await this.blockDependents();
      const ready = this.pending();
      if (!ready.length) {
        this.succeeded();
        return;
      }
      if (!isOnline() && !(await checkConnectivity())) {
        this.setState({ online: false });
        this.scheduleRetry();
        return;
      }
      let batch = ready.slice(0, BATCH_SIZE);
      try {
        for (let i = 0; i < batch.length; i += 1) batch[i] = await this.uploadFiles(batch[i]);
      } catch (error) {
        if (error?.authRequired) {
          this.setState({ authRequired: true, lastError: "Sign in again to send what was recorded on this computer." });
          return;
        }
        if (!error?.retryable) reportNetworkFailure(); // no answer at all (a server error is retried as well)
        this.scheduleRetry();
        return;
      }
      batch = batch.filter(Boolean);
      for (const op of batch) await updateOperation(op.key, { status: STATUS.SENDING });

      const t = withTimeout(SEND_TIMEOUT_MS);
      let response;
      try {
        response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          signal: t.signal,
          body: JSON.stringify({ ops: batch.map((op) => ({ key: op.key, kind: op.kind, input: op.input, occurredAt: op.occurredAt })) }),
        });
      } catch (error) {
        t.clear();
        for (const op of batch) await updateOperation(op.key, { status: STATUS.PENDING });
        if (isNetworkError(error)) reportNetworkFailure();
        this.setState({ lastError: "No connection to the server." });
        this.scheduleRetry();
        return;
      }
      t.clear();

      if (response.status === 401) {
        for (const op of batch) await updateOperation(op.key, { status: STATUS.PENDING });
        this.setState({ authRequired: true, lastError: "Sign in again to send what was recorded on this computer." });
        return; // resumes after signing in
      }
      if (!response.ok) {
        for (const op of batch) await updateOperation(op.key, { status: STATUS.PENDING });
        reportNetworkSuccess();
        this.setState({ lastError: `The server could not take the records right now (${response.status}).` });
        this.scheduleRetry();
        return;
      }
      reportNetworkSuccess();
      const data = await response.json().catch(() => ({ results: [] }));
      const byKey = new Map((data.results || []).map((r) => [r.key, r]));
      const applied = [];
      let retryLater = false;
      for (const op of batch) {
        const r = byKey.get(op.key);
        if (!r || r.status === "skipped") {
          await updateOperation(op.key, { status: STATUS.PENDING });
          retryLater = true;
        } else if (r.status === "applied" || r.status === "duplicate") {
          applied.push(await updateOperation(op.key, { status: STATUS.APPLIED, result: r.result, appliedAt: r.appliedAt, syncedAt: Date.now(), error: null, code: null }));
        } else if (r.status === "rejected") {
          await updateOperation(op.key, { status: STATUS.REJECTED, error: r.error, code: r.code });
        } else {
          await updateOperation(op.key, (o) => ({ status: STATUS.PENDING, attempts: (o.attempts || 0) + 1, error: r.error, code: "RETRY" }));
          retryLater = true;
        }
      }
      if (applied.length && this.onApplied) {
        try {
          this.onApplied(applied.filter(Boolean));
        } catch {
          // a UI callback must never stop sending
        }
      }
      if (retryLater) {
        this.setState({ lastError: "Some records could not be saved yet. Trying again." });
        this.scheduleRetry();
        return;
      }
      this.succeeded();
    }
  }
}

/** One engine per browser tab. */
export const syncEngine = typeof window === "undefined" ? null : (window.__sfSyncEngine ||= new SyncEngine());
export { SyncEngine };
