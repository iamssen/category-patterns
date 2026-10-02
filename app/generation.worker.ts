import { categoryColors } from "./colors.ts";

addEventListener("message", (event: MessageEvent<number>) => {
  try {
    postMessage({ colors: categoryColors(event.data) });
  } catch (error) {
    postMessage({
      error: error instanceof Error ? error.message : "Failed to generate colors.",
    });
  }
});
