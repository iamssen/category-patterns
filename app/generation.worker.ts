import { categoryColors } from "./colors.ts";

export type GenerationRequest = number | { colors: string[]; index: number };

addEventListener("message", (event: MessageEvent<GenerationRequest>) => {
  try {
    const request = event.data;
    const colors =
      typeof request === "number"
        ? categoryColors(request)
        : categoryColors(request.colors.length, request.colors, request.index);
    postMessage({ colors });
  } catch (error) {
    postMessage({
      error: error instanceof Error ? error.message : "Failed to generate colors.",
    });
  }
});
