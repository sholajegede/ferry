import type { TransferView } from "../protocol/types";
import { receivedBlob, writeStreamToDisk } from "./sinks";

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function saveReceived(transfer: Pick<TransferView, "peerId" | "id" | "name">) {
  const blob = await receivedBlob(transfer.peerId, transfer.id);
  if (!blob) return false;
  saveBlob(blob, transfer.name);
  return true;
}

export async function saveZip(
  transfers: Pick<TransferView, "peerId" | "id" | "name" | "path">[],
  name: string,
) {
  const { downloadZip } = await import("client-zip");
  const used = new Set<string>();
  const entries: { name: string; input: Blob; lastModified: Date }[] = [];
  for (const transfer of transfers) {
    const blob = await receivedBlob(transfer.peerId, transfer.id);
    if (!blob) continue;
    let entry = transfer.path ?? transfer.name;
    for (let n = 2; used.has(entry); n++) {
      const dot = transfer.name.lastIndexOf(".");
      const stem = dot > 0 ? transfer.name.slice(0, dot) : transfer.name;
      const ext = dot > 0 ? transfer.name.slice(dot) : "";
      entry = `${stem} (${n})${ext}`;
    }
    used.add(entry);
    entries.push({ name: entry, input: blob, lastModified: new Date() });
  }
  if (entries.length === 0) return false;
  const body = downloadZip(entries).body;
  if (!body) return false;
  const blob = await writeStreamToDisk(`zip-${Date.now()}`, body);
  saveBlob(blob, name.endsWith(".zip") ? name : `${name}.zip`);
  return true;
}
