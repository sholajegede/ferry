import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { RTCPeerConnection } from "node-datachannel/polyfill";
import { randomId } from "../../src/lib/protocol/bytes";
import type { KeyRecord } from "../../src/lib/protocol/crypto";
import type { Identity, Platform } from "../../src/lib/protocol/room-controller";
import type { FileSource, SinkProvider } from "../../src/lib/protocol/types";

export async function loadIdentity(): Promise<Identity> {
  const dir = path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "ferry");
  const file = path.join(dir, "device.json");
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Identity;
    if (parsed.deviceId && parsed.deviceSecret) return parsed;
  } catch {}
  const identity: Identity = {
    deviceId: randomId(16),
    deviceSecret: randomId(32),
    name: `Terminal on ${process.env.HOSTNAME ?? process.platform}`.slice(0, 40),
  };
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(identity), { mode: 0o600 });
  return identity;
}

export async function sourcesFrom(inputs: string[]): Promise<FileSource[]> {
  const sources: FileSource[] = [];
  const add = async (absolute: string, relative: string | undefined) => {
    const info = await stat(absolute);
    if (info.isDirectory()) {
      const { readdir } = await import("node:fs/promises");
      const base = relative ?? path.basename(absolute);
      for (const entry of (await readdir(absolute)).sort())
        await add(path.join(absolute, entry), `${base}/${entry}`);
      return;
    }
    if (!info.isFile()) return;
    let handle: FileHandle | null = null;
    sources.push({
      name: path.basename(absolute),
      path: relative,
      size: info.size,
      type: "application/octet-stream",
      lastModified: Math.round(info.mtimeMs),
      async read(offset, length) {
        handle ??= await open(absolute, "r");
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (offset + bytesRead >= info.size) {
          await handle.close().catch(() => undefined);
          handle = null;
        }
        return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
      },
    });
  };
  for (const input of inputs) await add(path.resolve(input), undefined);
  return sources;
}

async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
}

async function freeName(file: string) {
  if (!(await exists(file))) return file;
  const parsed = path.parse(file);
  for (let n = 2; n < 1000; n++) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${n})${parsed.ext}`);
    if (!(await exists(candidate))) return candidate;
  }
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

export function diskSinks(outDir: string, saved: (file: string) => void): SinkProvider {
  const partOf = (relative: string) => path.join(outDir, `${relative}.ferry-part`);
  const finished = new Set<string>();
  const within = (relative: string) => {
    const target = path.resolve(outDir, relative);
    if (!target.startsWith(path.resolve(outDir) + path.sep)) throw new Error("Unsafe path");
    return relative;
  };

  return {
    async open(_peerId, meta) {
      if (finished.has(meta.id)) return "done";
      const relative = within(meta.path ?? meta.name);
      const part = partOf(relative);
      await mkdir(path.dirname(part), { recursive: true });
      let offset = 0;
      try {
        const marker = await readFile(`${part}.id`, "utf8");
        if (marker === meta.id) offset = Math.min((await stat(part)).size, meta.size);
      } catch {}
      await writeFile(`${part}.id`, meta.id);
      const handle = await open(part, offset > 0 ? "r+" : "w");
      if (offset > 0) await handle.truncate(offset);
      return {
        offset,
        sink: {
          async write(at, data) {
            await handle.write(data, 0, data.length, at);
          },
          async close() {
            await handle.close().catch(() => undefined);
          },
          async abort() {
            await handle.close().catch(() => undefined);
            await rm(part, { force: true });
            await rm(`${part}.id`, { force: true });
          },
        },
      };
    },
    progress() {},
    async complete(_peerId, meta) {
      const relative = within(meta.path ?? meta.name);
      const part = partOf(relative);
      const target = await freeName(path.join(outDir, relative));
      await rename(part, target);
      await rm(`${part}.id`, { force: true });
      finished.add(meta.id);
      saved(target);
    },
    async discard(_peerId, meta) {
      const part = partOf(within(meta.path ?? meta.name));
      await rm(part, { force: true });
      await rm(`${part}.id`, { force: true });
    },
  };
}

export function nodePlatform(sinks: SinkProvider): Platform {
  const keys = new Map<string, KeyRecord>();
  return {
    createConnection: (config) =>
      new RTCPeerConnection(config as never) as unknown as globalThis.RTCPeerConnection,
    keys: {
      get: async (id) => keys.get(id) ?? null,
      put: async (id, record) => {
        keys.set(id, record);
      },
    },
    sinks,
  };
}
