import { build } from 'vite';
await build({configFile:false,publicDir:false,build:{ssr:'src/server/screen/worker.mjs',outDir:'dist-server',emptyOutDir:true,minify:false,rollupOptions:{output:{format:'es',entryFileNames:'screen.mjs'}}},ssr:{noExternal:['@xterm/headless','@xterm/addon-serialize']}});
