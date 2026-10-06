# Category Patterns

Single Solid 2 + Vite app. UI source lives in app/; Vite config and local server live at the root.

- Save persists project data and metadata (Web: localStorage; App: ~/category-patterns/{name}.yml).
- Download SVGs exports a ZIP in Web; Generate SVGs writes configured directories in App.
- config.yml and data.json are legacy migration inputs; preserve original files.
- templates/dark.json and templates/light.json seed new projects only; default uses dark.
- The home route opens default or the first remaining project; hash routes open the project list and named editors. Keep at least one project when deleting.
- Project sharing imports/exports one .category-patterns.svg file with previews and embedded JSON metadata; SVG asset export uses current edits.
- App SVG history tracks output paths; prevent shared or overlapping outputs and clean old managed paths on next generation.
- Preserve the palette schema and SVG filenames/IDs. Use the same SVG generator for both connectors.
- Use English for UI and project documentation; keep README.kr.md in Korean.
- Keep changes and documentation concise. Do not add tests or stories unless requested.
- Check changes with type-check, lint, build, and relevant real app flows.
- This app uses Solid 2: import rendering from @solidjs/web and return cleanup from onSettled.
- Korean responses to the user must use polite language.
