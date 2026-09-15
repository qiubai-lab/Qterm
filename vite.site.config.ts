import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: source("./site"),
  publicDir: source("./site/public"),
  base: process.env.QTERM_SITE_BASE || "/Qterm/",
  plugins: [react()],
  define: { __QTERM_DEMO__: true },
  resolve: {
    alias: [
      { find: "@qterm/services", replacement: source("./src/demo/services") },
      { find: "/src", replacement: source("./src") },
    ],
  },
  build: {
    outDir: source("./dist-site"),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: source("./site/index.html"), demo: source("./site/demo/index.html") },
      output: { manualChunks: { terminal: ["@xterm/xterm", "@xterm/addon-fit"] } },
    },
  },
  server: { port: 1422, strictPort: true },
  test: { root: source("./"), environment: "jsdom", setupFiles: source("./src/test/setup.ts"), include: ["src/demo/**/*.test.{ts,tsx}", "src/onboarding/**/*.test.{ts,tsx}", "src/lib/runtime/*.test.ts"] },
});
