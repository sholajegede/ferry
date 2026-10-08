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
  },
});
console.log(`Built dist/index.js (server: ${server || "not set"}, site: ${site || "not set"})`);
