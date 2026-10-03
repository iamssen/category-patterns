import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import type { Element } from "solid-js";
import { DEFAULT_GENERATION_SETTINGS, emptyData, isValidName } from "./model.ts";
import type { GenerationRequest } from "./generation.worker.ts";
import type { Palette, PaletteData } from "./model.ts";
import { Preview } from "./Preview.tsx";
import { PATTERN_LABELS, randomCategories, swatchUrl } from "./svg.ts";

import { createTheme, DEFAULT_BACKGROUND } from "./theme.ts";

import { connector } from "./connector.ts";

export function App(): Element {
  const [data, setData] = createSignal<PaletteData>(emptyData());
  const [selected, setSelected] = createSignal("");
  const [name, setName] = createSignal("scheme8");
  const [count, setCount] = createSignal(8);
  const [rename, setRename] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const palette = createMemo(() => data().palettes.find((item) => item.id === selected()));
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
  let worker: Worker | undefined;

  function change(next: PaletteData): void {
    setData(next);
    setDirty(true);
    setMessage("");
  }
  function select(item: Palette): void {
    setSelected(item.id);
    setRename(item.name);
  }
  async function load(): Promise<void> {
    setError("");
    try {
      const result = await connector.load();
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
    void load();
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      worker?.terminate();
      window.removeEventListener("beforeunload", beforeUnload);
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
        categories: randomCategories(colors),
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
    const categories = randomCategories(item.categories.map((category) => category.color));
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
      const next = mode === "color" ? { ...category, color } : randomCategories([color])[0];
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
  async function save(): Promise<void> {
    if (busy() || !loaded() || !dirty()) return;
    setBusy("Saving…");
    setError("");
    setMessage("");
    try {
      await connector.save(data());
      setDirty(false);
      setMessage(`${data().palettes.length} palettes saved.`);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to save.");
    } finally {
      setBusy("");
    }
  }

  async function exportSVGs(): Promise<void> {
    if (busy() || !loaded()) return;
    setBusy(connector.exportProgress);
    setError("");
    setMessage("");
    try {
      await connector.exportSVGs(data());
      setMessage(connector.exportSuccess);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to export SVGs.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div class="app" style={theme().style}>
      <aside class="sidebar">
        <header>
          <span class="eyebrow">Visual asset manager</span>
          <h1>Category Patterns</h1>
          <p>Distinct colors. Subtle patterns.</p>
        </header>
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
          <button type="submit" disabled={!loaded() || Boolean(busy())}>
            ＋ Create palette
          </button>
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
            <button disabled={!loaded() || Boolean(busy())} onClick={() => void exportSVGs()}>
              {connector.exportLabel}
            </button>
          </div>
          <small>{connector.description}</small>
        </footer>
      </aside>
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
            </tbody>
          </table>
          <p class="settings-footer">
            Applies to all palettes. Save to keep these settings.
          </p>
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
          {(current) => (
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
                          disabled={Boolean(busy())}
                          aria-label={`Randomize color for Category ${index() + 1}`}
                          title="Randomize color"
                          onClick={() => void rerollCategory(index(), "color")}
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
                            aria-label={`Randomize color for Category ${index() + 1}`}
                            title="Randomize color"
                            onClick={() => void rerollCategory(index(), "color")}
                          >
                            <code>{category.color}</code>
                          </button>
                          <button
                            disabled={Boolean(busy())}
                            aria-label={`Randomize pattern for Category ${index() + 1}`}
                            title="Randomize pattern"
                            onClick={() => void rerollCategory(index(), "pattern")}
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
          )}
        </Show>
      </main>
    </div>
  );
}
