import assert from "node:assert/strict";
import { test } from "node:test";
import { randomId } from "../src/lib/protocol/bytes";
import { createKeyRecord, deriveSession } from "../src/lib/protocol/crypto";
import { PeerSession } from "../src/lib/protocol/peer-session";
import type {
  ChannelLike,
  FileSource,
  OutgoingItem,
  PeerEvent,
  SinkProvider,
} from "../src/lib/protocol/types";

class FakeChannel implements ChannelLike {
  readyState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = "arraybuffer";
  onopen = null;
  onclose = null;
  onerror = null;
  onmessage: ChannelLike["onmessage"] = null;
  onbufferedamountlow = null;
  other!: FakeChannel;
  delivered = 0;

  send(data: ArrayBuffer | Uint8Array | string) {
    if (this.readyState !== "open") throw new Error("closed");
    const copy = (data as Uint8Array).slice();
    setTimeout(() => {
      if (this.other.readyState !== "open") return;
      this.other.delivered++;
      this.other.onmessage?.({ data: copy.buffer });
    }, 0);
  }

  close() {
    this.readyState = "closed";
  }
}

function pair() {
  const a = new FakeChannel();
  const b = new FakeChannel();
  a.other = b;
  b.other = a;
  return [a, b] as const;
}

function memorySinks() {
  const files = new Map<string, { bytes: Uint8Array; received: number; done: boolean }>();
  const provider: SinkProvider = {
    async open(_peer, meta) {
      const existing = files.get(meta.id);
      if (existing?.done) return "done";
      const entry = existing ?? { bytes: new Uint8Array(meta.size), received: 0, done: false };
      files.set(meta.id, entry);
      return {
        offset: entry.received,
        sink: {
          async write(offset, data) {
            entry.bytes.set(data, offset);
            entry.received = offset + data.length;
          },
          async close() {},
          async abort() {
            files.delete(meta.id);
          },
        },
      };
    },
    progress() {},
    async complete(_peer, meta) {
      files.get(meta.id)!.done = true;
    },
    async discard(_peer, meta) {
      files.delete(meta.id);
    },
  };
  return { provider, files };
}

async function sessions() {
  const host = await createKeyRecord(false);
  const guest = await createKeyRecord(true);
  const shared = { context: "room", hostPub: host.pub, guestPub: guest.pub, linkSecret: null };
  const a = await deriveSession({ privateKey: host.pair.privateKey, peerPub: guest.pub, ...shared });
  const b = await deriveSession({ privateKey: guest.pair.privateKey, peerPub: host.pub, ...shared });
  return [a, b] as const;
}

function source(bytes: Uint8Array, name: string): FileSource {
  return {
    name,
    size: bytes.length,
    type: "application/octet-stream",
    lastModified: 1,
    read: async (offset, length) => bytes.slice(offset, offset + length),
  };
}

function item(bytes: Uint8Array, name: string, id: string): OutgoingItem {
  return { id, name, size: bytes.length, type: "application/octet-stream", batch: "b", source: source(bytes, name) };
}

function until(check: () => boolean, ms = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > ms) return reject(new Error("timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

const [ID_A, ID_B, ID_C, ID_D, ID_E] = Array.from({ length: 5 }, () => randomId(16));

function random(size: number) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 65536)
    crypto.getRandomValues(bytes.subarray(i, Math.min(size, i + 65536)));
  return bytes;
}

test("both sides derive the same code and keys", async () => {
  const [a, b] = await sessions();
  assert.equal(a.code, b.code);
  assert.match(a.code, /^\d{6}$/);
});

test("a link secret changes the keys", async () => {
  const host = await createKeyRecord(false);
  const guest = await createKeyRecord(true);
  const base = { context: "room", hostPub: host.pub, guestPub: guest.pub };
  const plain = await deriveSession({ privateKey: host.pair.privateKey, peerPub: guest.pub, ...base, linkSecret: null });
  const linked = await deriveSession({
    privateKey: host.pair.privateKey,
    peerPub: guest.pub,
    ...base,
    linkSecret: "q83vEjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJA",
  });
  assert.notEqual(plain.code, linked.code);
});

test("files, empty files and notes arrive intact", async () => {
  const [sa, sb] = await sessions();
  const [ca, cb] = pair();
  const received = memorySinks();
  const events: PeerEvent[] = [];
  const sender = new PeerSession("guest", sa, {
    selfName: "Sender",
    peerName: "Receiver",
    sinks: memorySinks().provider,
    emit: () => {},
    changed: () => {},
  });
  const receiver = new PeerSession("host", sb, {
    selfName: "Receiver",
    peerName: "Sender",
    sinks: received.provider,
    emit: (event) => events.push(event),
    changed: () => {},
  });
  const big = random(3 * 1024 * 1024 + 123);
  const empty = new Uint8Array(0);
  sender.offer([item(big, "big.bin", ID_A), item(empty, "empty.txt", ID_B)]);
  sender.attach(ca, 262144);
  receiver.attach(cb, 262144);
  await until(() => sender.snapshot().every((t) => t.status === "done"));
  assert.deepEqual(received.files.get(ID_A)!.bytes, big);
  assert.equal(received.files.get(ID_B)!.done, true);
  assert.equal(receiver.peerName, "Sender");
  sender.sendNote("hello there");
  await until(() => events.some((e) => e.type === "note"));
  const note = events.find((e) => e.type === "note");
  assert.equal(note?.type === "note" && note.note.text, "hello there");
  await sender.destroy();
  await receiver.destroy();
});

test("a dropped connection resumes from where it stopped", async () => {
  const [sa, sb] = await sessions();
  const received = memorySinks();
  const sender = new PeerSession("guest", sa, {
    selfName: "S",
    peerName: "R",
    sinks: memorySinks().provider,
    emit: () => {},
    changed: () => {},
  });
  const receiver = new PeerSession("host", sb, {
    selfName: "R",
    peerName: "S",
    sinks: received.provider,
    emit: () => {},
    changed: () => {},
  });
  const data = random(24 * 1024 * 1024);
  let reads = 0;
  const counted: OutgoingItem = {
    ...item(data, "movie.bin", ID_C),
    source: {
      ...source(data, "movie.bin"),
      read: async (offset, length) => {
        reads += length;
        return data.slice(offset, offset + length);
      },
    },
  };
  sender.offer([counted]);
  const [c1, c2] = pair();
  sender.attach(c1, 65536);
  receiver.attach(c2, 65536);
  await until(() => (received.files.get(counted.id)?.received ?? 0) > 4 * 1024 * 1024);
  c1.close();
  c2.close();
  sender.detach();
  receiver.detach();
  const before = received.files.get(counted.id)!.received;
  assert.ok(before < data.length);
  assert.equal(sender.snapshot()[0].status, "queued");
  reads = 0;
  const [c3, c4] = pair();
  sender.attach(c3, 65536);
  receiver.attach(c4, 65536);
  await until(() => sender.snapshot()[0].status === "done");
  assert.deepEqual(received.files.get(counted.id)!.bytes, data);
  assert.ok(reads <= data.length - before + 65536, `re-read ${reads} bytes after ${before} were saved`);
  await sender.destroy();
  await receiver.destroy();
});

test("the wrong key is rejected", async () => {
  const [sa] = await sessions();
  const [, other] = await sessions();
  const [ca, cb] = pair();
  const received = memorySinks();
  const events: PeerEvent[] = [];
  const sender = new PeerSession("guest", sa, {
    selfName: "S",
    peerName: "R",
    sinks: memorySinks().provider,
    emit: () => {},
    changed: () => {},
  });
  const receiver = new PeerSession("host", other, {
    selfName: "R",
    peerName: "S",
    sinks: received.provider,
    emit: (event) => events.push(event),
    changed: () => {},
  });
  sender.offer([item(random(1000), "secret.txt", ID_D)]);
  sender.attach(ca, 65536);
  receiver.attach(cb, 65536);
  await until(() => events.some((e) => e.type === "key-mismatch"));
  assert.equal(received.files.size, 0);
  await sender.destroy();
  await receiver.destroy();
});

test("cancelling stops a transfer on both sides", async () => {
  const [sa, sb] = await sessions();
  const [ca, cb] = pair();
  const received = memorySinks();
  const sender = new PeerSession("guest", sa, {
    selfName: "S",
    peerName: "R",
    sinks: memorySinks().provider,
    emit: () => {},
    changed: () => {},
  });
  const receiver = new PeerSession("host", sb, {
    selfName: "R",
    peerName: "S",
    sinks: received.provider,
    emit: () => {},
    changed: () => {},
  });
  const data = random(32 * 1024 * 1024);
  sender.offer([item(data, "large.bin", ID_E)]);
  sender.attach(ca, 65536);
  receiver.attach(cb, 65536);
  await until(() => receiver.snapshot()[0]?.bytes > 1024 * 1024);
  sender.cancel(ID_E, "out");
  await until(() => receiver.snapshot()[0].status === "cancelled");
  assert.equal(sender.snapshot()[0].status, "cancelled");
  assert.equal(received.files.has(ID_E), false);
  await sender.destroy();
  await receiver.destroy();
});
