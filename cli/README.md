# ferry-send

Send and receive end-to-end encrypted files from the terminal. It speaks the same protocol as the Ferry web app, so a terminal can send to a phone and a browser can send to a server.

```bash
npx ferry-send send report.pdf photos/
npx ferry-send receive 482107 --out ~/Downloads
```

`send` prints a QR code, a link and a 6-digit code, and exits when every file has arrived. `receive` takes the code or the link.

Options:

- `--out <folder>` sets where received files are written.
- `--keep` keeps a send open for more receivers.
- `--yes` admits devices that join with the 6-digit code without asking.
- `--server <url>` and `--site <url>` point the tool at your own deployment. `FERRY_SERVER` and `FERRY_SITE` do the same.

Requires Node.js 22 or later.
