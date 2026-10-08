import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);

function run(args) {
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readEnv() {
  if (!existsSync(envFile)) return new Map();
  const entries = readFileSync(envFile, "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]);
  return new Map(entries);
}

console.log("Step 1 of 2: connect this project to Convex and push the functions.\n");
run(["convex", "dev", "--once"]);

const env = readEnv();
const added = [];
const ensure = (name, value) => {
  if (env.get(name)) return env.get(name);
  env.set(name, value);
  added.push(name);
  return value;
};

const networkSecret = ensure("NETWORK_SECRET", randomBytes(32).toString("hex"));
const analyticsKey = ensure("ANALYTICS_KEY", randomBytes(32).toString("hex"));
const adminPassword = ensure("ADMIN_PASSWORD", randomBytes(12).toString("base64url"));
ensure("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

if (added.length > 0) {
  const existing = existsSync(envFile) ? readFileSync(envFile, "utf8").replace(/\n*$/, "\n") : "";
  writeFileSync(envFile, existing + added.map((name) => `${name}=${env.get(name)}`).join("\n") + "\n");
}

console.log("\nStep 2 of 2: share the secrets with Convex.\n");
run(["convex", "env", "set", "NETWORK_SECRET", networkSecret]);
run(["convex", "env", "set", "ANALYTICS_KEY", analyticsKey]);

console.log(`
Setup is complete.

  Admin page password: ${adminPassword}
  (saved in .env.local as ADMIN_PASSWORD)

Start the app with: npm run dev
`);
