# Category Patterns

Single Solid 2 + Vite app. UI source lives in app/; Vite config and local server live at the root.

- Save persists data only (Web: localStorage; App: configured data file).
- Download SVGs exports a ZIP in Web; Generate SVGs writes configured directories in App.
- config.yml is local and ignored; config.template.yml is the public example.
- data.template.json seeds Web storage and is copied to a missing App data file at startup; preserve existing data.json (ignored by Git).
- Preserve the palette schema and SVG filenames/IDs. Use the same SVG generator for both connectors.
- Use English for UI and project documentation; keep README.kr.md in Korean.
- Keep changes and documentation concise. Do not add tests or stories unless requested.
- Check changes with type-check, lint, build, and relevant real app flows.
- This app uses Solid 2: import rendering from @solidjs/web and return cleanup from onSettled.
- Korean responses to the user must use polite language.
