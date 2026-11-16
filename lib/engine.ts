import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
export function pythonPath() {
  return (
    process.env.PYTHON_PATH ||
    path.join(
      process.cwd(),
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    )
  );
}
export async function runEngine(
  job: Record<string, unknown>,
  engine: "process" | "converter" = "process",
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      pythonPath(),
      [path.join(process.cwd(), `engine/${engine}.py`)],
      {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(
        new Error("Processing timed out. Try fewer pages or a smaller file."),
      );
    }, 180000);
    function finish(error?: Error, value?: Record<string, any>) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value!);
    }
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 25_000_000) {
        child.kill();
        finish(new Error("The document preview is too large."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", () =>
      finish(
        new Error(
          "The PDF engine is not installed. Run npm run setup:engine in the project folder.",
        ),
      ),
    );
    child.on("close", () => {
      try {
        const lines = stdout.trim().split("\n");
        const value = JSON.parse(lines[lines.length - 1]);
        if (!value.ok) finish(new Error(value.error));
        else finish(undefined, value);
      } catch {
        console.error("PDF engine:", stderr);
        finish(
          new Error(
            "The processing engine could not read this file. Check its format and try again.",
          ),
        );
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(job));
  });
}
export async function guardOfficeZip(file: string) {
  // File size is bounded before staging. Document parsers run in isolated processes.
  const stat = await fs.stat(file);
  if (stat.size === 0) throw new Error("Empty files cannot be processed.");
}
