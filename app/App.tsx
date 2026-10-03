import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import type { Element } from "solid-js";
import { emptyData, isValidName } from "./model.ts";
import type { GenerationRequest } from "./generation.worker.ts";
import type { Palette, PaletteData } from "./model.ts";
import { Preview } from "./Preview.tsx";
import { PATTERN_LABELS, randomCategories, swatchUrl } from "./svg.ts";

import { connector } from "./connector.ts";

export function App(): Element {
  const [data, setData] = createSignal<PaletteData>(emptyData());
  const [selected, setSelected] = createSignal("");
  const [name, setName] = createSignal("scheme8");
  const [count, setCount] = createSignal(8);
  const [rename, setRename] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const palette = createMemo(() => data().palettes.find((item) => item.id === selected()));
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
        staticWorker.postMessage(request);
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
      const colors = await generateColors(length);
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
    if (busy() || !loaded()) return;
    setBusy("Saving…");
    setError("");
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

  return (
    <div class="app">
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
          <p>{dirty() ? "● Unsaved changes" : "Saved"}</p>
          <button
            class="primary"
            disabled={!loaded() || Boolean(busy())}
            onClick={() => void save()}
          >
            Save all palettes
          </button>
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
              <section class="settings">
                <label>
                  Pattern brightness <strong>{Math.round(data().patternLighten * 100)}%</strong>
                  <input
                    aria-label="Pattern brightness"
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={data().patternLighten}
                    disabled={Boolean(busy())}
                    onInput={(event) =>
                      change({
                        ...data(),
                        patternLighten: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </label>
                <p>Amount of white mixed into the base color. Applies to all palettes.</p>
              </section>
              <section class="panel">
                <div class="panel-heading">
                  <h3>Stacked bars</h3>
                  <span>Proportional / equal width · thin bars</span>
                </div>
                <Preview palette={current()} lighten={data().patternLighten} chart="stack" />
              </section>
              <div class="chart-grid">
                <section class="panel">
                  <div class="panel-heading">
                    <h3>Bar chart</h3>
                    <span>Sample values</span>
                  </div>
                  <Preview palette={current()} lighten={data().patternLighten} chart="bars" />
                </section>
                <section class="panel">
                  <div class="panel-heading">
                    <h3>Donut chart</h3>
                  </div>
                  <Preview palette={current()} lighten={data().patternLighten} chart="donut" />
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
                <p>Renames and deletions are applied to SVG files when you save all palettes.</p>
              </details>
            </>
          )}
        </Show>
      </main>
    </div>
  );
}
