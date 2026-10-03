export const DEFAULT_BACKGROUND = "#26282b";

function channels(color: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function mix(color: string, target: string, amount: number): string {
  const end = channels(target);
  return `#${channels(color)
    .map((value, index) =>
      Math.round(value + (end[index] - value) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(color: string): number {
  const linear = channels(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function createTheme(background: string) {
  const dark = luminance(background) < 0.179;
  const foreground = dark ? "#ffffff" : "#000000";
  // Add depth at light/dark extremes without sacrificing contrast near mid luminance.
  const opposite = dark ? "#000000" : "#ffffff";
  const raised = mix(background, foreground, 0.045);
  const raisedHover = mix(background, foreground, 0.09);
  const safeRaised = contrast(foreground, raisedHover) >= 4.5;
  const surface = safeRaised ? raised : mix(background, opposite, 0.14);
  const hover = safeRaised ? raisedHover : mix(background, opposite, 0.27);
  const surfaces = [background, surface, hover];
  function readable(seed: string, ratio: number): string {
    for (let step = 0; step <= 100; step++) {
      const color = mix(seed, foreground, step / 100);
      if (surfaces.every((base) => contrast(color, base) >= ratio)) return color;
    }
    return foreground;
  }
  const text = readable(dark ? "#eeeeee" : "#202124", 7);
  const muted = readable(mix(background, foreground, 0.55), 4.5);
  const accent = readable(dark ? "#b4d9a6" : "#315925", 4.5);
  const danger = readable(dark ? "#f6a7a7" : "#a02121", 4.5);
  return {
    text,
    muted,
    style: {
      "--background": background,
      "--surface": surface,
      "--hover": hover,
      "--text": text,
      "--muted": muted,
      "--border": readable(mix(background, foreground, 0.3), 3),
      "--accent": accent,
      "--on-accent":
        contrast(accent, "#000000") > contrast(accent, "#ffffff") ? "#000000" : "#ffffff",
      "--danger": danger,
      "color-scheme": dark ? "dark" : "light",
    },
  };
}
