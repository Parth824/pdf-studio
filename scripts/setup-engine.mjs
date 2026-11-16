import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const isWindows = process.platform === "win32";
const python = path.join(
  process.cwd(),
  ".venv",
  isWindows ? "Scripts/python.exe" : "bin/python",
);
function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
if (!existsSync(python))
  run(process.env.PYTHON_PATH || (isWindows ? "py" : "python3"), [
    "-m",
    "venv",
    ".venv",
  ]);
run(python, ["-m", "pip", "install", "-r", "engine/requirements.txt"]);
const directory = path.join(process.cwd(), ".runtime/tessdata");
mkdirSync(directory, { recursive: true });
const language = path.join(directory, "eng.traineddata");
if (!existsSync(language)) {
  console.log("Downloading English OCR language data...");
  const response = await fetch(
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata",
  );
  if (!response.ok) throw new Error("OCR data download failed");
  writeFileSync(language, Buffer.from(await response.arrayBuffer()));
}
console.log("PDF engine and English OCR are ready.");
