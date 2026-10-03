# Category Patterns

Color lightness and Background contrast control new color generation. Defaults
are 55–80% lightness and contrast priority 1. Global settings can be collapsed
to a value summary; each Restore button restores only its named setting.
Save all palettes persists these settings without changing existing colors.

Choose Background in Global settings to update the entire UI. On first
launch, confirm the default background or choose your own. Save all palettes
persists the background and confirmation; exported SVG patterns remain unchanged.
New color generation uses the selected background for contrast evaluation.

Generate color palettes, preview patterns in charts, and export SVG assets.

In Colors and patterns, click a category name to randomize its color and pattern,
the swatch or HEX color for color only, or the pattern name for pattern only.

Requires Node.js 22.12+.

```sh
npm install
npm run dev       # Web mode: browser storage + SVG ZIP on Save
npm run build     # Static Web build in dist/
npm run preview   # Preview the build
```

The Web build is an installable PWA on HTTPS (or localhost). Open it once online
to cache the app, then use it offline, including SVG ZIP export. Install from
your browser's app menu or Add to Home Screen. Updates take effect after all app
windows and tabs are closed and reopened; editing is never interrupted by an
automatic reload. PWA caching is disabled in development and App mode.

Direct folder output is possible with `showDirectoryPicker()` in desktop
Chrome/Edge after the user selects and grants access to a folder. Safari/Firefox
do not support this picker. PWA installation does not grant filesystem access;
OPFS is private browser storage, not a project folder. Web Save currently uses ZIP.

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
npm run build
```

GitHub Actions checks pull requests and deploys the Web build on pushes to main
or manual runs on main. In repository Settings → Pages, set Source to
**GitHub Actions**. Local config.yml and data.json are not needed for deployment.
