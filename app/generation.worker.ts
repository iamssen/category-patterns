import type { GenerationSettings } from "./model.ts";
import { categoryColors } from "./colors.ts";

export type GenerationRequest = { count: number } | { colors: string[]; index: number };

addEventListener(
  "message",
  (
    event: MessageEvent<GenerationRequest & { background: string; generation: GenerationSettings }>,
  ) => {
    try {
      const request = event.data;
      const colors =
        "count" in request
          ? categoryColors(request.count, request.background, request.generation)
          : categoryColors(
              request.colors.length,
              request.background,
              request.generation,
              request.colors,
              request.index,
            );
      postMessage({ colors });
    } catch (error) {
      postMessage({
        error: error instanceof Error ? error.message : "Failed to generate colors.",
      });
    }
  },
);
