import {
  contrast,
  createDefaultConfig,
  deltaE,
  jnd,
  prepareInitialState,
  runSimulatedAnnealing,
  similarity,
} from "category-colors";

export function categoryColors(length: number): string[] {
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
    ranges: [
      [0, 360],
      [0.7, 1],
      [0.55, 0.8],
    ],
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
      weight: 1,
      background: "#333333",
      ratio: 3,
    },
  );

  const initial = prepareInitialState({ colors: [] }, config);
  const colors = runSimulatedAnnealing(initial, config).colors.map(String);
  return colors;
}
