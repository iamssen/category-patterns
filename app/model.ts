import { DEFAULT_BACKGROUND } from "./theme.ts";

export const DEFAULT_PATTERN_LIGHTEN = 0.12;
export interface GenerationSettings {
  lightness: [number, number];
  contrastWeight: number;
}
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  lightness: [0.55, 0.8],
  contrastWeight: 1,
};
export const PATTERN_TYPES = [
  "lines",
  "dots",
  "rings",
  "crosses",
  "grid",
  "waves",
  "chevrons",
] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];
export interface Category {
  color: string;
  pattern: PatternType;
  size: number;
  strokeWidth: number;
  angle: number;
}
export interface Palette {
  id: string;
  name: string;
  categories: Category[];
}
export interface PaletteData {
  version: 1;
  patternLighten: number;
  background: string;
  backgroundConfirmed: boolean;
  generation: GenerationSettings;
  palettes: Palette[];
}

export function emptyData(): PaletteData {
  return {
    version: 1,
    patternLighten: DEFAULT_PATTERN_LIGHTEN,
    background: DEFAULT_BACKGROUND,
    backgroundConfirmed: false,
    generation: DEFAULT_GENERATION_SETTINGS,
    palettes: [],
  };
}

export function isValidName(name: string): boolean {
  return /^[\p{L}\p{N}_-][\p{L}\p{N}_ -]{0,63}$/u.test(name) && name === name.trim();
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid data format.");
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error("Setting is outside the allowed range.");
  return value;
}

export function parseData(input: unknown): PaletteData {
  const data = object(input);
  if (data.version !== 1 || !Array.isArray(data.palettes))
    throw new Error("Unsupported palette data.");
  if (
    data.background !== undefined &&
    (typeof data.background !== "string" || !/^#[\da-f]{6}$/i.test(data.background))
  )
    throw new Error("Invalid background HEX color.");
  if (data.backgroundConfirmed !== undefined && typeof data.backgroundConfirmed !== "boolean")
    throw new Error("Invalid background confirmation.");
  let generation = DEFAULT_GENERATION_SETTINGS;
  if (data.generation !== undefined) {
    const settings = object(data.generation);
    if (!Array.isArray(settings.lightness) || settings.lightness.length !== 2)
      throw new Error("Invalid color lightness range.");
    const min = number(settings.lightness[0], 0, 1);
    const max = number(settings.lightness[1], 0, 1);
    if (min >= max) throw new Error("Minimum color lightness must be below maximum.");
    generation = { lightness: [min, max], contrastWeight: number(settings.contrastWeight, 0, 100) };
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const palettes = data.palettes.map((value): Palette => {
    const palette = object(value);
    if (typeof palette.id !== "string" || !/^[\da-f-]{36}$/.test(palette.id) || ids.has(palette.id))
      throw new Error("Invalid palette ID.");
    if (typeof palette.name !== "string" || !isValidName(palette.name))
      throw new Error("Names must contain 1–64 letters, numbers, spaces, hyphens or underscores.");
    const name = palette.name.normalize("NFC");
    if (names.has(name.toLowerCase())) throw new Error("Duplicate palette name.");
    ids.add(palette.id);
    names.add(name.toLowerCase());
    if (
      !Array.isArray(palette.categories) ||
      palette.categories.length === 0 ||
      palette.categories.length > 20
    )
      throw new Error("Color count must be between 1 and 20.");
    const categories = palette.categories.map((item): Category => {
      const category = object(item);
      if (typeof category.color !== "string" || !/^#[\da-f]{6}$/i.test(category.color))
        throw new Error("Invalid HEX color.");
      if (!PATTERN_TYPES.includes(category.pattern as PatternType))
        throw new Error("Unknown pattern.");
      return {
        color: category.color,
        pattern: category.pattern as PatternType,
        size: number(category.size, 6, 24),
        strokeWidth: number(category.strokeWidth, 0.5, 3),
        angle: number(category.angle, -180, 180),
      };
    });
    return { id: palette.id, name, categories };
  });
  return {
    version: 1,
    generation,
    background: (data.background as string | undefined) ?? DEFAULT_BACKGROUND,
    backgroundConfirmed: (data.backgroundConfirmed as boolean | undefined) ?? true,
    patternLighten: number(data.patternLighten, 0, 0.5),
    palettes,
  };
}
