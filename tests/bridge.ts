import { createServer } from "node:http";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";
import { modules } from "./modules";

const backend = convexTest(schema, modules);
const port = Number(process.env.BRIDGE_PORT ?? 4455);
let queue: Promise<unknown> = Promise.resolve();

type Call = { kind: "query" | "mutation" | "action"; name: string; args: Record<string, unknown> };

type Runner = (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;

function execute(call: Call) {
  const ref = makeFunctionReference(call.name);
  const run = backend[call.kind] as unknown as Runner;
  return run(ref, call.args);
}

createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    const reply = (value: unknown) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(value));
    };
    let call: Call;
    try {
      call = JSON.parse(body) as Call;
    } catch {
      reply({ error: { code: "bad-request" } });
      return;
    }
    const task = queue.then(() => execute(call));
    queue = task.catch(() => undefined);
    task.then(
      (value) => reply({ value: value ?? null }),
      (error: { data?: unknown; message?: string }) => {
        let data = error.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {}
        }
        reply({ error: data ?? { code: "error", message: error.message } });
      },
    );
  });
}).listen(port, () => console.log(`bridge listening on ${port}`));
