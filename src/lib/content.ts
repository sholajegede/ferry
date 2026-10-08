export const faqs = [
  {
    q: "What is Ferry?",
    a: "Ferry is a free web app that sends files, folders and text from one device to another. The files are encrypted on the sending device and go directly to the receiving device, so they are never stored on a server.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. You can start a transfer without signing up.",
  },
  {
    q: "Do I need to install an app?",
    a: "No. Ferry runs in the browser on both devices. You can add it to your home screen if you want it to open like an app.",
  },
  {
    q: "How do I connect my devices?",
    a: "Choose Send files on one device. On a phone, point the camera at the QR code. On a laptop, type the 6-digit code or open the link.",
  },
  {
    q: "Is there a file size limit?",
    a: "No. Ferry sets no size cap. Files are written to storage as they arrive, so the only limit is the free space on the receiving device.",
  },
  {
    q: "Are my files uploaded to Ferry?",
    a: "No. Files are encrypted on the sending device and travel to the receiving device. The server only helps the two devices find each other.",
  },
  {
    q: "Is Ferry free?",
    a: "Yes. Ferry is free, with no paid plan, no advertising and no account.",
  },
  {
    q: "Is Ferry open source?",
    a: "Yes. The web app, the server functions and the command line tool are open source under the MIT licence, and the code is on GitHub.",
  },
  {
    q: "How long does a transfer stay open?",
    a: "24 hours, or until the sender ends it. After that the link and code stop working.",
  },
  {
    q: "What if my devices cannot connect?",
    a: "Some office, school and mobile networks block direct connections. Put both devices on the same Wi-Fi and try again, or use offline mode.",
  },
  {
    q: "How fast are transfers?",
    a: "As fast as the connection between your two devices. On the same Wi-Fi the files never leave your network.",
  },
  {
    q: "Can I send multiple files?",
    a: "Yes. Select several files or a whole folder. Up to 16 devices can join one transfer.",
  },
  {
    q: "Can I send files without internet?",
    a: "Yes. Put both devices on the same Wi-Fi or phone hotspot and open offline mode. The devices connect by scanning each other's QR codes and nothing leaves your network.",
  },
];

export const howTo = [
  {
    name: "Start",
    text: "Open Ferry on the device that has your files and choose Send files.",
  },
  {
    name: "Scan",
    text: "Point your other device at the QR code, or type the 6-digit code.",
  },
  {
    name: "Send",
    text: "Choose what to share, watch the progress, and save it on the other device.",
  },
];

export const featureList = [
  "Send files, folders and text between any two devices",
  "End-to-end encryption with AES-256-GCM and a 6-digit security code",
  "No account and nothing to install",
  "No file size cap",
  "Connect with a QR code, a 6-digit code or a link",
  "Transfers resume after a dropped connection",
  "Offline mode on the same Wi-Fi or hotspot",
  "Up to 16 devices in one transfer",
  "Command line tool and HTTP API",
  "Open source under the MIT licence",
];
