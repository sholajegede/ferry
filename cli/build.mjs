import { readFileSync } from "node:fs";
import { build } from "esbuild";

function fromEnvFile(name) {
  try {
    const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .find((entry) => entry.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : "";
  } catch {
    return "";
  }
}

const server = process.env.NEXT_PUBLIC_CONVEX_URL || fromEnvFile("NEXT_PUBLIC_CONVEX_URL");
const site = process.env.NEXT_PUBLIC_SITE_URL || fromEnvFile("NEXT_PUBLIC_SITE_URL");
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// A published package must point at the public server, not at a development one.
if (process.env.npm_lifecycle_event === "prepublishOnly" && !(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_SITE_URL)) {
  console.error("Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_SITE_URL to the production values in the publish command.");
  process.exit(1);
}

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["node-datachannel", "node-datachannel/polyfill", "qrcode", "convex", "convex/*"],
  banner: { js: "#!/usr/bin/env node" },
  define: {
    __DEFAULT_SERVER__: JSON.stringify(server),
    __DEFAULT_SITE__: JSON.stringify(site),
    __VERSION__: JSON.stringify(version),
  },
});
console.log(`Built dist/index.js (server: ${server || "not set"}, site: ${site || "not set"})`);
