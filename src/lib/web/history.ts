import { useSyncExternalStore } from "react";

/**
 * A list of finished transfers for one room, kept in this browser only.
 * It holds names, sizes and times so the list is still there after a refresh.
 * It never holds file contents or text notes, and nothing here goes to a server.
 */
export type PastTransfer = {
  key: string;
  name: string;
  size: number;
  type: string;
  direction: "in" | "out";
  peer: string;
  at: number;
};

const PREFIX = "ferry.history.";
const KEEP_MS = 2 * 86_400_000;
const MAX = 200;
const EMPTY: PastTransfer[] = [];

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; list: PastTransfer[] }>();

function read(roomId: string): PastTransfer[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + roomId);
  } catch {
    return EMPTY;
  }
  const cached = cache.get(roomId);
  if (cached && cached.raw === raw) return cached.list;
  let list = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "null") as { items?: PastTransfer[] } | null;
    if (Array.isArray(parsed?.items))
      list = parsed.items.filter(
        (item) => item && typeof item.key === "string" && typeof item.name === "string" && Number.isFinite(item.size),
      );
  } catch {}
  cache.set(roomId, { raw, list });
  return list;
}

function write(roomId: string, items: PastTransfer[]) {
  try {
    if (items.length === 0) localStorage.removeItem(PREFIX + roomId);
    else localStorage.setItem(PREFIX + roomId, JSON.stringify({ at: Date.now(), items: items.slice(-MAX) }));
  } catch {}
  for (const listener of listeners) listener();
}

/** Add finished transfers that are not in the list yet. */
export function recordPast(roomId: string, items: PastTransfer[]) {
  const current = read(roomId);
  const known = new Set(current.map((item) => item.key));
  const fresh = items.filter((item) => !known.has(item.key));
  if (fresh.length > 0) write(roomId, [...current, ...fresh]);
}

export function clearPast(roomId: string) {
  write(roomId, []);
}

/** Remove the lists of rooms that have expired. */
export function prunePast() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const entry = JSON.parse(localStorage.getItem(key) ?? "{}") as { at?: number };
      if (!entry.at || Date.now() - entry.at > KEEP_MS) localStorage.removeItem(key);
    }
  } catch {}
}

export function usePast(roomId: string | undefined): PastTransfer[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => (roomId ? read(roomId) : EMPTY),
    () => EMPTY,
  );
}
