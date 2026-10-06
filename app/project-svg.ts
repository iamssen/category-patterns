import { parseProject } from "./projects.ts";
import type { Project } from "./projects.ts";
import { patternSvg } from "./svg.ts";
import { createTheme } from "./theme.ts";

const svgNamespace = "http://www.w3.org/2000/svg";
const projectNamespace = "urn:category-patterns:project";

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function projectSvg(input: Project): string {
  const project = parseProject(input);
  const { data } = project;
  const { text, muted } = createTheme(data.background);
  const footerY = 142 + Math.max(1, data.palettes.length) * 96 + 32;
  const height = footerY + 142;
  const defs = data.palettes
    .map((palette, row) => {
      const y = 158 + row * 96;
      return `<clipPath id="row-${row}"><rect x="56" y="${y}" width="888" height="52" rx="6"/></clipPath>${palette.categories.map((category, index) => patternSvg(category, `p-${row}-${index}`, data.patternLighten)).join("")}`;
    })
    .join("");
  const rows = data.palettes
    .map((palette, row) => {
      const y = 142 + row * 96;
      const width = 888 / palette.categories.length;
      const labelSize = Math.min(14, 720 / Array.from(palette.name).length);
      return `<text x="56" y="${y}" fill="${text}" font-size="${labelSize}">${xml(palette.name)}</text><text x="944" y="${y}" fill="${muted}" font-size="12" text-anchor="end">${palette.categories.length} ${palette.categories.length === 1 ? "pattern" : "patterns"}</text><g clip-path="url(#row-${row})">${palette.categories.map((_, index) => `<rect x="${56 + index * width}" y="${y + 16}" width="${width + 0.01}" height="52" fill="url(#p-${row}-${index})"/>`).join("")}</g>`;
    })
    .join("");
  const titleSize = Math.min(28, 888 / Array.from(project.name).length);
  // Share portable project data; output paths belong to the recipient's machine.
  const portable = { ...project, outputs: [] };
  return `<svg xmlns="${svgNamespace}" xmlns:cp="${projectNamespace}" width="1000" height="${height}" viewBox="0 0 1000 ${height}">
<title>${xml(project.name)} — Category Patterns</title>
<metadata><cp:project format-version="1">${xml(JSON.stringify(portable))}</cp:project></metadata>
<defs>${defs}</defs>
<rect width="1000" height="${height}" fill="${data.background}"/>
<g font-family="Arial, Helvetica, sans-serif">
<text x="56" y="79" fill="${text}" font-size="${titleSize}" font-weight="700">${xml(project.name)}</text>
${rows || `<text x="56" y="142" fill="${muted}" font-size="14">No palettes yet.</text>`}
<text x="56" y="${footerY}" fill="${text}" font-size="13">This file contains color palettes, patterns, and project settings.</text>
<text x="56" y="${footerY + 22}" fill="${text}" font-size="13">To edit them, open the App below, click “Import project”, and select this SVG file.</text>
<text x="56" y="${footerY + 58}" fill="${muted}" font-size="13">App:</text>
<a href="https://iamssen.github.io/category-patterns/"><text x="110" y="${footerY + 58}" fill="${text}" font-size="13">https://iamssen.github.io/category-patterns/</text></a>
<text x="56" y="${footerY + 84}" fill="${muted}" font-size="13">Github:</text>
<a href="https://github.com/iamssen/category-patterns"><text x="110" y="${footerY + 84}" fill="${text}" font-size="13">https://github.com/iamssen/category-patterns</text></a>
</g>
</svg>\n`;
}

export function parseProjectSvg(source: string): Project {
  // Only extract metadata. Never insert the imported SVG into the app's document.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsupported SVG document.");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (
    document.querySelector("parsererror") ||
    root.localName !== "svg" ||
    root.namespaceURI !== svgNamespace
  )
    throw new Error("Invalid SVG project file.");
  const metadata = Array.from(root.children).filter(
    (element) => element.localName === "metadata" && element.namespaceURI === svgNamespace,
  );
  const embedded = metadata
    .flatMap((element) => Array.from(element.children))
    .filter(
      (element) => element.localName === "project" && element.namespaceURI === projectNamespace,
    );
  if (embedded.length !== 1)
    throw new Error("This SVG does not contain a Category Patterns project.");
  const payload = embedded[0]!;
  if (payload.getAttribute("format-version") !== "1")
    throw new Error("Unsupported project file version.");
  if (payload.children.length) throw new Error("Invalid project metadata.");
  return parseProject(JSON.parse(payload.textContent ?? ""));
}
