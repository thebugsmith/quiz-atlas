"use client";

import type { ResponseValue } from "./manifest";

/**
 * A small IndexedDB outbox for exam edits that could not reach the server.
 *
 * It holds one row per attempt item with the intent, the revision it was based on and the
 * mutation key generated when the player made the edit. Two rules matter:
 *
 *   * rows are scoped by owner, so switching identity never uploads one person's pending
 *     answer into another account (rows for other owners are dropped on load);
 *   * the database stays authoritative. A queued row is only applied when its base
 *     revision still matches what the server has; otherwise it is surfaced as a conflict.
 */
const DB_NAME = "quiz-atlas-exam";
const STORE = "outbox";

export type OutboxEntry = {
  key: string;
  owner: string;
  attemptId: string;
  itemId: string;
  value: ResponseValue | null;
  baseRevision: number;
  mutationKey: string;
  queuedAt: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const outboxKey = (attemptId: string, itemId: string) => `${attemptId}:${itemId}`;

export async function queueEdit(entry: OutboxEntry): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore("readwrite", (store) => store.put(entry));
}

export async function dropEdit(attemptId: string, itemId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore("readwrite", (store) => store.delete(outboxKey(attemptId, itemId)));
}

export async function pendingFor(owner: string, attemptId: string): Promise<OutboxEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await withStore<OutboxEntry[]>("readonly", (store) => store.getAll());
  return all.filter((entry) => entry.owner === owner && entry.attemptId === attemptId);
}

/** Drop every row that belongs to a different identity than the signed-in one. */
export async function clearOtherOwners(owner: string): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const all = await withStore<OutboxEntry[]>("readonly", (store) => store.getAll());
  const foreign = all.filter((entry) => entry.owner !== owner);
  for (const entry of foreign) {
    await withStore("readwrite", (store) => store.delete(entry.key));
  }
  return foreign.length;
}
