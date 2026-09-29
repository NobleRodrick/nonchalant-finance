"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "./outbox";
import { syncEngine } from "./sync-engine";
import { describe, opsInEffect } from "./overlay";
import { recordWithToast } from "./record";
import { STATUS } from "./status";

/** Who is recording on this device and in which time zone (set by the app shell). */
export const OfflineContext = createContext({ userId: null, userName: null, timeZone: undefined, enabled: false });

export function useOfflineContext() {
  return useContext(OfflineContext);
}

/** Pages saved on this computer for offline use: { enabled, total, ready, missing, saving, saveNow }. */
export const OfflinePagesContext = createContext({ enabled: false, total: 0, ready: 0, missing: [], saving: false, saveNow: () => {} });

export function useOfflinePages() {
  return useContext(OfflinePagesContext);
}

/** Every operation of this device for the signed-in person (live). */
export function useOutboxOps() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const SERVER_STATE = { syncing: false, online: true, authRequired: false, lastSyncAt: null, lastError: null, nextRetryAt: null };
const noop = () => () => {};

/** Connection and sending state (live). */
export function useSyncState() {
  return useSyncExternalStore(syncEngine ? syncEngine.subscribe : noop, syncEngine ? syncEngine.getState : () => SERVER_STATE, () => SERVER_STATE);
}

/**
 * Effects of this device's records that the page's figures (rendered at `renderedAt`, server
 * clock) do not include yet — see lib/offline/overlay.
 */
export function usePendingEffects(departmentId, renderedAt) {
  const ops = useOutboxOps();
  return useMemo(() => opsInEffect(ops, { departmentId, renderedAt }).map(describe), [ops, departmentId, renderedAt]);
}

/** Counts for the status indicator. */
export function useOutboxCounts() {
  const ops = useOutboxOps();
  return useMemo(() => {
    let waiting = 0;
    let attention = 0;
    for (const op of ops) {
      if (op.status === STATUS.PENDING || op.status === STATUS.SENDING) waiting += 1;
      else if (op.status === STATUS.REJECTED) attention += 1;
    }
    return { waiting, attention };
  }, [ops]);
}

/**
 * Returns record(spec, messages): saves an operation on this device and sends it (see
 * lib/offline/record). spec: { kind, departmentId, input, meta, label, dateKey, files }.
 */
export function useRecorder() {
  const ctx = useContext(OfflineContext);
  return useCallback((spec, messages) => recordWithToast({ ...spec, userId: ctx.userId, timeZone: ctx.timeZone, by: ctx.userName }, messages), [ctx]);
}
