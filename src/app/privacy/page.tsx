import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  title: "Privacy policy",
  description: `What ${site.name} stores, what it never receives, and how long data is kept.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <article className="prose-doc mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Trust and legal</p>
      <h1 className="mt-6">Privacy policy</h1>
      <p className="mt-3 text-ink/80">Last updated 8 October 2026</p>

      <h2>The short version</h2>
      <p>
        {site.name} sends your files and text directly from one device to another. They are
        encrypted on the sending device and decrypted on the receiving device. The {site.name}{" "}
        server never receives them, their names, or the keys that protect them. It does keep
        anonymous statistics about how the service is used, described below.
      </p>

      <h2>What the server stores</h2>
      <p>
        To let two devices find each other, the server keeps a small amount of data. {site.name} is
        operated by {site.operator}.
      </p>
      <h3>About a device</h3>
      <ul>
        <li>A random device ID that your browser creates. It is not linked to your name or email.</li>
        <li>A one-way hash of a secret your browser creates, used to prove requests come from that device.</li>
        <li>The device name, for example &ldquo;Mac (Chrome)&rdquo;, or a name you typed.</li>
        <li>The time the device last had {site.name} open.</li>
      </ul>
      <p>A device record is deleted after 90 days without use.</p>
      <h3>About a transfer</h3>
      <ul>
        <li>A random transfer ID, a 6-digit code, and the time it expires.</li>
        <li>A one-way hash of a join token. The token comes from the part of the link after the # sign, which browsers never send to servers.</li>
        <li>The device IDs and names of the devices that joined, and the public halves of their encryption keys.</li>
        <li>Connection setup messages between the devices. These are encrypted with a key the server does not have.</li>
        <li>If &ldquo;Show to devices on my network&rdquo; is on, a keyed hash of your public IP address. The address itself is not stored.</li>
      </ul>
      <p>
        Setup messages are deleted when the devices connect or the transfer ends. Everything about a
        transfer is deleted after it expires, which is 24 hours after it starts.
      </p>
      <h3>About remembered devices</h3>
      <ul>
        <li>The pair of device IDs that agreed to remember each other.</li>
        <li>A short-lived, encrypted invitation when one of them starts a transfer to the other. It is deleted after 10 minutes.</li>
      </ul>
      <h3>Usage statistics</h3>
      <p>
        To understand how {site.name} is used, the server records an event when a page is opened,
        a transfer is started or joined, a file or text message is sent, or two devices choose to
        remember each other. An event can include:
      </p>
      <ul>
        <li>The date and the kind of event.</li>
        <li>The country, region and city your network appears to be in, as estimated by the hosting provider from your IP address. The IP address itself is not stored.</li>
        <li>Your operating system, browser and whether the device is a phone, tablet or computer.</li>
        <li>The site that linked you here, and which page of {site.name} you opened.</li>
        <li>For a file: its general type, such as image or video, its extension, such as &ldquo;pdf&rdquo;, its size, and whether the route was direct or relayed.</li>
        <li>How a device joined a transfer: by link, code, nearby list or remembered device.</li>
        <li>A random-looking visitor code that changes every day. It lets visits be counted without identifying a device from one day to the next.</li>
      </ul>
      <p>
        Events never include a file name, file contents, text you send, a device ID or an IP
        address. They are deleted after 120 days. Daily totals for the whole service are kept
        longer.
      </p>

      <h2>What the server never receives</h2>
      <ul>
        <li>The contents of your files or text.</li>
        <li>File names, folder names or paths.</li>
        <li>The encryption keys, or the secret part of a transfer link.</li>
      </ul>
      <p>
        For the statistics above, the sending device reports the type, extension and size of each
        file it sends. Nothing else about a file is reported.
      </p>

      <h2>IP addresses and other companies</h2>
      <ul>
        <li>The companies that host this site and its database process your IP address to deliver the service, as any website host does.</li>
        <li>To connect directly, your two devices learn each other&rsquo;s IP addresses. This is how peer-to-peer connections work.</li>
        <li>Your browser contacts public address-discovery servers run by Cloudflare and Google to find a route between the devices. They see your IP address and nothing about your files.</li>
        <li>When no direct route exists and a relay is configured, your encrypted data passes through the relay. The relay cannot decrypt it.</li>
      </ul>
      <p>{site.name} has no advertising and no third-party analytics or tracking scripts.</p>

      <h2>What is stored on your device</h2>
      <ul>
        <li>The device ID, its secret and its name.</li>
        <li>Your list of remembered devices and the keys shared with them.</li>
        <li>Encryption keys for transfers that are still open.</li>
        <li>Files you received, in the browser&rsquo;s private storage, until you save them. {site.name} clears finished files after 24 hours and unfinished ones after 3 days.</li>
        <li>Your settings, such as whether received files save automatically.</li>
      </ul>
      <p>
        You can remove all of it by clearing this site&rsquo;s data in your browser settings.
        {" "}{site.name} sets no tracking cookies. One cookie is used only to keep the site
        operator signed in to the admin page.
      </p>

      <h2>Offline mode</h2>
      <p>
        Offline mode does not contact the server. The two devices exchange connection details
        through the QR codes on their screens.
      </p>

      <h2>Children</h2>
      <p>{site.name} is not directed at children under 13 and does not knowingly collect data from them.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version is posted here with a new date.</p>

      {site.contactEmail && (
        <>
          <h2>Contact</h2>
          <p>
            Questions or requests about your data: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
          </p>
        </>
      )}
    </article>
  );
}
