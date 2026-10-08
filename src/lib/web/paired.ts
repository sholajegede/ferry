import { fromBase64Url, toBase64Url } from "../protocol/bytes";
import { openText, pairKeyFrom, sealText } from "../protocol/crypto";

export type PairedDevice = { id: string; name: string; key: string; at: number };

const KEY = "ferry.paired";
const listeners = new Set<() => void>();
const EMPTY: PairedDevice[] = [];
let cache: PairedDevice[] | null = null;

function read(): PairedDevice[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PairedDevice[];
    cache = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: PairedDevice[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  for (const listener of listeners) listener();
}

export const pairedStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: read,
  server: () => EMPTY,
};

export function addPaired(id: string, name: string, seed: Uint8Array) {
  const rest = read().filter((device) => device.id !== id);
  write([...rest, { id, name, key: toBase64Url(seed), at: Date.now() }]);
}

export function removePaired(id: string) {
  write(read().filter((device) => device.id !== id));
}

export function isPaired(id: string) {
  return read().some((device) => device.id === id);
}

export async function sealInvite(device: PairedDevice, invite: { roomId: string; secret: string }) {
  const key = await pairKeyFrom(fromBase64Url(device.key));
  return sealText(key, JSON.stringify(invite));
}

export async function openInvite(fromId: string, sealed: string) {
  const device = read().find((entry) => entry.id === fromId);
  if (!device) return null;
  try {
    const key = await pairKeyFrom(fromBase64Url(device.key));
    const invite = JSON.parse(await openText(key, sealed)) as {
      roomId: string;
      secret: string;
    };
    if (typeof invite.roomId !== "string" || typeof invite.secret !== "string") return null;
    return invite;
  } catch {
    return null;
  }
}
