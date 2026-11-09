import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { metadata, pages, siteConfig, siteSeo, sitemap } from "./seo.mjs";

const html = '<title>Qterm &amp; SSH</title><meta name="description" content="Remote development" />';
test("the canonical deployment address owns the base and rejects inconsistent configuration", () => {
  assert.deepEqual(siteConfig({}), { url: "https://qiubai-lab.github.io/Qterm/", base: "/Qterm/" });
  assert.deepEqual(siteConfig({ QTERM_SITE_URL: "https://qterm.example/" }), { url: "https://qterm.example/", base: "/" });
  for (const url of ["http://qterm.example/", "https://qterm.example/path", "https://user:pass@qterm.example/", "https://qterm.example/?x=1", "https://qterm.example/#x"]) {
    assert.throws(() => siteConfig({ QTERM_SITE_URL: url }));
  }
  assert.throws(() => siteConfig({ QTERM_SITE_BASE: "/" }), /must match/);
});

test("nested translations retain their own canonical and reciprocal language URLs on a custom base", () => {
  const config = siteConfig({ QTERM_SITE_URL: "https://qterm.example/docs/" });
  const page = pages.find(page => page.path === "en/guides/remote-ai/");
  const doc = new JSDOM(`<head>${metadata(page, html, config)}</head>`).window.document;
  assert.equal(doc.querySelector('link[rel="canonical"]').href, "https://qterm.example/docs/en/guides/remote-ai/");
  assert.equal(doc.querySelector('[hreflang="zh-CN"]').href, "https://qterm.example/docs/guides/remote-ai/");
  assert.equal(doc.querySelector('[hreflang="en"]').href, "https://qterm.example/docs/en/guides/remote-ai/");
  assert.equal(doc.querySelector('[property="og:title"]').content, "Qterm & SSH");
  assert.equal(doc.querySelector('[property="og:image"]').content, "https://qterm.example/docs/qterm-social.png");
});

test("the demo is noindex and absent from the sitemap; no translation is invented", () => {
  const config = siteConfig({});
  const demo = pages.find(page => page.path === "demo/");
  assert.match(metadata(demo, html, config), /noindex,follow/);
  assert(!sitemap(config).includes("/demo/"));
  const singleLanguage = pages.find(page => page.path === "guides/remote-git/");
  assert(!metadata(singleLanguage, html, config).includes("hreflang"));
});

test("home schema describes the software without ratings and uses localized download links", () => {
  const config = siteConfig({ QTERM_SITE_URL: "https://qterm.example/" });
  const home = pages.find(page => page.path === "en/");
  const doc = new JSDOM(`<head>${metadata(home, html, config)}</head>`).window.document;
  const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(schema.downloadUrl, "https://qterm.example/en/download/");
  assert.equal(schema.offers.price, "0");
  assert(!schema.aggregateRating);
  assert.throws(() => metadata(home, "<title>Missing description</title>", config), /Missing/);
});

test("robots.txt is emitted only when the deployment owns the domain root", () => {
  for (const url of ["https://qterm.example/", "https://qterm.example/project/"]) {
    const config = siteConfig({ QTERM_SITE_URL: url });
    const output = [];
    siteSeo(config).generateBundle.call({ emitFile: asset => output.push(asset) });
    assert(output.some(asset => asset.fileName === "sitemap.xml"));
    assert.equal(output.some(asset => asset.fileName === "robots.txt"), config.base === "/");
  }
});

test("the HTML hook requires an explicit marker and escapes optional site-verification metadata", () => {
  const previous = process.env.QTERM_GOOGLE_SITE_VERIFICATION;
  try {
    process.env.QTERM_GOOGLE_SITE_VERIFICATION = 'proof"<&';
    const plugin = siteSeo(siteConfig({}));
    const result = plugin.transformIndexHtml.handler(html + '<!-- site:seo -->', { path: '/en/index.html' });
    const doc = new JSDOM(`<head>${result}</head>`).window.document;
    assert.equal(doc.querySelector('[name="google-site-verification"]').content, 'proof"<&');
    assert.equal(doc.querySelectorAll('[name="google-site-verification"]').length, 1);
    assert.throws(() => plugin.transformIndexHtml.handler(html, { path: '/en/index.html' }), /Missing SEO marker/);
    assert.throws(() => plugin.transformIndexHtml.handler(html, { path: '/missing/index.html' }), /Unregistered/);
  } finally {
    if (previous === undefined) delete process.env.QTERM_GOOGLE_SITE_VERIFICATION;
    else process.env.QTERM_GOOGLE_SITE_VERIFICATION = previous;
  }
});
