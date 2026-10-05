import { resolve } from "node:path";
import { defineConfig } from "vite";
export default defineConfig({
  root:"web",
  optimizeDeps:{exclude:["@shutter-network/shutter-sdk"]},
  build:{
    outDir:"../public",
    emptyOutDir:true,
    sourcemap:true,
    target:"es2022",
    rollupOptions:{
      input:{
        home:resolve("web/index.html"),
        console:resolve("web/console.html")
      }
    }
  }
});
