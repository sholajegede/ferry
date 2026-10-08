import type { FileMeta, FileSink, SinkProvider } from "../protocol/types";
import { idb } from "./idb";

export type StoredFile = {
  key: string;
  peerId: string;
  id: string;
  name: string;
  path?: string;
  size: number;
  type: string;
  batch: string;
  received: number;
  done: boolean;
  at: number;
};

type Pending = { resolve(value: unknown): void; reject(error: unknown): void };

const DAY = 86_400_000;
const FLUSH_MS = 1_000;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let mode: Promise<"disk" | "memory"> | null = null;
const memory = new Map<string, Blob>();
const memoryRecords = new Map<string, StoredFile>();
const live = new Map<string, { record: StoredFile; latest: number; saved: number }>();
let flusher: ReturnType<typeof setInterval> | null = null;

function call<T>(message: Record<string, unknown>, transfer: Transferable[] = []) {
  return new Promise<T>((resolve, reject) => {
    if (!worker) return reject(new Error("Storage is not available"));
    const id = ++seq;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker.postMessage({ ...message, seq: id }, transfer);
  });
}

function storageMode() {
  if (!mode) {
    mode = (async () => {
      try {
        if (!navigator.storage?.getDirectory || typeof Worker === "undefined")
          return "memory" as const;
        worker = new Worker(new URL("./opfs.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (event: MessageEvent<{ seq: number; value?: unknown; error?: string }>) => {
          const entry = pending.get(event.data.seq);
          if (!entry) return;
          pending.delete(event.data.seq);
          if (event.data.error)
            entry.reject(new DOMException(event.data.error, event.data.error));
          else entry.resolve(event.data.value);
        };
        await call({ op: "probe" });
        await sweep().catch(() => undefined);
        return "disk" as const;
      } catch {
        worker?.terminate();
        worker = null;
        return "memory" as const;
      }
    })();
  }
  return mode;
}

const keyOf = (peerId: string, id: string) => `${peerId}.${id}`;

async function sweep() {
  const now = Date.now();
  const records = await idb.all<StoredFile>("files");
  const kept = new Set<string>();
  for (const record of records) {
    const limit = record.done ? DAY : 3 * DAY;
    if (now - record.at > limit && !live.has(record.key)) {
      await call({ op: "remove", name: record.key }).catch(() => undefined);
      await idb.delete("files", record.key);
    } else {
      kept.add(record.key);
    }
  }
  const names = await call<string[]>({ op: "list" }).catch(() => [] as string[]);
  for (const name of names)
    if (!kept.has(name) && !live.has(name) && !name.startsWith("zip-"))
      await call({ op: "remove", name }).catch(() => undefined);
}

function startFlusher() {
  if (flusher) return;
  flusher = setInterval(() => {
    for (const [key, entry] of live) {
      if (entry.latest === entry.saved) continue;
      const mark = entry.latest;
      void call({ op: "flush", name: key })
        .then(() => {
          entry.saved = mark;
          entry.record.received = mark;
          entry.record.at = Date.now();
          return idb.put("files", key, entry.record);
        })
        .catch(() => undefined);
    }
    if (live.size === 0 && flusher) {
      clearInterval(flusher);
      flusher = null;
    }
  }, FLUSH_MS);
}

async function hasSpace(bytes: number) {
  try {
    const estimate = await navigator.storage.estimate();
    if (!estimate.quota) return true;
    return estimate.quota - (estimate.usage ?? 0) > bytes + 16 * 1024 * 1024;
  } catch {
    return true;
  }
}

const MEMORY_LIMIT = 512 * 1024 * 1024;

export const sinks: SinkProvider = {
  async open(peerId, meta) {
    const key = keyOf(peerId, meta.id);
    const record: StoredFile = {
      key,
      peerId,
      id: meta.id,
      name: meta.name,
      path: meta.path,
      size: meta.size,
      type: meta.type,
      batch: meta.batch,
      received: 0,
      done: false,
      at: Date.now(),
    };

    if ((await storageMode()) === "memory") {
      if (memory.has(key)) return "done";
      if (meta.size > MEMORY_LIMIT)
        throw new DOMException("Too large for this browser", "QuotaExceededError");
      const parts: Uint8Array<ArrayBuffer>[] = [];
      const sink: FileSink = {
        async write(_offset, data) {
          parts.push(data.slice() as Uint8Array<ArrayBuffer>);
        },
        async close() {
          memory.set(key, new Blob(parts, { type: meta.type }));
          memoryRecords.set(key, { ...record, received: meta.size, done: true });
        },
        async abort() {
          parts.length = 0;
        },
      };
      return { sink, offset: 0 };
    }

    const existing = await idb.get<StoredFile>("files", key);
    if (existing?.done && existing.size === meta.size) {
      const names = await call<string[]>({ op: "list" });
      if (names.includes(key)) return "done";
    }
    const resumeFrom =
      existing && !existing.done && existing.size === meta.size ? existing.received : 0;
    if (!(await hasSpace(meta.size - resumeFrom)))
      throw new DOMException("Not enough space", "QuotaExceededError");
    const offset = await call<number>({ op: "open", name: key, keep: resumeFrom });
    record.received = offset;
    await idb.put("files", key, record);
    live.set(key, { record, latest: offset, saved: offset });
    startFlusher();

    const sink: FileSink = {
      async write(at, data) {
        await call(
          {
            op: "write",
            name: key,
            at,
            buffer: data.buffer,
            offset: data.byteOffset,
            length: data.byteLength,
          },
          [data.buffer as ArrayBuffer],
        );
      },
      async close() {
        const entry = live.get(key);
        live.delete(key);
        await call({ op: "close", name: key });
        if (entry && !entry.record.done) {
          entry.record.received = entry.latest;
          entry.record.at = Date.now();
          await idb.put("files", key, entry.record);
        }
      },
      async abort() {
        live.delete(key);
        await call({ op: "remove", name: key }).catch(() => undefined);
      },
    };
    return { sink, offset };
  },

  progress(peerId, meta, received) {
    const entry = live.get(keyOf(peerId, meta.id));
    if (entry) entry.latest = received;
  },

  async complete(peerId, meta) {
    const key = keyOf(peerId, meta.id);
    if ((await storageMode()) === "memory") return;
    const record = await idb.get<StoredFile>("files", key);
    if (!record) return;
    await idb.put("files", key, {
      ...record,
      received: meta.size,
      done: true,
      at: Date.now(),
    });
  },

  async discard(peerId, meta) {
    const key = keyOf(peerId, meta.id);
    live.delete(key);
    memory.delete(key);
    memoryRecords.delete(key);
    if ((await storageMode()) === "memory") return;
    await call({ op: "remove", name: key }).catch(() => undefined);
    await idb.delete("files", key).catch(() => undefined);
  },
};

export async function receivedBlob(peerId: string, id: string): Promise<Blob | null> {
  const key = keyOf(peerId, id);
  if ((await storageMode()) === "memory") return memory.get(key) ?? null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("ferry");
    const handle = await dir.getFileHandle(key);
    const file = await handle.getFile();
    const record = await idb.get<StoredFile>("files", key);
    return record?.type ? file.slice(0, file.size, record.type) : file;
  } catch {
    return null;
  }
}

export async function removeReceived(peerId: string, id: string) {
  await sinks.discard(peerId, { id } as FileMeta);
}

export async function writeStreamToDisk(
  name: string,
  stream: ReadableStream<Uint8Array>,
): Promise<Blob> {
  if ((await storageMode()) === "memory") return new Response(stream).blob();
  await call({ op: "open", name, keep: 0 });
  const reader = stream.getReader();
  let at = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const copy = value.slice();
      await call(
        { op: "write", name, at, buffer: copy.buffer, offset: 0, length: copy.byteLength },
        [copy.buffer],
      );
      at += copy.byteLength;
    }
  } finally {
    await call({ op: "close", name });
  }
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("ferry");
  return (await dir.getFileHandle(name)).getFile();
}

export async function storageKind() {
  return storageMode();
}
