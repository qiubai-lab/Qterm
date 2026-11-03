import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [react()],
  define: { __QTERM_DEMO__: false, __QTERM_SERVER__: true },
  resolve: { alias: [{ find: "@qterm/services", replacement: fileURLToPath(new URL("./src/server/services", import.meta.url)) }, { find: "/src", replacement: fileURLToPath(new URL("./src", import.meta.url)) }] },
  build: { outDir: "../dist-web", emptyOutDir: true, rollupOptions: { output: { manualChunks: { terminal: ["@xterm/xterm", "@xterm/addon-fit"] } } } },
  server: { port: 1423, strictPort: true, proxy: { "/healthz": { target: "http://127.0.0.1:8080" }, "/api": { target: "http://127.0.0.1:8080", ws: true } } },
  test: { root: fileURLToPath(new URL("./", import.meta.url)), environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/server/**/*.test.{ts,tsx}"] },
});
