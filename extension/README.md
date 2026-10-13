# Ferry for Chrome

Send the page you are on, a link, selected text or an image to your phone, with one click. It uses the same encrypted, device-to-device protocol as the [Ferry](https://ferry.sholajegede.com) web app. Nothing is uploaded.

## What it does

- **Send this page.** Click the Ferry icon. Scan the QR code with your phone, or type the 6-digit code at the Ferry site.
- **Right-click to send.** Right-click a page, a link, an image or selected text, and choose "Send with Ferry".
- **Remember a phone.** Pair the browser and a phone once. After that, "Send to <phone>" sends with no code. The phone gets a prompt when Ferry is open on it.
- **Send files.** Opens the Ferry site, which sends files and folders of any size.

The transfer runs in a hidden offscreen page, so it keeps going after the popup closes. The toolbar icon shows a dot while it waits, a tick when the phone has it, and an exclamation mark when it fails.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the address and title of the tab when you click the Ferry icon or the menu. |
| `contextMenus` | Add "Send with Ferry" to the right-click menu. |
| `offscreen` | Keep the connection to your phone open after the popup closes. |
| `storage` | Remember what you right-clicked until you choose how to send it. |
| Optional: the site of an image | Asked for only when you send an image from that site, so the extension can read it. |

The extension reads no page content, keeps no history and has no analytics.

## Build

```bash
npm install
npm run build        # writes dist/
npm run zip          # writes ferry-extension-<version>.zip for the Chrome Web Store
```

`FERRY_SERVER` and `FERRY_SITE` point the build at your own deployment. The defaults are the public Ferry.

To try it, open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose `dist/`.

## Limits

- It sends. It does not receive. To receive on the computer, open the Ferry site.
- A remembered phone gets the prompt only while Ferry is open on it, in a tab or as an installed app.
- Chrome pages, such as the new tab page and settings, cannot be sent.
