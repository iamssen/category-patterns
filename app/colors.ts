import {
  contrast,
  createDefaultConfig,
  deltaE,
  jnd,
  prepareInitialState,
  runSimulatedAnnealing,
  similarity,
} from "category-colors";

import { DEFAULT_GENERATION_SETTINGS } from "./model.ts";
import type { GenerationSettings } from "./model.ts";

export function categoryColors(
  length: number,
  background: string,
  settings: GenerationSettings = DEFAULT_GENERATION_SETTINGS,
  existing?: string[],
  target?: number,
): string[] {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError("Color count must be a nonnegative safe integer.");
  }
  if (length === 0) return [];

  const config = createDefaultConfig();
  config.colorCount = length;
  config.logProgress = false;
  config.maxIterations = 1000;
  config.coolingRate = 0.99;
  config.colorSpace = {
    mode: "okhsl",
    ranges: [[0, 360], [0.7, 1], settings.lightness],
  };
  config.evalFunctions = config.evalFunctions
    .filter(
      (entry) =>
        entry.function !== similarity &&
        entry.cvd?.type !== "grayscale" &&
        (length > 1 || entry.function !== jnd),
    )
    .map((entry) => ({
      ...entry,
      weight: entry.cvd ? 0.01 : entry.function === jnd ? 4 : entry.weight,
    }));
  config.evalFunctions.push(
    {
      function: (state) => {
        if (state.colors.length < 2) return 0;
        let cost = 0;
        for (let index = 1; index < state.colors.length; index++) {
          const distance = deltaE(state.colors[index - 1], state.colors[index], {
            method: "ciede2000",
          });
          cost += (30 / Math.max(distance, 1)) ** 4;
        }
        return cost / (state.colors.length - 1);
      },
      weight: 4,
    },
    {
      function: contrast,
      weight: settings.contrastWeight,
      background,
      ratio: 3,
    },
  );

  let initial = prepareInitialState({ colors: [] }, config);
  if (existing && target !== undefined) {
    initial = prepareInitialState(
      {
        colors: existing.map((color, index) => ({
          color: index === target ? String(initial.colors[index]) : color,
          fixedColor: index !== target,
          fixedOrder: true,
        })),
      },
      config,
    );
  }
  const colors = runSimulatedAnnealing(initial, config).colors.map(String);
  return colors;
}
