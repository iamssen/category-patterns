import JSZip from "jszip";
import initialData from "../data.template.json";
import type { Connector } from "./connector.ts";
import { parseData } from "./model.ts";
import type { PaletteData } from "./model.ts";
import { paletteFiles } from "./svg.ts";

const storageKey = "category-patterns:data:v1";

export class WebAppConnector implements Connector {
  description = "Save keeps data in this browser. Download SVGs exports a ZIP.";
  exportLabel = "Download SVGs";
  exportProgress = "Preparing SVG download…";
  exportSuccess = "SVG ZIP download started.";
  async load(): Promise<PaletteData> {
    const stored = localStorage.getItem(storageKey);
    return parseData(stored === null ? initialData : JSON.parse(stored));
  }
  async save(input: PaletteData): Promise<void> {
    localStorage.setItem(storageKey, JSON.stringify(parseData(input)));
  }
  async exportSVGs(input: PaletteData): Promise<void> {
    const data = parseData(input);
    const zip = new JSZip();
    for (const [name, svg] of paletteFiles(data)) zip.file(name, svg);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "category-patterns.zip";
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
