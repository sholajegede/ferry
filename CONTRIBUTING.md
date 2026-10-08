# Contributing to Ferry

Thanks for your interest in Ferry. This page explains how to get a change merged.

## Set up

Follow "Run it locally" in the [README](README.md). You need Node.js 22 or later and a free Convex account.

## Before you open a pull request

Run the same checks the project uses:

```bash
npm run lint
npm run typecheck
npm test
```

If your change touches the transfer flow, the interface or the CLI, also run the browser tests. The README lists the three commands.

## What makes a change easy to accept

- It does one thing. Send a refactor and a feature as two pull requests.
- It comes with a test when it changes behaviour in `src/lib/protocol/` or `convex/`.
- It keeps `src/lib/protocol/` free of browser and Node imports. The web app and the CLI share that code.
- It keeps file names, file contents and device IDs out of anything the server stores for statistics.
- Text in the interface is short and plain. Say what happened and what the person can do next.

## Changes to the protocol or the encryption

Open an issue first and describe the change. A change to key agreement, framing or the security code needs a clear reason and a test that fails without it. Old and new clients talk to each other during a deploy, so say how the change behaves when the two sides run different versions.

## Reporting bugs

Open an issue with:

- What you did, what you expected, and what happened.
- The browser and operating system on both devices.
- Whether the devices were on the same network.
- Any message from the browser console.

Do not include a transfer link in an issue. The part after `#` is the secret for that transfer.

## Security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).
