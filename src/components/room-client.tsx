"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Lock,
  Share2,
  ShieldAlert,
  Star,
  UserMinus,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  RoomController,
  type PeerView,
  type RoomState,
} from "@/lib/protocol/room-controller";
import { getBackend, ready } from "@/lib/web/backend";
import { formatCode, formatRemaining } from "@/lib/web/format";
import { useClientValue, useNow, usePaired } from "@/lib/web/hooks";
import { netToken } from "@/lib/web/net";
import { takeStash } from "@/lib/web/outbox";
import { addPaired } from "@/lib/web/paired";
import { supported, webPlatform } from "@/lib/web/platform";
import { recallSecret, rememberSecret } from "@/lib/web/rooms";
import { site } from "@/lib/site";
import { Qr } from "./qr";
import { TransferPanel } from "./transfer-panel";
import { Button, Modal, Notice, useFeedback } from "./ui";

const EMPTY: RoomState = {
  phase: "loading",
  role: null,
  roomId: "",
  code: null,
  expiresAt: null,
  visible: false,
  nearbyReady: false,
  hostName: null,
  peers: [],
  transfers: [],
  notes: [],
  queued: 0,
  pending: [],
};

const SECRET = /^[A-Za-z0-9_-]{40,64}$/;

function readSecret(roomId: string) {
  const fromHash = location.hash.startsWith("#k=") ? location.hash.slice(3) : "";
  return SECRET.test(fromHash) ? fromHash : recallSecret(roomId);
}

function routeLabel(route: PeerView["route"]) {
  if (route === "lan") return "Same network";
  if (route === "direct") return "Direct over the internet";
  if (route === "relay") return "Relayed, still encrypted";
  return null;
}

function peerLine(peer: PeerView) {
  switch (peer.status) {
    case "connected":
      return routeLabel(peer.route) ?? "Connected";
    case "approval":
      return "Waiting for your approval";
    case "securing":
      return "Setting up encryption";
    case "reconnecting":
      return "Connection dropped. Reconnecting";
    case "mismatch":
      return "Encryption check failed. Start a new transfer";
    default:
      return peer.attempts >= 3
        ? "Still trying. Put both devices on the same Wi-Fi if this continues"
        : "Connecting";
  }
}

function Ended({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-[28px] border border-sea bg-paper p-8 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink/80">{body}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center pill bg-sea px-6 text-xs text-on-sea hover:bg-sea-deep"
      >
        Start a new transfer
      </Link>
    </div>
  );
}

export function RoomClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, ask } = useFeedback();
  const paired = usePaired();
  const now = useNow(30_000);
  const [controller, setController] = useState<RoomController | null>(null);
  const secret = useClientValue(() => readSecret(id), null);
  const usable = useClientValue(supported, true);
  const [problem, setProblem] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const pendingNote = useRef("");
  const feedback = useRef({ toast, ask });

  useEffect(() => {
    feedback.current = { toast, ask };
  }, [toast, ask]);

  useEffect(() => {
    if (!supported()) return;
    let active = true;
    let created: RoomController | null = null;
    const offs: (() => void)[] = [];
    const linkSecret = readSecret(id);
    const via = new URLSearchParams(location.search).get("via") === "nearby" ? "nearby" : "code";

    ready().then(
      (identity) => {
        if (!active) return;
        created = new RoomController({
          backend: getBackend(),
          platform: webPlatform,
          identity,
          roomId: id,
          linkSecret,
          via: linkSecret ? "link" : via,
        });
        offs.push(
          created.onEvent((event) => {
            const { toast: say, ask: confirm } = feedback.current;
            if (event.type === "joined") {
              say(`${event.name} connected`, "ok");
              if (pendingNote.current && created?.sendNote(pendingNote.current))
                pendingNote.current = "";
            } else if (event.type === "note") {
              say("Text received");
            } else if (event.type === "pair-ask") {
              void confirm({
                title: `Remember ${event.name}?`,
                body: "Each device can then start a transfer to the other with one tap, with no code.",
                confirm: "Remember",
                cancel: "Not now",
              }).then((yes) => created?.answerPair(event.peerId, yes));
            } else if (event.type === "paired") {
              addPaired(event.peerId, event.name, event.seed);
              say(`${event.name} is now one of your devices`, "ok");
            } else if (event.type === "pair-declined") {
              say(`${event.name} chose not to be remembered`);
            }
          }),
        );
        const stashed = takeStash();
        if (stashed.files.length > 0) void created.share(stashed.files);
        pendingNote.current = stashed.note;
        created.start();
        setController(created);
      },
      () =>
        active &&
        setProblem("Ferry could not reach its server. Check your connection and reload this page."),
    );

    return () => {
      active = false;
      for (const off of offs) off();
      void created?.stop();
      setController(null);
    };
  }, [id]);

  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getState ?? emptyState,
    emptyState,
  );

  useEffect(() => {
    if (state.role === "host" && secret) rememberSecret(id, secret);
  }, [state.role, secret, id]);

  const active = state.transfers.some((t) => ["active", "finishing", "waiting"].includes(t.status));

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    let lock: { release(): Promise<void> } | null = null;
    let released = false;
    const wake = (navigator as unknown as {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    }).wakeLock;
    const hold = () => {
      if (document.visibilityState !== "visible") return;
      void wake?.request("screen").then(
        (next) => {
          if (released) void next.release();
          else lock = next;
        },
        () => undefined,
      );
    };
    hold();
    document.addEventListener("visibilitychange", hold);
    return () => {
      released = true;
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hold);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);

  const arrival = useMemo(
    () => (listener: (batchKey: string) => void) =>
      controller?.onEvent((event) => {
        if (event.type === "received") listener(`${event.peerId}:${event.meta.batch}`);
      }) ?? (() => undefined),
    [controller],
  );

  const busy = state.transfers.filter((t) => t.status === "active" || t.status === "finishing");
  const busyTotal = busy.reduce((sum, t) => sum + t.size, 0);
  const busyPercent = busyTotal
    ? Math.floor((busy.reduce((sum, t) => sum + t.bytes, 0) / busyTotal) * 100)
    : -1;
  const linked = state.peers.filter((peer) => peer.status === "connected").length;

  useEffect(() => {
    const base = `Transfer | ${site.name}`;
    document.title =
      busyPercent >= 0
        ? `${busyPercent}% | ${site.name}`
        : linked > 0
          ? `Connected | ${site.name}`
          : base;
    return () => {
      document.title = base;
    };
  }, [busyPercent, linked]);

  const peerNames = useMemo(
    () => Object.fromEntries(state.peers.map((peer) => [peer.id, peer.name])),
    [state.peers],
  );

  if (!usable)
    return (
      <Notice tone="error">
        This browser is missing features Ferry needs. Use a current version of Chrome, Safari, Edge
        or Firefox.
      </Notice>
    );
  if (problem) return <Notice tone="error">{problem}</Notice>;

  const origin = typeof window === "undefined" ? site.url : window.location.origin;
  const inviteLink = secret ? `${origin}/room/${id}#k=${secret}` : null;
  const host = state.role === "host";
  const connected = state.peers.filter((peer) => peer.status === "connected");
  const waiting = state.peers.filter((peer) => peer.status === "approval");

  switch (state.phase) {
    case "missing":
      return <Ended title="This transfer does not exist" body="The link or code may be mistyped, or the transfer was removed." />;
    case "closed":
      return <Ended title="This transfer has ended" body="The sender closed it. Ask them to start a new one." />;
    case "expired":
      return <Ended title="This transfer has expired" body="Transfers stay open for 24 hours. Ask the sender to start a new one." />;
    case "declined":
      return <Ended title="The sender did not let this device in" body="If that was a mistake, ask them to start a new transfer." />;
    case "full":
      return <Ended title="This transfer is full" body="It already has the most devices it can hold." />;
    case "bad-link":
      return <Ended title="This link is not valid" body="Part of the link is missing or changed. Copy it again from the sending device, or use the 6-digit code." />;
    case "error":
      return <Ended title="Something went wrong" body="Ferry could not open this transfer. Check your connection and try again." />;
  }

  if (state.phase === "loading" || !controller) {
    return (
      <div className="rounded-[28px] border border-sea bg-paper p-8">
        <p className="flex items-center gap-3 text-ink/80">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-sea" aria-hidden />
          Opening the transfer
        </p>
      </div>
    );
  }

  const end = async () => {
    const sure = await ask(
      host
        ? {
            title: "End this transfer?",
            body: "Connected devices are disconnected and the link and code stop working.",
            confirm: "End transfer",
            danger: true,
          }
        : {
            title: "Leave this transfer?",
            body: active ? "Files still in progress will stop." : "You can rejoin with the same link or code.",
            confirm: "Leave",
            danger: active,
          },
    );
    if (!sure) return;
    await controller.close().catch(() => undefined);
    router.push("/");
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Copying is blocked in this browser. Select the link and copy it by hand.", "error");
    }
  };

  const remember = (peer: PeerView) => {
    controller.askToPair(peer.id);
    toast(`Asked ${peer.name}. Accept on that device to finish.`);
  };

  if (state.phase === "approval") {
    const hostPeer = state.peers[0];
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-sea bg-paper p-8 text-center">
        <h1 className="text-3xl font-bold">Check the other device</h1>
        <p className="mx-auto mt-3 max-w-sm text-ink/80">
          {state.hostName ?? "The sender"} has to let this device in. Make sure both screens show
          the same code.
        </p>
        <p className="digits mt-8 text-7xl" aria-label="Security code">
          {hostPeer?.code ? formatCode(hostPeer.code) : "··· ···"}
        </p>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-ink/80">
          <span className="pulse-dot h-2 w-2 rounded-full bg-signal" aria-hidden />
          Waiting for approval
        </p>
        <Button variant="quiet" className="mt-4" onClick={() => void end()}>
          Cancel
        </Button>
      </div>
    );
  }

  const invite = host && inviteLink && state.code && (
    <div className="ticket grid md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="rounded-[14px]"
          aria-label="Show a larger QR code"
        >
          <Qr value={inviteLink} size={208} label="QR code that opens this transfer" />
        </button>
        <span className="eyebrow">Tap to enlarge</span>
      </div>
      <div className="ticket-tear p-6 sm:p-8">
        <h1 className="text-4xl sm:text-5xl">
          {connected.length > 0 ? "Add another device" : "Open this on your other device"}
        </h1>
        <p className="serif mt-3 max-w-md text-xl leading-snug">
          Scan the code with its camera. Or go to{" "}
          <strong className="text-ink">{origin.replace(/^https?:\/\//, "")}</strong> on it and enter
          these digits.
        </p>
        <button
          type="button"
          title="Copy the code"
          onClick={() =>
            navigator.clipboard
              ?.writeText(state.code ?? "")
              .then(() => toast("Code copied", "ok"))
              .catch(() => undefined)
          }
          className="digits mt-6 block rounded-[14px] text-left text-7xl hover:text-sea-deep sm:text-[5.5rem] sm:leading-none"
          aria-label="Transfer code"
        >
          {formatCode(state.code)}
        </button>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copyLink()}>
            {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
            {copied ? "Link copied" : "Copy link"}
          </Button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button
              variant="secondary"
              onClick={() =>
                void navigator
                  .share({ title: `${site.name} transfer`, url: inviteLink })
                  .catch(() => undefined)
              }
            >
              <Share2 size={17} aria-hidden /> Share link
            </Button>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink/80">
          {state.expiresAt && now > 0 && (
            <span>Open for another {formatRemaining(state.expiresAt - now)}</span>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--sea)]"
              checked={state.visible}
              onChange={async (event) => {
                const visible = event.target.checked;
                const token = visible ? await netToken() : null;
                if (visible && !token && !state.nearbyReady) {
                  toast("Nearby discovery is not set up on this server.", "error");
                  return;
                }
                await controller.setVisible(visible, token ?? undefined).catch(() => undefined);
              }}
            />
            <Wifi size={15} aria-hidden /> Show to devices on my network
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {host && (connected.length === 0 || showInvite) && invite}

      {waiting.map((peer) => (
        <div key={peer.id} className="rise rounded-[20px] border border-signal bg-mint text-forest p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="serif text-2xl !font-bold">{peer.name} wants to join</p>
              <p className="mt-1">
                Let it in only if it shows this code:{" "}
                <strong className="digits text-xl">
                  {peer.code ? formatCode(peer.code) : ""}
                </strong>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void controller.decide(peer.id, false)}>
                Decline
              </Button>
              <Button onClick={() => void controller.decide(peer.id, true).catch(() => toast("That request changed. Check the code again.", "error"))}>
                Codes match, let it in
              </Button>
            </div>
          </div>
        </div>
      ))}

      <section aria-label="Devices" className="rounded-[20px] border border-sea bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl">
            {host
              ? connected.length === 0
                ? "Waiting for a device"
                : `${connected.length} ${connected.length === 1 ? "device" : "devices"} connected`
              : `Transfer with ${state.hostName ?? "the sender"}`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {host && connected.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setShowInvite((v) => !v)}>
                {showInvite ? "Hide code" : "Add a device"}
                <ChevronDown size={15} className={showInvite ? "rotate-180" : ""} aria-hidden />
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void end()}>
              {host ? "End transfer" : "Leave"}
            </Button>
          </div>
        </div>
        {state.peers.filter((peer) => peer.status !== "approval").length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {state.peers
              .filter((peer) => peer.status !== "approval")
              .map((peer) => {
                const known = paired.some((device) => device.id === peer.id);
                const bad = peer.status === "mismatch";
                return (
                  <li key={peer.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 flex-none rounded-full ${
                          peer.status === "connected"
                            ? "bg-ok"
                            : bad
                              ? "bg-danger"
                              : "pulse-dot bg-signal"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{peer.name}</p>
                        <p className={`text-sm ${bad ? "text-danger" : "text-ink/80"}`}>
                          {peerLine(peer)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {peer.code && !bad && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-sm"
                          title="Both devices show this code when the connection is private"
                        >
                          {peer.linked ? (
                            <Lock size={14} className="text-ok" aria-hidden />
                          ) : (
                            <ShieldAlert size={14} className="text-ink/80" aria-hidden />
                          )}
                          End-to-end encrypted, code{" "}
                          <strong className="digits">{formatCode(peer.code)}</strong>
                        </span>
                      )}
                      {peer.status === "connected" &&
                        (known ? (
                          <span className="inline-flex items-center gap-1 text-sm text-ink/80">
                            <Star size={14} aria-hidden /> Remembered
                          </span>
                        ) : (
                          <Button size="sm" variant="quiet" onClick={() => remember(peer)}>
                            <Star size={15} aria-hidden /> Remember
                          </Button>
                        ))}
                      {host && (
                        <button
                          type="button"
                          aria-label={`Remove ${peer.name}`}
                          className="rounded-full p-2 hover:bg-sunken"
                          onClick={async () => {
                            const sure = await ask({
                              title: `Remove ${peer.name}?`,
                              body: "It is disconnected and cannot rejoin this transfer.",
                              confirm: "Remove device",
                              danger: true,
                            });
                            if (sure) void controller.decide(peer.id, false);
                          }}
                        >
                          <UserMinus size={17} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <Modal open={zoomed && !!inviteLink} onClose={() => setZoomed(false)} title="Scan to connect" wide>
        {inviteLink && (
          <div className="grid place-items-center pb-2">
            <Qr value={inviteLink} size={440} label="Large QR code that opens this transfer" />
            {state.code && (
              <p className="digits mt-4 text-5xl">{formatCode(state.code)}</p>
            )}
          </div>
        )}
      </Modal>

      <TransferPanel
        transfers={state.transfers}
        notes={state.notes}
        peerNames={peerNames}
        connected={connected.length > 0}
        pending={state.pending}
        onFiles={(files) => void controller.share(files)}
        onNote={(text) => controller.sendNote(text)}
        onCancel={(transfer) => controller.cancel(transfer)}
        onWithdraw={(transferId) => controller.withdraw(transferId)}
        onRetry={(transferId) => controller.retry(transferId)}
        onArrival={arrival}
      />
    </div>
  );
}

const noopSubscribe = () => () => undefined;
const emptyState = () => EMPTY;
