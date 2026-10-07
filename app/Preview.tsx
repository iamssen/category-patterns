import { createMemo, createSignal, onSettled } from "solid-js";
import type { Element } from "solid-js";
import type { Palette } from "./model.ts";
import { patternSvg } from "./svg.ts";

type Chart = "stack" | "bars" | "donut";

function chartSvg(
  palette: Palette,
  lighten: number,
  chart: Chart,
  text: string,
  muted: string,
  width: number,
): string {
  const scale = width / (chart === "donut" ? 240 : 720);
  const px = (value: number) => value * scale;
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
      const segmentWidth = (value / total) * width;
      shapes += `<rect x="${offset}" y="${px(8)}" width="${segmentWidth}" height="${px(64)}" fill="url(#c${index})"/>`;
      shapes += `<rect x="${(index * width) / values.length}" y="${px(94)}" width="${width / values.length}" height="${px(18)}" fill="url(#c${index})"/>`;
      offset += segmentWidth;
    }
  } else if (chart === "bars") {
    for (const [index, value] of values.entries()) {
      shapes += `<rect x="${(index * width) / values.length + px(3)}" y="${px(190 - value * 3)}" width="${width / values.length - px(6)}" height="${px(value * 3)}" rx="${px(2)}" fill="url(#c${index})"/>`;
    }
  } else {
    const radius = px(70);
    const circumference = Math.PI * 2 * radius;
    for (const [index, value] of values.entries()) {
      const length = (value / total) * circumference;
      shapes += `<circle cx="${px(120)}" cy="${px(110)}" r="${radius}" fill="none" stroke="url(#c${index})" stroke-width="${px(38)}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${px(120)} ${px(110)})"/>`;
      offset += length;
    }
    shapes += `<text x="${px(120)}" y="${px(108)}" fill="${text}" font-size="${px(28)}" text-anchor="middle" font-family="sans-serif">${values.length}</text><text x="${px(120)}" y="${px(130)}" fill="${muted}" font-size="${px(12)}" text-anchor="middle" font-family="sans-serif">Category</text>`;
  }
  const height = px(chart === "stack" ? 120 : 220);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${shapes}</svg>`;
}

export function Preview(props: {
  palette: Palette;
  lighten: number;
  chart: Chart;
  text: string;
  muted: string;
}): Element {
  let image: HTMLImageElement | undefined;
  const [width, setWidth] = createSignal(props.chart === "donut" ? 240 : 720);
  onSettled(() => {
    if (!image) return;
    let frame = 0;
    // Match SVG units to CSS pixels so only the chart geometry resizes.
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth <= 0) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(nextWidth));
    });
    observer.observe(image);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  const source = createMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(chartSvg(props.palette, props.lighten, props.chart, props.text, props.muted, width()))}`,
  );
  return (
    <img
      ref={(element) => {
        image = element;
      }}
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
