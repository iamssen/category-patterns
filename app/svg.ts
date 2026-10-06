import { DEFAULT_GENERATION_SETTINGS, PATTERN_TYPES } from "./model.ts";
import type { Category, Palette, PaletteData, PatternType, GenerationSettings } from "./model.ts";

export const PATTERN_LABELS: Record<PatternType, string> = {
  lines: "Lines",
  dots: "Dots",
  rings: "Rings",
  crosses: "Crosses",
  grid: "Grid",
  waves: "Waves",
  chevrons: "Chevrons",
};

export function randomCategories(
  colors: string[],
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
): Category[] {
  function randomValue(range: [number, number], scale: number): number {
    const min = Math.round(range[0] * scale);
    const max = Math.round(range[1] * scale);
    return (min + Math.floor(Math.random() * (max - min + 1))) / scale;
  }
  let previous: PatternType | undefined;
  return colors.map((color) => {
    const choices = PATTERN_TYPES.filter((type) => type !== previous);
    const pattern = choices[Math.floor(Math.random() * choices.length)];
    previous = pattern;
    return {
      color,
      pattern,
      size: randomValue(settings.patternSpacing, 1),
      strokeWidth: randomValue(settings.patternThickness, 10),
      angle: [0, 45, 90, -45][Math.floor(Math.random() * 4)],
    };
  });
}

export function patternColor(color: string, lighten: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * lighten)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function patternSvg(
  category: Category,
  id: string,
  lighten: number,
  appearance?: { background: string; foreground: string },
): string {
  const { size: s, strokeWidth: w, color, pattern, angle } = category;
  const h = s / 2;
  const foreground = appearance?.foreground ?? patternColor(color, lighten);
  const background = appearance?.background ?? color;
  let shape: string;
  switch (pattern) {
    case "lines": {
      shape = `<path d="M${h} 0V${s}"/>`;
      break;
    }
    case "dots": {
      shape = `<circle cx="${h}" cy="${h}" r="${w * 1.3}" fill="${foreground}" stroke="none"/>`;
      break;
    }
    case "rings": {
      shape = `<circle cx="${h}" cy="${h}" r="${s / 4}"/>`;
      break;
    }
    case "crosses": {
      shape = `<path d="M${s / 4} ${h}H${s * 0.75}M${h} ${s / 4}V${s * 0.75}"/>`;
      break;
    }
    case "grid": {
      shape = `<path d="M${h} 0V${s}M0 ${h}H${s}"/>`;
      break;
    }
    case "waves": {
      shape = `<path d="M0 ${h}Q${s / 4} 0 ${h} ${h}T${s} ${h}"/>`;
      break;
    }
    case "chevrons": {
      shape = `<path d="M0 ${s * 0.75}L${h} ${s / 4}L${s} ${s * 0.75}"/>`;
      break;
    }
  }
  return `<pattern id="${id}" width="${s}" height="${s}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><rect width="${s}" height="${s}" fill="${background}"/><g fill="none" stroke="${foreground}" stroke-width="${w}">${shape}</g></pattern>`;
}

export function paletteSvg(palette: Palette, lighten: number): string {
  const defs = palette.categories
    .map((category, index) => patternSvg(category, `${palette.name}-fill${index + 1}`, lighten))
    .join("");
  const samples = palette.categories
    .map(
      (_, index) =>
        `<rect x="${index * 64}" width="64" height="64" fill="url(#${palette.name}-fill${index + 1})"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${palette.categories.length * 64}" height="64"><defs>${defs}</defs>${samples}</svg>\n`;
}

export function swatchUrl(category: Category, lighten: number): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs>${patternSvg(category, "swatch", lighten)}</defs><rect width="64" height="64" fill="url(#swatch)"/></svg>`)}`;
}

export function patternPreviewUrl(pattern: PatternType, color: string): string {
  const category: Category = { pattern, color: "#000000", size: 12, strokeWidth: 1.2, angle: 0 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs>${patternSvg(category, "preview", 0, { background: "none", foreground: color })}</defs><rect width="64" height="64" fill="url(#preview)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function categoryImageSvg(category: Category, lighten: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs>${patternSvg(category, "pattern", lighten)}</defs><rect width="100%" height="100%" fill="url(#pattern)"/></svg>\n`;
}

export function paletteFiles(data: PaletteData): Map<string, string> {
  const files = new Map<string, string>();
  for (const palette of data.palettes) {
    files.set(`${palette.name}.svg`, paletteSvg(palette, data.patternLighten));
    for (const [index, category] of palette.categories.entries()) {
      files.set(
        `${palette.name}.fill${index + 1}.svg`,
        categoryImageSvg(category, data.patternLighten),
      );
    }
  }
  const colors = Object.fromEntries(
    data.palettes.map((palette) => [
      palette.name,
      palette.categories.map((category) => category.color),
    ]),
  );
  files.set("colors.json", `${JSON.stringify(colors, null, 2)}\n`);
  return files;
}
