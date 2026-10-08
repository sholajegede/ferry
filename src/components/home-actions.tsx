"use client";

import { MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FileSource } from "@/lib/protocol/types";
import { formatBytes } from "@/lib/web/format";
import { useClientValue, useIdentity, usePaired } from "@/lib/web/hooks";
import { readShared } from "@/lib/web/outbox";
import type { PairedDevice } from "@/lib/web/paired";
import { supported } from "@/lib/web/platform";
import { createRoom } from "@/lib/web/rooms";
import { fromDataTransfer } from "@/lib/web/sources";
import { Notice, useFeedback } from "./ui";

export function errorText(error: unknown) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code === "slow-down") return "Too many tries in a short time. Wait a few minutes and try again.";
  if (code === "not-paired")
    return "That device is no longer linked. Connect once with a code to link it again.";
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You are offline. Use offline mode to send over the same Wi-Fi.";
  return "Could not reach the server. Check your connection and try again.";
}

function useStart() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const start = async (options: { files?: FileSource[]; note?: string; ring?: PairedDevice }) => {
    if (busy) return;
    setBusy(true);
    try {
      router.push(await createRoom(options));
    } catch (error) {
      toast(errorText(error), "error");
    }
    setBusy(false);
  };
  return { busy, start };
}

export function SendButton({
  label = "Send files",
  tone = "primary",
}: {
  label?: string;
  tone?: "primary" | "light" | "nav";
}) {
  const { busy, start } = useStart();
  const ok = useClientValue(supported, true);
  return (
    <button
      type="button"
      disabled={busy || !ok}
      onClick={() => void start({})}
      className={`pill transition-colors disabled:opacity-50 ${
        tone === "nav"
          ? "ml-1 h-9 bg-sea-deep px-5 text-xs text-on-sea hover:bg-night"
          : tone === "primary"
            ? "h-10 bg-sea px-6 text-[0.8125rem] text-on-sea hover:bg-sea-deep"
            : "h-10 bg-paper px-6 text-[0.8125rem] text-sea-deep hover:bg-lilac"
      }`}
    >
      {busy ? "Starting" : label}
    </button>
  );
}

export function HeroExtras() {
  const { busy, start } = useStart();
  const { failed } = useIdentity();
  const paired = usePaired();
  const ok = useClientValue(supported, true);
  const [shared, setShared] = useState<{ files: FileSource[]; note: string } | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(location.search).has("shared")) return;
    void readShared().then((items) => {
      if (items.files.length > 0 || items.note) setShared(items);
      history.replaceState(null, "", "/");
    });
  }, []);

  const size = shared?.files.reduce((sum, file) => sum + file.size, 0) ?? 0;
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(start);

  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!event.dataTransfer || !hasFiles(event)) return;
      event.preventDefault();
      void fromDataTransfer(event.dataTransfer).then((files) => {
        if (files.length > 0) void startRef.current({ files });
      });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="mt-5 space-y-4">
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-[40px] border-2 border-dashed border-sea bg-lilac/90">
          <p className="serif text-4xl !font-bold text-sea-deep">Drop to start a transfer</p>
        </div>
      )}
      {!ok && (
        <div className="max-w-xl">
          <Notice tone="error">
            This browser is missing features Ferry needs. Use a current version of Chrome, Safari,
            Edge or Firefox.
          </Notice>
        </div>
      )}
      {failed && ok && (
        <div className="max-w-xl">
          <Notice tone="warn">
            Ferry cannot reach its server right now. On the same Wi-Fi you can still use{" "}
            <a href="/offline" className="font-semibold underline">
              offline mode
            </a>
            .
          </Notice>
        </div>
      )}
      {shared && (
        <div className="flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-[20px] bg-mint p-5 text-forest">
          <p className="serif text-xl !font-bold">
            {shared.files.length > 0
              ? `${shared.files.length} ${shared.files.length === 1 ? "file" : "files"} ready, ${formatBytes(size)}`
              : "Text ready to send"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(shared)}
            className="pill h-9 bg-signal px-5 text-xs text-on-signal hover:bg-forest"
          >
            Send them
          </button>
        </div>
      )}
      {paired.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Your devices</span>
          {paired.map((device) => (
            <button
              key={device.id}
              type="button"
              disabled={busy || !ok}
              onClick={() => void start({ ...(shared ?? {}), ring: device })}
              className="inline-flex h-[30px] items-center gap-2 rounded-full border border-sea px-3 text-sm font-semibold hover:bg-sunken disabled:opacity-50"
              aria-label={`Send to ${device.name}`}
            >
              <MonitorSmartphone size={15} aria-hidden /> {device.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
