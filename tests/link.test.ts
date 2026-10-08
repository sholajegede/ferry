import assert from "node:assert/strict";
import { test } from "node:test";
import { Link, type Signal } from "../src/lib/protocol/link";

class FakeConnection {
  connectionState = "new";
  signalingState = "stable";
  localDescription: { type: string; sdp: string } | null = null;
  onicecandidate: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: unknown = null;
  offers: { iceRestart?: boolean }[] = [];
  closed = false;
  createDataChannel() {
    return { readyState: "connecting", onopen: null, onclose: null, onerror: null };
  }
  async createOffer(options: { iceRestart?: boolean } = {}) {
    this.offers.push(options);
    return { type: "offer", sdp: `offer-${this.offers.length}` };
  }
  async createAnswer() {
    return { type: "answer", sdp: "answer" };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
    this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(description: { type: string }) {
    this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate() {}
  restartIce() {}
  close() {
    this.closed = true;
  }
  set(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function pair() {
  const made: { host: FakeConnection[]; guest: FakeConnection[] } = { host: [], guest: [] };
  const sent: { host: Signal[]; guest: Signal[] } = { host: [], guest: [] };
  const downs = { host: 0, guest: 0 };
  const build = (side: "host" | "guest") => {
    const link: Link = new Link({
      initiator: side === "host",
      createConnection: () => {
        const pc = new FakeConnection();
        made[side].push(pc);
        return pc as unknown as RTCPeerConnection;
      },
      iceServers: async () => [],
      send: (signal) => {
        sent[side].push(signal);
        void (side === "host" ? guest : host).onSignal(signal);
      },
      onChannel: () => undefined,
      onDown: () => {
        downs[side]++;
      },
      onChange: () => undefined,
    });
    return link;
  };
  const host: Link = build("host");
  const guest: Link = build("guest");
  return { host, guest, made, sent, downs };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a short gap heals without rebuilding the connection", async () => {
  const { host, guest, made, sent, downs } = pair();
  host.start();
  guest.start();
  await wait(50);
  made.host[0].set("connected");
  made.guest[0].set("connected");
  assert.equal(host.status, "connected");

  made.host[0].set("disconnected");
  await wait(600);
  assert.equal(host.status, "connected", "a brief gap is not shown as a drop");
  made.host[0].set("connected");
  await wait(2_600);
  assert.equal(made.host.length, 1);
  assert.equal(sent.host.filter((signal) => signal.kind === "offer").length, 1);
  assert.equal(downs.host, 0);
  host.stop();
  guest.stop();
});

test("a longer gap finds a new route on the same connection", async () => {
  const { host, guest, made, sent, downs } = pair();
  host.start();
  guest.start();
  await wait(50);
  made.host[0].set("connected");
  made.guest[0].set("connected");

  made.host[0].set("disconnected");
  await wait(2_800);
  assert.equal(host.status, "reconnecting");
  const offers = sent.host.filter((signal) => signal.kind === "offer");
  assert.equal(offers.length, 2);
  assert.equal(offers[1].kind === "offer" && offers[1].restart, true);
  assert.deepEqual(made.host[0].offers[1], { iceRestart: true });
  assert.equal(sent.guest.filter((signal) => signal.kind === "answer").length, 2);
  assert.equal(made.host.length, 1, "the connection is kept");
  assert.equal(made.guest.length, 1);
  assert.equal(downs.host, 0, "the data channel is not torn down");

  made.host[0].set("connected");
  assert.equal(host.status, "connected");
  host.stop();
  guest.stop();
});

test("the joining device asks for a new route when it notices the gap first", async () => {
  const { host, guest, made, sent } = pair();
  host.start();
  guest.start();
  await wait(50);
  made.host[0].set("connected");
  made.guest[0].set("connected");

  made.host[0].connectionState = "disconnected";
  made.guest[0].set("disconnected");
  await wait(2_800);
  assert.equal(sent.guest.some((signal) => signal.kind === "retry" && signal.ice), true);
  assert.deepEqual(made.host[0].offers[1], { iceRestart: true });
  assert.equal(made.host.length, 1);
  host.stop();
  guest.stop();
});
