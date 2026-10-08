# Ferry

Ferry sends files, folders and text from one device to another. The data goes directly between the two devices over WebRTC and is encrypted on the sending device. There is no account and no upload to a server.

It is a Next.js app (App Router) with a Convex backend. Convex stores the transfer rooms and passes the connection setup messages. It never receives file data.

## What it does

- Sends files of any size. The receiver writes each piece to storage as it arrives, so a large file does not sit in memory.
- Encrypts every piece with AES-256-GCM. Keys come from an ECDH exchange between the two devices, and both screens show the same 6-digit security code.
- Resumes after a dropped connection or a page reload from the last saved piece.
- Connects with a QR code, a link, a 6-digit code, or a list of senders on the same network.
- Lets up to 16 devices join one transfer. Late joiners get the files already shared.
- Sends folders with their structure. The receiver can save a batch as one zip.
- Sends text and links, and accepts files from the clipboard.
- Remembers devices you choose, so each can start a transfer to the other with one tap.
- Works with no internet in offline mode. Two devices on the same Wi-Fi connect by scanning each other's QR codes.
- Installs as an app and appears in the system share sheet on Android.
- Ships a command line tool that speaks the same protocol.

## Run it

You need Node.js 22 or later and a Convex account.

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` signs you in to Convex, creates the project, pushes the functions, and writes the secrets the app needs to `.env.local` and to Convex. It prints the password for the admin page.

Open http://localhost:3000 in two browser windows to try a transfer. Use a second browser or a private window for the second one, because two tabs of one browser share the same device identity.

### Try it with a phone

Browsers only allow WebRTC and the Web Crypto API on HTTPS or localhost. To reach your computer from a phone on the same Wi-Fi, run:

```bash
npm run dev:https
```

Then open `https://<your computer's IP>:3000` on the phone and accept the self-signed certificate.

## Tests

```bash
npm test
```

This runs the protocol tests (encryption, resume, cancel, wrong key) and the backend access-control tests against the real Convex functions with `convex-test`.

The browser tests drive real WebRTC transfers between several Chromium windows and the CLI. They use a small local bridge in place of a Convex deployment:

```bash
npx playwright install chromium
npm run cli:build
npm run test:bridge                                   # terminal 1
NEXT_PUBLIC_TEST_BRIDGE=http://localhost:4455 npm run build && npm start   # terminal 2
E2E_FILES=/path/to/test-files npm run test:e2e        # terminal 3
```

`E2E_FILES` is a folder that holds `photo.bin` (a few MB), `movie.bin` (a few hundred MB) and a folder named `album` with a subfolder.

## Command line

```bash
npm run cli:build
node cli/dist/index.js send report.pdf photos/
node cli/dist/index.js receive 482107 --out ~/Downloads
```

The build reads `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_SITE_URL` from `.env.local` and uses them as defaults. `--server` and `--site` override them. The package in `cli/` is ready to publish to npm under a name you choose.

## Deploy

1. Deploy the Convex functions with `npx convex deploy`.
2. Deploy the Next.js app to any Node host. Set the variables from `.env.example`, with `NEXT_PUBLIC_SITE_URL` set to the public address.
3. Set `NETWORK_SECRET` and `ANALYTICS_KEY` in the production Convex deployment to the same values the web app uses.

The HTTP API is served from the site's own domain at `/v1/...`. A rewrite in `next.config.ts` forwards it to the Convex HTTP actions.

Direct connections fail on some office, school and mobile networks. To cover those, set a TURN relay in Convex. `.env.example` lists the variables for Cloudflare Realtime TURN or any standard TURN server. Relayed data is still encrypted end to end.

## How it is built

| Path | What is in it |
| --- | --- |
| `convex/` | Schema and functions: devices, rooms, signaling, remembered devices, usage totals, TURN credentials, the HTTP API, and the cleanup job |
| `src/lib/protocol/` | The transfer engine. It has no browser or Node dependencies, so the web app and the CLI share it |
| `src/lib/web/` | Browser storage, file sources, zip, pairing, and offline mode |
| `src/components/`, `src/app/` | The interface and pages |
| `public/sw.js` | Service worker: offline shell and the share target |
| `cli/` | The command line tool |
| `tests/` | Protocol, backend and browser tests |

### The connection, step by step

1. The sender creates a room and gets a link. The part of the link after `#` holds a 32-byte secret that is never sent to a server.
2. A receiver joins and commits to an ECDH P-256 public key. The sender publishes its key, then the receiver reveals its own. Committing first means a 6-digit code is enough to detect an attacker in the middle.
3. Both sides derive keys with HKDF-SHA-256. A receiver that joined with the link mixes in the link secret, which the server cannot do. A receiver that joined with the 6-digit code or from the network list waits until the sender confirms the security code.
4. The WebRTC offer, answer and ICE candidates pass through Convex, sealed with a key from the same exchange.
5. Files move over one ordered data channel. Each frame is sealed with AES-256-GCM and carries its file ID and byte offset. The receiver acknowledges what it has written, and the sender uses that both as flow control and as the resume point.

## Limits to know about

- The receiver needs free browser storage for the whole file. Saving copies it from browser storage to the download folder, so a large file needs that space twice until the browser clears the first copy.
- A remembered device must have Ferry open to get the incoming-transfer prompt. There are no push notifications.
- "On your network now" matches devices by public IP address. On networks where many strangers share one address, turn it off for a transfer with the checkbox on the transfer screen.
- The privacy policy and terms describe what the code does. Have them reviewed before a public launch, and set `NEXT_PUBLIC_OPERATOR_NAME` and `NEXT_PUBLIC_CONTACT_EMAIL`.
