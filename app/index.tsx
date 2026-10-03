import { render } from "@solidjs/web";
import { Workspace } from "./Workspace.tsx";
import "./style.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing app root.");
render(() => <Workspace />, root);
