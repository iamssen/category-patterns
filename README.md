# Category Patterns

Generate color palettes, preview patterns in charts, and export SVG assets.

Requires Node.js 22.12+.

```sh
npm install
npm run dev       # Web mode: browser storage + SVG ZIP on Save
npm run build     # Static Web build in dist/
npm run preview   # Preview the build
```

For local file output:

```sh
cp config.template.yml config.yml
# Edit data and outputs in config.yml.
npm run dev:app
```

App mode saves data.json and writes SVGs to every configured output directory.
Paths are relative to config.yml. config.yml and data.json are ignored by Git.
Web mode uses data.template.json when browser storage is empty. App mode copies
the template to the configured data path on first launch if the file is missing;
existing data is preserved.

Exports include `{name}.svg` (pattern IDs `{name}-fill1`, etc.) and
`{name}.fill1.svg`, etc. for CSS backgrounds. Renamed or removed assets are cleaned
up on App saves; unrelated files are preserved. Keep output directories dedicated
to this app.

```sh
npm run type-check
npm run lint
```

GitHub Actions checks pull requests and deploys the Web build on pushes to main
or manual runs on main. In repository Settings → Pages, set Source to
**GitHub Actions**. Local config.yml and data.json are not needed for deployment.
