import { render } from "@solidjs/web";
import { App } from "./App.tsx";
import "./style.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing app root.");
render(() => <App />, root);
