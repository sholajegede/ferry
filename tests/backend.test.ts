import assert from "node:assert/strict";
import { test } from "node:test";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { randomId } from "../src/lib/protocol/bytes";
import {
  createKeyRecord,
  joinTokenFor,
  joinTokenHash,
  newLinkSecret,
} from "../src/lib/protocol/crypto";
import { modules } from "./modules";

process.env.ANALYTICS_KEY = "test-analytics-key-123456";

type Backend = TestConvex<typeof schema>;

async function device(t: Backend, name: string) {
  const creds = { deviceId: randomId(16), deviceSecret: randomId(32) };
  await t.mutation(api.devices.register, { ...creds, name });
  return creds;
}

async function room(t: Backend, host: { deviceId: string; deviceSecret: string }) {
  const roomId = randomId(16);
  const secret = newLinkSecret();
  const token = await joinTokenFor(secret, roomId);
  const created = await t.mutation(api.rooms.create, {
    ...host,
    roomId,
    joinTokenHash: await joinTokenHash(token),
    visible: false,
  });
  return { roomId, token, code: created.code };
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: { data?: unknown }) => {
    const data = typeof error.data === "string" ? JSON.parse(error.data) : error.data;
    assert.equal((data as { code?: string })?.code, code);
    return true;
  });
}

test("a device cannot act with the wrong secret", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  await rejects(
    t.mutation(api.devices.heartbeat, { deviceId: host.deviceId, deviceSecret: randomId(32) }),
    "unauthorized",
  );
  await rejects(
    t.mutation(api.devices.register, { deviceId: host.deviceId, deviceSecret: randomId(32), name: "Thief" }),
    "unauthorized",
  );
});

test("the link admits, a wrong link is refused, a code join waits for approval", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId, token } = await room(t, host);
  const linked = await device(t, "Linked");
  const stranger = await device(t, "Stranger");
  const keys = await createKeyRecord(true);

  const admitted = await t.mutation(api.rooms.join, { ...linked, roomId, commit: keys.commit!, joinToken: token, via: "link" });
  assert.equal(admitted.state, "admitted");
  await rejects(
    t.mutation(api.rooms.join, { ...stranger, roomId, commit: keys.commit!, joinToken: randomId(32), via: "link" }),
    "bad-link",
  );
  const pending = await t.mutation(api.rooms.join, { ...stranger, roomId, commit: keys.commit!, via: "link" });
  assert.equal(pending.state, "pending");
  const view = await t.query(api.rooms.view, { ...host, roomId });
  assert.equal(view.role, "host");
  const row = view.role === "host" ? view.guests.find((g) => g.deviceId === stranger.deviceId) : null;
  assert.equal(row?.via, "code");
});

test("only admitted devices can exchange connection messages, and only with the host", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId, token } = await room(t, host);
  const guest = await device(t, "Guest");
  const other = await device(t, "Other");
  const waiting = await device(t, "Waiting");
  const outsider = await device(t, "Outsider");
  const keys = await createKeyRecord(true);
  await t.mutation(api.rooms.join, { ...guest, roomId, commit: keys.commit!, joinToken: token, via: "link" });
  await t.mutation(api.rooms.join, { ...other, roomId, commit: keys.commit!, joinToken: token, via: "link" });
  await t.mutation(api.rooms.join, { ...waiting, roomId, commit: keys.commit!, via: "code" });

  await t.mutation(api.signals.send, { ...guest, roomId, to: host.deviceId, payload: "sealed" });
  await t.mutation(api.signals.send, { ...host, roomId, to: guest.deviceId, payload: "sealed" });
  await rejects(t.mutation(api.signals.send, { ...waiting, roomId, to: host.deviceId, payload: "x" }), "unauthorized");
  await rejects(t.mutation(api.signals.send, { ...outsider, roomId, to: host.deviceId, payload: "x" }), "unauthorized");
  await rejects(t.mutation(api.signals.send, { ...guest, roomId, to: other.deviceId, payload: "x" }), "unauthorized");
  await rejects(t.mutation(api.signals.send, { ...host, roomId, to: waiting.deviceId, payload: "x" }), "unauthorized");
  await rejects(
    t.mutation(api.signals.send, { ...guest, roomId, to: host.deviceId, payload: "x".repeat(20_000) }),
    "too-large",
  );

  assert.equal((await t.query(api.signals.inbox, { ...host, roomId })).length, 1);
  assert.equal((await t.query(api.signals.inbox, { ...other, roomId })).length, 0);
});

test("a revealed key must match the commitment", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId } = await room(t, host);
  const guest = await device(t, "Guest");
  const keys = await createKeyRecord(true);
  const swapped = await createKeyRecord(true);
  const hostKeys = await createKeyRecord(false);
  await t.mutation(api.rooms.join, { ...guest, roomId, commit: keys.commit!, via: "code" });
  await t.mutation(api.rooms.setHostKey, { ...host, roomId, guestId: guest.deviceId, epoch: 1, hostPub: hostKeys.pub });
  await rejects(
    t.mutation(api.rooms.reveal, { ...guest, roomId, epoch: 1, guestPub: swapped.pub, nonce: keys.nonce! }),
    "bad-key",
  );
  assert.equal(
    await t.mutation(api.rooms.reveal, { ...guest, roomId, epoch: 1, guestPub: keys.pub, nonce: keys.nonce! }),
    true,
  );
});

test("only the host can admit, remove or close", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId } = await room(t, host);
  const guest = await device(t, "Guest");
  const keys = await createKeyRecord(true);
  await t.mutation(api.rooms.join, { ...guest, roomId, commit: keys.commit!, via: "code" });
  await rejects(
    t.mutation(api.rooms.decide, { ...guest, roomId, guestId: guest.deviceId, epoch: 1, admit: true }),
    "unauthorized",
  );
  await rejects(t.mutation(api.rooms.close, { ...guest, roomId }), "unauthorized");
  await rejects(
    t.mutation(api.rooms.decide, { ...host, roomId, guestId: guest.deviceId, epoch: 1, admit: true }),
    "stale",
  );
  await t.mutation(api.rooms.decide, { ...host, roomId, guestId: guest.deviceId, epoch: 1, admit: false });
  await rejects(t.mutation(api.rooms.join, { ...guest, roomId, commit: keys.commit!, via: "code" }), "declined");
  await t.mutation(api.rooms.close, { ...host, roomId });
  const late = await device(t, "Late");
  await rejects(t.mutation(api.rooms.join, { ...late, roomId, commit: keys.commit!, via: "code" }), "closed");
});

test("guessing codes is rate limited", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId, code } = await room(t, host);
  const guesser = await device(t, "Guesser");
  const found = await t.mutation(api.rooms.lookupCode, { ...guesser, code });
  assert.equal(found.roomId, roomId);
  let limited = false;
  for (let i = 0; i < 14; i++) {
    const result = await t.mutation(api.rooms.lookupCode, { ...guesser, code: "000000" });
    limited ||= result.limited;
  }
  assert.equal(limited, true);
  assert.equal((await t.mutation(api.rooms.lookupCode, { ...guesser, code })).roomId, null);
});

test("someone outside a transfer sees no member details", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId } = await room(t, host);
  const outsider = await device(t, "Outsider");
  const view = await t.query(api.rooms.view, { ...outsider, roomId });
  assert.equal(view.role, "none");
  assert.equal("guests" in view, false);
  assert.equal(JSON.stringify(view).includes("code"), false);
});

test("a device can only ring a device that remembered it back", async () => {
  const t = convexTest(schema, modules);
  const a = await device(t, "A");
  const b = await device(t, "B");
  await t.mutation(api.pairs.link, { ...a, peer: b.deviceId });
  await rejects(t.mutation(api.pairs.ring, { ...a, to: b.deviceId, sealed: "x" }), "not-paired");
  await t.mutation(api.pairs.link, { ...b, peer: a.deviceId });
  await t.mutation(api.pairs.ring, { ...a, to: b.deviceId, sealed: "sealed-invite" });
  const rings = await t.query(api.pairs.incoming, b);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].sealed, "sealed-invite");
  assert.equal((await t.query(api.pairs.incoming, a)).length, 0);
});

test("usage totals need the analytics key and expired transfers are swept", async () => {
  const t = convexTest(schema, modules);
  const host = await device(t, "Host");
  const { roomId } = await room(t, host);
  assert.equal(await t.query(api.stats.summary, { key: "wrong-key-wrong-key", days: 30 }), null);
  const summary = await t.query(api.stats.summary, { key: process.env.ANALYTICS_KEY!, days: 30 });
  assert.equal(summary?.totals.rooms, 1);
  await t.mutation(api.stats.track, { ...host, event: "file", bytes: 2_000_000, kind: "image", ext: "jpg", bucket: "1 to 10 MB", route: "lan", geo: "forged.99999999999999.sig" });
  await t.mutation(api.stats.track, { ...host, event: "visit", path: "/", os: "macOS", device: "Computer" });
  const report = await t.query(api.stats.summary, { key: process.env.ANALYTICS_KEY!, days: 7 });
  assert.equal(report?.range.files, 1);
  assert.equal(report?.kinds[0].name, "image");
  assert.equal(report?.extensions[0].name, ".jpg");
  assert.equal(report?.countries.length, 0);
  assert.equal(report?.range.visitors, 1);
  assert.equal(JSON.stringify(report).includes(host.deviceId), false);
  await t.run(async (ctx) => {
    const row = await ctx.db.query("rooms").first();
    await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1000 });
  });
  await t.mutation(internal.maintenance.sweep, {});
  assert.equal((await t.query(api.rooms.view, { ...host, roomId })).room, null);
});

test("the HTTP API creates and reports a transfer", async () => {
  const t = convexTest(schema, modules);
  const roomId = randomId(16);
  const created = await t.fetch("/v1/rooms", {
    method: "POST",
    body: JSON.stringify({ roomId, joinTokenHash: "a".repeat(64), name: "Build server" }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as { code: string; roomId: string };
  assert.match(body.code, /^\d{6}$/);
  const status = await t.fetch(`/v1/rooms/${roomId}`);
  assert.deepEqual(((await status.json()) as { status: string }).status, "open");
  assert.equal((await t.fetch("/v1/rooms/unknownunknownunknown1")).status, 404);
  assert.equal(
    (await t.fetch("/v1/rooms", { method: "POST", body: JSON.stringify({ roomId: "short" }) })).status,
    400,
  );
});
