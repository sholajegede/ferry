import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import QRCode from "qrcode";
import { api } from "../../convex/_generated/api";
import { serveMcp } from "./mcp";
import { setDeviceName } from "./node-platform";
import { findPaired, listPaired, removePaired, watchRings } from "./paired";
import { connect, EXIT, Session, UsageError, type Admit, type FerryEvent } from "./session";
import { loadIdentity } from "./node-platform";

declare const __DEFAULT_SERVER__: string;
declare const __DEFAULT_SITE__: string;
declare const __VERSION__: string;

const HELP = `ferry: send and receive end-to-end encrypted files

Usage
  ferry send <file or folder>...   Open a transfer and print a QR code, link and 6-digit code
  ferry send <files>... --to <code or link>
                                   Send into a transfer another device opened
  ferry send -                     Send what arrives on standard input (name it with --name)
  ferry receive <code or link>     Receive files into the current folder
  ferry receive                    Open a transfer and wait for another device to send files
  ferry pair                       Open a transfer that makes two devices remember each other
  ferry pair <code or link>        Join one, so this device and that one remember each other
  ferry devices                    List the devices this one remembers
  ferry forget <device>            Stop remembering a device
  ferry send <files>... --to-device <device>
                                   Send to a remembered device, with no link or code
  ferry listen                     Wait for remembered devices to send, and save what they send
  ferry mcp                        Run as an MCP server for AI agents

Options
  --out <folder>     Where received files are written (default: current folder)
  --text <note>      Send a text note. Use it with files or alone
  --to <code|link>   Join a transfer to send into it
  --keep             Stay open after the first exchange finishes
  --admit <who>      Who may join a transfer you opened: link, any or ask
                     link: only a device with the link. any: the 6-digit code too.
                     ask: ask for each device that uses the code (default in a terminal)
  --yes              The same as --admit any
  --max-size <size>  Refuse a received file larger than this, for example 500MB or 2GB
  --timeout <secs>   Stop after this many seconds
  --json             Print one JSON event on each line, with no prompts
  --stdout           With receive: write the received file to standard output
  --name <name>      With "send -": the file name for the data on standard input
  --root <folder>    With mcp: the folder the server may read from and write to
  --from <device>    With listen: take transfers from this device only
  --once             With listen: stop after the first transfer
  --device-name <n>  Set the name other devices see for this one
  --server <url>     Convex deployment URL of your own Ferry
  --site <url>       Web address of your own Ferry
  -v, --version      Print the version
  -h, --help         Show this help

Exit codes
  0 finished   1 a file was not transferred   2 wrong usage   3 time limit
  4 the transfer could not be opened or was ended   130 stopped
`;

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

export function parseSize(text: string): number {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i);
  if (!match) throw new UsageError(`"${text}" is not a size. Use a form like 500MB or 2GB.`);
  const power = ["b", "kb", "mb", "gb", "tb"].indexOf((match[2] ?? "b").toLowerCase());
  return Math.round(Number(match[1]) * 1000 ** power);
}

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Wait for remembered devices to start transfers, and receive each one. */
async function listen(options: {
  server: string;
  site: string;
  json: boolean;
  from?: string;
  once: boolean;
  outDir?: string;
  maxBytes?: number;
  timeoutMs?: number;
}) {
  const from = options.from
    ? await findPaired(options.from).catch((error: Error) => {
        throw new UsageError(error.message);
      })
    : undefined;
  if ((await listPaired()).length === 0) throw new UsageError("No device is remembered yet. Run ferry pair first.");
  const identity = await loadIdentity();
  const { backend, close } = connect(options.server);
  await backend.mutation(api.devices.register, identity);
  const print = (event: Record<string, unknown>) =>
    process.stdout.write(options.json ? `${JSON.stringify(event)}\n` : "");
  const say = (line: string) => void (!options.json && process.stdout.write(`${line}\n`));
  const active = new Set<Session>();
  let finished: (code: number) => void = () => undefined;
  const ended = new Promise<number>((resolve) => (finished = resolve));
  let busy = false;

  say(`Listening for ${from ? from.name : "remembered devices"} as ${identity.name}. Press Ctrl+C to stop.`);
  print({ event: "listening", device: identity.name, from: from?.name ?? null });

  const stop = watchRings(backend, identity, {
    from,
    since: Date.now() - 120_000,
    onRing: (ring) => {
      if (options.once && busy) return;
      busy = true;
      say(`${ring.from.name} is sending`);
      print({ event: "incoming", device: ring.from.name, device_id: ring.from.id });
      void Session.open({
        target: `${options.site || "https://ferry"}/room/${ring.roomId}#k=${ring.secret}`,
        outDir: options.outDir,
        maxBytes: options.maxBytes,
        admit: "link",
        server: options.server,
        onEvent: (event) => {
          if (event.event === "progress") return;
          print({ ...event, device: ring.from.name });
          if (event.event === "file_saved") say(`Saved ${path.relative(process.cwd(), event.path) || event.path}`);
          if (event.event === "text") say(`Text from ${ring.from.name}: ${event.text}`);
          if (event.event === "file_refused") say(`Refused ${event.name}. ${event.reason}`);
        },
      }).then(
        (session) => {
          active.add(session);
          void session.result.then((done) => {
            active.delete(session);
            if (!done.ok) say(done.message);
            if (options.once) finished(EXIT[done.reason]);
          });
        },
        (error: Error) => {
          say(error.message);
          if (options.once) finished(4);
        },
      );
    },
  });

  const quit = (code: number) => finished(code);
  process.on("SIGINT", () => quit(130));
  process.on("SIGTERM", () => quit(130));
  if (options.timeoutMs) setTimeout(() => quit(3), options.timeoutMs);
  const code = await ended;
  stop();
  await Promise.all([...active].map((session) => session.stop()));
  close();
  process.exit(code);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      text: { type: "string" },
      to: { type: "string" },
      keep: { type: "boolean", default: false },
      admit: { type: "string" },
      yes: { type: "boolean", default: false },
      "max-size": { type: "string" },
      timeout: { type: "string" },
      json: { type: "boolean", default: false },
      stdout: { type: "boolean", default: false },
      name: { type: "string" },
      root: { type: "string" },
      "to-device": { type: "string" },
      from: { type: "string" },
      once: { type: "boolean", default: false },
      "device-name": { type: "string" },
      server: { type: "string" },
      site: { type: "string" },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) return void process.stdout.write(`${__VERSION__}\n`);
  if (values.help || !command) return void process.stdout.write(HELP);

  const server = values.server ?? process.env.FERRY_SERVER ?? __DEFAULT_SERVER__;
  const site = values.site ?? process.env.FERRY_SITE ?? __DEFAULT_SITE__;

  if (command === "mcp") {
    await serveMcp({ server, site, root: path.resolve(values.root ?? process.env.FERRY_ROOT ?? "."), version: __VERSION__ });
    return;
  }
  if (values["device-name"]) await setDeviceName(values["device-name"]);

  if (command === "devices") {
    const devices = await listPaired();
    if (values.json) {
      for (const device of devices) process.stdout.write(`${JSON.stringify({ event: "device", name: device.name, device_id: device.id, paired_at: new Date(device.at).toISOString() })}\n`);
    } else if (devices.length === 0) {
      process.stdout.write("No device is remembered yet. Run ferry pair.\n");
    } else {
      for (const device of devices) process.stdout.write(`${device.name}  ${device.id.slice(0, 8)}  paired ${new Date(device.at).toLocaleDateString()}\n`);
    }
    return;
  }

  if (command === "forget") {
    if (!rest[0]) throw new UsageError("Name the device to forget. Run ferry devices to see them.");
    const device = await findPaired(rest[0]).catch((error: Error) => {
      throw new UsageError(error.message);
    });
    await removePaired(device.id);
    const identity = await loadIdentity();
    const { backend, close } = connect(server);
    await backend.mutation(api.pairs.unlink, { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret, peer: device.id }).catch(() => undefined);
    close();
    process.stdout.write(values.json ? `${JSON.stringify({ event: "forgotten", name: device.name, device_id: device.id })}\n` : `This device no longer remembers ${device.name}.\n`);
    return;
  }

  if (command === "listen") {
    await listen({
      server,
      site,
      json: values.json,
      from: values.from,
      once: values.once,
      outDir: values.out,
      maxBytes: values["max-size"] ? parseSize(values["max-size"]) : undefined,
      timeoutMs: values.timeout ? Number(values.timeout) * 1000 : undefined,
    });
    return;
  }

  if (command !== "send" && command !== "receive" && command !== "pair") throw new UsageError(`Unknown command "${command}". Run ferry --help.`);

  const json = values.json;
  const interactive = !json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const admit = (values.yes ? "any" : (values.admit ?? (interactive ? "ask" : "link"))) as Admit;
  if (!["ask", "link", "any"].includes(admit)) throw new UsageError("--admit takes link, any or ask.");
  if (admit === "ask" && !interactive) throw new UsageError("--admit ask needs a terminal. Use --admit link or --admit any.");
  const timeoutMs = values.timeout ? Number(values.timeout) * 1000 : undefined;
  if (timeoutMs !== undefined && !(timeoutMs > 0)) throw new UsageError("--timeout takes a number of seconds.");

  // Status goes to standard error when the data itself goes to standard output.
  const status = values.stdout ? process.stderr : process.stdout;
  const say = (line: string) => void (json ? undefined : status.write(`${line}\n`));
  const temp: string[] = [];

  let paths: string[] = [];
  let target: string | undefined;
  let outDir = values.out;
  if (command === "send") {
    paths = rest;
    target = values.to;
    if (paths.includes("-")) {
      if (paths.length > 1) throw new UsageError('Use "-" alone. It cannot be mixed with file names.');
      const dir = await mkdtemp(path.join(tmpdir(), "ferry-in-"));
      temp.push(dir);
      const file = path.join(dir, path.basename(values.name ?? "data.bin"));
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      await writeFile(file, Buffer.concat(chunks));
      paths = [file];
    }
    if (paths.length === 0 && !values.text) throw new UsageError("Name at least one file or folder to send, or pass --text.");
    if (values["to-device"] && target) throw new UsageError("Use --to or --to-device, not both.");
  } else if (command === "pair") {
    target = rest[0];
  } else {
    target = rest[0];
    if (values.stdout) {
      outDir = await mkdtemp(path.join(tmpdir(), "ferry-out-"));
      temp.push(outDir);
    }
  }

  const prompt = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  let session: Session | null = null;
  let tty = "";

  const onEvent = (event: FerryEvent) => {
    if (json) return void process.stdout.write(`${JSON.stringify(event)}\n`);
    const clear = () => {
      if (tty) status.write("\r\x1b[K");
      tty = "";
    };
    switch (event.event) {
      case "join_request":
        clear();
        void prompt
          ?.question(`${event.device} wants to join and should show the code ${spaced(event.security_code)}. Let it in? [y/N] `)
          .then((answer) => session?.decide(event.device_id, /^y/i.test(answer.trim())))
          .catch(() => undefined);
        break;
      case "security_code":
        clear();
        say(`Security code ${spaced(event.code)}. The other device has to confirm the same code on its screen.`);
        break;
      case "connected":
        clear();
        say(`${event.device} connected`);
        break;
      case "progress": {
        if (!status.isTTY) break;
        const percent = event.total_bytes ? Math.floor((event.bytes / event.total_bytes) * 100) : 100;
        tty = `${event.files_done}/${event.files_total} files, ${size(event.bytes)} of ${size(event.total_bytes)} (${percent}%)${event.rate ? `, ${size(event.rate)}/s` : ""}`;
        status.write(`\r\x1b[K${tty}`);
        break;
      }
      case "file_saved":
        clear();
        say(`Saved ${path.relative(process.cwd(), event.path) || event.path}`);
        break;
      case "file_refused":
        clear();
        say(`Refused ${event.name} (${size(event.size)}). ${event.reason}`);
        break;
      case "text":
        clear();
        say(`Text from ${event.from}: ${event.text}`);
        break;
      case "paired":
        clear();
        say(`This device and ${event.device} now remember each other. Send to it with --to-device "${event.device}".`);
        break;
      case "text_delivered":
        clear();
        say("Text delivered");
        break;
      case "done":
        clear();
        if (event.reason === "complete") {
          if (event.sent > 0) say(event.sent === 1 ? "The file was delivered." : "All files delivered.");
          if (event.received > 0) say(`Done. ${event.received} ${event.received === 1 ? "file" : "files"} in ${session?.outDir}`);
          if (event.sent === 0 && event.received === 0) say(event.message);
        } else say(event.message);
        break;
    }
  };

  const ring = values["to-device"]
    ? await findPaired(values["to-device"]).catch((error: Error) => {
        throw new UsageError(error.message);
      })
    : undefined;

  session = await Session.open({
    paths,
    ring,
    pair: command === "pair",
    text: values.text,
    target,
    outDir,
    maxBytes: values["max-size"] ? parseSize(values["max-size"]) : undefined,
    keep: values.keep,
    admit,
    timeoutMs,
    server,
    site,
    onEvent: (event) => {
      if (event.event !== "ready") onEvent(event);
    },
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(session.events.find((event) => event.event === "ready"))}\n`);
  } else if (ring) {
    say(`Asked ${ring.name} to receive. It takes the transfer when Ferry is open on it, or when it runs ferry listen.`);
  } else if (session.link && session.code) {
    status.write(await QRCode.toString(session.link, { type: "terminal", small: true }));
    const total = session.events.find((event) => event.event === "ready");
    const files = total?.event === "ready" ? total.files : [];
    say(
      (files.length > 0
        ? `\nSending ${files.length} ${files.length === 1 ? "file" : "files"} (${size(files.reduce((sum, file) => sum + file.size, 0))})`
        : command === "receive"
          ? `\nWaiting for files. They are saved in ${session.outDir}`
          : command === "pair"
            ? "\nOpen this on the other device. The two devices will remember each other"
            : "\nSending a text note") +
        `\nLink  ${session.link}\nCode  ${spaced(session.code)}  (enter it at ${site.replace(/\/$/, "")})\n\n` +
        "Waiting for the other device. Press Ctrl+C to stop.",
    );
  }

  process.on("SIGINT", () => void session?.stop());
  process.on("SIGTERM", () => void session?.stop());
  const done = await session.result;
  prompt?.close();

  if (values.stdout && done.saved.length > 0) {
    // One file goes out as it is. Status lines already went to standard error.
    await pipeline(createReadStream(done.saved[0]), process.stdout, { end: false });
  }
  for (const dir of temp) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  process.exit(EXIT[done.reason]);
}

main().catch((error: Error) => {
  const usage = error instanceof UsageError;
  if (process.argv.includes("--json"))
    process.stdout.write(`${JSON.stringify({ event: "error", code: usage ? "usage" : "error", message: error.message || "Something went wrong." })}\n`);
  else process.stderr.write(`${error.message || "Something went wrong."}\n`);
  process.exit(usage ? 2 : 4);
});
