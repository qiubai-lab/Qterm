import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { pages } from "./seo.mjs";

async function htmlFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(entry => entry.isDirectory()
    ? htmlFiles(path.join(directory, entry.name), prefix + entry.name + "/")
    : entry.name.endsWith(".html") ? [prefix + entry.name] : []));
  return lists.flat();
}

export async function verifySite(directory, config) {
  const expected = pages.map(page => `${page.path}index.html`).sort();
  assert.deepEqual((await htmlFiles(directory)).sort(), expected, "All built HTML pages must be registered");
  const documents = new Map();
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const file = `${page.path}index.html`;
    const html = await readFile(path.join(directory, file), "utf8");
    assert(!html.includes("%BASE_URL%") && !html.includes("<!-- site:seo -->"), `${file}: unresolved template`);
    const doc = new JSDOM(html).window.document;
    documents.set(file, doc);
    assert.equal(doc.documentElement.lang, page.lang, `${file}: language`);
    const title = doc.title;
    const description = doc.querySelector('meta[name="description"]')?.content;
    assert(title && description, `${file}: missing title/description`);
    assert(!titles.has(title) && !descriptions.has(description), `${file}: duplicate title/description`);
    titles.add(title); descriptions.add(description);
    const url = new URL(page.path, config.url).href;
    const canonicals = doc.querySelectorAll('link[rel="canonical"]');
    assert.equal(canonicals.length, 1, `${file}: one canonical required`);
    assert.equal(canonicals[0].href, url, `${file}: self canonical`);
    assert.equal(doc.querySelector('meta[property="og:url"]')?.content, url, `${file}: OG URL`);
    assert.equal(doc.querySelector('meta[property="og:title"]')?.content, title, `${file}: OG title`);
    assert.equal(doc.querySelector('meta[property="og:description"]')?.content, description, `${file}: OG description`);
    assert.equal(doc.querySelector('meta[property="og:image"]')?.content, new URL("qterm-social.png", config.url).href, `${file}: OG image`);
    const alternates = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')];
    if (page.translation !== undefined) {
      assert.equal(alternates.length, 3, `${file}: language alternatives`);
      for (const alternate of alternates) {
        const target = pages.find(other => new URL(other.path, config.url).href === alternate.href);
        assert(target && (target.path === page.path || target.translation === page.path), `${file}: reciprocal translation`);
        assert(alternate.hreflang === target.lang || alternate.hreflang === "x-default", `${file}: alternate language`);
      }
      assert.deepEqual(alternates.map(a => a.hreflang).sort(), ["en", "x-default", "zh-CN"], `${file}: language set`);
    } else assert.equal(alternates.length, 0, `${file}: no invented translations`);
    if (page.index === false) {
      assert.equal(doc.querySelector('meta[name="robots"]')?.content, "noindex,follow", `${file}: demo indexing policy`);
    } else {
      assert(!doc.querySelector('meta[name="robots"]')?.content.includes("noindex"), `${file}: indexable page`);
      assert.equal(doc.querySelectorAll("h1").length, 1, `${file}: one visible H1`);
      assert(doc.querySelector("main")?.textContent.trim().length > 250, `${file}: substantive static content`);
      assert(!doc.querySelector('script[type="module"]'), `${file}: content must not load the terminal runtime`);
    }
    const schema = doc.querySelectorAll('script[type="application/ld+json"]');
    assert.equal(schema.length, page.application ? 1 : 0, `${file}: structured data scope`);
    if (page.application) {
      const data = JSON.parse(schema[0].textContent);
      assert.equal(data["@type"], "SoftwareApplication");
      assert.equal(data.url, url);
      assert.equal(data.name, "Qterm");
      assert.equal(data.offers.price, "0");
      assert(!data.aggregateRating && !data.review, `${file}: no invented ratings`);
    }
  }
  for (const [file, doc] of documents) {
    const ids = [...doc.querySelectorAll("[id]")].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
    for (const element of doc.querySelectorAll("[href], [src]")) {
      const reference = element.getAttribute("href") ?? element.getAttribute("src");
      const url = new URL(reference, new URL(file, config.url));
      if (url.origin !== new URL(config.url).origin) continue;
      assert(url.pathname.startsWith(config.base), `${file}: link escapes site base: ${reference}`);
      let local = decodeURIComponent(url.pathname.slice(config.base.length));
      if (!local || local.endsWith("/")) local += "index.html";
      await access(path.join(directory, local)).catch(() => { throw new Error(`${file}: missing resource ${reference}`); });
      if (url.hash && documents.has(local)) {
        assert(documents.get(local).getElementById(decodeURIComponent(url.hash.slice(1))), `${file}: broken fragment ${reference}`);
      }
    }
    for (const img of doc.querySelectorAll("img")) {
      assert(img.alt && img.getAttribute("width") && img.getAttribute("height"), `${file}: image needs alt text and dimensions`);
    }
  }
  const sitemap = new JSDOM(await readFile(path.join(directory, "sitemap.xml"), "utf8"), { contentType: "text/xml" }).window.document;
  assert.deepEqual([...sitemap.querySelectorAll("loc")].map(node => node.textContent).sort(),
    pages.filter(page => page.index !== false).map(page => new URL(page.path, config.url).href).sort(), "Sitemap must match indexable canonical URLs");
  if (config.base === "/") {
    const robots = await readFile(path.join(directory, "robots.txt"), "utf8");
    assert(robots.includes(`Sitemap: ${config.url}sitemap.xml`), "Root robots must advertise the sitemap");
    assert(!robots.includes("Disallow: /"), "Public pages must be crawlable");
  } else {
    await assert.rejects(access(path.join(directory, "robots.txt")), "Do not publish an ineffective project-path robots.txt");
  }
  // Walk actual internal hyperlinks from the homepages to detect orphan content.
  const visited = new Set();
  const queue = ["index.html"];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const doc = documents.get(file);
    for (const anchor of doc?.querySelectorAll("a[href]") ?? []) {
      const url = new URL(anchor.getAttribute("href"), new URL(file, config.url));
      if (!url.href.startsWith(config.url)) continue;
      let target = url.pathname.slice(config.base.length);
      if (target.endsWith("/")) target += "index.html";
      if (documents.has(target)) queue.push(target);
    }
  }
  for (const file of expected) assert(visited.has(file), `Orphan page: ${file}`);
  console.log(`Verified ${documents.size} pages: static content, metadata, translations, links, sitemap and discovery.`);
}
