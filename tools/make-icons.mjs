/**
 * Génère les PNG de l'app à partir des SVG sources, en les rendant avec Chromium.
 * Usage : npm run icons
 */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ICONS = new URL('../icons/', import.meta.url);

const TARGETS = [
  { source: 'icon.svg', size: 192, output: 'icon-192.png' },
  { source: 'icon.svg', size: 512, output: 'icon-512.png' },
  { source: 'icon-maskable.svg', size: 512, output: 'icon-maskable-512.png' },
  { source: 'icon.svg', size: 180, output: 'apple-touch-icon.png' },
];

const browser = await chromium.launch();

for (const target of TARGETS) {
  const svg = await readFile(fileURLToPath(new URL(target.source, ICONS)), 'utf8');
  const page = await browser.newPage({
    viewport: { width: target.size, height: target.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;padding:0;background:#000}
    svg{display:block;width:${target.size}px;height:${target.size}px}</style>${svg}`);
  const buffer = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: target.size, height: target.size },
  });
  await writeFile(fileURLToPath(new URL(target.output, ICONS)), buffer);
  await page.close();
  process.stdout.write(`${target.output} (${target.size}px)\n`);
}

await browser.close();
