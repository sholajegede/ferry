# ferry-send

Send and receive end-to-end encrypted files from the terminal, a script or an AI agent. It speaks the same protocol as the [Ferry](https://ferry.sholajegede.com) web app, so a terminal can send to a phone and a browser can send to a server.

Files go straight from one machine to the other. Nothing is uploaded, so both sides must be online at the same time.

```bash
npx ferry-send send report.pdf photos/
npx ferry-send receive 482107 --out ~/Downloads
```

Requires Node.js 22 or later.

## Commands

| Command | What it does |
| --- | --- |
| `ferry send <files>...` | Opens a transfer and prints a QR code, a link and a 6-digit code. Exits when every file has arrived. |
| `ferry send <files>... --to <code or link>` | Sends into a transfer another device opened. |
| `ferry send --text "note"` | Sends a text note, alone or with files. |
| `ferry send - --name data.json` | Sends what arrives on standard input. |
| `ferry receive <code or link>` | Receives files into the current folder. |
| `ferry receive` | Opens a transfer and waits for another device to send files. |
| `ferry pair` | Opens a transfer that makes two devices remember each other. `ferry pair <link>` joins one. |
| `ferry devices` | Lists the devices this one remembers. `ferry forget <device>` removes one. |
| `ferry send <files>... --to-device <device>` | Sends to a remembered device, with no link or code. |
| `ferry listen` | Waits for remembered devices to send, and saves what they send. `--from` and `--once` narrow it. |
| `ferry mcp` | Runs as an MCP server for AI agents. |

## Options

- `--out <folder>` sets where received files are written. A received file never replaces an existing one.
- `--max-size <size>` refuses a received file larger than this, for example `500MB` or `2GB`.
- `--timeout <seconds>` stops after this long.
- `--admit link|any|ask` sets who may join a transfer you opened. `link` admits only a device that has the link. `any` also admits a device with the 6-digit code. `ask` asks you for each device that uses the code. The default is `ask` in a terminal and `link` everywhere else.
- `--keep` stays open after the first exchange finishes.
- `--json` prints one JSON event on each line and never prompts.
- `--stdout` writes the received file to standard output. Status lines go to standard error.
- `--device-name <name>` sets the name other devices see for this one.
- `--server <url>` and `--site <url>` point the tool at your own deployment. `FERRY_SERVER` and `FERRY_SITE` do the same.

## Scripts and agents

`--json` gives a stream that a program can read. Two machines can transfer with no person involved:

```bash
# machine A
ferry send build.tar.gz --json
{"event":"ready","role":"host","link":"https://…/room/…#k=…","code":"482107","files":[{"name":"build.tar.gz","size":48211930}],…}
{"event":"connected","device":"Terminal on linux","device_id":"…"}
{"event":"progress","direction":"out","files_done":0,"files_total":1,"bytes":13107200,"total_bytes":48211930,"rate":9400000}
{"event":"file_sent","name":"build.tar.gz","size":48211930}
{"event":"done","ok":true,"reason":"complete","sent":1,"received":0,"failed":0,"saved":[]}

# machine B
ferry receive "https://…/room/…#k=…" --json --out ./incoming
```

Events: `ready`, `connected`, `paired`, `join_request`, `security_code`, `progress`, `file_sent`, `file_saved`, `file_refused`, `text`, `text_delivered`, `done`. A usage mistake prints one `error` event.

| Exit code | Meaning |
| --- | --- |
| 0 | Finished |
| 1 | A file was not transferred |
| 2 | Wrong usage |
| 3 | The time limit passed |
| 4 | The transfer could not be opened, or the other side ended it |
| 130 | Stopped |

Pipes work too:

```bash
pg_dump mydb | ferry send - --name mydb.sql        # on one machine
ferry receive "<link>" --stdout | psql mydb        # on the other
```

## MCP server

`ferry mcp` lets an agent send and receive files with tool calls. It runs on the agent's own machine, because the files leave from there. It reads and writes only inside one folder, the root.

```json
{
  "mcpServers": {
    "ferry": {
      "command": "npx",
      "args": ["-y", "ferry-send", "mcp", "--root", "/path/to/a/folder"]
    }
  }
}
```

| Tool | What it does |
| --- | --- |
| `send_files` | Sends files, folders or a text note. Returns a link and a code at once. |
| `receive_files` | With `from`, joins a transfer. Without it, opens one and returns a link for a person to drop files into. |
| `transfer_status` | Reads devices, files, saved paths, received text and the result. `wait_seconds` waits for the next change. |
| `admit_device` | Answers a device that asked to join with the 6-digit code. |
| `send_text` | Sends a text note into an open transfer. |
| `cancel_transfer` | Stops a transfer. |
| `pair_device` | Makes this machine and another device remember each other. |
| `list_devices` | Lists the remembered devices. |
| `forget_device` | Stops remembering a device. |

`send_files` takes `to_device` to send to a remembered device, and `receive_files` takes `from_device` to wait for one. Neither needs a link.

What the server will not do:

- Read or write outside the root folder.
- Replace an existing file.
- Accept a file larger than `max_size_mb` (2000 by default).
- Admit a device that has only the 6-digit code, unless the agent sets `allow_code_join` and then calls `admit_device`.

A transfer ends by itself after 15 minutes if nothing finishes it. The agent can set `timeout_seconds`.

## Remembered devices

Two machines that pair once can send to each other with no link:

```bash
ferry pair --device-name build-server     # prints a link
ferry pair "<link>" --device-name laptop  # on the other machine
ferry listen --out ./incoming             # on the laptop: wait and save
ferry send dist.zip --to-device laptop    # on the build server
```

The two devices share a key. To start a transfer, the sender seals the room details with that key and leaves them on the server for the other device, which cannot read them. A phone that paired with the Ferry site works the same way. It gets a prompt when Ferry is open on it.

## What it cannot do

- It cannot leave a file for later. If the other device is not online, nothing is sent.
- It needs a network that lets WebRTC through. Some locked-down sandboxes block it. The tool then waits until its time limit and exits with code 3.
