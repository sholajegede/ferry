"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { getBackend, hasBackend } from "@/lib/web/backend";
import { useIdentity, useLive, useNow } from "@/lib/web/hooks";
import { openInvite } from "@/lib/web/paired";
import { Button, Modal } from "./ui";

const RING_WINDOW_MS = 120_000;

export function Background() {
  const { identity } = useIdentity();
  const router = useRouter();
  const now = useNow(5000);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visited = useRef(new Set<string>());
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!identity || !hasBackend()) return;
    const creds = { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret };
    const backend = getBackend();
    const page = pathname.startsWith("/room/") ? "/room" : pathname;
    if (!visited.current.has(page) && !pathname.startsWith("/admin")) {
      visited.current.add(page);
      let referrer: string | undefined;
      try {
        const from = document.referrer ? new URL(document.referrer).hostname : "";
        if (from && from !== location.hostname) referrer = from.replace(/^www\./, "");
      } catch {}
      void backend
        .mutation(api.stats.track, { ...creds, event: "visit", path: page, referrer })
        .catch(() => undefined);
    }
    const beat = () => {
      if (document.visibilityState === "visible")
        void backend.mutation(api.devices.heartbeat, creds).catch(() => undefined);
    };
    const timer = setInterval(beat, 25_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [identity, pathname]);

  const rings = useLive(
    api.pairs.incoming,
    identity ? { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret } : "skip",
  );
  const ring = (rings ?? []).find(
    (entry) => !dismissed.has(entry.id) && now > 0 && now - entry.at < RING_WINDOW_MS,
  );

  const settle = (accept: boolean) => {
    if (!ring || !identity) return;
    setDismissed((current) => new Set(current).add(ring.id));
    void getBackend()
      .mutation(api.pairs.dismiss, {
        deviceId: identity.deviceId,
        deviceSecret: identity.deviceSecret,
        ringId: ring.id,
      })
      .catch(() => undefined);
    if (!accept) return;
    void openInvite(ring.from, ring.sealed).then((invite) => {
      if (invite) router.push(`/room/${invite.roomId}#k=${invite.secret}`);
    });
  };

  return (
    <Modal open={!!ring} onClose={() => settle(false)} title="Incoming transfer">
      {ring && (
        <>
          <p className="text-ink/80">
            <strong className="text-ink">{ring.fromName}</strong>, one of your remembered devices,
            wants to send something to this device.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(false)}>
              Not now
            </Button>
            <Button onClick={() => settle(true)}>Receive</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
