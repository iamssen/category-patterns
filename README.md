# Category Patterns

Color lightness and Background contrast control new color generation. Defaults
are 55–80% lightness and contrast priority 1. Global settings can be collapsed
to a value summary; each Restore button restores only its named setting.
Save persists these settings without changing existing colors.

Choose Background in Global settings to update the entire UI. On first
launch, confirm the default background or choose your own. Save
persists the background and confirmation; exported SVG patterns remain unchanged.
New color generation uses the selected background for contrast evaluation.

Generate color palettes, preview patterns in charts, and export SVG assets.
Save persists all palettes and settings. Download SVGs exports the current edits
as a ZIP without saving them.

In Colors and patterns, click a category name to randomize its color and pattern,
the swatch or HEX color for color only, or the pattern name for pattern only.

Requires Node.js 22.12+.

```sh
npm install
npm run dev       # Web mode: Save to browser storage; Download SVGs as ZIP
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
OPFS is private browser storage, not a project folder. Web Download SVGs exports a ZIP.

Projects open directly in the editor. The root opens the saved `default` project;
use the Project button above the palette controls to open `/#/projects`.
Create a named project from Dark or Light. Light uses the saved `light-sample`
configuration; edit `templates/light.json` to change the seed for future projects.
Template updates never replace existing projects. Hash routes also work on
GitHub Pages, including direct links and refreshes. Unsaved changes are protected
when switching pages or using browser Back/Forward.

For local file output:

```sh
npm run dev:app
```

App projects live in `~/category-patterns/{name}.yml`. Each YAML contains
`version: 1`, `name`, `outputs` (a list), and `data` (the existing palette schema).
Create projects and edit output directories on the Projects page. Enter one
SVG directory per line; `~/` expands to your home directory and relative paths
start at `~/category-patterns/`. Directories must not overlap between projects
or with the project folder. Projects can start without output paths; Generate SVGs
stays disabled with a setup notice until you add directories in Projects.

Web **Export projects** packages all saved projects as `projects.zip`, after
asking for output directories for each project. Extract its YAML files into
`~/category-patterns/` without replacing existing files you need, then run the App.
The directory choices are remembered in browser storage. This is separate from
**Download SVGs**, which exports the current palette edits as
`category-patterns-{project}.zip`.

App **Save** persists the current project YAML. **Generate SVGs** writes the
current edits without saving them. Each project's `{name}.svg-state.json` tracks
its generated data and resolved output directories. Changing directories takes
effect on the next generation: previously managed SVG files are removed from old
directories and written to the new directories. Old directories remain reserved
until that generation succeeds. Unrelated files are preserved and conflicting
unmanaged SVG filenames stop generation.

On first use, old browser data is copied into `default`. App also migrates an
existing root `config.yml` and its JSON data/output history into `default` when
that project is missing. Original browser entries and local files are preserved.
Otherwise, `templates/dark.json` seeds the default project. Local config.yml and
data.json are now used only for legacy migration. For an alternate App project
folder, set `CATEGORY_PATTERNS_HOME` before starting the server.

Exports include `{name}.svg` (pattern IDs `{name}-fill1`, etc.) and
`{name}.fill1.svg`, etc. for CSS backgrounds. Renamed or removed assets are cleaned
up when generating SVGs; unrelated files are preserved. Keep output directories dedicated
to this app.

```sh
npm run type-check
npm run lint
npm run build
```

GitHub Actions checks pull requests and deploys the Web build on pushes to main
or manual runs on main. In repository Settings → Pages, set Source to
**GitHub Actions**. Local config.yml and data.json are not needed for deployment.
