import { chromium } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = "http://127.0.0.1:3000";
const directory = path.resolve("test-output");
writeFileSync(
  path.join(directory, "local-book.txt"),
  "Expanded local conversion preserves this sentence.\nA second paragraph.",
);
const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capabilities = await (await fetch(`${root}/api/convert`)).json();
  for (const engine of ["office", "calibre", "imagemagick", "archive_native"])
    assert.equal(
      capabilities.engines[engine],
      true,
      `${engine} must be installed`,
    );
  assert.ok(capabilities.routes.docx.includes("doc"));
  assert.ok(capabilities.routes.mobi.includes("txt"));
  assert.ok(capabilities.routes.cpio.includes("zip"));
  assert.ok(capabilities.routes.png.includes("psd"));
  for (const [input, output, file, downloaded] of [
    ["txt", "mobi", "local-book.txt", "extended-browser.mobi"],
    ["png", "psd", "scan.png", "extended-browser.psd"],
    ["txt", "docx", "local-book.txt", "extended-browser.docx"],
    ["docx", "doc", "extended-browser.docx", "extended-browser.doc"],
  ]) {
    await page.goto(`${root}/convert?from=${input}&to=${output}`, {
      waitUntil: "networkidle",
    });
    await page
      .locator("input[type=file]")
      .setInputFiles(path.join(directory, file));
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page
      .locator(".conversion-row.status-done")
      .waitFor({ timeout: 180000 });
    const pending = page.waitForEvent("download");
    await page.locator(".conversion-row a[download]").click();
    await (await pending).saveAs(path.join(directory, downloaded));
  }
  assert.equal(
    readFileSync(path.join(directory, "extended-browser.mobi"))
      .subarray(60, 68)
      .toString(),
    "BOOKMOBI",
  );
  assert.equal(
    readFileSync(path.join(directory, "extended-browser.psd"))
      .subarray(0, 4)
      .toString(),
    "8BPS",
  );
  assert.deepEqual(errors, []);
  assert.equal(readFileSync(path.join(directory, 'extended-browser.doc')).subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1');
  await page.goto(`${root}/convert?from=docx&to=doc`, {
    waitUntil: "networkidle",
  });
  assert.equal(await page.locator('.engine-list .ready').count(), 11);
  const enabledInputs = Object.values(capabilities.routes).filter(outputs => outputs.length).length;
  assert.ok((await page.locator('.local-engines').textContent()).includes(`${enabledInputs} input formats`));
  await page.locator('.local-engines').screenshot({ path: path.join(directory, 'extended-engine-status.png') });
  await page.screenshot({
    path: path.join(directory, "converter-expanded-desktop.png"),
    fullPage: true,
  });
  const report = {
    passed: true,
    engines: capabilities.engines,
    inputFormats: Object.values(capabilities.routes).filter(
      (outputs) => outputs.length,
    ).length,
    conversionPairs: Object.values(capabilities.routes).reduce(
      (count, outputs) => count + outputs.length,
      0,
    ),
    checks: [
      "Installed engine status",
      "New format routes",
      "MOBI browser download",
      "PSD browser download",
      "DOCX and DOC browser downloads",
      "No browser errors",
    ],
  };
  writeFileSync(
    path.join(directory, "extended-browser-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
