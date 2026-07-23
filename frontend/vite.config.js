import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

// Served through Frappe at /assets/managefarmspro/frontend/, built by
// `bench build --app managefarmspro` (or `npm run build` here directly).
// www/farmpro.html loads the fixed-name entry files below.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  base: "/assets/managefarmspro/frontend/",
  build: {
    outDir: "../managefarmspro/public/frontend",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/main.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://farmspro.local:8000", changeOrigin: true },
    },
  },
})
