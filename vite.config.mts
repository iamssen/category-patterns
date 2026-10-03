import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import solid from "@solidjs/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { parse } from "yaml";
import { categoryPatternsServer, initializeData } from "./server.ts";

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
  let dataPath: string | undefined;
  if (appMode) {
    const configPath = path.resolve(import.meta.dirname, "config.yml");
    const config = parse(await readFile(configPath, "utf8")) as unknown;
    if (!config || typeof config !== "object") throw new Error("Invalid config.yml.");
    const { data, outputs } = config as { data?: unknown; outputs?: unknown };
    if (
      typeof data !== "string" ||
      !data.trim() ||
      !Array.isArray(outputs) ||
      !outputs.length ||
      outputs.some((item) => typeof item !== "string" || !item.trim())
    ) {
      throw new Error("config.yml requires a data path and a nonempty outputs list.");
    }
    dataPath = path.resolve(path.dirname(configPath), data);
    const outputPaths = [
      ...new Set((outputs as string[]).map((item) => path.resolve(path.dirname(configPath), item))),
    ];
    if (outputPaths.some((item) => dataPath!.startsWith(`${item}${path.sep}`))) {
      throw new Error("Keep the data file outside SVG output directories.");
    }
    await initializeData(dataPath, path.resolve(import.meta.dirname, "data.template.json"));
    plugins.push(categoryPatternsServer(dataPath, outputPaths));
  }
  return {
    base: "./",
    plugins,
    server: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      watch: { ignored: dataPath ? [dataPath, `${dataPath}.svg-state.json`] : [] },
    },
    build: { outDir: "dist" },
  };
});
