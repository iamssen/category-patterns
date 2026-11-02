import init, { generate_colors } from "#libs/colors";
import { DEFAULT_GENERATION_SETTINGS } from "./model.ts";
import type { GenerationSettings } from "./model.ts";

let ready: Promise<unknown> | undefined;

export async function categoryColors(
  length: number,
  background: string,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  existing?: string[],
  target?: number,
): Promise<string[]> {
  if (!Number.isSafeInteger(length) || length < 0 || length > 20)
    throw new RangeError("Color count must be between 0 and 20.");
  if (length === 0) return [];
  await (ready ??= init());
  return generate_colors(
    length,
    background,
    settings.lightness[0],
    settings.lightness[1],
    settings.contrastWeight,
    existing ?? [],
    target ?? -1,
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
}
