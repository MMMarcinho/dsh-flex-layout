import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const bundle = await readFile('dist/client.js', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
function fixture(native = false) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%}*{box-sizing:border-box} .host_frame{height:100%;display:grid;position:relative;overflow:hidden;grid-template-columns:56px minmax(0,1fr) 0}
  .host_centerCol{display:flex;min-width:0;grid-column:2;grid-row:1}.host_sidebarCol{grid-column:1;grid-row:1}.host_rightbarCol{grid-column:3;grid-row:1}
  .conv_root{min-width:0;display:flex;flex-direction:column;width:100%}.conv_scrollBody{flex:1;overflow:auto}.conv_composerSeat{flex:none}
  .input_row,.input_standardControls,.input_modes{display:flex;white-space:nowrap}.input_card{width:100%}.input_root{width:100%}pre{width:1200px}
  </style></head><body><div class="host_frame" data-sidebar-collapsed ${native ? 'data-sidebar-drawer' : ''}>
  ${native ? '<div data-sidebar-mask></div>' : ''}<aside class="host_sidebarCol"><button>会话 A</button><button>会话 B</button></aside>
  <main class="host_centerCol"><div class="conv_root"><header class="conv_header"><div class="conv_headerLeading">标题</div></header>
  <div class="conv_scrollBody"><p>长会话</p><pre>very long code</pre></div><div class="conv_composerSeat"><div class="input_root"><div class="input_card"><textarea class="input_input"></textarea>
  <div class="input_standardControls"><div class="input_modes"><button>模式</button><button>权限</button><button>一个很长的模型名字</button></div><button>发送</button></div></div></div></div></div></main>
  <aside class="host_rightbarCol"></aside></div></body></html>`;
}
async function mount(native = false) {
  await page.setContent(fixture(native));
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load({ factory }) { window.plugin = factory(() => {}); } };
    window.toggles = 0;
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    window.stopPlugin = window.plugin.install(document, { toggleSidebar() {
      document.querySelector('.host_frame').toggleAttribute('data-sidebar-collapsed'); window.toggles++;
    } });
  });
}
const settle = () => page.waitForTimeout(80);
try {
  await mount();
  assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), 390);
  assert.equal(await page.locator('[data-dfl="sidebar"]').evaluate(el => el.inert), true);
  assert.equal(await page.locator('[data-dfl="input-modes"]').evaluate(el => getComputedStyle(el).flexWrap), 'wrap');
  await page.locator('[data-dfl-toggle]').click(); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'true');
  assert.ok((await page.locator('[data-dfl-toggle]').boundingBox()).x >= 330, 'open toggle clears sidebar branding');
  assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.inert), true);
  await page.locator('[data-dfl-toggle]').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '会话 A');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-dfl-toggle')), true);
  await page.keyboard.press('Escape'); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false');
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.locator('[data-dfl-backdrop]').click({ position: { x: 380, y: 300 } }); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => {
    const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.style.width = '800px'; dialog.innerHTML = '<p>设置</p>'; document.body.append(dialog);
  }); await settle();
  assert.ok(await page.locator('[data-dfl="dialog"]').evaluate(el => el.getBoundingClientRect().width) <= 390);
  await page.evaluate(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 410, offsetTop: 12, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.dispatchEvent(new Event('resize'));
  }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').evaluate(el => el.clientHeight), 410, 'keyboard viewport height');
  await page.evaluate(() => { window.visualViewport.scale = 2; window.dispatchEvent(new Event('resize')); }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').evaluate(el => el.clientHeight), 844, 'pinch zoom stays browser-owned');
  await page.evaluate(() => { delete window.visualViewport; });
  await page.setViewportSize({ width: 320, height: 640 }); await settle();
  assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), 320);
  await page.setViewportSize({ width: 1280, height: 900 }); await settle();
  assert.equal(await page.locator('html').getAttribute('data-dfl-size'), 'wide');
  assert.equal(await page.locator('[data-dfl="sidebar"]').evaluate(el => el.inert), false);
  assert.equal(await page.locator('[data-dfl-toggle]').isVisible(), false);
  await page.evaluate(() => window.stopPlugin());
  assert.equal(await page.locator('[data-dfl], [data-dfl-owned], [data-dfl-active]').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(true);
  assert.equal(await page.locator('[data-dfl-toggle]').count(), 0, 'native drawer is not replaced');
  assert.equal(await page.locator('[data-sidebar-mask]').count(), 1);
  assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), 334);
  await page.evaluate(() => window.stopPlugin());
  assert.equal(await page.locator('[data-dfl]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: 320/390px grid, wrapping, drawer/focus/Escape/backdrop, inert, dialogs, visual viewport and zoom, desktop resize, native drawer coexistence, teardown');
} finally { await browser.close(); }
