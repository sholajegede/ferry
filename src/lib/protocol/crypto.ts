import {
  buf,
  concat,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  toHex,
  utf8,
} from "./bytes";

export type Session = {
  dataKey: CryptoKey;
  signalKey: CryptoKey;
  code: string;
  pairSeed: Uint8Array;
  linked: boolean;
};

export type KeyRecord = {
  pair: CryptoKeyPair;
  pub: string;
  nonce?: string;
  commit?: string;
};

const NONCE_BYTES = 12;

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf(data)));
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length = 32,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(utf8(info)) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buf(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export const newLinkSecret = () => toBase64Url(randomBytes(32));

export async function joinTokenFor(linkSecret: string, roomId: string) {
  const bytes = await hkdf(
    fromBase64Url(linkSecret),
    new Uint8Array(32),
    `ferry/join/${roomId}`,
  );
  return toBase64Url(bytes);
}

export async function joinTokenHash(joinToken: string) {
  return toHex(await sha256(utf8(joinToken)));
}

export async function createKeyRecord(withCommit: boolean): Promise<KeyRecord> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const pubBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const pub = toBase64Url(pubBytes);
  if (!withCommit) return { pair, pub };
  const nonce = randomBytes(16);
  const commit = toBase64Url(await sha256(concat(pubBytes, nonce)));
  return { pair, pub, nonce: toBase64Url(nonce), commit };
}

export async function commitMatches(pub: string, nonce: string, commit: string) {
  const digest = await sha256(concat(fromBase64Url(pub), fromBase64Url(nonce)));
  return toBase64Url(digest) === commit;
}

export async function deriveSession(input: {
  privateKey: CryptoKey;
  peerPub: string;
  context: string;
  hostPub: string;
  guestPub: string;
  linkSecret?: string | null;
}): Promise<Session> {
  const peerKey = await crypto.subtle.importKey(
    "raw",
    buf(fromBase64Url(input.peerPub)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerKey },
      input.privateKey,
      256,
    ),
  );
  const salt = input.linkSecret
    ? fromBase64Url(input.linkSecret)
    : new Uint8Array(32);
  const master = await hkdf(
    shared,
    salt,
    `ferry/v1/${input.context}/${input.hostPub}/${input.guestPub}`,
  );
  const none = new Uint8Array(32);
  const [data, signal, sas, pairSeed] = await Promise.all([
    hkdf(master, none, "data"),
    hkdf(master, none, "signal"),
    hkdf(master, none, "code", 4),
    hkdf(master, none, "pair"),
  ]);
  const number =
    (((sas[0] << 24) | (sas[1] << 16) | (sas[2] << 8) | sas[3]) >>> 0) %
    1_000_000;
  return {
    dataKey: await aesKey(data),
    signalKey: await aesKey(signal),
    code: String(number).padStart(6, "0"),
    pairSeed,
    linked: !!input.linkSecret,
  };
}

export async function seal(key: CryptoKey, plain: Uint8Array) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, key, buf(plain)),
  );
  return concat(nonce, cipher);
}

export async function open(key: CryptoKey, sealed: Uint8Array) {
  if (sealed.length < NONCE_BYTES + 16) throw new Error("Message too short");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(sealed.subarray(0, NONCE_BYTES)) },
    key,
    buf(sealed.subarray(NONCE_BYTES)),
  );
  return new Uint8Array(plain);
}

export async function sealText(key: CryptoKey, value: string) {
  return toBase64Url(await seal(key, utf8(value)));
}

export async function openText(key: CryptoKey, value: string) {
  return new TextDecoder().decode(await open(key, fromBase64Url(value)));
}

export async function pairKeyFrom(seed: Uint8Array) {
  return aesKey(seed);
}

export async function fileIdFor(parts: {
  name: string;
  path?: string;
  size: number;
  lastModified: number;
}) {
  const digest = await sha256(
    utf8(`${parts.path ?? ""}\n${parts.name}\n${parts.size}\n${parts.lastModified}`),
  );
  return toBase64Url(digest.subarray(0, 16));
}
