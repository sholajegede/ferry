import { breadcrumbs, JsonLd, pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  ownImage: true,
  title: "Developers: command line and API",
  description: `Send and receive files from the terminal with the ${site.name} command line tool, or create transfers with the HTTP API.`,
  path: "/developers",
});

const apiBase = site.url;

export default function DevelopersPage() {
  return (
    <article className="prose-doc mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        graph={[breadcrumbs([{ name: "Developers", path: "/developers" }])]}
      />
      <p className="eyebrow">Developers</p>
      <h1 className="mt-6">Command line and API</h1>
      <p className="serif mt-5 !text-2xl !leading-snug">
        The command line tool speaks the same encrypted protocol as the browser,
        so a terminal can send to a phone and a browser can send to a server.
      </p>

      <h2>Send from the terminal</h2>
      <pre>
        <code>{`npx ${site.cliPackage} send report.pdf photos/`}</code>
      </pre>
      <p>
        The tool prints a QR code, a link and a 6-digit code. Open any of them
        on the other device. Folders are sent with their structure. The command
        exits when every file has arrived.
      </p>

      <h2>Receive in the terminal</h2>
      <pre>
        <code>{`npx ${site.cliPackage} receive 482107
npx ${site.cliPackage} receive "${site.url}/room/…#k=…" --out ~/Downloads`}</code>
      </pre>
      <p>
        When you join with a 6-digit code, the terminal shows a security code.
        The sender confirms the same code on their screen before the transfer
        starts.
      </p>

      <h2>Options</h2>
      <ul>
        <li>
          <code>--out &lt;folder&gt;</code> sets where received files are
          written. The default is the current folder.
        </li>
        <li>
          <code>--keep</code> keeps a send open for more receivers after the
          first one finishes.
        </li>
        <li>
          <code>--yes</code> admits devices that join with the 6-digit code
          without asking. Use it only on a network you trust.
        </li>
        <li>
          <code>--server</code> and <code>--site</code> point the tool at your
          own deployment.
        </li>
      </ul>

      <h2 id="http-api">HTTP API</h2>
      <p>
        The API creates and inspects transfers. File data never passes through
        it. Devices still connect to each other directly and encrypt everything
        they send.
      </p>
      <h3>Create a transfer</h3>
      <pre>
        <code>{`POST ${apiBase}/v1/rooms
Content-Type: application/json

{
  "roomId": "<16 random bytes, base64url>",
  "joinTokenHash": "<sha-256 hex of your join token>",
  "name": "Build server"
}`}</code>
      </pre>
      <p>The response has what a client needs to host the transfer:</p>
      <pre>
        <code>{`{
  "roomId": "p1Qm…",
  "code": "482107",
  "expiresAt": 1791547200000,
  "deviceId": "…",
  "deviceSecret": "…"
}`}</code>
      </pre>
      <p>
        Create the link secret yourself: 32 random bytes in base64url. Derive
        the join token from it with HKDF-SHA-256, using 32 zero bytes as the
        salt and <code>ferry/join/&lt;roomId&gt;</code> as the info string, and
        send the SHA-256 of the base64url token. The link to share is{" "}
        <code>{`${site.url}/room/<roomId>#k=<link secret>`}</code>. The secret
        stays in the part after the # sign, which is never sent to a server.
      </p>
      <h3>Check a transfer</h3>
      <pre>
        <code>{`GET ${apiBase}/v1/rooms/<roomId>

{ "roomId": "p1Qm…", "status": "open", "expiresAt": 1791547200000, "devices": 2 }`}</code>
      </pre>

      <h2 id="encryption">How the encryption works</h2>
      <ul>
        <li>
          Each pair of devices runs an ECDH P-256 key exchange. The joining
          device commits to its key first, so a short code is enough to detect
          an attacker in the middle.
        </li>
        <li>
          Keys are derived with HKDF-SHA-256. When the receiver joins with the
          full link, the secret in the link is mixed in, and the server never
          sees that secret.
        </li>
        <li>
          Every piece of a file is sealed with AES-256-GCM. Each piece carries
          its file and its position, so pieces cannot be swapped, replayed or
          cut short without being detected.
        </li>
        <li>
          Connection setup messages that pass through the server are sealed with
          a separate key from the same exchange.
        </li>
      </ul>
    </article>
  );
}
