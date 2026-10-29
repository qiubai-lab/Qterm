(() => {
  const NativeSocket = globalThis.WebSocket;
  // Test-only escape hatch to verify native raw-loopback blocking.
  globalThis.__probeNativeSocket = NativeSocket;
  globalThis.WebSocket = new Proxy(NativeSocket, {
    construct(Target, args, NewTarget) {
      const url = new URL(args[0], globalThis.location.href);
      if (url.protocol === 'ws:' && url.hostname === 'localhost' && url.port === '3000') {
        url.hostname = 'localhost.qterm-tunnel.invalid';
      }
      args[0] = url.href;
      return Reflect.construct(Target, args, NewTarget);
    },
  });
})();
