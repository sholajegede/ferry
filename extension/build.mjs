import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

/**
 * Builds the extension into dist/. Load that folder in chrome://extensions with "Load unpacked".
 * FERRY_SERVER and FERRY_SITE set the Convex deployment and the site. FERRY_TEST_BRIDGE is for the tests.
 */
const server = process.env.FERRY_SERVER ?? "https://tangible-lion-81.convex.cloud";
const site = process.env.FERRY_SITE ?? "https://ferry.sholajegede.com";
const bridge = process.env.FERRY_TEST_BRIDGE ?? "";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("static", "dist", { recursive: true });

await build({
  entryPoints: { background: "src/background.ts", offscreen: "src/offscreen.ts", popup: "src/popup.ts" },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome127",
  minify: !bridge,
  define: { __SERVER__: JSON.stringify(server), __SITE__: JSON.stringify(site), __BRIDGE__: JSON.stringify(bridge) },
  logLevel: "warning",
});

// The manifest carries the package version.
const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
manifest.version = version;
await import("node:fs").then(({ writeFileSync }) => writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2)));

if (process.argv.includes("--zip")) {
  if (existsSync(`ferry-extension-${version}.zip`)) rmSync(`ferry-extension-${version}.zip`);
  execFileSync("zip", ["-qr", `../ferry-extension-${version}.zip`, "."], { cwd: "dist" });
  console.log(`Wrote ferry-extension-${version}.zip`);
}
console.log(`Built dist/ (server: ${bridge ? `test bridge ${bridge}` : server}, site: ${site})`);
