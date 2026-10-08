"use client";

import { Camera, Pencil, Radio, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { getBackend, ready } from "@/lib/web/backend";
import { renameDevice } from "@/lib/web/device";
import { useClientValue, useIdentity, useLive, useNow, usePaired } from "@/lib/web/hooks";
import { netToken } from "@/lib/web/net";
import { removePaired } from "@/lib/web/paired";
import { handheld } from "@/lib/web/platform";
import { parseInvite } from "@/lib/web/rooms";
import { errorText } from "./home-actions";
import { Scanner } from "./scanner";
import { Button, Modal, useFeedback } from "./ui";

const ONLINE_MS = 70_000;

export function ReceivePanel() {
  const router = useRouter();
  const { toast, ask } = useFeedback();
  const { identity } = useIdentity();
  const paired = usePaired();
  const now = useNow(5000);
  const phone = useClientValue(handheld, false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [net, setNet] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const creds = useMemo(
    () => (identity ? { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret } : null),
    [identity],
  );

  useEffect(() => {
    void netToken().then(setNet);
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      const invite = parseInvite(text);
      if (invite && "path" in invite && text.includes("/room/")) router.push(invite.path);
      else if (/^\d{3}\s?\d{3}$/.test(text)) setCode(text.replace(/\D/g, ""));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [router]);

  const nearby = useLive(api.rooms.nearby, creds && net ? { ...creds, netToken: net } : "skip");
  const pairState = useLive(
    api.pairs.status,
    creds && paired.length > 0 ? { ...creds, peers: paired.map((device) => device.id) } : "skip",
  );
  const visibleNearby = (nearby ?? []).filter(
    (room) => now > 0 && now - room.hostSeenAt < ONLINE_MS && room.expiresAt > now,
  );

  const joinWithCode = async (value: string) => {
    if (!/^\d{6}$/.test(value) || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const me = await ready();
      const result = await getBackend().mutation(api.rooms.lookupCode, {
        deviceId: me.deviceId,
        deviceSecret: me.deviceSecret,
        code: value,
      });
      if (result.roomId) {
        router.push(`/room/${result.roomId}?via=code`);
        setCode("");
      } else {
        setProblem(
          result.limited
            ? "Too many tries. Wait a few minutes, or open the link instead."
            : "No transfer has that code. Check the six digits on the other device.",
        );
      }
    } catch (error) {
      setProblem(errorText(error));
    }
    setBusy(false);
  };

  const follow = (value: string) => {
    const invite = parseInvite(value);
    if (!invite) return false;
    if ("offline" in invite) router.push(`/offline#${invite.offline}`);
    else router.push(invite.path);
    return true;
  };

  return (
    <div className="rounded-[28px] bg-paper p-6 text-left text-ink sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void joinWithCode(code);
          }}
        >
          <label htmlFor="code" className="serif text-2xl !font-bold">
            Have a 6-digit code?
          </label>
          <p className="mt-1 text-sm">It is on the screen of the sending device.</p>
          <div className="mt-4 flex gap-2">
            <input
              id="code"
              aria-label="Enter the 6-digit code from the other device"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                setProblem(null);
                if (digits.length === 6) void joinWithCode(digits);
              }}
              placeholder="000 000"
              className="digits h-12 w-full min-w-0 rounded-full border border-sea bg-paper px-6 text-2xl"
            />
            <Button type="submit" size="lg" disabled={code.length !== 6 || busy}>
              Join
            </Button>
          </div>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!follow(link))
              setProblem("That is not a Ferry link. Copy the link from the other device again.");
          }}
        >
          <label htmlFor="link" className="serif text-2xl !font-bold">
            Have a transfer link?
          </label>
          <p className="mt-1 text-sm">Paste the link the sender copied for you.</p>
          <div className="mt-4 flex gap-2">
            <input
              id="link"
              aria-label="Or paste a link"
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                setProblem(null);
              }}
              placeholder="https://"
              className="h-12 w-full min-w-0 rounded-full border border-sea bg-paper px-6"
            />
            <Button type="submit" size="lg" variant="secondary" disabled={!link.trim()}>
              Open
            </Button>
          </div>
        </form>
      </div>

      {problem && <p className="mt-4 text-sm font-semibold text-danger">{problem}</p>}

      <p className="mt-6 text-sm">
        {phone
          ? "Have a QR code in front of you? Scan it here, or with your phone’s camera app."
          : "On a phone, point the camera app at the QR code on the sending device. It opens the transfer by itself."}
      </p>
      {phone && (
        <Button variant="secondary" className="mt-3" onClick={() => setScanning(true)}>
          <Camera size={16} aria-hidden /> Scan a QR code
        </Button>
      )}

      {visibleNearby.length > 0 && (
        <div className="mt-8 border-t border-line pt-6">
          <h3 className="eyebrow flex items-center gap-2 !font-mono">
            <Radio size={15} aria-hidden /> On your network now
          </h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {visibleNearby.map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between gap-3 rounded-[14px] bg-mint px-4 py-3 text-forest"
              >
                <p className="min-w-0 truncate font-semibold">{room.hostName}</p>
                <button
                  type="button"
                  onClick={() => router.push(`/room/${room.roomId}?via=nearby`)}
                  className="pill h-8 bg-signal px-4 text-[0.6875rem] text-on-signal hover:bg-forest"
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            The sender has to approve you and both screens show a matching code.
          </p>
        </div>
      )}

      {paired.length > 0 && (
        <div className="mt-8 border-t border-line pt-6">
          <h3 className="eyebrow !font-mono">Your devices</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {paired.map((device) => {
              const live = pairState?.find((entry) => entry.peer === device.id);
              const online = !!live?.linked && now > 0 && now - live.lastSeen < ONLINE_MS;
              return (
                <li
                  key={device.id}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{live?.name ?? device.name}</p>
                    <p className="flex items-center gap-1.5 text-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${online ? "bg-signal" : "bg-line"}`}
                        aria-hidden
                      />
                      {live && !live.linked
                        ? "No longer linked"
                        : online
                          ? "Ferry is open on it"
                          : "Open Ferry on it to receive"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Forget ${device.name}`}
                    className="rounded-full p-2 hover:bg-sunken"
                    onClick={async () => {
                      const sure = await ask({
                        title: `Forget ${device.name}?`,
                        body: "You can link it again by connecting once with a code.",
                        confirm: "Forget device",
                        danger: true,
                      });
                      if (!sure) return;
                      removePaired(device.id);
                      if (creds)
                        void getBackend()
                          .mutation(api.pairs.unlink, { ...creds, peer: device.id })
                          .catch(() => undefined);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {identity && (
        <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t border-line pt-5 text-sm">
          This device shows up as <strong>{identity.name}</strong>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md font-semibold underline underline-offset-2"
            onClick={() => {
              setNameDraft(identity.name);
              setRenaming(true);
            }}
          >
            <Pencil size={13} aria-hidden /> Rename
          </button>
        </p>
      )}

      <Scanner
        open={scanning}
        title="Scan the QR code"
        hint="Point the camera at the code on the sending device."
        onClose={() => setScanning(false)}
        onResult={(value) => {
          setScanning(false);
          if (!follow(value)) toast("That QR code is not a Ferry code.", "error");
        }}
      />

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename this device">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            renameDevice(nameDraft);
            setRenaming(false);
          }}
        >
          <label htmlFor="device-name" className="text-sm">
            Other devices see this name when you connect.
          </label>
          <input
            id="device-name"
            value={nameDraft}
            maxLength={40}
            onChange={(event) => setNameDraft(event.target.value)}
            className="mt-2 h-11 w-full rounded-full border border-sea bg-paper px-5"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!nameDraft.trim()}>
              Save name
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
