"use client";

import { Camera, ClipboardPaste, Copy, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import { getBackend, hasBackend, ready } from "@/lib/web/backend";
import { getIdentity } from "@/lib/web/device";
import { OfflineSession, type OfflineState } from "@/lib/web/offline";
import { useClientValue } from "@/lib/web/hooks";
import { handheld, supported } from "@/lib/web/platform";
import { parseInvite } from "@/lib/web/rooms";
import { Qr } from "./qr";
import { Scanner } from "./scanner";
import { TransferPanel } from "./transfer-panel";
import { Button, Notice, useFeedback } from "./ui";

const NONE: never[] = [];

const IDLE: OfflineState = {
  step: "idle",
  role: null,
  localCode: null,
  peerName: null,
  route: null,
  transfers: [],
  notes: [],
  error: null,
};

function codeFrom(value: string) {
  const invite = parseInvite(value);
  return invite && "offline" in invite ? invite.offline : null;
}

export function OfflineClient() {
  const { toast } = useFeedback();
  const [session] = useState(() =>
    typeof window === "undefined" ? null : new OfflineSession(getIdentity().name),
  );
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useState("");
  const ok = useClientValue(supported, true);
  const phone = useClientValue(handheld, false);
  const started = useRef(false);

  useEffect(() => {
    if (!session) return;
    if (!started.current && location.hash.length > 4) {
      started.current = true;
      const code = codeFrom(location.hash.slice(1));
      history.replaceState(null, "", "/offline");
      if (code) void session.join(code);
    }
    return () => session.reset();
  }, [session]);

  const state = useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getState ?? idleState,
    idleState,
  );
  const counted = useRef(false);

  useEffect(() => {
    if (state.step !== "connected" || counted.current || !navigator.onLine || !hasBackend()) return;
    counted.current = true;
    void ready()
      .then(({ deviceId, deviceSecret }) =>
        getBackend().mutation(api.stats.track, { deviceId, deviceSecret, event: "offline" }),
      )
      .catch(() => undefined);
  }, [state.step]);

  const peerNames = useMemo(
    () => ({ "offline-peer-device": state.peerName ?? "the other device" }),
    [state.peerName],
  );

  const take = (value: string) => {
    const code = codeFrom(value);
    if (!code || !session) {
      toast("That is not a Ferry offline code.", "error");
      return;
    }
    setPasted("");
    if (state.step === "show-offer") void session.finish(code);
    else void session.join(code);
  };

  if (!ok)
    return (
      <Notice tone="error">
        This browser is missing features Ferry needs. Use a current version of Chrome, Safari, Edge
        or Firefox.
      </Notice>
    );

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const share = state.localCode
    ? state.step === "show-offer"
      ? `${origin}/offline#${state.localCode}`
      : state.localCode
    : "";

  const manual = (label: string) => (
    <div className="mt-5 rounded-[14px] bg-sunken p-4">
      {state.localCode && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard
              ?.writeText(state.localCode ?? "")
              .then(() => toast("Code copied. Send it to the other device any way you can.", "ok"))
              .catch(() => toast("Copying is blocked in this browser.", "error"))
          }
        >
          <Copy size={14} aria-hidden /> Copy this device&rsquo;s code
        </Button>
      )}
      {label && (
        <form
          className={state.localCode ? "mt-4" : ""}
          onSubmit={(event) => {
            event.preventDefault();
            take(pasted);
          }}
        >
          <label htmlFor="offline-code" className="eyebrow">
            {label}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="offline-code"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              className="h-10 w-full min-w-0 rounded-full border border-sea bg-paper px-5 text-sm"
              placeholder="F1."
            />
            <Button type="submit" variant="secondary" disabled={!pasted.trim()}>
              <ClipboardPaste size={16} aria-hidden /> Use
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  const camera = (label: string) => (
    <Button
      size={phone ? "lg" : "md"}
      variant={phone ? "primary" : "secondary"}
      className="mt-5"
      onClick={() => setScanning(true)}
    >
      <Camera size={18} aria-hidden /> {phone ? label : "Use this computer’s camera"}
    </Button>
  );

  return (
    <div>
      {state.step === "idle" && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[28px] border border-sea bg-paper p-6">
            <h2 className="text-4xl">Start here</h2>
            <p className="serif mt-2 text-xl leading-snug">
              This device shows a QR code. The other device scans it.
            </p>
            <Button size="lg" className="mt-5" onClick={() => void session?.start()}>
              Show a code
            </Button>
          </div>
          <div className="rounded-[28px] border border-sea bg-paper p-6">
            <h2 className="text-4xl">Join from here</h2>
            <p className="serif mt-2 text-xl leading-snug">
              The other device is already showing a code. On a phone, the camera app opens it for
              you.
            </p>
            {camera("Scan its code")}
            {manual("Paste the other device’s code")}
          </div>
        </div>
      )}

      {state.step === "preparing" && (
        <p className="flex items-center gap-3 text-ink/80">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-sea" aria-hidden /> Getting ready
        </p>
      )}

      {(state.step === "show-offer" || state.step === "show-answer") && share && (
        <div className="ticket grid md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex items-center justify-center p-6">
            <Qr value={share} size={288} label="QR code for the other device" />
          </div>
          <div className="ticket-tear p-6 sm:p-8">
            {state.step === "show-offer" ? (
              <>
                <h2 className="text-4xl">Step 1 of 2: scan this on the other device</h2>
                <p className="serif mt-3 max-w-md text-xl leading-snug">
                  Point the other device&rsquo;s camera at this code. It shows a reply code. Bring
                  that reply back here.
                </p>
                {camera("Scan the reply")}
                {manual("Paste the reply code")}
              </>
            ) : (
              <>
                <h2 className="text-4xl">Step 2 of 2: show this reply to the first device</h2>
                <p className="serif mt-3 max-w-md text-xl leading-snug">
                  The first device reads this code with its camera, or you paste it there. The two
                  devices connect as soon as it is read.
                </p>
                <p className="mt-5 flex items-center gap-2 text-sm text-ink/80">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-signal" aria-hidden /> Waiting
                  for the first device
                </p>
                {manual("")}
              </>
            )}
            <Button variant="quiet" size="sm" className="mt-4" onClick={() => session?.reset()}>
              <RotateCcw size={15} aria-hidden /> Start over
            </Button>
          </div>
        </div>
      )}

      {state.step === "connecting" && (
        <p className="flex items-center gap-3 text-ink/80">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-sea" aria-hidden /> Connecting the
          two devices
        </p>
      )}

      {state.step === "failed" && (
        <div className="max-w-xl space-y-4">
          <Notice tone="error">{state.error}</Notice>
          <Button onClick={() => session?.reset()}>Try again</Button>
        </div>
      )}

      {(state.step === "connected" || state.step === "lost") && session && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-sea bg-paper p-5">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${state.step === "connected" ? "bg-ok" : "bg-danger"}`}
                aria-hidden
              />
              <div>
                <p className="font-semibold">
                  {state.step === "connected"
                    ? `Connected to ${state.peerName ?? "the other device"}`
                    : "The connection was lost"}
                </p>
                <p className="text-sm text-ink/80">
                  {state.step === "connected"
                    ? "Encrypted, sent over your local network, with no internet involved"
                    : "Start over and scan again. Files already received stay saved, and unfinished ones continue."}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => session.reset()}>
              {state.step === "connected" ? "Disconnect" : "Start over"}
            </Button>
          </div>
          <TransferPanel
            transfers={state.transfers}
            notes={state.notes}
            peerNames={peerNames}
            connected={state.step === "connected"}
            pending={NONE}
            onFiles={(files) => void session.share(files)}
            onNote={(text) => session.sendNote(text)}
            onCancel={(transfer) => session.cancel(transfer)}
            onWithdraw={(id) => session.withdraw(id)}
            onArrival={session.onArrival}
          />
        </div>
      )}

      <Scanner
        open={scanning}
        title={state.step === "show-offer" ? "Scan the reply" : "Scan the other device"}
        hint="Hold the camera steady on the whole code."
        onClose={() => setScanning(false)}
        onResult={(value) => {
          setScanning(false);
          take(value);
        }}
      />
    </div>
  );
}

const noopSubscribe = () => () => undefined;
const idleState = () => IDLE;
