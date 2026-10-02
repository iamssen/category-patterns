import { createMemo } from "solid-js";
import type { Element } from "solid-js";
import type { Palette } from "./model.ts";
import { patternSvg } from "./svg.ts";

type Chart = "stack" | "bars" | "donut";

function chartSvg(palette: Palette, lighten: number, chart: Chart): string {
  const categories = palette.categories;
  const values = categories.map((_, index) => 12 + ((index * 17 + 9) % 40));
  const total = values.reduce((sum, value) => sum + value, 0);
  const defs = categories
    .map((category, index) => patternSvg(category, `c${index}`, lighten))
    .join("");
  let shapes = "";
  let offset = 0;
  if (chart === "stack") {
    for (const [index, value] of values.entries()) {
      const width = (value / total) * 720;
      shapes += `<rect x="${offset}" y="8" width="${width}" height="64" fill="url(#c${index})"/>`;
      shapes += `<rect x="${(index * 720) / values.length}" y="94" width="${720 / values.length}" height="18" fill="url(#c${index})"/>`;
      offset += width;
    }
  } else if (chart === "bars") {
    for (const [index, value] of values.entries()) {
      shapes += `<rect x="${(index * 720) / values.length + 3}" y="${190 - value * 3}" width="${720 / values.length - 6}" height="${value * 3}" rx="2" fill="url(#c${index})"/>`;
    }
  } else {
    const radius = 70;
    const circumference = Math.PI * 2 * radius;
    for (const [index, value] of values.entries()) {
      const length = (value / total) * circumference;
      shapes += `<circle cx="120" cy="110" r="${radius}" fill="none" stroke="url(#c${index})" stroke-width="38" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 120 110)"/>`;
      offset += length;
    }
    shapes += `<text x="120" y="108" fill="#eeeeee" font-size="28" text-anchor="middle" font-family="sans-serif">${values.length}</text><text x="120" y="130" fill="#aaaaaa" font-size="12" text-anchor="middle" font-family="sans-serif">Category</text>`;
  }
  const width = chart === "donut" ? 240 : 720;
  const height = chart === "stack" ? 120 : 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${shapes}</svg>`;
}

export function Preview(props: { palette: Palette; lighten: number; chart: Chart }): Element {
  const source = createMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(chartSvg(props.palette, props.lighten, props.chart))}`,
  );
  return (
    <img
      class={["chart", { donut: props.chart === "donut" }]}
      src={source()}
      alt={
        props.chart === "stack"
          ? "Proportional and equal-width stacked bars"
          : props.chart === "bars"
            ? "Vertical bar chart"
            : "Donut chart"
      }
    />
  );
}
