import type { FileSource } from "../protocol/types";
import { fromFile } from "./sources";

const SHARE_CACHE = "ferry-share";

let files: FileSource[] = [];
let note = "";

export function stash(next: { files?: FileSource[]; note?: string }) {
  if (next.files) files = [...files, ...next.files];
  if (next.note) note = next.note;
}

export function takeStash() {
  const taken = { files, note };
  files = [];
  note = "";
  return taken;
}

export async function readShared(): Promise<{ files: FileSource[]; note: string }> {
  if (typeof caches === "undefined") return { files: [], note: "" };
  const cache = await caches.open(SHARE_CACHE);
  const requests = await cache.keys();
  const shared: FileSource[] = [];
  let text = "";
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    if (request.url.endsWith("/__share/text")) {
      text = await response.text();
    } else {
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get("X-File-Name") ?? "shared-file");
      const modified = Number(response.headers.get("X-Last-Modified")) || Date.now();
      shared.push(fromFile(new File([blob], name, { type: blob.type, lastModified: modified })));
    }
    await cache.delete(request);
  }
  return { files: shared, note: text };
}
