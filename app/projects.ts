import dark from "../templates/dark.json" with { type: "json" };
import light from "../templates/light.json" with { type: "json" };
import { isValidName, parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";

export type TemplateName = "dark" | "light";
export interface Project {
  version: 1;
  name: string;
  outputs: string[];
  data: PaletteData;
}
export function projectName(input: string): string {
  if (typeof input !== "string") throw new Error("Enter a project name.");
  const name = input.trim().normalize("NFC");
  if (!isValidName(name))
    throw new Error("Names must contain 1–64 letters, numbers, spaces, hyphens or underscores.");
  return name;
}
export function outputLines(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}
export function templateData(name: TemplateName, includePalettes = true): PaletteData {
  if (name !== "dark" && name !== "light") throw new Error("Unknown template.");
  const data = parseData(structuredClone(name === "light" ? light : dark));
  return includePalettes ? data : { ...data, palettes: [] };
}
export function parseProject(input: unknown): Project {
  if (!input || typeof input !== "object") throw new Error("Invalid project.");
  const value = input as Partial<Project>;
  if (
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !Array.isArray(value.outputs) ||
    value.outputs.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new Error("Invalid project.");
  return {
    version: 1,
    name: projectName(value.name),
    outputs: outputLines(value.outputs.join("\n")),
    data: parseData(value.data),
  };
}
export function checkProjectName(name: string, projects: Project[]): void {
  if (projects.some((item) => item.name.toLowerCase() === name.toLowerCase()))
    throw new Error("A project with this name already exists.");
}

export function prepareImport(input: unknown, existing: Pick<Project, "name">[]): Project {
  const project = parseProject(input);
  const original = project.name;
  let suffix = 2;
  while (existing.some((item) => item.name.toLowerCase() === project.name.toLowerCase())) {
    const ending = `-${suffix++}`;
    project.name = `${original.slice(0, 64 - ending.length)}${ending}`;
  }
  // Output directories belong to the recipient's machine.
  project.outputs = [];
  return project;
}
