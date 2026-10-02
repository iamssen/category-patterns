import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { parseData } from "./app/model.ts";
import type { PaletteData } from "./app/model.ts";
import { paletteFiles } from "./app/svg.ts";

export async function initializeData(dataPath: string, templatePath: string): Promise<void> {
  await mkdir(path.dirname(dataPath), { recursive: true });
  try {
    await copyFile(templatePath, dataPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new Error("Save data is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWrite(file: string, value: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, "utf8");
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function saveData(data: PaletteData, dataPath: string, outputPaths: string[]): Promise<void> {
  const previousText = await readFile(dataPath, "utf8");
  const previous = parseData(JSON.parse(previousText));
  for (const outputPath of outputPaths) await mkdir(outputPath, { recursive: true });
  const files = new Map(
    outputPaths.flatMap((outputPath) =>
      [...paletteFiles(data)].map(([name, svg]) => [path.join(outputPath, name), svg] as const),
    ),
  );
  const oldFiles = new Set(
    outputPaths.flatMap((outputPath) =>
      [...paletteFiles(previous).keys()].map((name) => path.join(outputPath, name)),
    ),
  );
  const backups = new Map<string, string | undefined>();
  const affectedFiles = new Set([...oldFiles, ...files.keys()]);
  for (const file of affectedFiles) {
    const existing = await readOptional(file);
    if (existing !== undefined && !oldFiles.has(file))
      throw new Error(`An unmanaged file already exists: ${path.basename(file)}`);
    backups.set(file, existing);
  }
  try {
    for (const [file, svg] of files) await atomicWrite(file, svg);
    for (const file of oldFiles) if (!files.has(file)) await rm(file, { force: true });
    await atomicWrite(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  } catch (error) {
    for (const [file, contents] of backups) {
      if (contents === undefined) await rm(file, { force: true });
      else await atomicWrite(file, contents);
    }
    await atomicWrite(dataPath, previousText);
    throw error;
  }
}

export function categoryPatternsServer(dataPath: string, outputPaths: string[]): Plugin {
  let isSaving = false;
  return {
    name: "category-patterns-storage",
    configureServer(server) {
      server.middlewares.use("/__api/category-patterns", async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        try {
          if (request.url !== "/" && request.url !== "") {
            response.statusCode = 404;
            response.end(JSON.stringify({ error: "Unknown route." }));
            return;
          }
          if (request.method === "GET") {
            const contents = await readFile(dataPath, "utf8");
            const data = parseData(JSON.parse(contents));
            response.end(JSON.stringify(data));
            return;
          }
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: "Unsupported request." }));
            return;
          }
          if (
            request.headers.origin !== `http://${request.headers.host}` ||
            !request.headers["content-type"]?.startsWith("application/json")
          ) {
            response.statusCode = 403;
            response.end(JSON.stringify({ error: "Please save from the app." }));
            return;
          }
          if (isSaving) {
            response.statusCode = 409;
            response.end(
              JSON.stringify({
                error: "A save is in progress. Please try again shortly.",
              }),
            );
            return;
          }
          isSaving = true;
          try {
            const data = parseData(await readBody(request));
            await saveData(data, dataPath, outputPaths);
            response.end(JSON.stringify({ saved: data.palettes.length }));
          } finally {
            isSaving = false;
          }
        } catch (error) {
          response.statusCode = 500;
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to save.",
            }),
          );
        }
      });
    },
  };
}
