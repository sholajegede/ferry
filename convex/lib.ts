import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_GUESTS = 16;
export const MAX_SIGNAL_BYTES = 16_384;
export const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const KEY_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;

export type Creds = { deviceId: string; deviceSecret: string };

export function fail(code: string): never {
  throw new ConvexError({ code });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const length = data.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

export function sha256Hex(input: string | Uint8Array) {
  return toHex(sha256(typeof input === "string" ? utf8(input) : input));
}

export function fromBase64Url(value: string) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of value) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) fail("bad-encoding");
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function toBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += alphabet[c & 63];
  }
  return out;
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cleanName(name: string) {
  const trimmed = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return trimmed || "Unnamed device";
}

export async function findDevice(
  ctx: QueryCtx | MutationCtx,
  creds: Creds,
): Promise<Doc<"devices"> | null> {
  if (!ID_PATTERN.test(creds.deviceId)) return null;
  const device = await ctx.db
    .query("devices")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", creds.deviceId))
    .unique();
  if (!device) return null;
  const hash = sha256Hex(creds.deviceSecret);
  return safeEqual(hash, device.secretHash) ? device : null;
}

export async function requireDevice(
  ctx: QueryCtx | MutationCtx,
  creds: Creds,
) {
  const device = await findDevice(ctx, creds);
  if (!device) fail("unauthorized");
  return device;
}

export async function getRoom(ctx: QueryCtx | MutationCtx, roomId: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .unique();
}

export async function getGuest(
  ctx: QueryCtx | MutationCtx,
  roomId: string,
  deviceId: string,
) {
  return await ctx.db
    .query("guests")
    .withIndex("by_room_device", (q) =>
      q.eq("roomId", roomId).eq("deviceId", deviceId),
    )
    .unique();
}

export async function takeLimit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now();
  const row = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) {
    await ctx.db.insert("limits", { key, count: 1, windowStart: now });
    return true;
  }
  if (now - row.windowStart > windowMs) {
    await ctx.db.patch(row._id, { count: 1, windowStart: now });
    return true;
  }
  if (row.count >= max) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

function hmacHex(secret: string, message: string) {
  let key: Uint8Array = utf8(secret);
  if (key.length > 64) key = sha256(key);
  const inner = new Uint8Array(64).fill(0x36);
  const outer = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < key.length; i++) {
    inner[i] ^= key[i];
    outer[i] ^= key[i];
  }
  const text = utf8(message);
  const first = new Uint8Array(64 + text.length);
  first.set(inner);
  first.set(text, 64);
  const second = new Uint8Array(96);
  second.set(outer);
  second.set(sha256(first), 64);
  return toHex(sha256(second));
}

export async function readNetToken(token: string | undefined) {
  const secret = process.env.NETWORK_SECRET;
  if (!secret || !token) return null;
  const [netHash, exp, sig] = token.split(".");
  if (!netHash || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = hmacHex(secret, `${netHash}.${exp}`);
  return safeEqual(expected, sig) ? netHash : null;
}

export function readGeoToken(token: string | undefined) {
  const secret = process.env.NETWORK_SECRET;
  if (!secret || !token) return null;
  const [body, exp, sig] = token.split(".");
  if (!body || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!safeEqual(hmacHex(secret, `geo:${body}.${exp}`), sig)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as {
      c?: string;
      r?: string;
      ci?: string;
    };
    return { country: parsed.c, region: parsed.r, city: parsed.ci };
  } catch {
    return null;
  }
}

export function label(value: string | undefined, max = 48) {
  if (!value) return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || undefined;
}

export function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export async function bump(
  ctx: MutationCtx,
  field: "visits" | "rooms" | "joins" | "files" | "notes",
  bytes = 0,
) {
  const day = dayKey(Date.now());
  const row = await ctx.db
    .query("daily")
    .withIndex("by_day", (q) => q.eq("day", day))
    .unique();
  if (!row) {
    await ctx.db.insert("daily", {
      day,
      visits: 0,
      rooms: 0,
      joins: 0,
      files: 0,
      bytes,
      notes: 0,
      [field]: 1,
    });
    return;
  }
  await ctx.db.patch(row._id, {
    [field]: row[field] + 1,
    bytes: row.bytes + bytes,
  });
}
