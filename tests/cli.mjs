import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.E2E_URL ?? "http://localhost:3000";
const files = process.env.E2E_FILES;
const env = { ...process.env, FERRY_TEST_BRIDGE: process.env.FERRY_TEST_BRIDGE ?? "http://localhost:4455", FERRY_SITE: base };
const cli = path.resolve("cli/dist/index.js");
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const hashFile = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (c) => hash.update(c)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });

function run(args, cwd) {
  const child = spawn("node", [cli, ...args], { env, cwd });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const until = async (pattern, ms = 30_000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const match = output.match(pattern);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`CLI never printed ${pattern}. Output:\n${output}`);
  };
  return { child, exited, until, output: () => output };
}

const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM || undefined,
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection"],
});

try {
  const sender = run(["send", path.join(files, "photo.bin"), path.join(files, "album")]);
  const [, link] = await sender.until(/Link\s+(\S+)/);
  const [, shown] = await sender.until(/Code\s+(\d{3} \d{3})/);
  check("ferry send prints a link, a code and a QR code", /#k=/.test(link) && sender.output().includes("▄"), shown);

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.goto(link);
  const zip = await download;
  check("a browser receives what the terminal sent", zip.suggestedFilename().endsWith(".zip"), zip.suggestedFilename());
  const code = await sender.exited;
  check("ferry send exits cleanly when everything is delivered", code === 0, sender.output().trim().split("\n").pop());
  await context.close();

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto(base);
  await host.getByRole("button", { name: "Send files", exact: true }).first().click();
  await host.waitForURL(/\/room\//);
  await host.locator('input[type="file"]').first().setInputFiles(path.join(files, "photo.bin"));
  const roomCode = (await host.getByLabel("Transfer code").innerText()).replace(/\D/g, "");
  const out = await mkdtemp(path.join(tmpdir(), "ferry-cli-"));
  const receiver = run(["receive", roomCode, "--out", out]);
  const [, security] = await receiver.until(/Security code (\d{3} \d{3})/);
  await host.getByText("wants to join").waitFor();
  const asked = await host.locator("div", { hasText: "wants to join" }).locator("strong.digits").first().innerText();
  check("the terminal and the browser show the same security code", asked === security, security);
  await host.getByRole("button", { name: "Codes match, let it in" }).click();
  check("ferry receive exits cleanly", (await receiver.exited) === 0, receiver.output().trim().split("\n").pop());
  const got = await readdir(out);
  check(
    "the terminal saves the file intact",
    got.includes("photo.bin") && (await hashFile(path.join(out, "photo.bin"))) === (await hashFile(path.join(files, "photo.bin"))),
    got.join(", "),
  );
} catch (error) {
  check(`run completed (${error.message.split("\n")[0]})`, false);
  console.log(error.message);
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
