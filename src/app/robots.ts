import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

const closed = ["/room/", "/admin", "/api/", "/v1/", "/share"];

const assistants = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "meta-externalagent",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: closed },
      { userAgent: assistants, allow: "/", disallow: closed },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
