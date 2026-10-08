import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.E2E_URL ?? "http://localhost:3000";
const files = process.env.E2E_FILES;
const shots = process.env.E2E_SHOTS;
if (!files) throw new Error("Set E2E_FILES to a folder with photo.bin, movie.bin and album/");

const executablePath = process.env.E2E_CHROMIUM || undefined;
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function shot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

const browser = await chromium.launch({
  executablePath,
  args: [
    "--disable-features=WebRtcHideLocalIpsWithMdns",
    "--allow-loopback-in-peer-connection",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

async function device(name, options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`[${name}] page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[${name}] console: ${message.text().slice(0, 300)}`);
  });
  return { context, page };
}

try {
  const host = await device("host");
  await host.page.goto(base);
  await host.page.getByRole("button", { name: "Send files", exact: true }).first().waitFor();
  await shot(host.page, "01-home");

  await host.page.getByRole("button", { name: "Send files", exact: true }).first().click();
  await host.page.waitForURL(/\/room\//);
  await host.page.locator('input[type="file"]').first().setInputFiles(path.join(files, "photo.bin"));
  const codeText = await host.page.getByLabel("Transfer code").innerText();
  const code = codeText.replace(/\D/g, "");
  check("host gets a 6-digit transfer code", /^\d{6}$/.test(code), code);
  const link = host.page.url();
  check("the link keeps its secret in the fragment", /#k=[\w-]{40,}/.test(link));
  await shot(host.page, "02-room-waiting");

  const phone = await device("phone");
  const firstDownload = phone.page.waitForEvent("download");
  await phone.page.goto(link);
  const download = await firstDownload;
  const saved = await download.path();
  check(
    "a file sent over the link arrives intact",
    (await hashFile(saved)) === (await hashFile(path.join(files, "photo.bin"))),
    download.suggestedFilename(),
  );
  await host.page.getByText("1 device connected").waitFor();
  const hostCode = await host.page.locator("li", { hasText: "End-to-end encrypted" }).locator("strong.digits").first().innerText();
  const phoneCode = await phone.page.locator("li", { hasText: "End-to-end encrypted" }).locator("strong.digits").first().innerText();
  check("both screens show the same security code", hostCode === phoneCode && /\d{3} \d{3}/.test(hostCode), hostCode);
  await host.page.getByText("Same network").first().waitFor({ timeout: 10_000 }).then(
    () => check("the route is reported", true, "Same network"),
    () => check("the route is reported", false),
  );
  await shot(host.page, "03-room-connected");
  await shot(phone.page, "04-guest-connected");

  await host.page.getByLabel("Send text or a link").fill("https://example.com/hello");
  await host.page.getByRole("button", { name: "Send text" }).click();
  await phone.page.getByText("https://example.com/hello").waitFor();
  check("text arrives on the other device", true);

  const tablet = await device("tablet");
  await tablet.page.goto(base);
  await tablet.page.getByLabel("Enter the 6-digit code from the other device").fill(code);
  await tablet.page.waitForURL(/\/room\//);
  await tablet.page.getByRole("heading", { name: "Check the other device" }).waitFor();
  await host.page.getByText("wants to join").waitFor();
  const askCode = await host.page.locator("div", { hasText: "wants to join" }).locator("strong.digits").first().innerText();
  await tablet.page.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('[aria-label="Security code"]')?.textContent ?? ""));
  const tabletCode = await tablet.page.getByLabel("Security code").innerText();
  check("a code join shows matching codes before approval", askCode === tabletCode, askCode);
  await shot(host.page, "05-approval");
  await shot(tablet.page, "06-guest-waiting");
  const lateDownload = tablet.page.waitForEvent("download");
  await host.page.getByRole("button", { name: "Codes match, let it in" }).click();
  const late = await lateDownload;
  check(
    "a late joiner receives the files already shared",
    (await hashFile(await late.path())) === (await hashFile(path.join(files, "photo.bin"))),
  );
  await host.page.getByText("2 devices connected").waitFor();
  check("two receivers are connected at once", true);

  const zipDownload = phone.page.waitForEvent("download");
  const folderInput = host.page.locator('input[type="file"]').nth(1);
  await folderInput.setInputFiles(path.join(files, "album"));
  const zip = await zipDownload;
  check("a folder arrives as one zip", zip.suggestedFilename().endsWith(".zip"), zip.suggestedFilename());

  await tablet.page.locator('input[type="file"]').first().setInputFiles(path.join(files, "photo.bin"));
  await host.page.locator("li", { hasText: "Received" }).first().waitFor({ timeout: 20_000 });
  check("a receiver can send back to the sender", true);
  await tablet.context.close();

  const big = path.join(files, "movie.bin");
  await host.page.locator('input[type="file"]').first().setInputFiles(big);
  await phone.page.locator("li", { hasText: "movie.bin" }).getByRole("progressbar").waitFor({ timeout: 20_000 });
  await phone.page.waitForFunction(() => {
    const bar = document.querySelector('[aria-label="movie.bin progress"]');
    return bar && Number(bar.getAttribute("aria-valuenow")) >= 8;
  }, null, { timeout: 60_000 });
  const speedLine = await phone.page.locator("li", { hasText: "movie.bin" }).locator("p").nth(1).innerText();
  check("speed and time left are shown", /\/s/.test(speedLine), speedLine);
  await shot(phone.page, "07-progress");
  const before = await phone.page.evaluate(() => Number(document.querySelector('[aria-label="movie.bin progress"]').getAttribute("aria-valuenow")));
  await phone.page.waitForTimeout(1200);
  await phone.page.reload();
  await phone.page.locator("li", { hasText: "movie.bin" }).waitFor({ timeout: 30_000 });
  const after = await phone.page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const bar = document.querySelector('[aria-label="movie.bin progress"]');
      const value = bar ? Number(bar.getAttribute("aria-valuenow")) : 0;
      if (value > 0) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  });
  check("after a reload the transfer resumes instead of restarting", after >= before - 3 && after > 0, `${before}% before, ${after}% when it resumed`);
  const resumed = phone.page.waitForEvent("download", { timeout: 180_000 });
  const movie = await resumed;
  check("the resumed file is byte-for-byte identical", (await hashFile(await movie.path())) === (await hashFile(big)));

  const heap = await phone.page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  check("a large file does not sit in memory", heap < 250 * 1024 * 1024, `${Math.round(heap / 1048576)} MB heap`);

  await host.page.getByRole("button", { name: "End transfer" }).first().click();
  await host.page.getByRole("button", { name: "End transfer" }).last().click();
  await host.page.waitForURL(base + "/");
  await phone.page.getByRole("heading", { name: "This transfer has ended" }).waitFor();
  check("ending a transfer asks first and closes it for everyone", true);
  await shot(phone.page, "08-ended");
} catch (error) {
  check(`run completed (${error.message.split("\n")[0]})`, false);
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
