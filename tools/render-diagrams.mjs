// Renders docs/diagrams/src/*.mmd -> docs/diagrams/*.png using the local Chrome + the mermaid npm package.
// Usage: npm run docs:diagrams   (set CHROME_PATH if Chrome is not in the default macOS location)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(root, 'docs/diagrams/src');
const outDir = path.join(root, 'docs/diagrams');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mermaidJs = path.join(root, 'node_modules/mermaid/dist/mermaid.min.js');

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1800, height: 1200, deviceScaleFactor: 2 });
await page.setContent('<html><body style="margin:0;background:#fff"><div id="out" style="display:inline-block;padding:24px"></div></body></html>');
await page.addScriptTag({ path: mermaidJs });
await page.evaluate(() => window.mermaid.initialize({
  startOnLoad: false, theme: 'base', securityLevel: 'loose',
  themeVariables: {
    fontFamily: 'Arial, sans-serif', fontSize: '14px',
    primaryColor: '#eaf3f1', primaryBorderColor: '#1f5f5b', primaryTextColor: '#1c282c',
    lineColor: '#4b5a5c', secondaryColor: '#fbf3e4', tertiaryColor: '#f6f4ee', clusterBkg: '#f6f4ee', clusterBorder: '#c9c2b2',
  },
  flowchart: { htmlLabels: true, curve: 'basis', wrappingWidth: 400, padding: 18, useMaxWidth: false }, er: { layoutDirection: 'TB', useMaxWidth: false }, sequence: { useMaxWidth: false }, class: { useMaxWidth: false },
}));

for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.mmd'))) {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const svg = await page.evaluate(async (c, id) => (await window.mermaid.render(id, c)).svg, code, file.replace(/\W/g, '_'));
  await page.evaluate((s) => {
    const out = document.getElementById('out');
    out.innerHTML = s;
    // render at the diagram's natural size (some diagram types ignore useMaxWidth)
    const el = out.querySelector('svg');
    const [, , w, h] = (el.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (w && h) { el.style.maxWidth = 'none'; el.setAttribute('width', w); el.setAttribute('height', h); }
  }, svg);
  const el = await page.$('#out');
  const out = path.join(outDir, file.replace('.mmd', '.png'));
  await el.screenshot({ path: out });
  fs.writeFileSync(path.join(outDir, file.replace('.mmd', '.svg')), svg);
  console.log('✔', path.relative(root, out));
}
await browser.close();
