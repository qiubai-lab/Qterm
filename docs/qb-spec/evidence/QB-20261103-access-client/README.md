# Access-log client identification

Browser screenshots use the real AccessLogDialog and AccessLogDetail with synthetic access-log responses in a temporary Vite fixture. They verify dark/light/cyberpunk rendering, compact client labels, and desktop platform/version details; they are not production server records or native macOS execution evidence.

- `dark.png`, `light.png`, `cyberpunk.png`: desktop, browser, and missing-metadata rows.
- `detail.png`: desktop macOS / arm64 / version detail.
- Adjacent frontend tests cover historical desktop UAs, OS/architecture display, browser compatibility-token precedence, unknown versus explicit timeout-system events, and list/detail rendering.
- Native loopback integration tests inspect the actual upstream HTTP User-Agent and return the upstream WebSocket User-Agent to verify parity, alongside cookie, origin, forwarding and disconnect behavior.
