import JSZip from "jszip";
import type { Connector } from "./connector.ts";
import { parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";
import {
  checkProjectName,
  parseProject,
  projectName,
  prepareImport,
  templateData,
} from "./projects.ts";
import type { Project, TemplateName } from "./projects.ts";
import { paletteFiles } from "./svg.ts";
import { projectSvg, parseProjectSvg } from "./project-svg.ts";

const storageKey = "category-patterns:projects:v1";
const legacyKey = "category-patterns:data:v1";
function downloadBlob(blob: Blob, name: string): void {
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
export async function downloadZip(zip: JSZip, name: string): Promise<void> {
  downloadBlob(await zip.generateAsync({ type: "blob" }), name);
}
export function exportProject(input: Project): void {
  const project = parseProject(input);
  downloadBlob(
    new Blob([projectSvg(project)], { type: "image/svg+xml" }),
    `${project.name}.category-patterns.svg`,
  );
}
export async function readProjectFile(file: File): Promise<Project> {
  if (!/\.category-patterns\.svg$/i.test(file.name))
    throw new Error("Choose a .category-patterns.svg project file.");
  if (file.size > 1_000_000) throw new Error("Project data is too large.");
  return parseProjectSvg(await file.text());
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
      if (names.size !== projects.length || !projects.length)
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
  async create(
    input: string,
    template: TemplateName,
    outputs: string[],
    includePalettes = true,
  ): Promise<Project> {
    const projects = await this.list();
    const name = projectName(input);
    checkProjectName(name, projects);
    const project = parseProject({
      version: 1,
      name,
      outputs,
      data: templateData(template, includePalettes),
    });
    localStorage.setItem(storageKey, JSON.stringify([...projects, project]));
    return project;
  }
  async importProject(input: Project): Promise<Project> {
    const projects = await this.list();
    const imported = prepareImport(input, projects);
    localStorage.setItem(storageKey, JSON.stringify([...projects, imported]));
    return imported;
  }
  async delete(name: string): Promise<void> {
    const projects = await this.list();
    if (!projects.some((item) => item.name === name)) throw new Error("Project not found.");
    if (projects.length < 2) throw new Error("Keep at least one project.");
    localStorage.setItem(storageKey, JSON.stringify(projects.filter((item) => item.name !== name)));
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
