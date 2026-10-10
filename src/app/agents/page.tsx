import Link from "next/link";
import { breadcrumbs, JsonLd, pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  image: "developers",
  title: "For AI agents: MCP server and JSON command line",
  description: `Let an AI agent send files to a person's phone, get files from them, or pass files to another agent with ${site.name}. MCP server and a JSON command line.`,
  path: "/agents",
});

const pkg = site.cliPackage;

export default function AgentsPage() {
  return (
    <article className="prose-doc mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd graph={[breadcrumbs([{ name: "For AI agents", path: "/agents" }])]} />
      <p className="eyebrow">For AI agents</p>
      <h1 className="mt-6">An agent can use {site.name} too</h1>
      <p className="serif mt-5 !text-2xl !leading-snug">
        An agent on your machine can hand you a file on your phone, ask you for one, or pass files to another agent. The files still go
        straight from one device to the other.
      </p>

      <h2>What an agent can do</h2>
      <ul>
        <li>
          <strong>Give a file to a person.</strong> The agent starts a transfer and shows you a link. You open it on any device and the
          file arrives.
        </li>
        <li>
          <strong>Get a file from a person.</strong> The agent opens a transfer and waits. You open the link and drop the file in.
        </li>
        <li>
          <strong>Send to another agent.</strong> Two agents on different machines exchange files with no person in the middle.
        </li>
      </ul>

      <h2 id="mcp">MCP server</h2>
      <p>Add this to the MCP settings of your agent. The root is the one folder the server may read from and write to.</p>
      <pre>
        <code>{`{
  "mcpServers": {
    "ferry": {
      "command": "npx",
      "args": ["-y", "${pkg}", "mcp", "--root", "/path/to/a/folder"]
    }
  }
}`}</code>
      </pre>
      <p>The server has six tools:</p>
      <ul>
        <li>
          <code>send_files</code> sends files, folders or a text note. It returns a link and a 6-digit code at once.
        </li>
        <li>
          <code>receive_files</code> joins a transfer, or opens one and returns a link for a person to drop files into.
        </li>
        <li>
          <code>transfer_status</code> reads the devices, the files, the saved paths, the text and the result. It can wait for the next
          change.
        </li>
        <li>
          <code>admit_device</code> answers a device that asked to join with the 6-digit code.
        </li>
        <li>
          <code>send_text</code> sends a text note into an open transfer.
        </li>
        <li>
          <code>cancel_transfer</code> stops a transfer.
        </li>
      </ul>

      <h2 id="json">JSON command line</h2>
      <p>
        An agent with a terminal and no MCP can use the command line. With <code>--json</code> it prints one event on each line and
        never asks a question.
      </p>
      <pre>
        <code>{`npx -y ${pkg} send report.pdf --json --timeout 900
{"event":"ready","link":"${site.url}/room/…#k=…","code":"482107", …}
{"event":"connected","device":"iPhone (Safari)", …}
{"event":"file_sent","name":"report.pdf","size":48211}
{"event":"done","ok":true,"reason":"complete","sent":1, …}`}</code>
      </pre>
      <pre>
        <code>{`npx -y ${pkg} receive --json --out ./incoming --max-size 500MB
npx -y ${pkg} receive "<link>" --json --out ./incoming
npx -y ${pkg} send build.zip --to "<link>" --json`}</code>
      </pre>
      <p>
        Exit codes: 0 finished, 1 a file was not transferred, 2 wrong usage, 3 the time limit passed, 4 the transfer could not be
        opened or was ended, 130 stopped.
      </p>

      <h2 id="rules">Rules that protect you</h2>
      <ul>
        <li>The MCP server reads and writes only inside its root folder.</li>
        <li>A received file never replaces an existing file.</li>
        <li>A file larger than the size limit is refused before any of it is written.</li>
        <li>
          Only a device with the link gets in. A device with only the 6-digit code is refused, unless the agent turns that on. Then the
          agent has to ask you to confirm the security code first.
        </li>
        <li>A transfer that nobody finishes ends by itself after 15 minutes.</li>
        <li>The agent is told to treat received text and file names as data, not as instructions.</li>
      </ul>

      <h2 id="limits">What an agent cannot do</h2>
      <ul>
        <li>
          It cannot leave a file for later. {site.name} keeps no files on a server, so both sides must be online at the same time.
        </li>
        <li>An agent with no machine of its own, such as a chat assistant in a browser tab, cannot send files this way.</li>
        <li>Some locked-down sandboxes block the direct connection. The tool then stops at its time limit and says so.</li>
      </ul>

      <h2 id="files">Files for agents to read</h2>
      <ul>
        <li>
          <a href="/llms.txt">llms.txt</a> and <a href="/llms-full.txt">llms-full.txt</a>
        </li>
        <li>
          <a href="/openapi.json">openapi.json</a> for the HTTP API
        </li>
        <li>
          <a href={`${site.repo}/blob/main/skills/ferry/SKILL.md`}>SKILL.md</a>, a skill file an agent can load
        </li>
        <li>
          <Link href="/developers">The developers page</Link> for the protocol and the encryption
        </li>
      </ul>
    </article>
  );
}
