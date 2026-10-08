import { createInterface } from "node:readline/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexClient } from "convex/browser";
import QRCode from "qrcode";
import { api } from "../../convex/_generated/api";
import { bridgeBackend } from "../../src/lib/protocol/bridge-backend";
import { randomId } from "../../src/lib/protocol/bytes";
import { joinTokenFor, joinTokenHash, newLinkSecret } from "../../src/lib/protocol/crypto";
import {
  RoomController,
  type Backend,
  type RoomState,
} from "../../src/lib/protocol/room-controller";
import { diskSinks, loadIdentity, nodePlatform, sourcesFrom } from "./node-platform";

declare const __DEFAULT_SERVER__: string;
declare const __DEFAULT_SITE__: string;

const HELP = `ferry: send and receive end-to-end encrypted files

Usage
  ferry send <file or folder>...   Share files and print a QR code, link and 6-digit code
  ferry receive <code or link>     Receive files into the current folder

Options
  --out <folder>    Where received files are written (default: current folder)
  --keep            Keep a send open for more receivers after the first one finishes
  --yes             Let devices that join with the 6-digit code in without asking
  --server <url>    Convex deployment URL of your own Ferry
  --site <url>      Web address of your own Ferry
  -h, --help        Show this help
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function size(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

function connect(server: string): Backend {
  const bridge = process.env.FERRY_TEST_BRIDGE;
  if (bridge) return bridgeBackend(bridge);
  if (!server)
    fail("No server is set. Pass --server <your Convex URL> or set FERRY_SERVER.");
  const client = new ConvexClient(server);
  return {
    mutation: (ref, args) => client.mutation(ref, args),
    action: (ref, args) => client.action(ref, args),
    subscribe: (ref, args, onValue, onError) => client.onUpdate(ref, args, onValue, onError),
  };
}

function progressLine(state: RoomState, direction: "out" | "in") {
  const list = state.transfers.filter((t) => t.direction === direction);
  if (list.length === 0) return "";
  const done = list.filter((t) => t.status === "done").length;
  const total = list.reduce((sum, t) => sum + t.size, 0);
  const moved = list.reduce((sum, t) => sum + t.bytes, 0);
  const rate = list.reduce((sum, t) => sum + t.rate, 0);
  const percent = total ? Math.floor((moved / total) * 100) : 100;
  return `${done}/${list.length} files, ${size(moved)} of ${size(total)} (${percent}%)${rate ? `, ${size(rate)}/s` : ""}`;
}

function watchProgress(controller: RoomController, direction: "out" | "in") {
  let last = "";
  const tty = process.stdout.isTTY;
  return controller.subscribe(() => {
    const line = progressLine(controller.getState(), direction);
    if (!line || line === last) return;
    last = line;
    if (tty) process.stdout.write(`\r\x1b[K${line}`);
  });
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      keep: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      server: { type: "string" },
      site: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return;
  }

  const server = values.server ?? process.env.FERRY_SERVER ?? __DEFAULT_SERVER__;
  const site = (values.site ?? process.env.FERRY_SITE ?? __DEFAULT_SITE__).replace(/\/$/, "");
  const identity = await loadIdentity();
  const creds = { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret };

  if (command === "send") {
    if (rest.length === 0) fail("Name at least one file or folder to send.");
    const sources = await sourcesFrom(rest).catch((error: Error) =>
      fail(`Could not read ${error.message.split("'")[1] ?? "that path"}.`),
    );
    if (sources.length === 0) fail("There are no files in what you named.");
    if (!site) fail("No site address is set. Pass --site <your Ferry address> or set FERRY_SITE.");

    const backend = connect(server);
    await backend.mutation(api.devices.register, identity);
    const roomId = randomId(16);
    const secret = newLinkSecret();
    const room = await backend.mutation(api.rooms.create, {
      ...creds,
      roomId,
      joinTokenHash: await joinTokenHash(await joinTokenFor(secret, roomId)),
      visible: false,
    });
    const link = `${site}/room/${roomId}#k=${secret}`;
    const total = sources.reduce((sum, source) => sum + source.size, 0);

    process.stdout.write(await QRCode.toString(link, { type: "terminal", small: true }));
    process.stdout.write(
      `\nSending ${sources.length} ${sources.length === 1 ? "file" : "files"} (${size(total)})\n` +
        `Link  ${link}\n` +
        `Code  ${spaced(room.code)}  (enter it at ${site})\n\n` +
        `Waiting for the other device. Press Ctrl+C to stop.\n`,
    );

    const controller = new RoomController({
      backend,
      platform: nodePlatform(diskSinks(path.resolve(values.out ?? "."), () => undefined)),
      identity,
      roomId,
      linkSecret: secret,
      via: "link",
    });
    const asked = new Set<string>();
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let finishing = false;

    const stop = async (code: number) => {
      if (finishing) return;
      finishing = true;
      prompt.close();
      await controller.close().catch(() => undefined);
      await controller.stop();
      process.exit(code);
    };
    process.on("SIGINT", () => {
      process.stdout.write("\nStopped. The link and code no longer work.\n");
      void stop(130);
    });

    controller.onEvent((event) => {
      if (event.type === "joined") process.stdout.write(`\n${event.name} connected\n`);
      if (event.type === "note") process.stdout.write(`\nText from the other device: ${event.note.text}\n`);
    });
    watchProgress(controller, "out");
    controller.subscribe(() => {
      const state = controller.getState();
      for (const peer of state.peers) {
        if (peer.status !== "approval" || !peer.code) continue;
        const key = `${peer.id}:${peer.code}`;
        if (asked.has(key)) continue;
        asked.add(key);
        if (values.yes) {
          void controller.decide(peer.id, true).catch(() => undefined);
          continue;
        }
        void prompt
          .question(
            `\n${peer.name} wants to join and should show the code ${spaced(peer.code)}. Let it in? [y/N] `,
          )
          .then((answer) => controller.decide(peer.id, /^y/i.test(answer.trim())))
          .catch(() => undefined);
      }
      if (values.keep || finishing) return;
      const out = state.transfers.filter((t) => t.direction === "out");
      const byPeer = new Map<string, typeof out>();
      for (const transfer of out)
        byPeer.set(transfer.peerId, [...(byPeer.get(transfer.peerId) ?? []), transfer]);
      const settled = [...byPeer.values()].filter(
        (list) =>
          list.length >= sources.length &&
          list.every((t) => ["done", "cancelled", "failed"].includes(t.status)),
      );
      const busy = out.some((t) => ["active", "finishing", "waiting"].includes(t.status));
      if (settled.length > 0 && !busy) {
        const failed = settled.flat().filter((t) => t.status !== "done").length;
        process.stdout.write(
          failed
            ? `\n${failed} ${failed === 1 ? "file was" : "files were"} not delivered.\n`
            : "\nAll files delivered.\n",
        );
        void stop(failed ? 1 : 0);
      }
    });
    await controller.share(sources);
    controller.start();
    return;
  }

  if (command === "receive") {
    const target = rest[0];
    if (!target) fail("Give the 6-digit code or the link from the sending device.");
    const backend = connect(server);
    await backend.mutation(api.devices.register, identity);

    let roomId = "";
    let secret: string | null = null;
    const digits = target.replace(/\s/g, "");
    if (/^\d{6}$/.test(digits)) {
      const found = await backend.mutation(api.rooms.lookupCode, { ...creds, code: digits });
      if (!found.roomId)
        fail(
          found.limited
            ? "Too many tries. Wait a few minutes and try again."
            : "No transfer has that code. Check the six digits on the other device.",
        );
      roomId = found.roomId;
    } else {
      const match = target.match(/\/room\/([A-Za-z0-9_-]{16,64})(?:#k=([A-Za-z0-9_-]{40,64}))?/);
      if (!match) fail("That is not a Ferry link or a 6-digit code.");
      roomId = match[1];
      secret = match[2] ?? null;
    }

    const outDir = path.resolve(values.out ?? ".");
    let saved = 0;
    const controller = new RoomController({
      backend,
      platform: nodePlatform(
        diskSinks(outDir, (file) => {
          saved++;
          process.stdout.write(`\nSaved ${path.relative(process.cwd(), file) || file}\n`);
        }),
      ),
      identity,
      roomId,
      linkSecret: secret,
      via: secret ? "link" : "code",
    });

    let shownCode = "";
    let idle: ReturnType<typeof setTimeout> | null = null;
    const stop = async (code: number) => {
      await controller.close().catch(() => undefined);
      await controller.stop();
      process.exit(code);
    };
    process.on("SIGINT", () => void stop(130));

    const endings: Record<string, string> = {
      missing: "That transfer does not exist.",
      closed: "The sender ended the transfer.",
      expired: "That transfer has expired.",
      declined: "The sender did not let this device in.",
      full: "That transfer is full.",
      "bad-link": "That link is not valid. Copy it again from the sending device.",
      error: "Could not open the transfer. Check your connection.",
    };

    controller.onEvent((event) => {
      if (event.type === "joined") process.stdout.write(`Connected to ${event.name}\n`);
      if (event.type === "note") process.stdout.write(`\nText from the sender: ${event.note.text}\n`);
    });
    watchProgress(controller, "in");
    controller.subscribe(() => {
      const state = controller.getState();
      if (endings[state.phase]) {
        process.stdout.write(`\n${endings[state.phase]}\n`);
        void stop(saved > 0 && state.phase === "closed" ? 0 : 1);
        return;
      }
      const code = state.peers[0]?.code;
      if (state.phase === "approval" && code && code !== shownCode) {
        shownCode = code;
        process.stdout.write(
          `Security code ${spaced(code)}. The sender has to confirm the same code on their screen.\n`,
        );
      }
      const incoming = state.transfers.filter((t) => t.direction === "in");
      const settled =
        incoming.length > 0 &&
        incoming.every((t) => ["done", "cancelled", "failed"].includes(t.status));
      if (idle) clearTimeout(idle);
      idle = settled
        ? setTimeout(() => {
            const failed = incoming.filter((t) => t.status !== "done").length;
            process.stdout.write(
              failed
                ? `\n${failed} ${failed === 1 ? "file was" : "files were"} not received.\n`
                : `\nDone. ${saved} ${saved === 1 ? "file" : "files"} in ${outDir}\n`,
            );
            void stop(failed ? 1 : 0);
          }, 2500)
        : null;
    });
    controller.start();
    return;
  }

  fail(`Unknown command "${command}". Run ferry --help.`);
}

main().catch((error: Error) => fail(error.message || "Something went wrong."));
