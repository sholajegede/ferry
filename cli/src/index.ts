import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import QRCode from "qrcode";
import { serveMcp } from "./mcp";
import { EXIT, Session, UsageError, type Admit, type FerryEvent } from "./session";

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
  if (command !== "send" && command !== "receive") throw new UsageError(`Unknown command "${command}". Run ferry --help.`);

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

  session = await Session.open({
    paths,
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
  } else if (session.link && session.code) {
    status.write(await QRCode.toString(session.link, { type: "terminal", small: true }));
    const total = session.events.find((event) => event.event === "ready");
    const files = total?.event === "ready" ? total.files : [];
    say(
      (files.length > 0
        ? `\nSending ${files.length} ${files.length === 1 ? "file" : "files"} (${size(files.reduce((sum, file) => sum + file.size, 0))})`
        : command === "receive"
          ? `\nWaiting for files. They are saved in ${session.outDir}`
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
