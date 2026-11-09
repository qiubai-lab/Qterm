import { readFileSync } from "node:fs";

export const pages = JSON.parse(readFileSync(new URL("./pages.json", import.meta.url), "utf8"));
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function siteConfig(env = process.env) {
  const url = new URL(env.QTERM_SITE_URL || "https://qiubai-lab.github.io/Qterm/");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) {
    throw new Error("QTERM_SITE_URL must be an absolute HTTPS URL ending in /, without credentials, query or fragment.");
  }
  const base = env.QTERM_SITE_BASE || url.pathname;
  if (base !== url.pathname) throw new Error("QTERM_SITE_BASE must match the pathname of QTERM_SITE_URL.");
  return { url: url.href, base };
}

export function metadata(page, html, config) {
  const url = new URL(page.path, config.url).href;
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"\s*\/?>/)?.[1];
  if (!title || !description) throw new Error(`Missing title or description: ${page.path}`);
  // The author-provided strings are already HTML escaped in the source.
  const tags = [
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Qterm" />',
    `<meta property="og:locale" content="${page.lang === "en" ? "en_US" : "zh_CN"}" />`,
    `<meta property="og:image" content="${escape(new URL("qterm-social.png", config.url).href)}" />`,
    '<meta property="og:image:alt" content="Qterm SSH workspace" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ];
  if (page.index === false) tags.push('<meta name="robots" content="noindex,follow" />');
  if (page.translation !== undefined) {
    const counterpart = pages.find(other => other.path === page.translation);
    if (!counterpart || counterpart.translation !== page.path) throw new Error(`Unpaired translation: ${page.path}`);
    for (const other of [page, counterpart]) {
      tags.push(`<link rel="alternate" hreflang="${other.lang}" href="${escape(new URL(other.path, config.url).href)}" />`);
    }
    const fallback = page.lang === "zh-CN" ? page : counterpart;
    tags.push(`<link rel="alternate" hreflang="x-default" href="${escape(new URL(fallback.path, config.url).href)}" />`);
  }
  if (page.application) {
    const data = {
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      name: "Qterm", url, applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux", isAccessibleForFree: true,
      license: "https://github.com/qiubai-lab/Qterm/blob/main/LICENSE",
      downloadUrl: new URL(page.lang === "en" ? "en/download/" : "download/", config.url).href,
      sameAs: "https://github.com/qiubai-lab/Qterm",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`);
  }
  return tags.join("\n    ");
}

export function sitemap(config) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.filter(page => page.index !== false).map(page => `  <url><loc>${escape(new URL(page.path, config.url).href)}</loc></url>`).join("\n") +
    "\n</urlset>\n";
}

export function siteSeo(config) {
  return {
    name: "qterm-site-seo",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const path = context.path.replace(/^\//, "").replace(/index\.html$/, "");
        const page = pages.find(entry => entry.path === path);
        if (!page) throw new Error(`Unregistered site page: ${context.path}`);
        if (!html.includes("<!-- site:seo -->")) throw new Error(`Missing SEO marker: ${context.path}`);
        const verification = [
          ["google-site-verification", process.env.QTERM_GOOGLE_SITE_VERIFICATION],
          ["msvalidate.01", process.env.QTERM_BING_SITE_VERIFICATION],
        ].filter(([, token]) => token).map(([name, token]) => `<meta name="${name}" content="${escape(token)}" />`).join("\n    ");
        return html.replace("<!-- site:seo -->", metadata(page, html, config) + "\n    " + verification);
      },
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap(config) });
      // A project-path robots.txt has no authority. Emit it only for root-domain hosting.
      if (config.base === "/") this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\nSitemap: ${config.url}sitemap.xml\n` });
    },
  };
}
