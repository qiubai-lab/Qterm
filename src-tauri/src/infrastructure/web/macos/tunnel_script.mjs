(() => {
  // Compatibility only. Native content rules, not these wrappers, prevent raw loopback traffic.
  const suffix = ".qterm-tunnel.invalid";
  function map(value) {
    const text = String(value);
    let url;
    try { url = new URL(text, document.baseURI); } catch { return text; }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    let alias;
    if (host === "localhost") alias = "localhost";
    else if (host === "[::1]") alias = "ipv6-loopback";
    else if (host === "[::ffff:7f00:1]") alias = "ip-7f000001";
    else if (host === "0.0.0.0") alias = "unspecified";
    else if (/^127(?:\.\d{1,3}){3}$/.test(host)) alias = "ip-" + host.split(".").map(n => Number(n).toString(16).padStart(2, "0")).join("");
    if (!alias) return text;
    if (!["http:", "ws:"].includes(url.protocol)) throw new TypeError("隧道地址映射仅支持 HTTP/WS；HTTPS localhost 需要使用服务器域名和有效证书");
    url.hostname = alias + suffix;
    return url.href;
  }
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      if (input instanceof Request) {
        const url = map(input.url);
        if (url !== input.url) input = new Request(url, input);
      } else input = map(input);
      return originalFetch.call(this, input, init);
    } catch (error) { return Promise.reject(error); }
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) { return open.call(this, method, map(url), ...rest); };
  const socket = window.WebSocket;
  window.WebSocket = new Proxy(socket, { construct(target, args, next) { args[0] = map(args[0]); return Reflect.construct(target, args, next); } });
  const popup = window.open;
  window.open = function(url, ...rest) { return popup.call(this, url == null ? url : map(url), ...rest); };
  const beacon = navigator.sendBeacon;
  if (beacon) navigator.sendBeacon = function(url, data) { return beacon.call(this, map(url), data); };

  const attributes = ["href", "src", "action", "formaction", "poster"];
  const set = Element.prototype.setAttribute;
  function repair(element) {
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value == null) continue;
      try { const next = map(value); if (next !== value) set.call(element, name, next); } catch { /* Native rules block unsupported original requests. */ }
    }
  }
  Element.prototype.setAttribute = function(name, value) {
    return set.call(this, name, attributes.includes(String(name).toLowerCase()) ? map(value) : value);
  };
  for (const [type, property] of [[HTMLAnchorElement, "href"], [HTMLImageElement, "src"], [HTMLIFrameElement, "src"], [HTMLScriptElement, "src"], [HTMLFormElement, "action"], [HTMLButtonElement, "formAction"], [HTMLSourceElement, "src"]]) {
    const descriptor = Object.getOwnPropertyDescriptor(type.prototype, property);
    if (descriptor?.set) Object.defineProperty(type.prototype, property, { ...descriptor, set(value) { descriptor.set.call(this, map(value)); } });
  }
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() { repair(this); return submit.call(this); };
  document.addEventListener("submit", event => { repair(event.target); if (event.submitter) repair(event.submitter); }, true);
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("a,area,button,input") : null;
    if (target) repair(target);
  }, true);
  function scan(root) {
    if (!(root instanceof Element)) return;
    repair(root); root.querySelectorAll("[href],[src],[action],[formaction],[poster]").forEach(repair);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") repair(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: attributes });
})();
