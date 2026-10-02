import type { Connector } from "./connector.ts";
import { parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";

const endpoint = "/__api/category-patterns";

async function request(init?: RequestInit): Promise<unknown> {
  const response = await fetch(endpoint, init);
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}

export class AppConnector implements Connector {
  description = "Save writes SVG files to your configured directories.";
  async load(): Promise<PaletteData> {
    return parseData(await request());
  }
  async save(data: PaletteData): Promise<void> {
    await request({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parseData(data)),
    });
  }
}
