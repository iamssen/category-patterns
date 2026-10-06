import type { Connector } from "./connector.ts";
import { parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";
import { parseProject } from "./projects.ts";
import type { Project, TemplateName } from "./projects.ts";

const endpoint = "/__api/category-patterns/projects";
async function request(route = "", body?: unknown): Promise<unknown> {
  const response = await fetch(
    `${endpoint}${route}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}
export class AppConnector implements Connector {
  appMode = true;
  description = "Save keeps this project in its YAML file. Generate SVGs writes current edits.";
  exportLabel = "Generate SVGs";
  exportProgress = "Generating SVGs…";
  exportSuccess = "SVGs generated in configured directories.";
  async list(): Promise<Project[]> {
    const result = await request();
    if (!Array.isArray(result)) throw new Error("Invalid project list.");
    return result.map(parseProject);
  }
  async create(
    name: string,
    template: TemplateName,
    outputs: string[],
    includePalettes = true,
  ): Promise<Project> {
    return parseProject(await request("", { name, template, outputs, includePalettes }));
  }
  async importProject(project: Project): Promise<Project> {
    return parseProject(await request("", { project: parseProject(project) }));
  }
  async delete(name: string): Promise<void> {
    await request(`/${encodeURIComponent(name)}/delete`, {});
  }
  async load(name: string): Promise<Project> {
    return parseProject(await request(`/${encodeURIComponent(name)}`));
  }
  async save(project: Project): Promise<void> {
    await request(`/${encodeURIComponent(project.name)}`, parseProject(project));
  }
  async exportSVGs(name: string, data: PaletteData): Promise<void> {
    await request(`/${encodeURIComponent(name)}/svgs`, parseData(data));
  }
}
