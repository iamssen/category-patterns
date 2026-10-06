import { createMemo, createSignal, flush, For, onSettled, Show } from "solid-js";
import type { Element } from "solid-js";
import { DEFAULT_GENERATION_SETTINGS, emptyData, isValidName, PATTERN_TYPES } from "./model.ts";
import type { GenerationRequest } from "./generation.worker.ts";
import type { Category, Palette, PaletteData } from "./model.ts";
import { Preview } from "./Preview.tsx";
import { PATTERN_LABELS, patternPreviewUrl, randomCategories, swatchUrl } from "./svg.ts";

import { createTheme, DEFAULT_BACKGROUND } from "./theme.ts";

import type { Project } from "./projects.ts";
import type { PageProps } from "./Workspace.tsx";

import { connector } from "./connector.ts";

export function App(props: PageProps & { projectName: string }): Element {
  let project: Project | undefined;
  let disposed = false;
  const [data, setData] = createSignal<PaletteData>(emptyData());
  const [selected, setSelected] = createSignal("");
  const [name, setName] = createSignal("scheme8");
  const [count, setCount] = createSignal(8);
  const [createOptionsOpen, setCreateOptionsOpen] = createSignal(false);
  const [colorCodes, setColorCodes] = createSignal("");
  const [colorCodesError, setColorCodesError] = createSignal("");
  let createActions: HTMLDivElement | undefined;
  let colorCodesDialog: HTMLDialogElement | undefined;
  const [editingCategory, setEditingCategory] = createSignal<number | undefined>();
  const [editorHex, setEditorHex] = createSignal("");
  let categoryEditor: HTMLDivElement | undefined;
  let appElement: HTMLDivElement | undefined;
  const editorHexInvalid = () => !/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(editorHex());
  const [rename, setRename] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  const [outputsConfigured, setOutputsConfigured] = createSignal(false);
  const missingOutputs = () => connector.appMode && loaded() && !outputsConfigured();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const palette = createMemo(() => data().palettes.find((item) => item.id === selected()));
  const editedCategory = createMemo(() => {
    const index = editingCategory();
    return index === undefined ? undefined : palette()?.categories[index];
  });
  const theme = createMemo(() => createTheme(data().background));
  function setBackground(background: string): void {
    change({ ...data(), background, backgroundConfirmed: true });
  }
  function setLightness(index: 0 | 1, input: HTMLInputElement): void {
    const percent = input.valueAsNumber;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return;
    const lightness: [number, number] = [...data().generation.lightness];
    lightness[index] =
      index === 0
        ? Math.min(percent / 100, lightness[1] - 0.01)
        : Math.max(percent / 100, lightness[0] + 0.01);
    change({ ...data(), generation: { ...data().generation, lightness } });
    input.value = String(Math.round(lightness[index] * 100));
  }
  function setPatternRange(
    key: "patternSpacing" | "patternThickness",
    index: 0 | 1,
    input: HTMLInputElement,
  ): void {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || !input.validity.valid) return;
    const range: [number, number] = [...data().generation[key]];
    range[index] = index === 0 ? Math.min(value, range[1]) : Math.max(value, range[0]);
    change({ ...data(), generation: { ...data().generation, [key]: range } });
    input.value = String(range[index]);
  }
  let worker: Worker | undefined;

  function change(next: PaletteData): void {
    setData(next);
    setDirty(true);
    setMessage("");
  }
  function select(item: Palette): void {
    closeCategoryEditor();
    setSelected(item.id);
    setRename(item.name);
  }
  async function load(): Promise<void> {
    setError("");
    try {
      project = await connector.load(props.projectName);
      if (disposed) return;
      const result = project.data;
      setOutputsConfigured(project.outputs.length > 0);
      setData(result);
      setSettingsOpen(!result.backgroundConfirmed);
      if (result.palettes[0]) select(result.palettes[0]);
      setLoaded(true);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to load data.");
    }
  }
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty()) event.preventDefault();
  };
  onSettled(() => {
    const unregister = props.registerGuard({ dirty, busy: () => Boolean(busy()), save });
    void load();
    window.addEventListener("beforeunload", beforeUnload);
    const dismissOptions = (event: PointerEvent) => {
      if (event.target instanceof Node && !createActions?.contains(event.target))
        setCreateOptionsOpen(false);
    };
    window.addEventListener("pointerdown", dismissOptions);
    window.addEventListener("resize", positionCategoryEditor);
    window.addEventListener("scroll", positionCategoryEditor, true);
    return () => {
      disposed = true;
      unregister();
      worker?.terminate();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pointerdown", dismissOptions);
      window.removeEventListener("resize", positionCategoryEditor);
      window.removeEventListener("scroll", positionCategoryEditor, true);
    };
  });

  function checkName(value: string, except?: string): string {
    const normalized = value.trim().normalize("NFC");
    if (!isValidName(normalized))
      throw new Error("Names must contain 1–64 letters, numbers, spaces, hyphens or underscores.");
    if (
      data().palettes.some(
        (item) => item.id !== except && item.name.toLowerCase() === normalized.toLowerCase(),
      )
    )
      throw new Error("A palette with this name already exists.");
    return normalized;
  }
  async function generateColors(request: GenerationRequest): Promise<string[]> {
    try {
      worker = new Worker(new URL("generation.worker.ts", import.meta.url), {
        type: "module",
      });
      const staticWorker = worker;
      return await new Promise<string[]>((resolve, reject) => {
        staticWorker.addEventListener(
          "message",
          (event: MessageEvent<{ colors?: string[]; error?: string }>) => {
            if (event.data.colors) resolve(event.data.colors);
            else reject(new Error(event.data.error ?? "Failed to generate colors."));
          },
          { once: true },
        );
        staticWorker.addEventListener(
          "error",
          () => reject(new Error("Failed to start the color worker.")),
          { once: true },
        );
        staticWorker.postMessage({
          ...request,
          background: data().background,
          generation: data().generation,
        });
      });
    } finally {
      worker?.terminate();
      worker = undefined;
    }
  }

  async function generate(existing?: Palette): Promise<void> {
    if (busy() || !loaded()) return;
    setError("");
    try {
      const nextName = existing?.name ?? checkName(name());
      const length = existing?.categories.length ?? count();
      if (!Number.isSafeInteger(length) || length < 1 || length > 20)
        throw new Error("Color count must be between 1 and 20.");
      setBusy("Generating colors and patterns…");
      const colors = await generateColors({ count: length });
      const next: Palette = {
        id: existing?.id ?? crypto.randomUUID(),
        name: nextName,
        categories: randomCategories(colors, data().generation),
      };
      change({
        ...data(),
        palettes: existing
          ? data().palettes.map((item) => (item.id === existing.id ? next : item))
          : [...data().palettes, next],
      });
      select(next);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Generation failed.");
    } finally {
      setBusy("");
    }
  }
  function createFromColorCodes(): void {
    if (busy() || !loaded()) return;
    setColorCodesError("");
    try {
      const nextName = checkName(name());
      const tokens = colorCodes()
        .replace(/[^#0-9a-z]+/gi, " ")
        .trim()
        .split(/\s+/u)
        .filter(Boolean);
      if (tokens.length < 1 || tokens.length > 20)
        throw new Error("Enter between 1 and 20 colors.");
      const colors = tokens.map((token) => {
        const hex = token.replace(/^#/, "");
        if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex))
          throw new Error(`Invalid color: ${token}. Use HEX codes such as #ABC or #AABBCC.`);
        return `#${hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex}`.toUpperCase();
      });
      const next: Palette = {
        id: crypto.randomUUID(),
        name: nextName,
        categories: randomCategories(colors, data().generation),
      };
      change({ ...data(), palettes: [...data().palettes, next] });
      select(next);
      setCount(colors.length);
      setError("");
      setColorCodes("");
      colorCodesDialog?.close();
    } catch (error_) {
      setColorCodesError(error_ instanceof Error ? error_.message : "Failed to create palette.");
    }
  }
  function closeCategoryEditor(): void {
    categoryEditor?.hidePopover();
    setEditingCategory(undefined);
  }
  function openCategoryEditor(index: number): void {
    if (busy()) return;
    const category = palette()?.categories[index];
    if (!category || !categoryEditor) return;
    setEditingCategory(index);
    setEditorHex(category.color);
    flush();
    categoryEditor.showPopover();
    positionCategoryEditor();
    categoryEditor.querySelector<HTMLInputElement>('input[type="color"]')?.focus();
  }
  function positionCategoryEditor(): void {
    if (!categoryEditor?.matches(":popover-open")) return;
    const anchor = appElement?.querySelector<HTMLButtonElement>(
      `[data-category-index="${editingCategory()}"]`,
    );
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panel = categoryEditor.getBoundingClientRect();
    const gap = 10;
    const top =
      rect.bottom + gap + panel.height <= window.innerHeight - 12
        ? rect.bottom + gap
        : rect.top - gap - panel.height;
    categoryEditor.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panel.width - 12))}px`;
    categoryEditor.style.top = `${Math.max(12, Math.min(top, window.innerHeight - panel.height - 12))}px`;
  }
  function editCategory(patch: Partial<Category>): void {
    const item = palette();
    const index = editingCategory();
    if (!item || index === undefined || busy()) return;
    change({
      ...data(),
      palettes: data().palettes.map((value) =>
        value.id === item.id
          ? {
              ...value,
              categories: value.categories.map((category, entryIndex) =>
                entryIndex === index ? { ...category, ...patch } : category,
              ),
            }
          : value,
      ),
    });
  }
  function editHex(value: string): void {
    setEditorHex(value);
    if (!/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return;
    const hex = value.replace(/^#/, "");
    editCategory({
      color:
        `#${hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex}`.toUpperCase(),
    });
  }
  function editPatternNumber(key: "angle" | "size" | "strokeWidth", input: HTMLInputElement): void {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || !input.validity.valid) return;
    editCategory({ [key]: value });
  }
  async function randomizeEditedCategory(mode: "color" | "pattern"): Promise<void> {
    const index = editingCategory();
    if (index === undefined) return;
    await rerollCategory(index, mode);
    flush();
    if (editingCategory() === index) setEditorHex(editedCategory()?.color ?? "");
  }
  function renamePalette(): void {
    const item = palette();
    if (!item) return;
    setError("");
    try {
      const next = { ...item, name: checkName(rename(), item.id) };
      change({
        ...data(),
        palettes: data().palettes.map((value) => (value.id === item.id ? next : value)),
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to rename the palette.");
    }
  }
  function remove(): void {
    closeCategoryEditor();
    const item = palette();
    if (!item) return;
    const remaining = data().palettes.filter((value) => value.id !== item.id);
    change({ ...data(), palettes: remaining });
    setSelected(remaining[0]?.id ?? "");
    setRename(remaining[0]?.name ?? "");
  }
  function rerollPatterns(): void {
    const item = palette();
    if (!item) return;
    const categories = randomCategories(
      item.categories.map((category) => category.color),
      data().generation,
    );
    change({
      ...data(),
      palettes: data().palettes.map((value) =>
        value.id === item.id ? { ...value, categories } : value,
      ),
    });
  }
  async function rerollCategory(index: number, mode: "both" | "color" | "pattern"): Promise<void> {
    const item = palette();
    if (!item || busy() || !loaded()) return;
    const category = item.categories[index];
    if (!category) return;
    setError("");
    setBusy(mode === "pattern" ? "Generating pattern…" : "Generating color…");
    try {
      const color =
        mode === "pattern"
          ? category.color
          : (
              await generateColors({
                colors: item.categories.map((value) => value.color),
                index,
              })
            )[index];
      const next =
        mode === "color" ? { ...category, color } : randomCategories([color], data().generation)[0];
      change({
        ...data(),
        palettes: data().palettes.map((value) =>
          value.id === item.id
            ? {
                ...value,
                categories: value.categories.map((entry, entryIndex) =>
                  entryIndex === index ? next : entry,
                ),
              }
            : value,
        ),
      });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Generation failed.");
    } finally {
      setBusy("");
    }
  }
  async function save(): Promise<boolean> {
    if (busy() || !loaded() || !project) return false;
    if (!dirty()) return true;
    setBusy("Saving…");
    setError("");
    setMessage("");
    try {
      const saved = data();
      await connector.save({ ...project, data: saved });
      if (data() !== saved) return false;
      setDirty(false);
      setMessage(`${data().palettes.length} palettes saved.`);
      return true;
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to save.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function exportSVGs(): Promise<void> {
    if (busy() || !loaded() || missingOutputs()) return;
    setBusy(connector.exportProgress);
    setError("");
    setMessage("");
    try {
      await connector.exportSVGs(props.projectName, data());
      setMessage(connector.exportSuccess);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to export SVGs.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      class="app"
      style={theme().style}
      ref={(element) => {
        appElement = element;
      }}
    >
      <aside class="sidebar">
        <header>
          <span class="eyebrow">Visual asset manager</span>
          <div class="app-title">
            <h1>Category Patterns</h1>
            <a
              class="readme-link"
              href="https://github.com/iamssen/category-patterns#readme"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Category Patterns README on GitHub (new tab)"
              title="README on GitHub"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
              </svg>
            </a>
          </div>
          <p>Distinct colors. Subtle patterns.</p>
        </header>
        <button
          class="project-switch"
          disabled={Boolean(busy())}
          onClick={() => props.navigate("/projects")}
        >
          <span>
            <small>Project</small>
            <strong>{props.projectName}</strong>
          </span>
          <span aria-hidden="true">⇄</span>
        </button>
        <form
          class="create"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <label>
            Palette name
            <input
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
              maxlength={64}
              required
              disabled={Boolean(busy())}
            />
          </label>
          <label>
            Color count
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={count()}
              onInput={(event) => setCount(event.currentTarget.valueAsNumber)}
              required
              disabled={Boolean(busy())}
            />
          </label>
          <div
            class="create-actions"
            ref={(element) => {
              createActions = element;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCreateOptionsOpen(false);
            }}
          >
            <div class="create-button-group" role="group" aria-label="Create palette">
              <button type="submit" disabled={!loaded() || Boolean(busy())}>
                ＋ Create palette
              </button>
              <button
                type="button"
                class="create-options-button"
                aria-label="Palette creation options"
                aria-expanded={createOptionsOpen() ? "true" : "false"}
                aria-controls="palette-creation-options"
                disabled={!loaded() || Boolean(busy())}
                onClick={() => setCreateOptionsOpen((open) => !open)}
              >
                <span aria-hidden="true">▾</span>
              </button>
            </div>
            <Show when={createOptionsOpen()}>
              <div class="create-options" id="palette-creation-options">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOptionsOpen(false);
                    setColorCodesError("");
                    colorCodesDialog?.showModal();
                  }}
                >
                  Create from color codes…
                </button>
              </div>
            </Show>
          </div>
        </form>
        <nav aria-label="Palette list">
          <div class="list-heading">
            Palettes <span>{data().palettes.length}</span>
          </div>
          <For
            each={data().palettes}
            fallback={<p class="empty-list">Create a palette to get started.</p>}
          >
            {(item) => (
              <button
                class={["palette-button", { active: selected() === item.id }]}
                onClick={() => select(item)}
                aria-pressed={selected() === item.id ? "true" : "false"}
              >
                <span class="mini-colors">
                  <For each={item.categories.slice(0, 5)}>
                    {(category) => <i style={{ "background-color": category.color }} />}
                  </For>
                </span>
                <span>{item.name}</span>
                <small>{item.categories.length}</small>
              </button>
            )}
          </For>
        </nav>
        <footer>
          <div class="save-actions" role="group" aria-label="Save and export palettes">
            <button disabled={!loaded() || Boolean(busy()) || !dirty()} onClick={() => void save()}>
              Save
            </button>
            <button
              disabled={!loaded() || Boolean(busy()) || missingOutputs()}
              aria-describedby={missingOutputs() ? "output-directory-warning" : undefined}
              onClick={() => void exportSVGs()}
            >
              {connector.exportLabel}
            </button>
          </div>
          <Show when={missingOutputs()}>
            <div class="output-warning" id="output-directory-warning" role="status">
              <small>Add an output directory to generate SVGs.</small>
              <button disabled={Boolean(busy())} onClick={() => props.navigate("/projects")}>
                Set output directories
              </button>
            </div>
          </Show>
          <small>{connector.description}</small>
        </footer>
      </aside>
      <dialog
        class="project-dialog color-codes-dialog"
        ref={(element) => {
          colorCodesDialog = element;
        }}
        aria-labelledby="color-codes-title"
      >
        <h2 id="color-codes-title">Create from color codes</h2>
        <p>Use your colors in the order entered, with randomly generated patterns.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createFromColorCodes();
          }}
        >
          <div class="export-fields">
            <label>
              Palette name
              <input
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                maxlength={64}
                required
              />
            </label>
            <label>
              Color codes
              <textarea
                value={colorCodes()}
                onInput={(event) => setColorCodes(event.currentTarget.value)}
                rows={6}
                placeholder={"#F87171, #FBBF24\n#34D399 #60A5FA"}
                aria-describedby="color-codes-hint"
                aria-invalid={colorCodesError() ? "true" : "false"}
                spellcheck={false}
                required
              />
              <small id="color-codes-hint">
                1–20 HEX colors (#RGB or #RRGGBB; # is optional). Separate with whitespace or
                punctuation, such as commas, quotes or brackets.
              </small>
            </label>
          </div>
          <Show when={colorCodesError()}>
            <div class="notice error" role="alert">
              {colorCodesError()}
            </div>
          </Show>
          <div class="dialog-actions">
            <button type="button" onClick={() => colorCodesDialog?.close()}>
              Cancel
            </button>
            <button type="submit" class="primary">
              Create palette
            </button>
          </div>
        </form>
      </dialog>
      <div
        id="category-editor"
        class="category-editor"
        popover="auto"
        role="region"
        aria-label="Color and pattern editor"
        ref={(element) => {
          categoryEditor = element;
        }}
        onToggle={(event) => {
          if (event.newState === "closed") setEditingCategory(undefined);
        }}
      >
        <div class="category-editor-color">
          <input
            type="color"
            aria-label="Category color"
            value={editedCategory()?.color ?? "#000000"}
            disabled={Boolean(busy())}
            onInput={(event) => {
              setEditorHex(event.currentTarget.value.toUpperCase());
              editCategory({ color: event.currentTarget.value.toUpperCase() });
            }}
          />
          <input
            class="category-editor-hex"
            aria-label="HEX color"
            value={editorHex()}
            maxlength={7}
            aria-invalid={editorHexInvalid() ? "true" : "false"}
            aria-describedby={editorHexInvalid() ? "category-hex-error" : undefined}
            disabled={Boolean(busy())}
            spellcheck={false}
            onInput={(event) => editHex(event.currentTarget.value)}
            onBlur={() => setEditorHex(editedCategory()?.color ?? "")}
          />
          <button aria-label="Close category editor" onClick={closeCategoryEditor}>
            ×
          </button>
        </div>
        <Show when={editorHexInvalid()}>
          <small class="danger" id="category-hex-error">
            Use #RGB or #RRGGBB.
          </small>
        </Show>
        <fieldset class="category-editor-patterns">
          <legend>
            Pattern <strong>{PATTERN_LABELS[editedCategory()?.pattern ?? "lines"]}</strong>
          </legend>
          <div class="pattern-choices">
            <For each={PATTERN_TYPES}>
              {(type) => (
                <button
                  type="button"
                  aria-label={PATTERN_LABELS[type]}
                  title={PATTERN_LABELS[type]}
                  aria-pressed={editedCategory()?.pattern === type ? "true" : "false"}
                  disabled={Boolean(busy())}
                  onClick={() => editCategory({ pattern: type })}
                >
                  <img src={patternPreviewUrl(type, theme().patternPreview)} alt="" />
                </button>
              )}
            </For>
          </div>
        </fieldset>
        <div class="category-editor-sliders">
          <label>
            <span>
              Angle <strong>{editedCategory()?.angle ?? 0}°</strong>
            </span>
            <input
              type="range"
              aria-label="Pattern angle"
              min="-180"
              max="180"
              step="1"
              value={editedCategory()?.angle ?? 0}
              aria-valuetext={`${editedCategory()?.angle ?? 0} degrees`}
              disabled={Boolean(busy())}
              onInput={(event) => editPatternNumber("angle", event.currentTarget)}
            />
          </label>
          <label>
            <span>
              Spacing <strong>{editedCategory()?.size ?? 8}px</strong>
            </span>
            <input
              type="range"
              aria-label="Pattern spacing"
              min="6"
              max="24"
              step="1"
              value={editedCategory()?.size ?? 8}
              aria-valuetext={`${editedCategory()?.size ?? 8} pixels`}
              disabled={Boolean(busy())}
              onInput={(event) => editPatternNumber("size", event.currentTarget)}
            />
          </label>
          <label>
            <span>
              Thickness <strong>{editedCategory()?.strokeWidth ?? 1}px</strong>
            </span>
            <input
              type="range"
              aria-label="Pattern thickness"
              min="0.5"
              max="3"
              step="0.1"
              value={editedCategory()?.strokeWidth ?? 1}
              aria-valuetext={`${editedCategory()?.strokeWidth ?? 1} pixels`}
              disabled={Boolean(busy())}
              onInput={(event) => editPatternNumber("strokeWidth", event.currentTarget)}
            />
          </label>
        </div>
        <div class="category-editor-randomize">
          <button disabled={Boolean(busy())} onClick={() => void randomizeEditedCategory("color")}>
            Randomize color
          </button>
          <button
            disabled={Boolean(busy())}
            onClick={() => void randomizeEditedCategory("pattern")}
          >
            Randomize pattern
          </button>
        </div>
        <small>Changes preview instantly. Save to keep them.</small>
      </div>
      <main>
        <Show when={error()}>
          <div class="notice error" role="alert">
            {error()}
            <Show when={!loaded()}>
              <button onClick={() => void load()}>Reload</button>
            </Show>
          </div>
        </Show>
        <Show when={message() || busy()}>
          <div class="notice" role="status">
            {busy() || message()}
          </div>
        </Show>
        <Show when={loaded() && !data().backgroundConfirmed}>
          <div class="background-notice" role="status">
            <strong>Check your background first</strong>
            <p>
              Is this the background you want to use? Keep it, or choose a color below before
              comparing palettes.
            </p>
            <button onClick={() => change({ ...data(), backgroundConfirmed: true })}>
              Yes, use this background
            </button>
          </div>
        </Show>
        <details
          class="settings"
          open={settingsOpen()}
          onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        >
          <summary>
            <strong>Global settings</strong>
            <span class="settings-values">
              <span>Pattern {Math.round(data().patternLighten * 100)}%</span>
              <span class="background-summary">
                <i style={{ "background-color": data().background }} />
                Background {data().background}
              </span>
              <span>
                Lightness {Math.round(data().generation.lightness[0] * 100)}–
                {Math.round(data().generation.lightness[1] * 100)}%
              </span>
              <span>Contrast priority {data().generation.contrastWeight}</span>
              <span>
                Spacing {data().generation.patternSpacing[0]}–{data().generation.patternSpacing[1]}
                px
              </span>
              <span>
                Thickness {data().generation.patternThickness[0]}–
                {data().generation.patternThickness[1]}px
              </span>
            </span>
          </summary>
          <table>
            <tbody>
              <tr>
                <th scope="row">Pattern brightness</th>
                <td>
                  <div class="config-content">
                    <div class="config-control">
                      <strong class="config-value">
                        {Math.round(data().patternLighten * 100)}%
                      </strong>
                      <input
                        aria-label="Pattern brightness"
                        aria-describedby="brightness-hint"
                        type="range"
                        min="0"
                        max="0.5"
                        step="0.01"
                        value={data().patternLighten}
                        disabled={!loaded() || Boolean(busy())}
                        onInput={(event) =>
                          change({ ...data(), patternLighten: event.currentTarget.valueAsNumber })
                        }
                      />
                    </div>
                    <small id="brightness-hint">
                      Amount of white mixed into the pattern color. Updates existing patterns
                      immediately.
                    </small>
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Background</th>
                <td>
                  <div class="config-content">
                    <div class="config-control background-setting">
                      <strong class="config-value">{data().background}</strong>
                      <input
                        aria-label="Background"
                        aria-describedby="background-hint"
                        type="color"
                        value={data().background}
                        disabled={!loaded() || Boolean(busy())}
                        onInput={(event) => setBackground(event.currentTarget.value)}
                      />
                      <button
                        disabled={
                          !loaded() || Boolean(busy()) || data().background === DEFAULT_BACKGROUND
                        }
                        onClick={() => setBackground(DEFAULT_BACKGROUND)}
                      >
                        Restore {DEFAULT_BACKGROUND}
                      </button>
                    </div>
                    <small id="background-hint">
                      Updates the entire UI. Existing colors stay unchanged; regenerate colors to
                      optimize for this background.
                    </small>
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Color lightness</th>
                <td>
                  <div class="config-content">
                    <fieldset
                      class="generation-setting config-control"
                      aria-label="Color lightness"
                      aria-describedby="lightness-hint"
                      disabled={!loaded() || Boolean(busy())}
                    >
                      <div class="lightness-values">
                        <span>
                          From <strong>{Math.round(data().generation.lightness[0] * 100)}%</strong>
                        </span>
                        <span>
                          To <strong>{Math.round(data().generation.lightness[1] * 100)}%</strong>
                        </span>
                      </div>
                      <div class="lightness-range">
                        <div class="lightness-track" aria-hidden="true">
                          <span
                            style={{
                              left: `${data().generation.lightness[0] * 100}%`,
                              right: `${100 - data().generation.lightness[1] * 100}%`,
                            }}
                          />
                        </div>
                        <input
                          aria-label="Minimum color lightness"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          aria-valuemax={Math.round(data().generation.lightness[1] * 100) - 1}
                          aria-valuetext={`${Math.round(data().generation.lightness[0] * 100)}%`}
                          value={Math.round(data().generation.lightness[0] * 100)}
                          onInput={(event) => setLightness(0, event.currentTarget)}
                        />
                        <input
                          aria-label="Maximum color lightness"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          aria-valuemin={Math.round(data().generation.lightness[0] * 100) + 1}
                          aria-valuetext={`${Math.round(data().generation.lightness[1] * 100)}%`}
                          value={Math.round(data().generation.lightness[1] * 100)}
                          onInput={(event) => setLightness(1, event.currentTarget)}
                        />
                      </div>

                      <button
                        disabled={
                          data().generation.lightness[0] ===
                            DEFAULT_GENERATION_SETTINGS.lightness[0] &&
                          data().generation.lightness[1] ===
                            DEFAULT_GENERATION_SETTINGS.lightness[1]
                        }
                        onClick={() =>
                          change({
                            ...data(),
                            generation: {
                              ...data().generation,
                              lightness: DEFAULT_GENERATION_SETTINGS.lightness,
                            },
                          })
                        }
                      >
                        Restore 55–80%
                      </button>
                    </fieldset>
                    <small id="lightness-hint">
                      Allowed lightness range for new or regenerated colors. Existing colors stay
                      unchanged.
                    </small>
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Background contrast</th>
                <td>
                  <div class="config-content">
                    <div class="config-control">
                      <strong class="config-value">
                        Priority {data().generation.contrastWeight}
                      </strong>
                      <input
                        aria-label="Background contrast priority"
                        aria-describedby="contrast-hint"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        disabled={!loaded() || Boolean(busy())}
                        value={data().generation.contrastWeight}
                        onInput={(event) =>
                          change({
                            ...data(),
                            generation: {
                              ...data().generation,
                              contrastWeight: event.currentTarget.valueAsNumber,
                            },
                          })
                        }
                      />
                      <button
                        disabled={
                          !loaded() ||
                          Boolean(busy()) ||
                          data().generation.contrastWeight ===
                            DEFAULT_GENERATION_SETTINGS.contrastWeight
                        }
                        onClick={() =>
                          change({
                            ...data(),
                            generation: {
                              ...data().generation,
                              contrastWeight: DEFAULT_GENERATION_SETTINGS.contrastWeight,
                            },
                          })
                        }
                      >
                        Restore priority 1
                      </button>
                    </div>
                    <small id="contrast-hint">
                      Higher priority favors background visibility over color separation when
                      generating colors. 0 ignores background contrast.
                    </small>
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Pattern spacing</th>
                <td>
                  <div class="config-content">
                    <fieldset
                      class="generation-setting config-control"
                      aria-label="Pattern spacing range"
                      aria-describedby="patternSpacing-hint"
                      disabled={!loaded() || Boolean(busy())}
                    >
                      <div class="lightness-values">
                        <span>
                          Min <strong>{data().generation.patternSpacing[0]}px</strong>
                        </span>
                        <span>
                          Max <strong>{data().generation.patternSpacing[1]}px</strong>
                        </span>
                      </div>
                      <div class="lightness-range">
                        <div class="lightness-track" aria-hidden="true">
                          <span
                            style={{
                              left: `${((data().generation.patternSpacing[0] - 6) / 18) * 100}%`,
                              right: `${100 - ((data().generation.patternSpacing[1] - 6) / 18) * 100}%`,
                            }}
                          />
                        </div>
                        <input
                          aria-label="Minimum pattern spacing"
                          type="range"
                          min="6"
                          max="24"
                          step="1"
                          value={data().generation.patternSpacing[0]}
                          aria-valuemax={data().generation.patternSpacing[1]}
                          aria-valuetext={`${data().generation.patternSpacing[0]} pixels`}
                          onInput={(event) =>
                            setPatternRange("patternSpacing", 0, event.currentTarget)
                          }
                        />
                        <input
                          aria-label="Maximum pattern spacing"
                          type="range"
                          min="6"
                          max="24"
                          step="1"
                          value={data().generation.patternSpacing[1]}
                          aria-valuemin={data().generation.patternSpacing[0]}
                          aria-valuetext={`${data().generation.patternSpacing[1]} pixels`}
                          onInput={(event) =>
                            setPatternRange("patternSpacing", 1, event.currentTarget)
                          }
                        />
                      </div>
                      <button
                        disabled={
                          data().generation.patternSpacing[0] ===
                            DEFAULT_GENERATION_SETTINGS.patternSpacing[0] &&
                          data().generation.patternSpacing[1] ===
                            DEFAULT_GENERATION_SETTINGS.patternSpacing[1]
                        }
                        onClick={() =>
                          change({
                            ...data(),
                            generation: {
                              ...data().generation,
                              patternSpacing: DEFAULT_GENERATION_SETTINGS.patternSpacing,
                            },
                          })
                        }
                      >
                        Restore 8–16px
                      </button>
                    </fieldset>
                    <small id="patternSpacing-hint">
                      Range for new or randomized patterns. Equal bounds use a fixed value. Existing
                      patterns stay unchanged.
                    </small>
                  </div>
                </td>
              </tr>
              <tr>
                <th scope="row">Pattern thickness</th>
                <td>
                  <div class="config-content">
                    <fieldset
                      class="generation-setting config-control"
                      aria-label="Pattern thickness range"
                      aria-describedby="patternThickness-hint"
                      disabled={!loaded() || Boolean(busy())}
                    >
                      <div class="lightness-values">
                        <span>
                          Min <strong>{data().generation.patternThickness[0]}px</strong>
                        </span>
                        <span>
                          Max <strong>{data().generation.patternThickness[1]}px</strong>
                        </span>
                      </div>
                      <div class="lightness-range">
                        <div class="lightness-track" aria-hidden="true">
                          <span
                            style={{
                              left: `${((data().generation.patternThickness[0] - 0.5) / 2.5) * 100}%`,
                              right: `${100 - ((data().generation.patternThickness[1] - 0.5) / 2.5) * 100}%`,
                            }}
                          />
                        </div>
                        <input
                          aria-label="Minimum pattern thickness"
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={data().generation.patternThickness[0]}
                          aria-valuemax={data().generation.patternThickness[1]}
                          aria-valuetext={`${data().generation.patternThickness[0]} pixels`}
                          onInput={(event) =>
                            setPatternRange("patternThickness", 0, event.currentTarget)
                          }
                        />
                        <input
                          aria-label="Maximum pattern thickness"
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={data().generation.patternThickness[1]}
                          aria-valuemin={data().generation.patternThickness[0]}
                          aria-valuetext={`${data().generation.patternThickness[1]} pixels`}
                          onInput={(event) =>
                            setPatternRange("patternThickness", 1, event.currentTarget)
                          }
                        />
                      </div>
                      <button
                        disabled={
                          data().generation.patternThickness[0] ===
                            DEFAULT_GENERATION_SETTINGS.patternThickness[0] &&
                          data().generation.patternThickness[1] ===
                            DEFAULT_GENERATION_SETTINGS.patternThickness[1]
                        }
                        onClick={() =>
                          change({
                            ...data(),
                            generation: {
                              ...data().generation,
                              patternThickness: DEFAULT_GENERATION_SETTINGS.patternThickness,
                            },
                          })
                        }
                      >
                        Restore 0.8–1.4px
                      </button>
                    </fieldset>
                    <small id="patternThickness-hint">
                      Range for new or randomized patterns. Equal bounds use a fixed value. Existing
                      patterns stay unchanged.
                    </small>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="settings-footer">Applies to all palettes. Save to keep these settings.</p>
        </details>
        <Show
          when={palette()}
          fallback={
            <div class="welcome">
              <span class="eyebrow">Palette studio</span>
              <h2>Distinct colors, subtle patterns.</h2>
              <p>
                Enter a name and color count on the left.
                <br />
                Compare charts and save your favorite combinations.
              </p>
            </div>
          }
        >
          {(current) => {
            const content = createMemo(() => (
              <>
                <header class="toolbar">
                  <div>
                    <span class="eyebrow">
                      Palette preview · {current().categories.length} colors
                    </span>
                    <h2>{current().name}</h2>
                  </div>
                  <div class="actions">
                    <button disabled={Boolean(busy())} onClick={() => void generate(current())}>
                      Regenerate colors + patterns
                    </button>
                    <button disabled={Boolean(busy())} onClick={rerollPatterns}>
                      Regenerate patterns
                    </button>
                  </div>
                </header>
                <section class="panel">
                  <div class="panel-heading">
                    <h3>Stacked bars</h3>
                    <span>Proportional / equal width · thin bars</span>
                  </div>
                  <Preview
                    palette={current()}
                    lighten={data().patternLighten}
                    text={theme().text}
                    muted={theme().muted}
                    chart="stack"
                  />
                </section>
                <div class="chart-grid">
                  <section class="panel">
                    <div class="panel-heading">
                      <h3>Bar chart</h3>
                      <span>Sample values</span>
                    </div>
                    <Preview
                      palette={current()}
                      lighten={data().patternLighten}
                      text={theme().text}
                      muted={theme().muted}
                      chart="bars"
                    />
                  </section>
                  <section class="panel">
                    <div class="panel-heading">
                      <h3>Donut chart</h3>
                    </div>
                    <Preview
                      palette={current()}
                      lighten={data().patternLighten}
                      text={theme().text}
                      muted={theme().muted}
                      chart="donut"
                    />
                  </section>
                </div>
                <section class="panel">
                  <div class="panel-heading">
                    <h3>Colors and patterns</h3>
                    <span>Compare at legend size</span>
                  </div>
                  <div class="swatches">
                    <For each={current().categories}>
                      {(category, index) => (
                        <div class="swatch">
                          <button
                            class="swatch-image"
                            data-category-index={index()}
                            disabled={Boolean(busy())}
                            aria-label={`Edit color and pattern for Category ${index() + 1}`}
                            title="Edit color and pattern"
                            aria-controls="category-editor"
                            aria-expanded={editingCategory() === index() ? "true" : "false"}
                            onClick={() => openCategoryEditor(index())}
                          >
                            <img src={swatchUrl(category, data().patternLighten)} alt="" />
                          </button>
                          <div class="swatch-details">
                            <button
                              disabled={Boolean(busy())}
                              aria-label={`Randomize color and pattern for Category ${index() + 1}`}
                              title="Randomize color and pattern"
                              onClick={() => void rerollCategory(index(), "both")}
                            >
                              <strong>Category {index() + 1}</strong>
                            </button>
                            <button
                              disabled={Boolean(busy())}
                              aria-label={`Edit color and pattern for Category ${index() + 1}`}
                              title="Edit color and pattern"
                              aria-controls="category-editor"
                              aria-expanded={editingCategory() === index() ? "true" : "false"}
                              onClick={() => openCategoryEditor(index())}
                            >
                              <code>{category.color}</code>
                            </button>
                            <button
                              disabled={Boolean(busy())}
                              aria-label={`Edit pattern for Category ${index() + 1}`}
                              title="Edit pattern"
                              aria-controls="category-editor"
                              aria-expanded={editingCategory() === index() ? "true" : "false"}
                              onClick={() => openCategoryEditor(index())}
                            >
                              <small>{PATTERN_LABELS[category.pattern]}</small>
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
                <details class="manage">
                  <summary>Rename or delete palette</summary>
                  <div>
                    <input
                      aria-label="New palette name"
                      value={rename()}
                      onInput={(event) => setRename(event.currentTarget.value)}
                      disabled={Boolean(busy())}
                    />
                    <button onClick={renamePalette} disabled={Boolean(busy())}>
                      Rename
                    </button>
                    <button class="danger" onClick={remove} disabled={Boolean(busy())}>
                      Delete palette
                    </button>
                  </div>
                  <p>SVG exports reflect palette renames and deletions.</p>
                </details>
              </>
            ));
            return <>{content()}</>;
          }}
        </Show>
      </main>
    </div>
  );
}
