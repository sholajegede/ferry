// Checks for unattended use: the JSON mode of the CLI and the MCP server.
// Every transfer here is between two terminals, with no browser and no person.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "../cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const base = process.env.E2E_URL ?? "http://localhost:3000";
const files = process.env.E2E_FILES;
const env = { ...process.env, FERRY_TEST_BRIDGE: process.env.FERRY_TEST_BRIDGE ?? "http://localhost:4455", FERRY_SITE: base };
const cli = path.resolve("cli/dist/index.js");
const photo = path.join(files, "photo.bin");
const results = [];
const check = (name, pass, detail = "") => {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const sha = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const temp = (name) => mkdtemp(path.join(tmpdir(), `ferry-${name}-`));

/** Each device needs its own identity, so each run gets its own config folder. */
async function run(args, { input, raw = false } = {}) {
  const config = await temp("cfg");
  const child = spawn("node", [cli, ...args], { env: { ...env, XDG_CONFIG_HOME: config } });
  const events = [];
  const chunks = [];
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    chunks.push(chunk);
    if (raw) return;
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try {
        events.push(JSON.parse(line));
      } catch {}
    }
  });
  child.stderr.on("data", (chunk) => (stderr += chunk));
  if (input !== undefined) child.stdin.end(input);
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const event = async (name, ms = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const found = events.find((entry) => entry.event === name);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error(`no "${name}" event. Got: ${events.map((e) => e.event).join(", ")} ${stderr}`);
  };
  return { child, events, exited, event, stdout: () => Buffer.concat(chunks), stderr: () => stderr };
}

async function step(name, body) {
  try {
    await body();
  } catch (error) {
    check(`${name}: ${String(error.message).split("\n")[0]}`, false);
  }
}

await step("agent to agent", async () => {
  const out = await temp("out");
  const sender = await run(["send", photo, "--json"]);
  const ready = await sender.event("ready");
  check("send --json prints a ready event with a link and a code", /#k=/.test(ready.link) && /^\d{6}$/.test(ready.code), ready.code);
  const receiver = await run(["receive", ready.link, "--json", "--out", out]);
  const [sendCode, receiveCode] = await Promise.all([sender.exited, receiver.exited]);
  const saved = receiver.events.find((entry) => entry.event === "file_saved");
  check("two terminals transfer a file with no person and no prompt", sendCode === 0 && receiveCode === 0, `exit ${sendCode} and ${receiveCode}`);
  check("the file is intact and its path is reported", saved && (await sha(saved.path)) === (await sha(photo)), saved?.path);
  const done = sender.events.at(-1);
  check("the last event says what happened", done.event === "done" && done.ok && done.sent === 1, JSON.stringify(done));
});

await step("an agent asks for a file", async () => {
  const out = await temp("inbox");
  const inbox = await run(["receive", "--json", "--out", out]);
  const ready = await inbox.event("ready");
  const giver = await run(["send", photo, "--to", ready.link, "--json"]);
  const [inboxCode, giverCode] = await Promise.all([inbox.exited, giver.exited]);
  check("receive with no code opens a transfer and waits for files", inboxCode === 0 && giverCode === 0, `exit ${inboxCode} and ${giverCode}`);
  check("the file that was dropped in is saved", (await readdir(out)).includes("photo.bin"));
});

await step("text", async () => {
  const sender = await run(["send", "--text", "the build is green", "--json"]);
  const ready = await sender.event("ready");
  const receiver = await run(["receive", ready.link, "--json"]);
  const text = await receiver.event("text");
  const codes = await Promise.all([sender.exited, receiver.exited]);
  check("a text note goes across alone", text.text === "the build is green" && codes.every((code) => code === 0), codes.join(" and "));
});

await step("rules for unattended use", async () => {
  const sender = await run(["send", photo, "--json"]);
  const ready = await sender.event("ready");
  const stranger = await run(["receive", ready.code, "--json"]);
  check("a device with only the 6-digit code is refused by default", (await stranger.exited) === 4, stranger.events.at(-1)?.reason);

  const out = await temp("small");
  const careful = await run(["receive", ready.link, "--json", "--out", out, "--max-size", "1MB"]);
  const refused = await careful.event("file_refused");
  const code = await careful.exited;
  check("a file over the size limit is refused and nothing is written", code === 1 && refused.name === "photo.bin" && (await readdir(out)).length === 0, `exit ${code}`);
  check("the sender is told the file was not delivered", (await sender.exited) === 1, sender.events.at(-1)?.message);

  const idle = await run(["send", photo, "--json"]);
  await idle.event("ready");
  idle.child.kill("SIGINT");
  check("a stopped transfer exits with 130", (await idle.exited) === 130);

  const waiting = await run(["receive", "--json", "--timeout", "2"]);
  check("the time limit ends a transfer that nobody joined", (await waiting.exited) === 3, waiting.events.at(-1)?.reason);

  const wrong = await run(["send", "--json"]);
  check("wrong usage exits with 2 and a JSON error", (await wrong.exited) === 2 && wrong.events[0]?.code === "usage", wrong.events[0]?.message);
});

await step("pipes", async () => {
  const sender = await run(["send", "-", "--name", "report.json", "--json"], { input: '{"ok":true}\n' });
  const ready = await sender.event("ready");
  const receiver = await run(["receive", ready.link, "--stdout"], { raw: true });
  await Promise.all([sender.exited, receiver.exited]);
  check("data piped in on one machine comes out of a pipe on the other", receiver.stdout().toString() === '{"ok":true}\n', ready.files[0]?.name);
});

await step("mcp", async () => {
  const connect = async (root) => {
    const client = new Client({ name: "test", version: "1" });
    await client.connect(
      new StdioClientTransport({ command: "node", args: [cli, "mcp", "--root", root], env: { ...env, XDG_CONFIG_HOME: await temp("cfg") } }),
    );
    return client;
  };
  const call = async (client, name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...JSON.parse(result.content[0].text), isError: result.isError };
  };
  const rootA = await temp("mcp-a");
  const rootB = await temp("mcp-b");
  await copyFile(photo, path.join(rootA, "photo.bin"));
  const a = await connect(rootA);
  const b = await connect(rootB);

  const tools = (await a.listTools()).tools.map((tool) => tool.name).sort();
  check("the MCP server lists its tools", tools.join(",") === "admit_device,cancel_transfer,receive_files,send_files,send_text,transfer_status", tools.join(", "));

  const outside = await call(a, "send_files", { paths: [photo] });
  check("a path outside the root folder is refused", outside.isError && /outside/.test(outside.error), outside.error);

  const sent = await call(a, "send_files", { paths: ["photo.bin"], text: "here is the photo" });
  check("send_files returns a link and a code at once", /#k=/.test(sent.link) && /^\d{6}$/.test(sent.code), sent.status);

  const got = await call(b, "receive_files", { from: sent.link, out_dir: "inbox" });
  let status = got;
  for (let i = 0; i < 20 && !status.result; i++) status = await call(b, "transfer_status", { transfer_id: got.transfer_id, wait_seconds: 5 });
  const file = status.saved_files?.[0];
  check("one agent receives what another agent sent", status.result?.ok && file?.startsWith(rootB) && (await sha(file)) === (await sha(photo)), status.result?.message);
  check("the text note arrives with the file", status.texts_received?.[0]?.text === "here is the photo");

  let mine = sent;
  for (let i = 0; i < 10 && !mine.result; i++) mine = await call(a, "transfer_status", { transfer_id: sent.transfer_id, wait_seconds: 5 });
  check("the sending agent sees the result", mine.result?.ok && mine.result.sent === 1, mine.result?.message);

  const open = await call(a, "receive_files", {});
  const cancelled = await call(a, "cancel_transfer", { transfer_id: open.transfer_id });
  check("a transfer can be cancelled", cancelled.result?.reason === "stopped");
  await a.close();
  await b.close();
});

console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
