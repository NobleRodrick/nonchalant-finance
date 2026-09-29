"use client";

/**
 * Recording from a form: the operation is saved on this device first (it cannot be lost), then
 * sent. With a connection the form waits a few seconds for the server's answer (real reference
 * number, or the reason it was refused); without one it returns at once and the record is shown
 * as "waiting to be sent".
 */
import { toast } from "sonner";
import { formatTimeInZone, toDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { STATUS } from "./status";
import { addOperation, nextSeq, putBlob, removeOperation } from "./outbox";
import { encodeLocalIds, newOperationKey } from "./local-ids";
import { isOnline, subscribeConnectivity } from "./connectivity";
import { syncEngine } from "./sync-engine";

/**
 * How long a form waits for the server while connected (the sending timeout): the button shows it
 * is working, as before offline support. Without a connection, or as soon as the connection is
 * found down, it does not wait at all.
 */
const WAIT_MS = 30000;

/** The server's answer for `key`, or null as soon as the connection is found to be down (or after `ms`). */
function waitForOutcome(key, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (op) => {
      if (done) return;
      done = true;
      unsubscribe();
      resolve(op);
    };
    const unsubscribe = subscribeConnectivity((online) => {
      if (!online) finish(null);
    });
    syncEngine.waitFor(key, ms).then(finish);
  });
}

/**
 * spec: { userId, timeZone, by, kind, departmentId, input, meta, label, dateKey, files }
 * Returns { status: "applied", result, op } | { status: "queued", op } | { status: "rejected", error, code }.
 */
export async function record(spec) {
  const { userId, timeZone = DEFAULT_TIMEZONE, by = null, kind, departmentId, input = {}, meta = {}, label, dateKey, files = [], waitMs = WAIT_MS } = spec;
  if (!userId) throw new Error("Not signed in.");
  const now = new Date();
  const key = newOperationKey();
  const { value, deps } = encodeLocalIds(input);
  const attachments = [];
  for (const file of files || []) {
    const localId = `${key}-${attachments.length}`;
    await putBlob(localId, file);
    attachments.push({ localId, name: file.name, size: file.size, type: file.type });
  }
  const op = {
    key,
    seq: nextSeq(),
    userId,
    departmentId,
    kind,
    input: value,
    deps,
    occurredAt: now.toISOString(),
    dateKey: dateKey || toDateKey(now, timeZone),
    label: label || kind,
    meta: { ...meta, time: formatTimeInZone(now, timeZone), by },
    attachments,
    status: STATUS.PENDING,
    attempts: 0,
    createdAt: now.getTime(),
  };
  await addOperation(op);
  syncEngine?.flush();
  if (!isOnline() || !syncEngine || !waitMs) return { status: "queued", op };
  const done = await waitForOutcome(key, waitMs);
  if (done?.status === STATUS.APPLIED) return { status: "applied", result: done.result || {}, op: done };
  if (done?.status === STATUS.REJECTED) {
    // Refused while the person is looking at the form: show why and forget it (nothing was recorded).
    await removeOperation(key).catch(() => {});
    return { status: "rejected", error: done.error || "This could not be recorded.", code: done.code };
  }
  return { status: "queued", op: done || op };
}

/**
 * record() with the usual messages. `success(result)` builds the confirmation (real reference);
 * returns the outcome, or null when it was refused (the error is shown).
 */
export async function recordWithToast(spec, { success } = {}) {
  let out;
  try {
    out = await record(spec);
  } catch (error) {
    toast.error(`Could not save on this computer: ${error?.message || error}`);
    return null;
  }
  if (out.status === "applied") {
    const msg = typeof success === "function" ? success(out.result) : success;
    if (msg) toast.success(msg);
    return out;
  }
  if (out.status === "queued") {
    toast.info(
      isOnline()
        ? `${spec.label || "Record"} saved. Sending it to the server…`
        : `${spec.label || "Record"} saved on this computer. It will be sent as soon as the connection is back.`
    );
    return out;
  }
  toast.error(out.error);
  return null;
}
