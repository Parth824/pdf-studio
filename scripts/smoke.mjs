import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const origin = process.env.TEST_URL || "http://127.0.0.1:3000";
const folder = path.resolve("test-output");
mkdirSync(folder, { recursive: true });
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const crossOrigin = await fetch(`${origin}/api/process`, {
    method: "POST",
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(
    crossOrigin.status,
    403,
    "Cross-origin uploads must be rejected",
  );
  const localForm = new FormData();
  localForm.append("tool", "html-pdf");
  localForm.append(
    "options",
    JSON.stringify({ html: "<h1>Local hostname test</h1>" }),
  );
  const localResponse = await fetch("http://localhost:3000/api/process", {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
    body: localForm,
  });
  assert.equal(
    localResponse.status,
    200,
    `localhost uploads must work: ${localResponse.status === 200 ? "" : await localResponse.text()}`,
  );
  console.log("PASS API origin checks and localhost uploads");
  await page.goto(origin, { waitUntil: "networkidle", timeout: 120000 });
  await page.locator(".tool-card").first().waitFor();
  assert.equal(await page.locator(".tool-card").count(), 33);
  await page.screenshot({
    path: path.join(folder, "home-desktop.png"),
    fullPage: true,
  });
  await page.getByLabel("Search PDF tools").fill("merge");
  assert.equal(await page.locator(".tool-card").count(), 1);
  await page.getByLabel("Favorite Merge PDF", { exact: true }).click();
  await page.getByLabel("Search PDF tools").fill("");
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  assert.equal(await page.locator(".tool-card").count(), 1);
  await page
    .getByRole("button", { name: "Show all tools", exact: true })
    .click();
  await page.getByRole("tab", { name: "PDF Security", exact: true }).click();
  assert.equal(await page.locator(".tool-card").count(), 5);
  await page.getByRole("tab", { name: "All tools", exact: true }).click();
  console.log("PASS tool catalogue, search, categories and favorites");
  await page.goto(`${origin}/merge`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page
    .locator("input[type=file]")
    .setInputFiles([
      path.join(folder, "sample.pdf"),
      path.join(folder, "appendix.pdf"),
    ]);
  await page.locator(".thumbnail").first().waitFor({ timeout: 180000 });
  assert.equal(await page.locator(".file-row").count(), 2);
  await page.screenshot({
    path: path.join(folder, "merge-desktop.png"),
    fullPage: true,
  });
  await page.locator(".process-button").click();
  await page
    .getByRole("heading", { name: "Your document is ready." })
    .waitFor({ timeout: 180000 });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(path.join(folder, "merged-browser.pdf"));
  console.log("PASS upload, page previews, merge processing and download");
  await page.goto(`${origin}/workspace`, { waitUntil: "networkidle" });
  assert.ok(
    (await page.locator(".history-row").textContent()).includes("Merge PDF"),
  );
  console.log("PASS local activity history");
  await page.goto(`${origin}/protect`, { waitUntil: "networkidle" });
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(folder, "sample.pdf"));
  await page.locator(".thumbnail").first().waitFor({ timeout: 180000 });
  await page.getByLabel("New password", { exact: true }).fill("browser-secret");
  await page.locator(".process-button").click();
  await page
    .getByRole("heading", { name: "Your document is ready." })
    .waitFor({ timeout: 180000 });
  const protectedEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  await (
    await protectedEvent
  ).saveAs(path.join(folder, "protected-browser.pdf"));
  console.log("PASS password protection through browser");
  await page.goto(`${origin}/workflow`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Save workflow" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(folder, "sample.pdf"));
  await page.getByRole("button", { name: "Run workflow" }).click();
  await page
    .getByRole("link", { name: "Download PDF", exact: true })
    .waitFor({ timeout: 180000 });
  console.log("PASS multistep workflow");
  await page.goto(`${origin}/convert?from=zip&to=rar`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.getByRole("heading", { name: "ZIP to RAR Converter" }).waitFor();
  await page
    .getByRole("button", { name: "Output format", exact: true })
    .click();
  await page.getByLabel("Search output format").fill("rar");
  await page
    .locator(".format-popover")
    .getByRole("button", { name: "RAR", exact: true })
    .click();
  await page.screenshot({
    path: path.join(folder, "converter-desktop.png"),
    fullPage: true,
  });
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(folder, "sample.zip"));
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await page
    .locator(".conversion-row.status-done")
    .waitFor({ timeout: 180000 });
  const rarEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download sample.rar", exact: true })
    .click();
  await (await rarEvent).saveAs(path.join(folder, "browser-archive.rar"));
  const bundleEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all (1)", exact: true })
    .click();
  await (await bundleEvent).saveAs(path.join(folder, "browser-bundle.zip"));
  console.log(
    "PASS format picker, ZIP-to-RAR conversion and batch ZIP download",
  );
  await page.goto(`${origin}/convert?from=png&to=webp`, {
    waitUntil: "networkidle",
  });
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(folder, "scan.png"));
  await page
    .getByRole("button", { name: "Conversion options", exact: true })
    .click();
  await page.getByLabel("Image max width (px)", { exact: true }).fill("320");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await page
    .locator(".conversion-row.status-done")
    .waitFor({ timeout: 180000 });
  const imageEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download scan.webp", exact: true })
    .click();
  await (await imageEvent).saveAs(path.join(folder, "browser-image.webp"));
  console.log("PASS image conversion and resizing through browser");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/convert?from=zip&to=rar`, {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: path.join(folder, "converter-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile converter must not overflow horizontally",
  );
  await page
    .getByRole("button", { name: "Output format", exact: true })
    .click();
  await page.screenshot({
    path: path.join(folder, "converter-mobile-picker.png"),
    fullPage: false,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile format picker must not overflow horizontally",
  );
  await page
    .getByRole("button", { name: "Close formats", exact: true })
    .click();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(folder, "home-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile home must not overflow horizontally",
  );
  await page.goto(`${origin}/rotate`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(folder, "tool-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile tool must not overflow horizontally",
  );
  console.log("PASS mobile layouts");
  assert.deepEqual(errors, [], "No browser runtime errors");
  writeFileSync(
    path.join(folder, "browser-results.json"),
    JSON.stringify({ passed: true, errors, checks: ['API origins', 'tool catalogue', 'favorites', 'PDF merge and download', 'password protection', 'workflow', 'format picker', 'ZIP to RAR', 'batch ZIP', 'image resizing', 'mobile layouts'] }, null, 2),
  );
} finally {
  await browser.close();
}
