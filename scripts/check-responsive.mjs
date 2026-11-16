import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';

const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/convert?from=zip&to=rar');
  const failures = [];
  for (const width of [320, 375, 390, 414, 600, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Input format', 'Output format']) {
      await page.getByRole('button', { name, exact: true }).click();
      const bounds = await page.locator('.format-popover').boundingBox();
      if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width) failures.push({ width, name, bounds });
      if (width === 320 && name === 'Output format') {
        await page.screenshot({ path: 'test-output/converter-mobile-320-picker.png' });
      }
      await page.getByRole('button', { name: 'Close formats', exact: true }).click();
    }
  }
  console.log(JSON.stringify({ failures }, null, 2));
  writeFileSync('test-output/responsive-results.json', JSON.stringify({ widths: [320, 375, 390, 414, 600, 768], failures }, null, 2));
  assert.equal(failures.length, 0, 'Format menus must fit on screen');
} finally {
  await browser.close();
}
