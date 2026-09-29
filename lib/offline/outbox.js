/**
 * The outbox: every write a head makes is saved here first (on this device), then sent by the
 * sync engine. It is the single source of what is "waiting to be sent" and of what "needs
 * attention". Kept in IndexedDB (survives closing the browser) and mirrored in memory for the UI;
 * tabs of the same browser keep each other informed through a BroadcastChannel.
 *
 * An operation:
 *   key          unique id (also the record's idempotency key on the server)
 *   seq          order of recording (operations are sent in this order)
 *   userId       who recorded it (only sent while that person is signed in)
 *   departmentId, kind, input (sent), deps (keys of operations it refers to)
 *   occurredAt   when it was done (ISO), dateKey (business day shown on this device)
 *   label, meta  what to show on screen until the server's figures include it
 *   attachments  proof files kept in the blobs store until sent
 *   status       pending → sending → applied | rejected (needs attention)
 *   result, appliedAt (server clock, ms), error, code, attempts
 */
import { storage, STORES } from "./idb";
import { STATUS } from "./status";

export { STATUS };
/** Applied operations are kept this long (receipts, "sent" list), then removed. */
const KEEP_APPLIED_MS = 2 * 24 * 3600 * 1000;

let current = new Map();
let snapshot = [];
let userId = null;
const listeners = new Set();
let channel = null;
let counter = 0;

function sortedSnapshot() {
  return [...current.values()].sort((a, b) => a.seq - b.seq);
}

function emit({ broadcast = true } = {}) {
  snapshot = sortedSnapshot();
  for (const l of listeners) l();
  if (broadcast && channel) {
    try {
      channel.postMessage({ type: "changed" });
    } catch {
      // closed channel: ignore
    }
  }
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("sf-outbox");
  channel.onmessage = (e) => {
    if (e.data?.type === "changed" && userId) reload().catch(() => {});
  };
}

async function reload() {
  const rows = userId ? await storage().byIndex(STORES.ops, "byUser", userId) : [];
  current = new Map(rows.map((r) => [r.key, r]));
  emit({ broadcast: false });
}

/** Loads the signed-in person's operations (call once when the app starts). */
export async function loadOutbox(forUserId) {
  userId = forUserId || null;
  ensureChannel();
  await reload();
  await prune();
}

export function outboxUserId() {
  return userId;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current operations, oldest first (stable array between changes, for useSyncExternalStore). */
export function getSnapshot() {
  return snapshot;
}

const EMPTY = [];
export function getServerSnapshot() {
  return EMPTY;
}

export function getOperation(key) {
  return current.get(key) || null;
}

/** Next sequence number (recording order, unique within the device). */
export function nextSeq() {
  counter = (counter + 1) % 1000;
  return Date.now() * 1000 + counter;
}

/** Saves a new operation (durably) before anything is shown as recorded. */
export async function addOperation(op) {
  await storage().put(STORES.ops, op);
  current.set(op.key, op);
  emit();
  return op;
}

/** Updates an operation from its stored copy (another tab may have changed it). */
export async function updateOperation(key, patch) {
  const stored = (await storage().get(STORES.ops, key)) || current.get(key);
  if (!stored) return null;
  const next = { ...stored, ...(typeof patch === "function" ? patch(stored) : patch) };
  await storage().put(STORES.ops, next);
  current.set(key, next);
  emit();
  return next;
}

/** Removes an operation and its files. */
export async function removeOperation(key) {
  const op = current.get(key) || (await storage().get(STORES.ops, key));
  for (const a of op?.attachments || []) await storage().del(STORES.blobs, a.localId).catch(() => {});
  await storage().del(STORES.ops, key);
  current.delete(key);
  emit();
}

async function prune() {
  const now = Date.now();
  const old = snapshot.filter((op) => op.status === STATUS.APPLIED && now - (op.syncedAt || op.createdAt) > KEEP_APPLIED_MS);
  for (const op of old) await removeOperation(op.key);
}

// ─── Proof files kept until sent ────────────────────────────────────────────

export async function putBlob(id, file) {
  await storage().put(STORES.blobs, { id, blob: file, name: file.name, type: file.type, size: file.size });
}

export async function getBlob(id) {
  return storage().get(STORES.blobs, id);
}

export async function deleteBlob(id) {
  await storage().del(STORES.blobs, id);
}

// ─── Small device values ────────────────────────────────────────────────────

export async function getMeta(k) {
  return (await storage().get(STORES.meta, k))?.v ?? null;
}

export async function setMeta(k, v) {
  await storage().put(STORES.meta, { k, v });
}

/** Operations of another person saved on this device (they are sent when that person signs in). */
export async function countOthers(forUserId) {
  const all = await storage().all(STORES.ops);
  return all.filter((op) => op.userId !== forUserId && op.status !== STATUS.APPLIED).length;
}

/** Forgets everything of this device (sign-out with nothing waiting). */
export async function clearDevice() {
  await storage().clear(STORES.ops);
  await storage().clear(STORES.blobs);
  current = new Map();
  emit();
}
