import { createSignal, onSettled, Show } from "solid-js";
import type { Element } from "solid-js";
import { App } from "./App.tsx";
import { Projects } from "./Projects.tsx";
import { createTheme, DEFAULT_BACKGROUND } from "./theme.ts";

export interface NavigationGuard {
  dirty(): boolean;
  busy(): boolean;
  save(): Promise<boolean>;
}
export interface PageProps {
  navigate(route: string): void;
  registerGuard(guard: NavigationGuard): () => void;
}
function currentRoute(): string {
  return window.location.hash.slice(1) || "/";
}
function routeProject(route: string): string | undefined {
  if (route === "/") return "";
  const match = /^\/project\/([^/]+)$/.exec(route);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
export function Workspace(): Element {
  const [route, setRoute] = createSignal(currentRoute());
  const [pending, setPending] = createSignal<string | undefined>();
  const [saving, setSaving] = createSignal(false);
  const [guardError, setGuardError] = createSignal("");
  let guard: NavigationGuard | undefined;
  let dialog: HTMLDialogElement | undefined;
  let historyIndex =
    typeof history.state?.categoryPatternsIndex === "number"
      ? history.state.categoryPatternsIndex
      : 0;
  history.replaceState({ ...history.state, categoryPatternsIndex: historyIndex }, "");
  let traversal: { route: string; index: number } | undefined;
  let restoring = false;
  function routeUrl(next: string): string {
    return `${window.location.pathname}${window.location.search}${next === "/" ? "" : `#${next}`}`;
  }
  function registerGuard(value: NavigationGuard): () => void {
    guard = value;
    return () => {
      if (guard === value) guard = undefined;
    };
  }
  function commit(next: string): void {
    guard = undefined;
    setPending(undefined);
    dialog?.close();
    if (traversal?.route === next) {
      const distance = traversal.index - historyIndex;
      historyIndex = traversal.index;
      traversal = undefined;
      history.go(distance);
    } else {
      traversal = undefined;
      if (currentRoute() !== next) {
        historyIndex++;
        history.pushState({ categoryPatternsIndex: historyIndex }, "", routeUrl(next));
      }
    }
    setRoute(next);
    window.scrollTo(0, 0);
  }
  function navigate(next: string): void {
    if (next === route()) return;
    if (guard?.busy()) {
      traversal = undefined;
      setGuardError("Please wait for the current operation to finish.");
      return;
    }
    if (guard?.dirty()) {
      setPending(next);
      setGuardError("");
      if (!dialog?.open) dialog?.showModal();
    } else commit(next);
  }
  function cancel(): void {
    traversal = undefined;
    setPending(undefined);
    dialog?.close();
  }
  async function saveAndLeave(): Promise<void> {
    if (saving()) return;
    setSaving(true);
    try {
      if (await guard?.save()) commit(pending()!);
      else setGuardError("Changes could not be saved. Close this dialog to review the error.");
    } finally {
      setSaving(false);
    }
  }
  onSettled(() => {
    const changed = () => {
      const next = currentRoute();
      if (restoring) {
        restoring = false;
        if (traversal) navigate(traversal.route);
        return;
      }
      let nextIndex = history.state?.categoryPatternsIndex;
      if (typeof nextIndex !== "number") {
        nextIndex = historyIndex + 1;
        history.replaceState({ ...history.state, categoryPatternsIndex: nextIndex }, "");
      }
      if (next === route()) {
        historyIndex = nextIndex;
        return;
      }
      if (guard?.dirty() || guard?.busy()) {
        traversal = { route: next, index: nextIndex };
        restoring = true;
        history.go(historyIndex - nextIndex);
      } else {
        historyIndex = nextIndex;
        setRoute(next);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("popstate", changed);
    // Manual hash edits can change the route without a popstate event.
    const hashChanged = () => {
      if (!restoring && currentRoute() !== route() && !traversal) changed();
    };
    window.addEventListener("hashchange", hashChanged);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("hashchange", hashChanged);
    };
  });
  return (
    <>
      <Show when={route()} keyed>
        {(active) => {
          const name = routeProject(active);
          return active === "/projects" ? (
            <Projects navigate={navigate} registerGuard={registerGuard} />
          ) : name !== undefined ? (
            <App projectName={name} navigate={navigate} registerGuard={registerGuard} />
          ) : (
            <div class="projects-page" style={createTheme(DEFAULT_BACKGROUND).style}>
              <main>
                <h1>Page not found</h1>
                <button onClick={() => navigate("/projects")}>Open projects</button>
              </main>
            </div>
          );
        }}
      </Show>
      <dialog
        ref={(element) => {
          dialog = element;
        }}
        class="project-dialog"
        style={createTheme(DEFAULT_BACKGROUND).style}
        onCancel={(event) => {
          event.preventDefault();
          if (!saving()) cancel();
        }}
      >
        <h2>Save your changes?</h2>
        <p>You have unsaved changes. Save them before leaving this page, or discard them.</p>
        <Show when={guardError()}>
          <p class="danger" role="alert">
            {guardError()}
          </p>
        </Show>
        <div class="dialog-actions">
          <button disabled={saving()} onClick={cancel}>
            Cancel
          </button>
          <button disabled={saving()} onClick={() => commit(pending()!)}>
            Discard
          </button>
          <button class="primary" disabled={saving()} onClick={() => void saveAndLeave()}>
            {saving() ? "Saving…" : "Save"}
          </button>
        </div>
      </dialog>
      <Show when={guardError() && !pending()}>
        <div class="navigation-notice" role="status">
          {guardError()} <button onClick={() => setGuardError("")}>Dismiss</button>
        </div>
      </Show>
    </>
  );
}
