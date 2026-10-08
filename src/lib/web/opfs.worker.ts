type SyncHandle = {
  getSize(): number;
  truncate(size: number): void;
  write(data: ArrayBufferView, options: { at: number }): number;
  flush(): void;
  close(): void;
};

type Job =
  | { seq: number; op: "probe" }
  | { seq: number; op: "open"; name: string; keep: number }
  | { seq: number; op: "write"; name: string; at: number; buffer: ArrayBuffer; offset: number; length: number }
  | { seq: number; op: "flush"; name: string }
  | { seq: number; op: "close"; name: string }
  | { seq: number; op: "remove"; name: string }
  | { seq: number; op: "list" };

const handles = new Map<string, SyncHandle>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown): void;
};

async function directory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("ferry", { create: true });
}

async function perform(request: Job): Promise<unknown> {
  switch (request.op) {
    case "probe": {
      await directory();
      return true;
    }
    case "open": {
      handles.get(request.name)?.close();
      const dir = await directory();
      const file = await dir.getFileHandle(request.name, { create: true });
      const handle = (await (
        file as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }
      ).createSyncAccessHandle()) as SyncHandle;
      const size = handle.getSize();
      const keep = Math.min(size, request.keep);
      if (size !== keep) handle.truncate(keep);
      handles.set(request.name, handle);
      return keep;
    }
    case "write": {
      const handle = handles.get(request.name);
      if (!handle) throw new Error("File is not open");
      const view = new Uint8Array(request.buffer, request.offset, request.length);
      const written = handle.write(view, { at: request.at });
      if (written !== request.length)
        throw new DOMException("Out of space", "QuotaExceededError");
      return true;
    }
    case "flush": {
      handles.get(request.name)?.flush();
      return true;
    }
    case "close": {
      const handle = handles.get(request.name);
      if (handle) {
        handle.flush();
        handle.close();
        handles.delete(request.name);
      }
      return true;
    }
    case "remove": {
      const handle = handles.get(request.name);
      if (handle) {
        handle.close();
        handles.delete(request.name);
      }
      const dir = await directory();
      await dir.removeEntry(request.name).catch(() => undefined);
      return true;
    }
    case "list": {
      const dir = await directory();
      const names: string[] = [];
      const entries = (
        dir as unknown as { keys(): AsyncIterable<string> }
      ).keys();
      for await (const name of entries) names.push(name);
      return names;
    }
  }
}

scope.onmessage = (event) => {
  const request = event.data;
  perform(request).then(
    (value) => scope.postMessage({ seq: request.seq, value }),
    (error: unknown) =>
      scope.postMessage({
        seq: request.seq,
        error: error instanceof Error ? error.name : "Error",
      }),
  );
};
export {};
