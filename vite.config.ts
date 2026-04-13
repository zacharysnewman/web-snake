import { defineConfig } from "vite";

export default defineConfig({
  base: "/web-snake/",
  server: {
    host: true,
    port: 3000,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    minify: "esbuild",
  },
});
