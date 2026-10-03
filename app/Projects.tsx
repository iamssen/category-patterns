import { createSignal, flush, For, onSettled, Show } from "solid-js";
import type { Element } from "solid-js";
import { connector } from "./connector.ts";
import { exportProjects } from "./web-connector.ts";
import { outputLines } from "./projects.ts";
import type { Project, TemplateName } from "./projects.ts";
import type { PageProps } from "./Workspace.tsx";
import { createTheme, DEFAULT_BACKGROUND } from "./theme.ts";

function autoSize(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight + 2}px`;
}
export function Projects(props: PageProps): Element {
  const textareaCleanup = new Set<() => void>();
  function setupTextarea(input: HTMLTextAreaElement): void {
    let width = -1;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => autoSize(input));
    });
    observer.observe(input);
    textareaCleanup.add(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    });
  }
  const [projects, setProjects] = createSignal<Project[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [name, setName] = createSignal("");
  const [template, setTemplate] = createSignal<TemplateName>("dark");
  const [outputs, setOutputs] = createSignal("");
  const [drafts, setDrafts] = createSignal<Record<string, string>>({});
  const [exportPaths, setExportPaths] = createSignal<Record<string, string>>({});
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [message, setMessage] = createSignal("");
  let exportDialog: HTMLDialogElement | undefined;
  const dirty = () => Object.keys(drafts()).length > 0;
  async function load(): Promise<void> {
    try {
      setProjects(await connector.list());
      setLoaded(true);
      setError("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to load projects.");
    }
  }
  async function savePaths(): Promise<boolean> {
    if (busy()) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      for (const project of projects()) {
        const draft = drafts()[project.name];
        if (draft === undefined) continue;
        const next = { ...project, outputs: outputLines(draft) };
        await connector.save(next);
        setProjects((items) => items.map((item) => (item.name === next.name ? next : item)));
        setDrafts((items) => {
          const next = { ...items };
          delete next[project.name];
          return next;
        });
      }
      setMessage("Output directories saved. Previous SVGs are cleaned up on the next generation.");
      return true;
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to save directories.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  onSettled(() => {
    const unregister = props.registerGuard({ dirty, busy, save: savePaths });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    void load();
    return () => {
      unregister();
      for (const cleanup of textareaCleanup) cleanup();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  });
  async function create(): Promise<void> {
    if (busy() || !loaded()) return;
    setBusy(true);
    setError("");
    try {
      const project = await connector.create(
        name(),
        template(),
        connector.appMode ? outputLines(outputs()) : [],
      );
      setProjects((items) => [...items, project]);
      setName("");
      setOutputs("");
      setBusy(false);
      flush();
      props.navigate(`/project/${encodeURIComponent(project.name)}`);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to create project.");
    } finally {
      setBusy(false);
    }
  }
  async function startExport(): Promise<void> {
    if (busy()) return;
    setError("");
    setExportPaths(
      Object.fromEntries(projects().map((project) => [project.name, project.outputs.join("\n")])),
    );
    exportDialog?.showModal();
  }
  async function download(): Promise<void> {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      // Reload saved data: project export never captures unsaved palette edits.
      const saved = (await connector.list()).map((project) => ({
        ...project,
        outputs: outputLines(exportPaths()[project.name] ?? ""),
      }));
      if (saved.some((project) => !project.outputs.length))
        throw new Error("Add at least one output directory for every project.");
      await exportProjects(saved);
      for (const project of saved) await connector.save(project);
      setProjects(saved);
      exportDialog?.close();
      setMessage(
        "projects.zip downloaded. Extract its YAML files into ~/category-patterns/, then run the App.",
      );
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Failed to export projects.");
    } finally {
      setBusy(false);
    }
  }
  function directoryInput(project: Project, value: string): void {
    setDrafts((items) => {
      const next = { ...items };
      if (outputLines(value).join("\n") === project.outputs.join("\n")) delete next[project.name];
      else next[project.name] = value;
      return next;
    });
  }
  return (
    <div class="projects-page" style={createTheme(DEFAULT_BACKGROUND).style}>
      <main class="projects-main">
        <header class="projects-header">
          <div>
            <span class="eyebrow">Category Patterns</span>
            <h1>Projects</h1>
            <p>Keep palettes and settings together for each project.</p>
          </div>
          <div class="actions">
            <button disabled={busy()} onClick={() => props.navigate("/")}>
              Open default
            </button>
            <Show when={!connector.appMode}>
              <button
                class="primary"
                disabled={!loaded() || busy()}
                onClick={() => void startExport()}
              >
                Export projects
              </button>
            </Show>
          </div>
        </header>
        <Show when={error() && !exportDialog?.open}>
          <div class="notice error" role="alert">
            {error()}
            <Show when={!loaded()}>
              <button onClick={() => void load()}>Retry</button>
            </Show>
          </div>
        </Show>
        <Show when={message()}>
          <div class="notice" role="status">
            {message()}
          </div>
        </Show>
        <div class="projects-layout">
          <section class="project-library" aria-label="Saved projects">
            <div class="section-heading">
              <h2>Your projects</h2>
              <span>
                {projects().length} {projects().length === 1 ? "project" : "projects"}
              </span>
            </div>
            <Show when={!loaded()}>
              <p>Loading projects…</p>
            </Show>
            <For each={projects()}>
              {(project) => (
                <article class="project-card">
                  <div class="project-card-heading">
                    <div>
                      <h3>{project.name}</h3>
                      <p>
                        {project.data.palettes.length} palettes · {project.data.background}
                      </p>
                    </div>
                    <button
                      disabled={busy()}
                      onClick={() =>
                        props.navigate(
                          project.name === "default"
                            ? "/"
                            : `/project/${encodeURIComponent(project.name)}`,
                        )
                      }
                    >
                      Open →
                    </button>
                  </div>
                  <div class="project-colors" aria-hidden="true">
                    <For
                      each={
                        project.data.palettes.find((item) => item.categories.length === 8)
                          ?.categories ??
                        project.data.palettes[0]?.categories ??
                        []
                      }
                    >
                      {(category) => <i style={{ "background-color": category.color }} />}
                    </For>
                  </div>
                  <Show when={connector.appMode}>
                    <label class="directory-label">
                      Output directories
                      <textarea
                        ref={(element) => setupTextarea(element)}
                        value={drafts()[project.name] ?? project.outputs.join("\n")}
                        rows={Math.max(
                          2,
                          (drafts()[project.name] ?? project.outputs.join("\n")).split("\n").length,
                        )}
                        disabled={busy()}
                        placeholder="~/Workspace/my-project/public/category-patterns"
                        onInput={(event) => {
                          directoryInput(project, event.currentTarget.value);
                          autoSize(event.currentTarget);
                        }}
                      />
                    </label>
                  </Show>
                </article>
              )}
            </For>
            <Show when={connector.appMode}>
              <div class="directory-footer">
                <small>
                  One directory per line. Relative paths start at the project folder. Each project
                  needs its own output directories.
                </small>
                <button
                  class="primary"
                  disabled={!dirty() || busy()}
                  onClick={() => void savePaths()}
                >
                  Save directories
                </button>
              </div>
            </Show>
          </section>
          <section class="project-create panel">
            <h2>Create a project</h2>
            <p>Start with a sample palette, then make it yours.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label>
                Project name
                <input
                  value={name()}
                  onInput={(event) => setName(event.currentTarget.value)}
                  placeholder="e.g. finance"
                  maxlength={64}
                  required
                  disabled={busy()}
                />
              </label>
              <fieldset class="template-picker">
                <legend>Sample palette</legend>
                <For each={["dark", "light"] as const}>
                  {(value) => (
                    <label class={["template-option", { selected: template() === value }]}>
                      <input
                        type="radio"
                        name="template"
                        value={value}
                        checked={template() === value}
                        onChange={() => setTemplate(value)}
                        disabled={busy()}
                      />
                      <span>{value === "dark" ? "Dark" : "Light"}</span>
                    </label>
                  )}
                </For>
              </fieldset>
              <Show when={connector.appMode}>
                <label>
                  Output directories
                  <textarea
                    ref={(element) => setupTextarea(element)}
                    value={outputs()}
                    rows={2}
                    disabled={busy()}
                    placeholder="~/Workspace/my-project/public/category-patterns"
                    onInput={(event) => {
                      setOutputs(event.currentTarget.value);
                      autoSize(event.currentTarget);
                    }}
                  />
                  <small>
                    Optional. One directory per line. Add directories before generating SVGs.
                  </small>
                </label>
              </Show>
              <button class="primary" type="submit" disabled={!loaded() || busy()}>
                Create project
              </button>
            </form>
          </section>
        </div>
        <Show when={!connector.appMode}>
          <p class="project-storage-note">
            Projects are saved in this browser. Export projects to continue working in the local
            App.
          </p>
        </Show>
        <dialog
          ref={(element) => {
            exportDialog = element;
          }}
          class="project-dialog export-dialog"
          onCancel={(event) => {
            if (busy()) event.preventDefault();
            else setError("");
          }}
        >
          <h2>Continue in the App</h2>
          <p>
            Choose SVG output directories for each saved project. Extract projects.zip into{" "}
            <code>~/category-patterns/</code>.
          </p>
          <Show when={error()}>
            <div class="notice error" role="alert">
              {error()}
            </div>
          </Show>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void download();
            }}
          >
            <div class="export-fields">
              <For each={projects()}>
                {(project) => (
                  <label>
                    {project.name}
                    <textarea
                      ref={(element) => setupTextarea(element)}
                      rows={Math.max(2, (exportPaths()[project.name] ?? "").split("\n").length)}
                      required
                      disabled={busy()}
                      value={exportPaths()[project.name] ?? ""}
                      placeholder="~/Workspace/my-project/public/category-patterns"
                      onInput={(event) => {
                        setExportPaths((items) => ({
                          ...items,
                          [project.name]: event.currentTarget.value,
                        }));
                        autoSize(event.currentTarget);
                      }}
                    />
                  </label>
                )}
              </For>
            </div>
            <small>
              One directory per line. Relative paths start at ~/category-patterns/. Use separate
              directories for each project.
            </small>
            <div class="dialog-actions">
              <button
                type="button"
                disabled={busy()}
                onClick={() => {
                  exportDialog?.close();
                  setError("");
                }}
              >
                Cancel
              </button>
              <button class="primary" type="submit" disabled={busy()}>
                {busy() ? "Preparing…" : "Download projects.zip"}
              </button>
            </div>
          </form>
        </dialog>
      </main>
    </div>
  );
}
