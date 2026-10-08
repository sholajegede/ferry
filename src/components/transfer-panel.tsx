"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  ExternalLink,
  FileArchive,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileMeta, FileSource, NoteView, TransferView } from "@/lib/protocol/types";
import { armChime, chime } from "@/lib/web/chime";
import { formatBytes, formatDuration, formatRate } from "@/lib/web/format";
import { useLocalFlag } from "@/lib/web/hooks";
import { saveReceived, saveZip } from "@/lib/web/save";
import { removeReceived } from "@/lib/web/sinks";
import { fromDataTransfer, fromFileList } from "@/lib/web/sources";
import { Dropzone } from "./dropzone";
import { FileTile } from "./file-kind";
import { Button, useFeedback } from "./ui";

const AUTOSAVE_KEY = "ferry.autosave";
const SOUND_KEY = "ferry.sound";

type Props = {
  transfers: TransferView[];
  notes: NoteView[];
  peerNames: Record<string, string>;
  connected: boolean;
  pending: FileMeta[];
  onFiles(files: FileSource[]): void;
  onNote(text: string): boolean;
  onCancel(transfer: TransferView): void;
  onWithdraw(id: string): void;
  onRetry?(id: string): boolean;
  onArrival(listener: (batchKey: string) => void): () => void;
};

function statusLine(transfer: TransferView, connected: boolean) {
  const { status, direction, bytes, size, rate, error } = transfer;
  if (status === "done") return direction === "out" ? "Sent" : "Received";
  if (status === "cancelled") return "Cancelled";
  if (status === "failed") {
    if (error === "space")
      return direction === "out"
        ? "The other device does not have enough free space"
        : "Not enough free space on this device";
    if (error === "source") return "This file changed or could not be read";
    return direction === "out"
      ? "The other device could not save this file"
      : "This file could not be saved";
  }
  if (status === "queued") {
    if (!connected) return bytes > 0 ? "Paused. Continues when the connection is back" : "Sends when a device connects";
    return "Up next";
  }
  if (status === "waiting") return bytes > 0 ? "Picking up where it stopped" : "Starting";
  if (status === "finishing") return "Finishing";
  const parts = [`${formatBytes(bytes)} of ${formatBytes(size)}`];
  if (rate > 0) {
    parts.push(formatRate(rate));
    parts.push(formatDuration((size - bytes) / rate));
  }
  return parts.filter(Boolean).join(", ");
}

function Row({
  transfer,
  peerName,
  showPeer,
  connected,
  saved,
  onSaved,
  onCancel,
  onRemove,
  onRetry,
}: {
  transfer: TransferView;
  peerName: string;
  showPeer: boolean;
  connected: boolean;
  saved: boolean;
  onSaved(): void;
  onCancel(): void;
  onRemove(): void;
  onRetry?(): void;
}) {
  const { toast } = useFeedback();
  const percent = transfer.size ? Math.min(100, (transfer.bytes / transfer.size) * 100) : 100;
  const moving = transfer.status === "active" || transfer.status === "finishing";
  const open = ["queued", "waiting", "active", "finishing"].includes(transfer.status);
  const folder = transfer.path?.includes("/")
    ? transfer.path.slice(0, transfer.path.lastIndexOf("/") + 1)
    : "";
  const Icon = transfer.direction === "out" ? ArrowUpFromLine : ArrowDownToLine;

  return (
    <li className="rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex items-start gap-3">
        <FileTile name={transfer.name} type={transfer.type} done={transfer.status === "done"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1.5 font-semibold leading-snug text-sea-deep [overflow-wrap:anywhere]">
            <Icon size={15} className="mt-1 flex-none text-ink" aria-label={transfer.direction === "out" ? "Sending" : "Receiving"} />
            <span className="min-w-0">
              {folder && <span className="font-normal text-ink/80">{folder}</span>}
              {transfer.name}
            </span>
          </p>
          <p
            className={`mt-0.5 text-sm ${transfer.status === "failed" ? "text-danger" : "text-ink/80"}`}
          >
            {statusLine(transfer, connected)}
            {!moving && transfer.status !== "failed" && `, ${formatBytes(transfer.size)}`}
            {showPeer && `, ${transfer.direction === "out" ? "to" : "from"} ${peerName}`}
          </p>
        </div>
        <div className="flex flex-none items-center gap-1">
          {transfer.direction === "in" && transfer.status === "done" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (await saveReceived(transfer)) onSaved();
                else toast("This file is no longer stored in this browser.", "error");
              }}
            >
              {saved ? "Save again" : "Save"}
            </Button>
          )}
          {onRetry &&
            connected &&
            transfer.direction === "out" &&
            (transfer.status === "failed" || transfer.status === "cancelled") && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Send again
              </Button>
            )}
          <button
            type="button"
            onClick={open ? onCancel : onRemove}
            aria-label={open ? `Cancel ${transfer.name}` : `Remove ${transfer.name} from the list`}
            className="rounded-full p-2 hover:bg-sunken"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {open && (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${transfer.name} progress`}
        >
          <div
            className={`h-full rounded-full ${moving ? "wake" : "bg-line"}`}
            style={{ width: `${percent}%`, transition: "width 200ms linear" }}
          />
        </div>
      )}
    </li>
  );
}

function linkIn(text: string) {
  const match = text.trim().match(/^https?:\/\/[^\s]+$/i);
  return match ? match[0] : null;
}

export function TransferPanel(props: Props) {
  const { transfers, notes, peerNames, connected, pending } = props;
  const { toast, ask } = useFeedback();
  const [draft, setDraft] = useState("");
  const [autosave, setAutosave] = useLocalFlag(AUTOSAVE_KEY, true);
  const [sound, setSound] = useLocalFlag(SOUND_KEY, true);
  const soundRef = useRef(true);
  const sending = useRef(0);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(() => armChime(), []);
  useEffect(() => {
    const out = transfers.filter((t) => t.direction === "out");
    const open = out.filter((t) => ["waiting", "active", "finishing"].includes(t.status)).length;
    if (sending.current > 0 && open === 0 && out.some((t) => t.status === "done") && soundRef.current)
      chime();
    sending.current = open;
  }, [transfers]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(props.onFiles);
  const arrived = useRef(new Set<string>());
  const [arrivals, setArrivals] = useState(0);
  const handled = useRef(new Set<string>());
  const autosaveRef = useRef(true);

  useEffect(() => {
    autosaveRef.current = autosave;
  }, [autosave]);
  const multiPeer = Object.keys(peerNames).length > 1;

  const visible = useMemo(
    () => transfers.filter((transfer) => !hidden.has(transfer.key)),
    [transfers, hidden],
  );
  const incomingDone = visible.filter((t) => t.direction === "in" && t.status === "done");

  const { onArrival } = props;
  useEffect(
    () =>
      onArrival((batchKey) => {
        arrived.current.add(batchKey);
        setArrivals((count) => count + 1);
      }),
    [onArrival],
  );

  useEffect(() => {
    for (const key of arrived.current) {
      if (handled.current.has(key)) continue;
      const batch = transfers.filter(
        (t) => t.direction === "in" && `${t.peerId}:${t.batch}` === key,
      );
      if (batch.length === 0) continue;
      if (!batch.every((t) => ["done", "cancelled", "failed"].includes(t.status))) continue;
      handled.current.add(key);
      const done = batch.filter((t) => t.status === "done");
      if (done.length === 0) continue;
      const count = `${done.length} ${done.length === 1 ? "file" : "files"} received`;
      if (soundRef.current) chime();
      if (!autosaveRef.current) {
        toast(`${count}. Choose Save to keep ${done.length === 1 ? "it" : "them"}.`, "ok");
        continue;
      }
      toast(`${count} and saved to your downloads`, "ok");
      setSaved((current) => new Set([...current, ...done.map((t) => t.key)]));
      if (done.length === 1) void saveReceived(done[0]);
      else void saveZip(done, zipName(done));
    }
  }, [transfers, arrivals, toast]);

  useEffect(() => {
    onFilesRef.current = props.onFiles;
  }, [props.onFiles]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        onFilesRef.current(fromFileList(files));
        return;
      }
      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();
        setDraft((current) => current + text);
      }
    };
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
      if (event.defaultPrevented || !event.dataTransfer || !hasFiles(event)) return;
      event.preventDefault();
      void fromDataTransfer(event.dataTransfer).then((files) => {
        if (files.length > 0) onFilesRef.current(files);
      });
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const sendDraft = () => {
    if (!draft.trim()) return;
    if (props.onNote(draft)) setDraft("");
    else toast("Text sends once the other device is connected.", "error");
  };

  const remove = (transfer: TransferView) => {
    setHidden((current) => new Set(current).add(transfer.key));
    if (transfer.direction === "in") void removeReceived(transfer.peerId, transfer.id);
    else props.onWithdraw(transfer.id);
  };

  const cancel = async (transfer: TransferView) => {
    const sure = await ask({
      title: `Cancel ${transfer.name}?`,
      body:
        transfer.direction === "out"
          ? "The other device will not receive this file."
          : "The part already received will be deleted.",
      confirm: "Cancel transfer",
      cancel: "Keep going",
      danger: true,
    });
    if (sure) props.onCancel(transfer);
  };

  const open = visible.filter((t) => ["queued", "waiting", "active", "finishing"].includes(t.status));
  const totalBytes = open.reduce((sum, t) => sum + t.size, 0);
  const movedBytes = open.reduce((sum, t) => sum + t.bytes, 0);
  const rate = open.reduce((sum, t) => sum + t.rate, 0);
  const summary =
    open.length > 1
      ? `${open.length} files in progress, ${formatBytes(movedBytes)} of ${formatBytes(totalBytes)}${
          rate > 0 ? `, ${formatDuration((totalBytes - movedBytes) / rate)}` : ""
        }`
      : pending.length > 1
        ? `${pending.length} files ready, ${formatBytes(pending.reduce((sum, f) => sum + f.size, 0))}`
        : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-[40px] border-2 border-dashed border-sea bg-lilac/90">
          <p className="serif text-4xl !font-bold text-sea-deep">Drop to send</p>
        </div>
      )}
      <section aria-label="Send" className="min-w-0">
        <Dropzone
          compact
          onFiles={props.onFiles}
          title="Drop files or folders to send"
          hint={connected ? "You can also paste from the clipboard." : "Add them now. They send as soon as a device connects."}
        />
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            sendDraft();
          }}
        >
          <label htmlFor="note" className="eyebrow">
            Send text or a link
          </label>
          <div className="mt-1.5 flex items-end gap-2">
            <textarea
              id="note"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  sendDraft();
                }
              }}
              placeholder="A password, an address, a link"
              className="min-h-11 flex-1 resize-y rounded-[20px] border border-sea bg-paper px-4 py-2.5 text-[0.95rem]"
            />
            <Button type="submit" disabled={!draft.trim()} aria-label="Send text">
              <Send size={18} aria-hidden />
            </Button>
          </div>
        </form>
        {notes.length > 0 && (
          <ul className="mt-4 space-y-2" aria-label="Text sent and received">
            {notes.map((note) => {
              const link = linkIn(note.text);
              return (
                <li
                  key={`${note.direction}:${note.id}`}
                  className={`rounded-[14px] border p-4 text-sm ${
                    note.direction === "in" ? "border-sea bg-sunken" : "border-line bg-paper"
                  }`}
                >
                  <p className="text-xs font-semibold text-ink/80">
                    {note.direction === "in"
                      ? `From ${peerNames[note.peerId] ?? "the other device"}`
                      : note.delivered === false
                        ? "Sending. It goes as soon as the other device is connected."
                        : "You sent, delivered"}
                  </p>
                  <p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(note.text)
                          .then(() => toast("Copied", "ok"))
                          .catch(() => toast("Copying is blocked in this browser.", "error"))
                      }
                    >
                      <Copy size={14} aria-hidden /> Copy
                    </Button>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pill h-8 gap-1.5 border border-sea px-3.5 text-[0.6875rem] hover:bg-sunken"
                      >
                        <ExternalLink size={14} aria-hidden /> Open link
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Transfers" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl">Transfers</h2>
          <div className="flex flex-wrap items-center gap-3">
            {incomingDone.length > 1 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  toast("Building the zip file");
                  if (!(await saveZip(incomingDone, zipName(incomingDone))))
                    toast("These files are no longer stored in this browser.", "error");
                }}
              >
                <FileArchive size={15} aria-hidden /> Save all as zip
              </Button>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--sea)]"
                checked={autosave}
                onChange={(event) => setAutosave(event.target.checked)}
              />
              Save received files automatically
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--sea)]"
                checked={sound}
                onChange={(event) => setSound(event.target.checked)}
              />
              Sound when done
            </label>
          </div>
        </div>
        {summary && <p className="mb-3 text-sm">{summary}</p>}
        {visible.length === 0 && pending.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-paper p-5 text-ink/80">
            Nothing sent or received yet. Drop files anywhere on this page, or paste them.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((file) => (
              <li key={`pending:${file.id}`} className="rounded-[14px] border border-dashed border-sea bg-paper p-3.5">
                <div className="flex items-start gap-3">
                  <FileTile name={file.name} type={file.type} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-sea-deep [overflow-wrap:anywhere]">
                      {file.path?.includes("/") && (
                        <span className="font-normal text-ink/80">
                          {file.path.slice(0, file.path.lastIndexOf("/") + 1)}
                        </span>
                      )}
                      {file.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink/80">
                      Sends when a device connects, {formatBytes(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onWithdraw(file.id)}
                    aria-label={`Remove ${file.name}`}
                    className="rounded-full p-2 hover:bg-sunken"
                  >
                    <X size={18} />
                  </button>
                </div>
              </li>
            ))}
            {visible.map((transfer) => (
              <Row
                key={transfer.key}
                transfer={transfer}
                peerName={peerNames[transfer.peerId] ?? "the other device"}
                showPeer={multiPeer}
                connected={connected}
                saved={saved.has(transfer.key)}
                onSaved={() => setSaved((current) => new Set(current).add(transfer.key))}
                onCancel={() => void cancel(transfer)}
                onRemove={() => remove(transfer)}
                onRetry={
                  props.onRetry
                    ? () => {
                        if (!props.onRetry?.(transfer.id))
                          toast("That file is no longer in this transfer. Add it again.", "error");
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function zipName(transfers: TransferView[]) {
  const roots = new Set(transfers.map((t) => (t.path?.includes("/") ? t.path.split("/")[0] : "")));
  if (roots.size === 1) {
    const [root] = roots;
    if (root) return `${root}.zip`;
  }
  return `ferry-${transfers.length}-files.zip`;
}
