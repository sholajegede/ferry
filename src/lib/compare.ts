import type { OgTone } from "./og";

export const checked = "October 2026";

export type Comparison = {
  slug: string;
  name: string;
  tone: OgTone;
  title: string;
  description: string;
  answer: string;
  intro: string[];
  rows: { label: string; ferry: string; them: string }[];
  ferryWhen: string[];
  themWhen: string[];
  sections: { heading: string; body: string[] }[];
  faqs: { q: string; a: string }[];
  sources: { label: string; url: string }[];
};

const ferry = {
  price: "Free. No paid plan",
  account: "None",
  install: "Nothing. Runs in the browser",
  size: "No cap. Limited by free space on the receiving device",
  path: "Directly between the two devices. Never stored on a server",
  encryption: "End to end, with a 6-digit code both screens show",
  platforms: "Any current browser on any system, plus a command line tool",
  timing: "Both devices open at the same time",
  offline: "Yes, on the same Wi-Fi or hotspot",
  resume: "Yes. Continues from where it stopped",
};

export const comparisons: Comparison[] = [
  {
    slug: "ferry-vs-wetransfer",
    name: "WeTransfer",
    tone: "purple",
    title: "Ferry vs WeTransfer: a free alternative with no size cap",
    description:
      "How Ferry and WeTransfer differ on file size limits, privacy, accounts and speed, and which one fits the file you need to send.",
    answer:
      "Use Ferry when both devices are in front of someone right now and the files are large or private: it has no size cap and never stores your files. Use WeTransfer when the other person needs to download later, because it keeps the files on its servers for them.",
    intro: [
      "WeTransfer and Ferry solve the same problem in opposite ways. WeTransfer uploads your files to its servers and gives you a download link. Ferry connects your two devices and sends the files from one to the other.",
      "That one difference explains almost everything else on this page: the size limits, the privacy, the speed, and whether the other person has to be there.",
    ],
    rows: [
      { label: "Price", ferry: ferry.price, them: "Free tier, with paid plans for larger transfers" },
      { label: "Account", ferry: ferry.account, them: "Not needed to download" },
      { label: "Size limit", ferry: ferry.size, them: "3 GB per transfer on the free tier" },
      {
        label: "How often",
        ferry: "As often as you like",
        them: "10 transfers or 3 GB in any 30 days on the free tier",
      },
      { label: "Where files go", ferry: ferry.path, them: "Uploaded to WeTransfer and stored there" },
      {
        label: "Encryption",
        ferry: ferry.encryption,
        them: "Encrypted in transit and in storage. WeTransfer holds the keys",
      },
      { label: "Timing", ferry: ferry.timing, them: "Recipient can download later" },
      { label: "Link lifetime", ferry: "24 hours, or until you end it", them: "3 days on the free tier" },
      { label: "No internet", ferry: ferry.offline, them: "No" },
    ],
    ferryWhen: [
      "The file is bigger than 3 GB, or you have used up the monthly allowance.",
      "The files are private and you do not want a copy on someone else's server.",
      "Both devices are yours, or the other person is ready to receive now.",
      "Both devices share a Wi-Fi network, where a direct transfer is much faster than uploading and downloading.",
    ],
    themWhen: [
      "The recipient will download hours or days later.",
      "You are sending to many people who will each download at their own time.",
      "You want a download page with a message and your own branding, which the paid plans offer.",
    ],
    sections: [
      {
        heading: "File size and limits",
        body: [
          "On its free tier WeTransfer allows up to 3 GB in one transfer, and at most 10 transfers or 3 GB in total in any 30 days. Larger and more frequent transfers need a paid plan.",
          "Ferry has no cap because it has no storage to pay for. Files are written to the receiving device as they arrive, so a 40 GB video works the same way as a photo. If the connection drops, the transfer continues from where it stopped.",
        ],
      },
      {
        heading: "Privacy",
        body: [
          "WeTransfer stores your files so the recipient can fetch them later. They are encrypted in transit and in storage, and WeTransfer manages the keys.",
          "Ferry encrypts files on the sending device with keys only your two devices hold. The server passes connection details between the devices and never receives a file, a file name or a key. Both screens show the same 6-digit security code so you can check nobody is in the middle.",
        ],
      },
      {
        heading: "Speed",
        body: [
          "With WeTransfer a file travels twice: up to the server, then down to the recipient. With Ferry it travels once. On the same Wi-Fi it does not leave your network at all.",
        ],
      },
      {
        heading: "Where WeTransfer is the better tool",
        body: [
          "Ferry needs both devices open at the same time. If the other person is asleep, in another time zone, or will get to it next week, a stored link is the right answer and Ferry is not.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is Ferry a free alternative to WeTransfer?",
        a: "Yes. Ferry is free with no size cap and no account. The difference is that Ferry sends files directly while both devices are open, and WeTransfer stores them for later download.",
      },
      {
        q: "How do I send a file larger than 3 GB for free?",
        a: "Open Ferry on both devices, choose Send files, and connect with the QR code or 6-digit code. Ferry sets no size limit, so the only constraint is free space on the receiving device.",
      },
      {
        q: "Does WeTransfer see my files?",
        a: "WeTransfer stores the files you upload on its servers and holds the encryption keys. Ferry never receives your files, so it has nothing to store or read.",
      },
    ],
    sources: [
      { label: "WeTransfer plans and pricing", url: "https://wetransfer.com/pricing" },
      { label: "Fast.io: WeTransfer file size limits", url: "https://fast.io/resources/wetransfer-file-size-limit/" },
    ],
  },
  {
    slug: "ferry-vs-airdrop",
    name: "AirDrop",
    tone: "green",
    title: "Ferry vs AirDrop: AirDrop for Windows, Android and Linux",
    description:
      "AirDrop works between Apple devices. Ferry does the same job in the browser on any phone or computer. Here is how they compare.",
    answer:
      "Use AirDrop between two Apple devices that are next to each other: it is built in and needs nothing else. Use Ferry when one of the devices is a Windows PC, a Linux machine or an Android phone without AirDrop support, or when the two devices are not in the same room.",
    intro: [
      "AirDrop is the standard everyone compares to, and between an iPhone and a Mac it is hard to beat. Its limit is who it works with. If one side is a Windows laptop, an older Android phone, a Chromebook or a Linux desktop, AirDrop is not an option.",
      "Ferry gives you the same idea in a browser tab: open it on both devices, scan a code, send.",
    ],
    rows: [
      { label: "Price", ferry: ferry.price, them: "Free. Built in to Apple devices" },
      { label: "Install", ferry: ferry.install, them: "Nothing on Apple devices" },
      {
        label: "Works on",
        ferry: ferry.platforms,
        them: "iPhone, iPad and Mac. Recent Pixel and Galaxy phones can connect through Quick Share",
      },
      { label: "Size limit", ferry: "No cap", them: "No cap" },
      { label: "Distance", ferry: "Anywhere with internet, or the same Wi-Fi offline", them: "About 10 metres" },
      { label: "Where files go", ferry: ferry.path, them: "Directly between the two devices" },
      { label: "Encryption", ferry: ferry.encryption, them: "Encrypted in transit" },
      { label: "Several receivers", ferry: "Up to 16 devices in one transfer", them: "One at a time" },
      { label: "No internet", ferry: ferry.offline, them: "Yes. Uses Bluetooth and peer-to-peer Wi-Fi" },
    ],
    ferryWhen: [
      "One device is a Windows, Linux or older Android device.",
      "The devices are in different rooms, buildings or countries.",
      "You want to send to several devices at once.",
      "AirDrop cannot find the other device and you need the file now.",
    ],
    themWhen: [
      "Both devices are Apple devices within a few metres.",
      "You are sharing from inside an app with the share sheet.",
      "There is no Wi-Fi network at all. AirDrop makes its own link, and Ferry's offline mode needs a shared network or hotspot.",
    ],
    sections: [
      {
        heading: "Devices",
        body: [
          "AirDrop is part of iOS, iPadOS and macOS. It uses Bluetooth to find nearby devices and a direct Wi-Fi link to move the file. Recent Pixel and Galaxy phones, and a few others, can now exchange files with it through Quick Share. On Windows, Linux, Chromebooks and older Android phones it is unavailable.",
          "Ferry needs a current browser and nothing else. iPhone to Windows, Android to Mac, and Linux to iPad all work the same way.",
        ],
      },
      {
        heading: "Distance",
        body: [
          "AirDrop is for devices in the same room, roughly 10 metres apart. Ferry connects over the internet, so the other device can be anywhere. When both are on the same Wi-Fi the files stay on that network.",
        ],
      },
      {
        heading: "Where AirDrop is the better tool",
        body: [
          "Between Apple devices AirDrop takes fewer steps, works from the share sheet in every app, and needs no network. If you live entirely inside Apple's devices, keep using it and reach for Ferry when someone else's device is involved.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is there an AirDrop for Windows?",
        a: "AirDrop itself does not run on Windows. Ferry does the same job in the browser: open it on the Windows PC and the iPhone, scan the QR code, and send files in either direction.",
      },
      {
        q: "How do I send files from iPhone to Android without an app?",
        a: "Open Ferry in the browser on both phones. Choose Send files on one, scan the QR code with the other, and pick the files. Nothing is installed on either phone.",
      },
      {
        q: "Does Ferry work without internet like AirDrop?",
        a: "Yes, when both devices are on the same Wi-Fi or phone hotspot. Offline mode connects them by scanning each other's QR codes. Unlike AirDrop it does need that shared network.",
      },
    ],
    sources: [
      { label: "Apple: use AirDrop on iPhone or iPad", url: "https://support.apple.com/HT204144" },
      { label: "9to5Google: Android phones that support AirDrop", url: "https://9to5google.com/2026/06/03/android-airdrop-list-of-supported-devices/" },
    ],
  },
  {
    slug: "ferry-vs-pairdrop",
    name: "PairDrop",
    tone: "peach",
    title: "Ferry vs PairDrop and Snapdrop: browser file transfer compared",
    description:
      "PairDrop, Snapdrop and Ferry all send files between browsers. Here is how they differ on encryption, large files, resuming and offline use.",
    answer:
      "PairDrop and Ferry are close relatives: both are free, run in the browser and send files directly. Choose PairDrop if you want open source software you can host yourself. Choose Ferry for very large files, transfers that resume, a security code you can check, and sending without internet.",
    intro: [
      "Snapdrop made browser-to-browser file sharing popular, and PairDrop is the actively maintained project that grew out of it. Both show the devices on your network and let you tap one to send a file.",
      "Ferry starts from the same idea and adds the parts that matter once files get large or the network gets unreliable.",
    ],
    rows: [
      { label: "Price", ferry: ferry.price, them: "Free and open source" },
      { label: "Account", ferry: ferry.account, them: "None" },
      { label: "Install", ferry: ferry.install, them: "Nothing. Runs in the browser" },
      { label: "Same network", ferry: "Nearby devices can be listed", them: "Devices appear automatically" },
      {
        label: "Other networks",
        ferry: "QR code, 6-digit code or link",
        them: "6-digit pairing code or a public room code",
      },
      {
        label: "Encryption",
        ferry: ferry.encryption,
        them: "The browser's built-in connection encryption",
      },
      {
        label: "Large files",
        ferry: "Written to storage as they arrive",
        them: "Depends on the browser's memory",
      },
      { label: "Resume", ferry: ferry.resume, them: "Start again" },
      { label: "No internet", ferry: ferry.offline, them: "Only if you host your own copy on that network" },
      { label: "Self hosting", ferry: "Not offered", them: "Yes" },
    ],
    ferryWhen: [
      "The file is several gigabytes and you do not want it held in the browser's memory.",
      "The connection is unreliable and the transfer needs to continue after a drop.",
      "You want to confirm with a security code that the two devices are talking only to each other.",
      "You need a command line tool or an API as well as a web page.",
    ],
    themWhen: [
      "You want to read the source code or run your own server.",
      "You mostly send small files between devices on one home network and like seeing them appear on their own.",
      "You already have it set up and paired, and it does the job.",
    ],
    sections: [
      {
        heading: "Encryption",
        body: [
          "Every browser-to-browser connection is encrypted in transit, and that is what PairDrop relies on. Ferry adds its own layer on top: the two devices agree on keys between themselves, every piece of every file is encrypted with them, and both screens show a 6-digit code that only matches when nobody is in the middle.",
        ],
      },
      {
        heading: "Large files and dropped connections",
        body: [
          "Ferry writes each file to the device's storage as it arrives and records how far it got. When a connection drops, the transfer continues from that point when the devices find each other again. This is the main practical difference for videos, disk images and backups.",
        ],
      },
      {
        heading: "Where PairDrop is the better tool",
        body: [
          "PairDrop is open source under the GPL and can be hosted on your own server, including one that never touches the internet. If auditing the code or owning the whole stack matters to you, that is a real advantage.",
        ],
      },
    ],
    faqs: [
      {
        q: "What is the difference between Snapdrop and PairDrop?",
        a: "PairDrop is a maintained continuation of Snapdrop. It adds pairing across networks with a 6-digit code, public rooms, and a number of fixes.",
      },
      {
        q: "Is Ferry a PairDrop alternative?",
        a: "Yes. Both send files directly between browsers for free. Ferry adds end-to-end encryption you can verify, transfers that resume, streaming to storage for large files, and an offline mode.",
      },
      {
        q: "Which is better for very large files?",
        a: "Ferry, in most cases. It saves files to storage as they arrive instead of holding them in memory, and continues after a dropped connection instead of starting over.",
      },
    ],
    sources: [
      { label: "PairDrop", url: "https://pairdrop.net" },
      { label: "PairDrop source code", url: "https://github.com/schlagmichdoch/PairDrop" },
    ],
  },
  {
    slug: "ferry-vs-send-anywhere",
    name: "Send Anywhere",
    tone: "night",
    title: "Ferry vs Send Anywhere: file transfer with no app and no ads",
    description:
      "Send Anywhere and Ferry both pair devices with a 6-digit code. Compare apps, ads, limits and privacy to pick the right one.",
    answer:
      "Both pair devices with a 6-digit code. Use Ferry if you want no app, no ads and no upload to a server. Use Send Anywhere if you want a native app on each device, or a download link that works for a couple of days.",
    intro: [
      "Send Anywhere has used 6-digit keys for years, and it is one of the best known ways to move a file between a phone and a computer. It is an app first, with a website alongside.",
      "Ferry uses the same kind of code and works entirely in the browser.",
    ],
    rows: [
      { label: "Price", ferry: ferry.price, them: "Free with ads, and a paid plan" },
      { label: "Account", ferry: ferry.account, them: "None" },
      { label: "Install", ferry: ferry.install, them: "Apps for phones and computers, plus a website" },
      { label: "Code lifetime", ferry: "24 hours, or until you end it", them: "10 minutes" },
      {
        label: "Where files go",
        ferry: ferry.path,
        them: "Direct when possible, through its servers when not. Links are stored",
      },
      { label: "Encryption", ferry: ferry.encryption, them: "Encrypted in transit" },
      { label: "Stored links", ferry: "None. Files are never stored", them: "Yes. Links last 48 hours" },
      { label: "Ads", ferry: "None", them: "Shown in the free apps" },
      { label: "No internet", ferry: ferry.offline, them: "Wi-Fi Direct between Android phones" },
    ],
    ferryWhen: [
      "You do not want to install anything on a device, especially one that is not yours.",
      "You want no ads and no account.",
      "You want the files to go only between your devices, with a security code to confirm it.",
      "You need more than 10 minutes to get to the other device.",
    ],
    themWhen: [
      "You transfer often and want an app in the share menu of your phone.",
      "You want a link the other person can download from over the next two days.",
      "You are sending between two Android phones with no network, using Wi-Fi Direct.",
    ],
    sections: [
      {
        heading: "Apps and ads",
        body: [
          "Send Anywhere's free apps are paid for by advertising, and a paid plan removes it. Ferry is a web page with no advertising and no tracking scripts. On a borrowed or work computer, opening a page is often possible where installing an app is not.",
        ],
      },
      {
        heading: "Codes and links",
        body: [
          "A Send Anywhere key lasts 10 minutes. A Ferry transfer stays open for 24 hours, so you can start it on one device and walk to the other. Send Anywhere also offers stored links that last 48 hours, which Ferry does not, because Ferry never stores files.",
        ],
      },
      {
        heading: "Where Send Anywhere is the better tool",
        body: [
          "A native app can sit in the share sheet, run in the background and use Wi-Fi Direct. If you send files every day from the same phone, that convenience is worth the install.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is there a Send Anywhere alternative without ads?",
        a: "Yes. Ferry pairs devices with a 6-digit code in the same way, runs in the browser, and has no ads, no account and no app to install.",
      },
      {
        q: "Does Ferry store my files like a Send Anywhere link?",
        a: "No. Ferry never stores files. They go directly from one device to the other while both are open.",
      },
      {
        q: "How long does a Ferry code last?",
        a: "24 hours, or until the sender ends the transfer. A Send Anywhere key lasts 10 minutes.",
      },
    ],
    sources: [
      { label: "Send Anywhere", url: "https://send-anywhere.com" },
      { label: "Send Anywhere on the App Store", url: "https://apps.apple.com/us/app/send-anywhere-file-transfer/id596642855" },
    ],
  },
  {
    slug: "ferry-vs-localsend",
    name: "LocalSend",
    tone: "cream",
    title: "Ferry vs LocalSend: file sharing with or without an app",
    description:
      "LocalSend shares files across a local network with an app on each device. Ferry does it in the browser and also works over the internet.",
    answer:
      "Use LocalSend if you can install its app on both devices and they are always on the same network: it needs no server at all. Use Ferry when you cannot or do not want to install anything, or when the devices are on different networks.",
    intro: [
      "LocalSend is a free, open source app for sharing files across a local network. It is well made and popular, and it works with no internet connection.",
      "Ferry covers the same case from the browser and also reaches devices that are somewhere else.",
    ],
    rows: [
      { label: "Price", ferry: ferry.price, them: "Free and open source" },
      { label: "Account", ferry: ferry.account, them: "None" },
      { label: "Install", ferry: ferry.install, them: "App needed on both devices" },
      { label: "Same network", ferry: "Yes", them: "Yes. Devices find each other" },
      { label: "Other networks", ferry: "Yes, over the internet", them: "No" },
      {
        label: "No internet",
        ferry: "Yes, after opening the page once while online",
        them: "Yes, always",
      },
      { label: "Encryption", ferry: ferry.encryption, them: "Encrypted in transit on the local network" },
      { label: "Resume", ferry: ferry.resume, them: "Start again" },
      { label: "Size limit", ferry: "No cap", them: "No cap" },
    ],
    ferryWhen: [
      "The other device belongs to someone else, or you cannot install apps on it.",
      "The devices are on different networks.",
      "The Wi-Fi isolates devices from each other, as many guest and office networks do.",
      "You want a transfer that continues after the connection drops.",
    ],
    themWhen: [
      "You can install the app everywhere and your devices share one network.",
      "You want no server involved at any point.",
      "You want open source software you can inspect and build yourself.",
    ],
    sections: [
      {
        heading: "Install or open",
        body: [
          "LocalSend needs its app on both sides, and it is available for Android, iOS, Windows, macOS and Linux. Ferry needs a browser. For your own devices the app is a one-time cost. For a friend's phone or an office computer, a web page is usually quicker.",
        ],
      },
      {
        heading: "Local network and beyond",
        body: [
          "LocalSend only works when both devices can reach each other on the same network. Ferry tries a direct route first, so on a shared network the files stay local, and it also connects across the internet when the devices are apart.",
          "With no internet at all, LocalSend works straight away. Ferry's offline mode works too, but the page has to have been opened once while online so the browser has saved it.",
        ],
      },
      {
        heading: "Where LocalSend is the better tool",
        body: [
          "If your devices live on one network and you are happy to install an app, LocalSend is simple and depends on nobody's server. It is also open source.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is there a LocalSend alternative that needs no app?",
        a: "Yes. Ferry runs in the browser on both devices, so there is nothing to install. It works on the same network and across the internet.",
      },
      {
        q: "Does LocalSend work over the internet?",
        a: "No. LocalSend is built for devices on the same local network. For devices on different networks, use a tool like Ferry that connects over the internet.",
      },
      {
        q: "Does Ferry keep files on my local network?",
        a: "When both devices are on the same Wi-Fi, Ferry connects them directly and the files do not leave that network. In offline mode nothing contacts the internet at all.",
      },
    ],
    sources: [
      { label: "LocalSend", url: "https://localsend.org" },
      { label: "LocalSend source code", url: "https://github.com/localsend/localsend" },
    ],
  },
];

export function findComparison(slug: string) {
  return comparisons.find((entry) => entry.slug === slug);
}
