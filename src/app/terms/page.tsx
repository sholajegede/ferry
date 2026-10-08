import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMeta({
  title: "Terms of use",
  description: `The terms for using ${site.name}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <article className="prose-doc mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Trust and legal</p>
      <h1 className="mt-6">Terms of use</h1>
      <p className="mt-3 text-ink/80">Last updated 8 October 2026</p>

      <h2>Using {site.name}</h2>
      <p>
        {site.name} lets you send files and text between devices. By using it you agree to these
        terms. If you do not agree, do not use it.
      </p>

      <h2>Your content</h2>
      <p>
        What you send goes directly from one device to another, encrypted. {site.name} does not
        receive it, cannot see it and cannot recover it for you. You are responsible for what you
        send and for having the right to send it.
      </p>

      <h2>What you must not do</h2>
      <ul>
        <li>Send content that is illegal where you or the receiver are.</li>
        <li>Send malware, or use {site.name} to harm or gain access to someone else&rsquo;s device.</li>
        <li>Interfere with the service, for example by flooding it with requests or guessing other people&rsquo;s transfer codes.</li>
        <li>Use {site.name} to harass anyone or to violate their privacy.</li>
      </ul>

      <h2>Only accept files you expect</h2>
      <p>
        Join transfers only from people you trust, and check the security code when {site.name}{" "}
        asks you to. Treat received files like any other download and scan them if you are unsure.
      </p>

      <h2>Availability</h2>
      <p>
        {site.name} is provided as it is, with no promise that it will always be available or that
        every transfer will complete. Transfers depend on your devices, your browsers and your
        network. Features can change or be removed.
      </p>

      <h2>No warranty and limits on liability</h2>
      <p>
        To the extent the law allows, {site.name} comes with no warranties of any kind, and{" "}
        {site.operator} is not liable for lost data, failed transfers, or any indirect or
        consequential loss that results from using it. Nothing in these terms limits liability that
        cannot be limited by law.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop using {site.name} at any time. Access can be limited for devices that break
        these terms.
      </p>

      <h2>Privacy</h2>
      <p>
        The <Link href="/privacy">privacy policy</Link> explains what data is stored and for how
        long.
      </p>

      <h2>Changes</h2>
      <p>If these terms change, the new version is posted here with a new date.</p>

      {site.contactEmail && (
        <>
          <h2>Contact</h2>
          <p>
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          </p>
        </>
      )}
    </article>
  );
}
