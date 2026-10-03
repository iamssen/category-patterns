import { homedir } from "node:os";
import path from "node:path";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import solid from "@solidjs/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { categoryPatternsServer, initializeProjects } from "./server.ts";

export default defineConfig(async ({ command, mode }) => {
  if (command === "build" && mode !== "web") {
    throw new Error("Only Web mode can be built. Use npm run build.");
  }
  if (mode !== "web" && command !== "build" && mode !== "app" && mode !== "production") {
    throw new Error("Use npm run dev or npm run dev:app.");
  }
  const appMode = command === "serve" && mode === "app";
  const plugins: PluginOption[] = [solid()];
  if (mode === "web") {
    plugins.push(
      VitePWA({
        registerType: "prompt",
        injectRegister: "script-defer",
        includeAssets: ["icon-180.png", "icon-192.png", "icon-512.png"],
        manifest: {
          id: "./",
          name: "Category Patterns",
          short_name: "Patterns",
          description: "Generate color palettes and export SVG patterns.",
          start_url: "./",
          scope: "./",
          display: "standalone",
          theme_color: "#101113",
          background_color: "#101113",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png}"],
          cleanupOutdatedCaches: true,
        },
      }),
    );
  }
  let projectRoot: string | undefined;
  if (appMode) {
    projectRoot = path.resolve(
      process.env.CATEGORY_PATTERNS_HOME ?? path.join(homedir(), "category-patterns"),
    );
    await initializeProjects(projectRoot, import.meta.dirname);
    plugins.push(categoryPatternsServer(projectRoot));
  }
  return {
    base: "./",
    plugins,
    server: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      watch: { ignored: projectRoot ? [`${projectRoot}/**`] : [] },
    },
    build: { outDir: "dist" },
  };
});
