import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Background } from "@/components/background";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { FeedbackProvider } from "@/components/ui";
import { site } from "@/lib/site";

const share = {
  url: "/og/home.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${site.name}: ${site.tagline.toLowerCase()}`,
};

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline.toLowerCase()}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  category: "technology",
  keywords: [
    "send files",
    "file transfer",
    "send large files free",
    "share files between devices",
    "phone to laptop file transfer",
    "AirDrop alternative",
    "WeTransfer alternative",
    "peer to peer file sharing",
    "encrypted file transfer",
  ],
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  publisher: site.name,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_US",
    title: `${site.name}: ${site.tagline.toLowerCase()}`,
    description: site.description,
    url: "/",
    images: [share],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline.toLowerCase()}`,
    description: site.description,
    images: [share],
  },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fcf9f5",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-sea focus:px-4 focus:py-2 focus:text-on-sea"
        >
          Skip to content
        </a>
        <FeedbackProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
          <Suspense fallback={null}>
            <Background />
          </Suspense>
        </FeedbackProvider>
      </body>
    </html>
  );
}
