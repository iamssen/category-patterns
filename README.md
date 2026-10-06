# Category Patterns

Create color palettes with subtle patterns for charts and category labels.
Compare them in bar, stacked bar, and donut previews, then export SVG assets for your project.

**[Open the Web app](https://iamssen.github.io/category-patterns/)** · [한국어](README.kr.md)

![Dark palette with chart and pattern previews](readme/screenshot1.png)

## Create and customize

- Create palettes with the number of colors you need. Regenerate colors and patterns together, or patterns alone.
- Use the options button beside **Create palette** to create a palette from 1–20 HEX colors in your preferred order. Separate codes with whitespace or punctuation, including commas, quotes, or brackets; `#RGB` and `#RRGGBB` work with or without `#`.
- Click a swatch, HEX value, or pattern name to edit its color, pattern, angle, spacing, and thickness in a floating panel with instant previews. Choose patterns from preview buttons and adjust angle, spacing, and thickness with sliders. Randomize colors or patterns from the panel, or click the category name to randomize both.
- Tune pattern brightness, background color, and the lightness and contrast of newly generated colors.
- Set minimum and maximum pattern spacing and thickness in Global settings to constrain randomized patterns. Equal bounds fix a value; existing patterns stay unchanged.
- Keep separate projects, starting from Dark or Light samples. Use the **Project** button to switch or create projects.

![Global settings for pattern brightness, background, lightness, and contrast](readme/screenshot2.png)

Choose a background to preview palettes for your own UI. Changing the background
keeps existing palette colors; regenerate colors to adapt them to the new background.

![Light palette with chart and pattern previews](readme/screenshot3.png)

## Save and download

**Save** keeps your project and settings in this browser. **Download SVGs** exports
current edits as a ZIP, without saving the project. The ZIP contains palette SVGs
and individual pattern SVGs for CSS backgrounds.

You can install the Web app from your browser's app menu or **Add to Home Screen**.
Open it once online, then continue editing and downloading SVGs offline.
Updates apply after you close all app tabs and windows and reopen the app.

## Use the Local App

Run the app locally to generate SVG files directly into folders you choose,
including multiple output folders. You can update your project's assets without
extracting a ZIP each time. The Local App runs in your browser with a local server.

Install [Node.js](https://nodejs.org/) 22.12 or later, then run:

```sh
git clone https://github.com/iamssen/category-patterns.git
cd category-patterns
npm install
npm run dev:app
```

Open the local URL printed in the terminal (normally `http://127.0.0.1:5174`).
Keep the server running while using the app.

1. Open **Project** and create a project or edit its output directories.
2. Enter one SVG output folder per line, such as `~/my-project/public/category-patterns`.
3. Open the project and click **Generate SVGs** to write the current edits.

**Save** stores the project in `~/category-patterns/{name}.yml`.
**Generate SVGs** writes SVG files separately; save as well to keep your edits.
Output folders must be separate from the project storage folder and must not
be shared or nested between projects. Use folders dedicated to these SVG assets.

To continue a Web project locally, use **Export projects** on the Web Projects
page and enter output folders for each project. Extract the YAML files from
`projects.zip` into `~/category-patterns/`, preserving any existing projects you need,
then open the Local App. This exports saved projects; save your edits first.

## Use the SVGs in React

Place the generated SVGs and `colors.json` in your Vite project's
`public/category-patterns/` folder.
Pass the palette name and pattern index to `fill("scheme8", 2)` or
`backgroundImage("scheme8", 2)`. This example uses `scheme8.svg` and
`scheme8.fill2.svg`; indices start at 1. `color("scheme8", 2)` returns the
original background color of `fill2`.

```jsx
// CategoryPatterns.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";

const PatternContext = createContext(null);

export function CategoryPatternsProvider({ children }) {
  const container = useRef(null);
  const requested = useRef(new Set());
  const [colors, setColors] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    async function loadColors() {
      const response = await fetch("/category-patterns/colors.json", {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Colors request failed: ${response.status}`);
      setColors(await response.json());
    }
    loadColors().catch((error) => {
      if (error.name !== "AbortError") console.error(error);
    });
    return () => controller.abort();
  }, []);

  async function load(scheme) {
    if (requested.current.has(scheme)) return;
    requested.current.add(scheme);
    const response = await fetch(`/category-patterns/${scheme}.svg`);
    if (!response.ok) throw new Error(`SVG request failed: ${response.status}`);
    const source = await response.text();
    const svg = new DOMParser().parseFromString(source, "image/svg+xml");
    container.current?.append(document.importNode(svg.documentElement, true));
  }

  const patterns = {
    color: (scheme, index) => colors[scheme]?.[index - 1],
    fill(scheme, index) {
      // Safari does not support external SVG pattern fills such as
      // url("/category-patterns/scheme8.svg#scheme8-fill2"); inject the SVG and use a local ID.
      load(scheme).catch(console.error);
      return `url("#${scheme}-fill${index}")`;
    },
    backgroundImage: (scheme, index) =>
      `url("/category-patterns/${scheme}.fill${index}.svg")`,
  };

  return (
    <PatternContext.Provider value={patterns}>
      <div ref={container} aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      {children}
    </PatternContext.Provider>
  );
}

export function useCategoryPatterns() {
  return useContext(PatternContext);
}
```
Wrap your app once with the provider. `fill` loads each required palette SVG
once and returns a local pattern reference. `backgroundImage` returns the
individual SVG file URL. `color` returns `undefined` until `colors.json` loads
or when the palette or fill is missing. You can adjust the returned HEX color
before using it as a line color.

```jsx
// App.jsx
import { CategoryPatternsProvider, useCategoryPatterns } from "./CategoryPatterns";

function Example() {
  const { fill, backgroundImage, color } = useCategoryPatterns();
  const baseColor = color("scheme8", 2);

  return (
    <>
      <svg width="120" height="80">
        <rect width="120" height="80" fill={fill("scheme8", 2)} />
        {baseColor && (
          <path d="M10 70L60 10L110 50" fill="none" stroke={baseColor} strokeWidth="3" />
        )}
      </svg>
      <div style={{ width: 24, height: 24, backgroundImage: backgroundImage("scheme8", 2) }} />
    </>
  );
}

export default function App() {
  return <CategoryPatternsProvider><Example /></CategoryPatternsProvider>;
}
```
Keep the SVG container at 0×0 rather than `display: none`.

<details>
<summary>Developer notes</summary>

### Development

Single Solid 2 + Vite app. UI source lives in `app/`; the Vite config and local
server live at the repository root. Both modes use the same SVG generator.

```sh
npm run dev       # Web mode
npm run build     # Static Web build in dist/
npm run preview   # Preview the build
npm run type-check
npm run lint
```

The Web build supports PWA installation on HTTPS or localhost. PWA caching is
disabled in development and Local App mode.

### Projects and output

Hash routes open the default editor, `/#/projects`, and named editors. They support
direct links and refreshes on GitHub Pages. Page changes and browser Back/Forward
prompt you to save, discard, or cancel when edits are unsaved.

Local project YAML contains `version: 1`, `name`, `outputs` (a list), and `data`
(the palette schema). `~/` expands to the home directory; relative output paths
start at the project storage folder. Set `CATEGORY_PATTERNS_HOME` before starting
the server to use another project storage folder.

`templates/dark.json` and `templates/light.json` seed new projects only. Dark is
the default. Template updates never replace existing projects.

SVG output includes `{palette}.svg` with pattern IDs such as `{palette}-fill1`,
and `{palette}.fill1.svg`, etc. for CSS backgrounds. Web SVG downloads are named
`category-patterns-{project}.zip`.

Both outputs also include `colors.json`: `{ "scheme8": ["#000000", "#ffffff"] }`.
Each palette's array contains the original fill background colors in order:
index 0 is `fill1`, index 1 is `fill2`, etc. Use these colors to derive line colors.

Each Local App project's `{name}.svg-state.json` tracks generated data and output
paths. The next generation removes previously managed SVGs and `colors.json` from old paths and
writes the new output. Old paths remain reserved until generation succeeds.
Unrelated files are preserved; unmanaged output filename conflicts stop generation.

On first use, legacy browser data is copied into `default`. If the local default
project is missing, the Local App migrates the root `config.yml`, its JSON data,
and output history. Original entries and files are preserved. `config.yml` and
`data.json` are legacy migration inputs only.

### Deployment

GitHub Actions checks pull requests and deploys the Web build on pushes to `main`
or manual runs on `main`. In repository **Settings → Pages**, set Source to
**GitHub Actions**. Local `config.yml` and `data.json` are not needed for deployment.

</details>
