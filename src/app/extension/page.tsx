import Image from "next/image";
import { breadcrumbs, JsonLd, pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  image: "developers",
  title: "Ferry for Chrome: send this page to your phone",
  description: `Send the page you are on, a link, selected text or an image from Chrome to your phone with one click, and get files back. ${site.name} for Chrome is free and end-to-end encrypted.`,
  path: "/extension",
});

const shots = [
  { src: "/extension/send-page.png", alt: "The Ferry popup with the current page ready to send to a remembered iPhone" },
  { src: "/extension/scan.png", alt: "The Ferry popup showing a QR code and a 6-digit code for the phone" },
  { src: "/extension/receive.png", alt: "The Ferry popup showing text and a photo received from a phone" },
];

export default function ExtensionPage() {
  const live = Boolean(site.chromeExtension);
  return (
    <article className="prose-doc mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd graph={[breadcrumbs([{ name: "Chrome extension", path: "/extension" }])]} />
      <p className="eyebrow">Chrome extension</p>
      <h1 className="mt-6">Send this page to your phone</h1>
      <p className="serif mt-5 !text-2xl !leading-snug">
        One click sends the page you are on to your phone. It goes straight from your browser, end-to-end encrypted, with nothing
        uploaded.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {live ? (
          <a href={site.chromeExtension} className="pill h-12 bg-sea px-7 text-on-sea hover:bg-sea-deep" rel="noopener">
            Add to Chrome, free
          </a>
        ) : (
          <span className="pill h-12 border border-sea px-7">Coming soon to Chrome</span>
        )}
        <a href={`${site.repo}/tree/main/extension`} className="pill h-12 border border-sea px-7 hover:bg-sunken" rel="noopener">
          Source code
        </a>
      </div>
      {!live && <p className="mt-3 text-sm">The listing is in review at the Chrome Web Store.</p>}

      <Image src={shots[0].src} alt={shots[0].alt} width={1280} height={800} priority className="mt-10 h-auto w-full rounded-[24px] border border-line" />

      <h2>What it does</h2>
      <ul>
        <li>
          <strong>Send this page.</strong> Click the Ferry icon. Scan the QR code with your phone, or type the 6-digit code at{" "}
          {site.url.replace(/^https?:\/\//, "")}.
        </li>
        <li>
          <strong>Right-click to send.</strong> Right-click a link, an image or selected text and choose &ldquo;Send with Ferry&rdquo;.
        </li>
        <li>
          <strong>Remember your phone.</strong> Pair once. After that, &ldquo;Send to your phone&rdquo; needs no code. Your phone gets
          a prompt when Ferry is open on it.
        </li>
        <li>
          <strong>Get files back.</strong> Photos and files from your phone go to your Downloads folder. Text shows in the popup,
          ready to copy.
        </li>
      </ul>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {shots.slice(1).map((shot) => (
          <Image key={shot.src} src={shot.src} alt={shot.alt} width={1280} height={800} className="h-auto w-full rounded-[18px] border border-line" />
        ))}
      </div>

      <h2>Private by design</h2>
      <ul>
        <li>The extension reads a tab&rsquo;s address and title only when you click its icon or its menu item.</li>
        <li>It asks for permission to read images from a site the first time you send an image from that site.</li>
        <li>Everything goes straight to your other device, encrypted. Ferry stores nothing on a server.</li>
        <li>It keeps no history and has no analytics.</li>
      </ul>

      {!live && (
        <>
          <h2>Install it before the listing is live</h2>
          <ol>
            <li>
              Download the source from <a href={site.repo}>GitHub</a>, then run <code>npm install</code> and{" "}
              <code>npm run build</code> in the <code>extension</code> folder.
            </li>
            <li>
              Open <code>chrome://extensions</code> and turn on Developer mode.
            </li>
            <li>
              Click &ldquo;Load unpacked&rdquo; and choose <code>extension/dist</code>.
            </li>
          </ol>
        </>
      )}

      <h2>Limits</h2>
      <ul>
        <li>Your phone must have Ferry open while the transfer runs. Ferry keeps no file for later.</li>
        <li>A file from your phone can be up to 2 GB. For larger files, use the Ferry site on both devices.</li>
        <li>Chrome&rsquo;s own pages, such as the new tab page and settings, cannot be sent.</li>
      </ul>
    </article>
  );
}
