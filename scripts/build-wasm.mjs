import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const crate = path.join(root, "libs/colors");
const pkg = path.join(crate, "pkg");
const env = { ...process.env };

// Resolve Homebrew's keg-only rustup without editing the user's shell.
try {
  execFileSync("rustup", ["--version"], { env, stdio: "pipe" });
  execFileSync("cargo", ["--version"], { cwd: root, env, stdio: "pipe" });
} catch {
  try {
    const prefix = execFileSync("brew", ["--prefix", "rustup"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    env.PATH = `${path.join(prefix, "bin")}${path.delimiter}${env.PATH ?? ""}`;
    execFileSync("rustup", ["--version"], { env, stdio: "pipe" });
    execFileSync("cargo", ["--version"], { cwd: root, env, stdio: "pipe" });
  } catch {
    throw new Error(
      "Rustup is required. Install it and make it available on PATH (macOS: brew install rustup).",
    );
  }
}

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(file) : [file];
    });
}

const inputs = [
  ...sources(path.join(crate, "src")),
  path.join(crate, "Cargo.toml"),
  path.join(crate, "Cargo.lock"),
  path.join(root, "rust-toolchain.toml"),
  path.join(root, "node_modules/wasm-pack/package.json"),
  fileURLToPath(import.meta.url),
];
const hash = createHash("sha256");
for (const file of inputs) hash.update(file).update(readFileSync(file));
const fingerprint = hash.digest("hex");
const stamp = path.join(pkg, ".build-fingerprint");
const outputs = [
  "category_patterns_colors.js",
  "category_patterns_colors.d.ts",
  "category_patterns_colors_bg.wasm",
];
if (
  existsSync(stamp) &&
  readFileSync(stamp, "utf8") === fingerprint &&
  outputs.every((file) => existsSync(path.join(pkg, file)))
) {
  process.exit(0);
}

execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules/wasm-pack/run.js"),
    "build",
    crate,
    "--target",
    "web",
    "--release",
    "--",
    "--locked",
  ],
  { cwd: root, env, stdio: "inherit" },
);
writeFileSync(stamp, fingerprint);
