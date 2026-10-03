import JSZip from "jszip";
import { stringify } from "yaml";
import type { Connector } from "./connector.ts";
import { parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";
import { checkProjectName, parseProject, projectName, templateData } from "./projects.ts";
import type { Project, TemplateName } from "./projects.ts";
import { paletteFiles } from "./svg.ts";

const storageKey = "category-patterns:projects:v1";
const legacyKey = "category-patterns:data:v1";
export async function downloadZip(zip: JSZip, name: string): Promise<void> {
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
function exportPath(input: string): string {
  const source = input.startsWith("/")
    ? input
    : input === "~" || input.startsWith("~/")
      ? `@home/${input.slice(2)}`
      : `@home/category-patterns/${input}`;
  const parts: string[] = [];
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${source.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}
function checkExportOutputs(projects: Project[]): void {
  const assigned: { name: string; path: string }[] = [];
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(`${b.replace(/\/$/, "")}/`) || b.startsWith(`${a.replace(/\/$/, "")}/`);
  for (const project of projects) {
    const paths = [...new Set(project.outputs.map(exportPath))];
    for (const path of paths) {
      if (overlaps(path, "@home/category-patterns"))
        throw new Error(
          `Keep output directories for ${project.name} separate from ~/category-patterns/.`,
        );
      const conflict = assigned.find((item) => overlaps(path, item.path));
      if (conflict)
        throw new Error(`Output directories for ${project.name} overlap with ${conflict.name}.`);
      assigned.push({ name: project.name, path });
    }
  }
}
export async function exportProjects(projects: Project[]): Promise<void> {
  checkExportOutputs(projects);
  const zip = new JSZip();
  for (const input of projects) {
    const project = parseProject(input);
    if (!project.outputs.length) throw new Error(`Add an output directory for ${project.name}.`);
    zip.file(`${project.name}.yml`, stringify(project));
  }
  await downloadZip(zip, "projects.zip");
}
export class WebAppConnector implements Connector {
  appMode = false;
  description = "Save keeps this project in your browser. Download SVGs exports current edits.";
  exportLabel = "Download SVGs";
  exportProgress = "Preparing SVG download…";
  exportSuccess = "SVG ZIP download started.";
  async list(): Promise<Project[]> {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value)) throw new Error("Invalid project storage.");
      const projects = value.map(parseProject);
      const names = new Set(projects.map((item) => item.name.toLowerCase()));
      if (names.size !== projects.length || !projects.some((item) => item.name === "default"))
        throw new Error("Invalid project list.");
      return projects;
    }
    const legacy = localStorage.getItem(legacyKey);
    const project: Project = {
      version: 1,
      name: "default",
      outputs: [],
      data: legacy === null ? templateData("dark") : parseData(JSON.parse(legacy)),
    };
    localStorage.setItem(storageKey, JSON.stringify([project]));
    return [project];
  }
  async create(input: string, template: TemplateName, outputs: string[]): Promise<Project> {
    const projects = await this.list();
    const name = projectName(input);
    checkProjectName(name, projects);
    const project = parseProject({ version: 1, name, outputs, data: templateData(template) });
    localStorage.setItem(storageKey, JSON.stringify([...projects, project]));
    return project;
  }
  async load(name: string): Promise<Project> {
    const project = (await this.list()).find((item) => item.name === name);
    if (!project) throw new Error("Project not found.");
    return project;
  }
  async save(input: Project): Promise<void> {
    const project = parseProject(input);
    const projects = await this.list();
    if (!projects.some((item) => item.name === project.name)) throw new Error("Project not found.");
    localStorage.setItem(
      storageKey,
      JSON.stringify(projects.map((item) => (item.name === project.name ? project : item))),
    );
  }
  async exportSVGs(name: string, input: PaletteData): Promise<void> {
    const zip = new JSZip();
    for (const [name, svg] of paletteFiles(parseData(input))) zip.file(name, svg);
    await downloadZip(zip, `category-patterns-${projectName(name)}.zip`);
  }
}
