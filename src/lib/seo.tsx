import type { Metadata } from "next";
import { site } from "./site";

export const published = "2026-10-08";

export function pageMeta(options: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  absoluteTitle?: boolean;
  ownImage?: boolean;
}): Metadata {
  const share = {
    url: options.ownImage ? `${options.path}/opengraph-image` : "/opengraph-image",
    width: 1200,
    height: 630,
    alt: options.title,
  };
  const shown = options.absoluteTitle ? options.title : `${options.title} | ${site.name}`;
  return {
    title: options.absoluteTitle ? { absolute: options.title } : options.title,
    description: options.description,
    alternates: { canonical: options.path },
    openGraph: {
      type: options.type ?? "website",
      siteName: site.name,
      locale: "en_US",
      url: options.path,
      title: shown,
      description: options.description,
      images: [share],
      ...(options.type === "article"
        ? { publishedTime: published, modifiedTime: published, authors: [site.name] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: shown,
      description: options.description,
      images: [share],
    },
  };
}

const orgId = `${site.url}/#organization`;
const siteId = `${site.url}/#website`;
export const appId = `${site.url}/#app`;

export const organization = {
  "@type": "Organization",
  "@id": orgId,
  name: site.name,
  url: site.url,
  logo: `${site.url}/icons/icon-512.png`,
};

export const website = {
  "@type": "WebSite",
  "@id": siteId,
  name: site.name,
  url: site.url,
  description: site.description,
  publisher: { "@id": orgId },
  inLanguage: "en",
};

export function breadcrumbs(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: site.name, path: "/" }, ...trail].map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${site.url}${entry.path === "/" ? "" : entry.path}`,
    })),
  };
}

export function faqPage(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function JsonLd({ graph }: { graph: object[] }) {
  const data = { "@context": "https://schema.org", "@graph": graph };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
