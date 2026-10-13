import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { api } from "../../convex/_generated/api";
import { fromBase64Url, toBase64Url } from "../../src/lib/protocol/bytes";
import { openText, pairKeyFrom, sealText } from "../../src/lib/protocol/crypto";
import type { Backend } from "../../src/lib/protocol/room-controller";

/**
 * Remembered devices for the terminal and the MCP server.
 *
 * Two devices that paired share a key. To start a transfer, one seals the room id and the link
 * secret with that key and leaves it on the server for the other. The server cannot read it.
 * So a paired device gets in with no link and no code passed by hand.
 */
export type PairedDevice = { id: string; name: string; key: string; at: number };

const file = () =>
  path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "ferry", "paired.json");

export async function listPaired(): Promise<PairedDevice[]> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as PairedDevice[];
    return Array.isArray(parsed) ? parsed.filter((device) => device?.id && device.key) : [];
  } catch {
    return [];
  }
}

async function save(devices: PairedDevice[]) {
  await mkdir(path.dirname(file()), { recursive: true, mode: 0o700 });
  await writeFile(file(), JSON.stringify(devices, null, 2), { mode: 0o600 });
}

export async function addPaired(id: string, name: string, seed: Uint8Array) {
  const rest = (await listPaired()).filter((device) => device.id !== id);
  await save([...rest, { id, name, key: toBase64Url(seed), at: Date.now() }]);
}

export async function removePaired(id: string) {
  await save((await listPaired()).filter((device) => device.id !== id));
}

/** Find one remembered device by its name or by the start of its id. */
export async function findPaired(query: string): Promise<PairedDevice> {
  const devices = await listPaired();
  const wanted = query.trim().toLowerCase();
  const matches = devices.filter(
    (device) => device.name.toLowerCase() === wanted || device.id.toLowerCase().startsWith(wanted),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0)
    throw new Error(
      devices.length === 0
        ? "No device is remembered yet. Pair one first."
        : `No remembered device is called "${query}". Remembered: ${devices.map((device) => device.name).join(", ")}.`,
    );
  throw new Error(`More than one remembered device is called "${query}". Use the id: ${matches.map((device) => device.id.slice(0, 8)).join(", ")}.`);
}

export async function sealInvite(device: PairedDevice, invite: { roomId: string; secret: string }) {
  return sealText(await pairKeyFrom(fromBase64Url(device.key)), JSON.stringify(invite));
}

async function openInvite(device: PairedDevice, sealed: string) {
  try {
    const invite = JSON.parse(await openText(await pairKeyFrom(fromBase64Url(device.key)), sealed)) as { roomId: string; secret: string };
    return typeof invite.roomId === "string" && typeof invite.secret === "string" ? invite : null;
  } catch {
    return null;
  }
}

export type Ring = { from: PairedDevice; roomId: string; secret: string };

/**
 * Wait for remembered devices to start a transfer with this one.
 * Each sealed invite that opens with the right key is passed to onRing once.
 * An invite from an unknown device, or one that does not open, is ignored.
 */
export function watchRings(
  backend: Backend,
  creds: { deviceId: string; deviceSecret: string },
  options: { from?: PairedDevice; since: number; onRing: (ring: Ring) => void },
) {
  // Only the two credential fields. The server refuses arguments it does not expect.
  creds = { deviceId: creds.deviceId, deviceSecret: creds.deviceSecret };
  const seen = new Set<string>();
  const beat = () => void backend.mutation(api.devices.heartbeat, creds).catch(() => undefined);
  beat();
  const timer = setInterval(beat, 25_000);
  const off = backend.subscribe(
    api.pairs.incoming,
    creds,
    (rows) => {
      void (async () => {
        const devices = await listPaired();
        for (const row of rows) {
          if (seen.has(row.id) || row.at < options.since) continue;
          seen.add(row.id);
          const device = devices.find((entry) => entry.id === row.from);
          if (!device || (options.from && options.from.id !== device.id)) continue;
          const invite = await openInvite(device, row.sealed);
          void backend.mutation(api.pairs.dismiss, { ...creds, ringId: row.id }).catch(() => undefined);
          if (invite) options.onRing({ from: device, ...invite });
        }
      })();
    },
    (error) => process.env.FERRY_DEBUG && process.stderr.write(`ferry: could not read invites: ${String(error)}\n`),
  );
  return () => {
    clearInterval(timer);
    off();
  };
}
