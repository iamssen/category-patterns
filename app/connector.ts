import type { PaletteData } from "./model.ts";
import type { Project, TemplateName } from "./projects.ts";
import { WebAppConnector } from "./web-connector.ts";
import { AppConnector } from "./app-connector.ts";

export interface Connector {
  appMode: boolean;
  description: string;
  exportLabel: string;
  exportProgress: string;
  exportSuccess: string;
  list(): Promise<Project[]>;
  create(name: string, template: TemplateName, outputs: string[]): Promise<Project>;
  load(name: string): Promise<Project>;
  save(project: Project): Promise<void>;
  exportSVGs(name: string, data: PaletteData): Promise<void>;
}
export const connector: Connector =
  import.meta.env.DEV && import.meta.env.MODE === "app"
    ? new AppConnector()
    : new WebAppConnector();
