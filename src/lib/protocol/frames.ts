import { concat, fromBase64Url, text, toBase64Url, utf8 } from "./bytes";
import type { ControlMessage } from "./types";

const CONTROL = 0;
const CHUNK = 1;
const CHUNK_HEADER = 1 + 16 + 8;

export const FRAME_OVERHEAD = CHUNK_HEADER + 12 + 16;

export function encodeControl(message: ControlMessage): Uint8Array {
  return concat(new Uint8Array([CONTROL]), utf8(JSON.stringify(message)));
}

export function encodeChunk(id: string, offset: number, data: Uint8Array) {
  const out = new Uint8Array(CHUNK_HEADER + data.length);
  out[0] = CHUNK;
  out.set(fromBase64Url(id).subarray(0, 16), 1);
  new DataView(out.buffer).setFloat64(17, offset);
  out.set(data, CHUNK_HEADER);
  return out;
}

export type Frame =
  | { kind: "control"; message: ControlMessage }
  | { kind: "chunk"; id: string; offset: number; data: Uint8Array };

export function decodeFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length < 1) return null;
  if (bytes[0] === CONTROL) {
    try {
      const message = JSON.parse(text(bytes.subarray(1))) as ControlMessage;
      if (!message || typeof message.t !== "string") return null;
      return { kind: "control", message };
    } catch {
      return null;
    }
  }
  if (bytes[0] === CHUNK && bytes.length >= CHUNK_HEADER) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = view.getFloat64(17);
    if (!Number.isSafeInteger(offset) || offset < 0) return null;
    return {
      kind: "chunk",
      id: toBase64Url(bytes.subarray(1, 17)),
      offset,
      data: bytes.subarray(CHUNK_HEADER),
    };
  }
  return null;
}
