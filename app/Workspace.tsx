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
  const [pending, setPending] = createSignal<
    { type: "navigate"; route: string } | { type: "refresh" } | undefined
  >();
  const [saving, setSaving] = createSignal(false);
  const [guardError, setGuardError] = createSignal("");
  const [needRefresh, setNeedRefresh] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  let updateSW: (() => Promise<void>) | undefined;
  let updateActivated = false;
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
      setPending({ type: "navigate", route: next });
      setGuardError("");
      if (!dialog?.open) dialog?.showModal();
    } else commit(next);
  }
  function cancel(): void {
    traversal = undefined;
    setPending(undefined);
    dialog?.close();
  }
  async function refreshApp(): Promise<void> {
    if (refreshing()) return;
    setPending(undefined);
    dialog?.close();
    setGuardError("");
    setRefreshing(true);
    if (updateActivated) {
      window.location.reload();
      return;
    }
    try {
      await updateSW?.();
    } catch {
      setRefreshing(false);
      setGuardError("Could not update the app. Please try again.");
    }
  }
  function requestRefresh(): void {
    if (refreshing() || pending()) return;
    if (guard?.busy()) {
      setGuardError("Please wait for the current operation to finish.");
      return;
    }
    if (guard?.dirty()) {
      setPending({ type: "refresh" });
      setGuardError("");
      dialog?.showModal();
    } else void refreshApp();
  }
  async function saveAndLeave(): Promise<void> {
    if (saving()) return;
    setSaving(true);
    try {
      if (await guard?.save()) {
        const action = pending();
        if (action?.type === "refresh") await refreshApp();
        else if (action) commit(action.route);
      } else setGuardError("Changes could not be saved. Close this dialog to review the error.");
    } finally {
      setSaving(false);
    }
  }
  onSettled(() => {
    let disposed = false;
    let controlled = Boolean(navigator.serviceWorker?.controller);
    let registration: ServiceWorkerRegistration | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const checkUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !registration?.installing)
        void registration?.update().catch(() => {
          /* Try again when online or focused. */
        });
    };
    const controllerChanged = () => {
      const isUpdate = controlled || needRefresh();
      controlled = true;
      if (!isUpdate) return;
      updateActivated = true;
      if (refreshing()) window.location.reload();
      else setNeedRefresh(true);
    };
    if (import.meta.env.PROD && import.meta.env.MODE === "web") {
      void import("virtual:pwa-register").then(({ registerSW }) => {
        if (disposed) return;
        updateSW = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
          // Handle controllerchange directly, including updates in a first-visit tab.
          onNeedReload: () => {},
          onRegisteredSW: (_url, value) => {
            if (disposed) return;
            registration = value;
            checkUpdate();
            interval = setInterval(checkUpdate, 60 * 60 * 1000);
          },
        });
      });
      window.addEventListener("focus", checkUpdate);
      window.addEventListener("online", checkUpdate);
      document.addEventListener("visibilitychange", checkUpdate);
      navigator.serviceWorker?.addEventListener("controllerchange", controllerChanged);
    }
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
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("focus", checkUpdate);
      window.removeEventListener("online", checkUpdate);
      document.removeEventListener("visibilitychange", checkUpdate);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
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
        <p>
          {pending()?.type === "refresh"
            ? "Save your changes before refreshing the app."
            : "You have unsaved changes. Save them before leaving this page, or discard them."}
        </p>
        <Show when={guardError()}>
          <p class="danger" role="alert">
            {guardError()}
          </p>
        </Show>
        <div class="dialog-actions">
          <button disabled={saving()} onClick={cancel}>
            Cancel
          </button>
          <Show when={pending()?.type === "navigate"}>
            <button
              disabled={saving()}
              onClick={() => {
                const action = pending();
                if (action?.type === "navigate") commit(action.route);
              }}
            >
              Discard
            </button>
          </Show>
          <button class="primary" disabled={saving()} onClick={() => void saveAndLeave()}>
            {saving() ? "Saving…" : pending()?.type === "refresh" ? "Save and refresh" : "Save"}
          </button>
        </div>
      </dialog>
      <Show when={needRefresh()}>
        <div class="pwa-update" role="status" style={createTheme(DEFAULT_BACKGROUND).style}>
          <span>A new version is available.</span>
          <button class="primary" disabled={refreshing()} onClick={requestRefresh}>
            {refreshing() ? "Refreshing…" : "Refresh app"}
          </button>
        </div>
      </Show>
      <Show when={guardError() && !pending()}>
        <div class="navigation-notice" role="status">
          {guardError()} <button onClick={() => setGuardError("")}>Dismiss</button>
        </div>
      </Show>
    </>
  );
}
