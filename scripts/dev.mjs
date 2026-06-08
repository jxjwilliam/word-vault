import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const viteBin = resolve(rootDir, "node_modules", ".bin", "vite");

const processes = [
  spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "server/index.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
  }),
  spawn(viteBin, ["--host", "127.0.0.1"], {
    cwd: rootDir,
    stdio: "inherit",
  }),
];

const stopAll = () => {
  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stopAll();
      process.exit(code);
    }
  });
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});
