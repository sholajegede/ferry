import type { FileSource } from "../protocol/types";

const MAX_FILES = 5_000;

export function fromFile(file: File, path?: string): FileSource {
  return {
    name: file.name,
    path: path && path !== file.name ? path : undefined,
    size: file.size,
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    read: async (offset, length) =>
      new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
  };
}

export function fromFileList(files: FileList | File[]): FileSource[] {
  return Array.from(files)
    .slice(0, MAX_FILES)
    .map((file) =>
      fromFile(file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined),
    );
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(resolve: (file: File) => void, reject: (error: unknown) => void): void;
  createReader?(): {
    readEntries(resolve: (entries: Entry[]) => void, reject: (error: unknown) => void): void;
  };
};

async function walk(entry: Entry, out: FileSource[]) {
  if (out.length >= MAX_FILES) return;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push(fromFile(file, entry.fullPath.replace(/^\//, "")));
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

export function fromDataTransfer(transfer: DataTransfer): Promise<FileSource[]> {
  const entries: Entry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = (
      item as DataTransferItem & { webkitGetAsEntry?(): Entry | null }
    ).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }
  if (entries.length === 0 && loose.length === 0) loose.push(...Array.from(transfer.files ?? []));
  return (async () => {
    const out: FileSource[] = loose.map((file) => fromFile(file));
    for (const entry of entries) await walk(entry, out).catch(() => undefined);
    return out;
  })();
}
