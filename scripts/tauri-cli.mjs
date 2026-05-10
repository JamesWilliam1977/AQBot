import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

function isBundleCommand() {
  return args[0] === "build" || args[0] === "bundle";
}

function cleanStaleDmgTempFiles() {
  const macosBundleDir = path.join(repoRoot, "src-tauri", "target", "release", "bundle", "macos");
  if (!existsSync(macosBundleDir)) return;

  for (const entry of readdirSync(macosBundleDir)) {
    if (/^rw\..+\.dmg$/.test(entry)) {
      rmSync(path.join(macosBundleDir, entry), { force: true });
    }
  }
}

function hasConfigOverride() {
  return args.some((arg) => arg === "--config" || arg === "-c" || arg.startsWith("--config="));
}

const env = { ...process.env };

if (isBundleCommand()) {
  cleanStaleDmgTempFiles();
  if (!env.TAURI_BUNDLER_DMG_IGNORE_CI) {
    env.CI = "true";
  }
  if (!env.TAURI_SIGNING_PRIVATE_KEY && !hasConfigOverride()) {
    args.push("--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  }
}

const tauriBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);

const child = spawn(tauriBin, args, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
