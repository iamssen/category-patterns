import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import type { Plugin } from "vite";
import { parseData } from "./app/model.ts";
import type { PaletteData } from "./app/model.ts";
import { checkProjectName, parseProject, projectName, templateData } from "./app/projects.ts";
import type { Project, TemplateName } from "./app/projects.ts";
import { paletteFiles } from "./app/svg.ts";

interface SVGState {
  version: 1;
  outputs: string[];
  data: PaletteData;
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
async function createFile(file: string, value: string): Promise<void> {
  // Publish only a complete file, without replacing an existing project.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, "utf8");
    await copyFile(temporary, file, constants.COPYFILE_EXCL);
  } finally {
    await rm(temporary, { force: true });
  }
}
function resolveOutput(root: string, input: string): string {
  const expanded =
    input === "~"
      ? homedir()
      : input.startsWith("~/")
        ? path.join(homedir(), input.slice(2))
        : input;
  return path.resolve(root, expanded);
}
async function canonicalPath(input: string): Promise<string> {
  try {
    return await realpath(input);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(input);
    if (parent === input) throw error;
    return path.join(await canonicalPath(parent), path.basename(input));
  }
}
function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}
async function readState(root: string, name: string): Promise<SVGState | undefined> {
  const text = await readOptional(path.join(root, `${name}.svg-state.json`));
  if (text === undefined) return undefined;
  const value = JSON.parse(text) as SVGState;
  if (
    value.version !== 1 ||
    !Array.isArray(value.outputs) ||
    value.outputs.some((item) => typeof item !== "string" || !path.isAbsolute(item))
  )
    throw new Error(`Invalid SVG history for ${name}.`);
  return { version: 1, outputs: value.outputs, data: parseData(value.data) };
}
async function listProjects(root: string): Promise<Project[]> {
  const projects: Project[] = [];
  for (const file of (await readdir(root)).filter((item) => item.endsWith(".yml")).sort()) {
    const project = parseProject(parse(await readFile(path.join(root, file), "utf8")));
    if (file !== `${project.name}.yml`)
      throw new Error(`Project name must match its filename: ${file}`);
    checkProjectName(project.name, projects);
    projects.push(project);
  }
  return projects.sort((a, b) =>
    a.name === "default" ? -1 : b.name === "default" ? 1 : a.name.localeCompare(b.name),
  );
}
async function validateOutputs(
  root: string,
  project: Project,
  projects: Project[],
): Promise<string[]> {
  const outputs = [
    ...new Set(
      await Promise.all(project.outputs.map((item) => canonicalPath(resolveOutput(root, item)))),
    ),
  ];
  const canonicalRoot = await canonicalPath(root);
  if (outputs.some((item) => overlaps(canonicalRoot, item)))
    throw new Error("Keep SVG output directories separate from the project directory.");
  for (let index = 0; index < outputs.length; index++) {
    if (outputs.slice(index + 1).some((item) => overlaps(item, outputs[index])))
      throw new Error("Output directories must not overlap.");
  }
  for (const other of projects) {
    if (other.name === project.name) continue;
    const history = await readState(root, other.name);
    const reserved = await Promise.all(
      [...other.outputs.map((item) => resolveOutput(root, item)), ...(history?.outputs ?? [])].map(
        canonicalPath,
      ),
    );
    if (outputs.some((item) => reserved.some((directory) => overlaps(item, directory))))
      throw new Error(`An output directory is already used by ${other.name}.`);
  }
  return outputs;
}

export async function initializeProjects(root: string, legacyRoot: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const projects = await listProjects(root);
  if (projects.some((item) => item.name.toLowerCase() === "default")) {
    if (!projects.some((item) => item.name === "default"))
      throw new Error("The default project must be named default.");
    return;
  }
  let project: Project = { version: 1, name: "default", outputs: [], data: templateData("dark") };
  let history: SVGState | undefined;
  const configText = await readOptional(path.join(legacyRoot, "config.yml"));
  if (configText !== undefined) {
    const config = parse(configText) as { data?: unknown; outputs?: unknown };
    if (
      !config ||
      typeof config.data !== "string" ||
      !config.data.trim() ||
      !Array.isArray(config.outputs) ||
      config.outputs.some((item) => typeof item !== "string" || !item.trim())
    )
      throw new Error("Invalid legacy config.yml.");
    const dataPath = resolveOutput(legacyRoot, config.data);
    const dataText = await readOptional(dataPath);
    const outputs = [
      ...new Set((config.outputs as string[]).map((item) => resolveOutput(legacyRoot, item))),
    ];
    project = {
      ...project,
      outputs,
      data: dataText === undefined ? templateData("dark") : parseData(JSON.parse(dataText)),
    };
    const stateText = await readOptional(`${dataPath}.svg-state.json`);
    // Preserve the legacy generation baseline; do not touch original files.
    history = {
      version: 1,
      outputs,
      data: stateText === undefined ? project.data : parseData(JSON.parse(stateText)),
    };
  }
  const resolvedOutputs = await validateOutputs(root, project, projects);
  if (history) history.outputs = resolvedOutputs;
  // Write history first so a failed migration can be retried without losing cleanup ownership.
  if (history)
    await atomicWrite(path.join(root, "default.svg-state.json"), JSON.stringify(history, null, 2));
  await createFile(path.join(root, "default.yml"), stringify(project));
}

async function generateSVGs(
  root: string,
  project: Project,
  data: PaletteData,
  outputs: string[],
): Promise<void> {
  if (!outputs.length)
    throw new Error("Add an output directory in Projects before generating SVGs.");
  const statePath = path.join(root, `${project.name}.svg-state.json`);
  const previousText = await readOptional(statePath);
  const previous = await readState(root, project.name);
  const canonicalRoot = await canonicalPath(root);
  if (previous?.outputs.some((item) => overlaps(canonicalRoot, item)))
    throw new Error("Invalid SVG history output directory.");
  const files = new Map(
    outputs.flatMap((directory) =>
      [...paletteFiles(data)].map(([name, svg]) => [path.join(directory, name), svg] as const),
    ),
  );
  const oldFiles = new Set(
    (previous?.outputs ?? []).flatMap((directory) =>
      [...paletteFiles(previous!.data).keys()].map((name) => path.join(directory, name)),
    ),
  );
  const backups = new Map<string, string | undefined>();
  for (const file of new Set([...oldFiles, ...files.keys()])) {
    const contents = await readOptional(file);
    if (contents !== undefined && !oldFiles.has(file))
      throw new Error(`An unmanaged file already exists: ${file}`);
    backups.set(file, contents);
  }
  for (const directory of outputs) await mkdir(directory, { recursive: true });
  try {
    for (const [file, contents] of files) await atomicWrite(file, contents);
    for (const file of oldFiles) if (!files.has(file)) await rm(file, { force: true });
    await atomicWrite(statePath, JSON.stringify({ version: 1, outputs, data }, null, 2));
  } catch (error) {
    for (const [file, contents] of backups) {
      if (contents === undefined) await rm(file, { force: true });
      else await atomicWrite(file, contents);
    }
    if (previousText === undefined) await rm(statePath, { force: true });
    else await atomicWrite(statePath, previousText);
    throw error;
  }
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new Error("Project data is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function categoryPatternsServer(root: string): Plugin {
  let writing = false;
  return {
    name: "category-patterns-projects",
    configureServer(server) {
      server.middlewares.use("/__api/category-patterns/projects", async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        try {
          const segments = (request.url ?? "")
            .split("?")[0]
            .split("/")
            .filter(Boolean)
            .map(decodeURIComponent);
          if (segments.length > 2 || (segments.length === 2 && segments[1] !== "svgs")) {
            response.statusCode = 404;
            response.end(JSON.stringify({ error: "Unknown route." }));
            return;
          }
          const name = segments[0] === undefined ? undefined : projectName(segments[0]);
          let projects = await listProjects(root);
          let project = projects.find((item) => item.name === name);
          if (name && !project) {
            response.statusCode = 404;
            response.end(JSON.stringify({ error: "Project not found." }));
            return;
          }
          if (request.method === "GET" && segments.length < 2) {
            response.end(JSON.stringify(name ? project : projects));
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
          if (writing) {
            response.statusCode = 409;
            response.end(
              JSON.stringify({
                error: "A save or export is in progress. Please try again shortly.",
              }),
            );
            return;
          }
          writing = true;
          try {
            const body = await readBody(request);
            projects = await listProjects(root);
            project = projects.find((item) => item.name === name);
            if (!name) {
              const input = body as { name: string; template: TemplateName; outputs: string[] };
              const next = parseProject({
                version: 1,
                name: projectName(input.name),
                outputs: input.outputs,
                data: templateData(input.template),
              });
              checkProjectName(next.name, projects);
              await validateOutputs(root, next, projects);
              await createFile(path.join(root, `${next.name}.yml`), stringify(next));
              response.end(JSON.stringify(next));
            } else if (segments.length === 2) {
              const outputs = await validateOutputs(root, project!, projects);
              await generateSVGs(root, project!, parseData(body), outputs);
              response.end(JSON.stringify({ generated: true }));
            } else {
              const next = parseProject(body);
              if (next.name !== name) throw new Error("Project name cannot be changed.");
              await validateOutputs(root, next, projects);
              await atomicWrite(path.join(root, `${name}.yml`), stringify(next));
              response.end(JSON.stringify({ saved: true }));
            }
          } finally {
            writing = false;
          }
        } catch (error) {
          response.statusCode = 500;
          response.end(
            JSON.stringify({ error: error instanceof Error ? error.message : "Request failed." }),
          );
        }
      });
    },
  };
}
