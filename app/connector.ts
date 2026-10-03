import type { PaletteData } from "./model.ts";
import { WebAppConnector } from "./web-connector.ts";
import { AppConnector } from "./app-connector.ts";

export interface Connector {
  description: string;
  exportLabel: string;
  exportProgress: string;
  exportSuccess: string;
  load(): Promise<PaletteData>;
  save(data: PaletteData): Promise<void>;
  exportSVGs(data: PaletteData): Promise<void>;
}

export const connector: Connector =
  import.meta.env.DEV && import.meta.env.MODE === "app"
    ? new AppConnector()
    : new WebAppConnector();
