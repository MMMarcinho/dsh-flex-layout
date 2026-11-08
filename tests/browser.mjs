import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const bundle = await readFile('dist/client.js', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const settle = () => page.waitForTimeout(100);
const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3zM9 4v16"/></svg>';
function composer(id) {
  return `<div class="conv_composerSeat" data-composer-seat><div class="input_root" data-editor-id="${id}"><div class="input_card"><div class="input_grow"><div class="input_scroll"><div class="input_input" role="textbox" contenteditable="true" aria-label="Draft ${id}"></div></div></div><div class="input_row"><div class="input_standardControls"><div class="input_modes"><button>模式</button><button>权限</button><button>模型</button></div><div class="input_trailing"><button>发送</button></div></div></div></div><div data-composer-dock><span data-composer-stat><button class="stats_pill"><span class="stats_label">当前工作目录 /Users/example/projects/a-very-long-project-name-without-natural-breaks</span></button></span><span data-composer-stat><button class="stats_pill"><span class="stats_label">上下文使用情况 123,456 / 200,000 tokens</span></button></span></div></div></div>`;
}
function conversation(id) {
  return `<div class="conv_root"><header class="conv_header"><div class="conv_headerLeading">标题 ${id}</div></header><div class="conv_body" data-conversation-content><div class="conv_scrollBody" data-conversation-scroll><p>长会话</p><pre>very long code</pre></div>${composer(id)}</div></div>`;
}
function fixture({ native = false, nativeClose = true, multiple = false } = {}) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%}*{box-sizing:border-box}button{font:inherit}.host_frame{height:100%;display:grid;position:relative;overflow:hidden;grid-template-columns:56px minmax(0,1fr) 0}
  .host_centerCol{display:flex;min-width:0;grid-column:2;grid-row:1}.host_sidebarCol{grid-column:1;grid-row:1}.host_rightbarCol{grid-column:3;grid-row:1}
  .conv_root,.conv_body{min-width:0;min-height:0;display:flex;flex-direction:column;flex:1}.conv_headerLeading{display:flex;align-items:center;gap:6px;height:40px}.conv_scrollBody{flex:1;min-height:0;overflow:auto}.conv_composerSeat{flex:none}
  .input_row,.input_standardControls,.input_modes{display:flex;white-space:nowrap}.input_standardControls{width:100%;justify-content:space-between}.input_card{width:100%;display:flex;flex-direction:column}.input_root{width:100%}.input_input{min-height:40px;white-space:pre-wrap;line-height:20px}.input_scroll{overflow:hidden}pre{width:1200px}
  [data-composer-dock]{display:flex}.stats_pill{display:flex;white-space:nowrap;max-width:100%;border:0}.stats_label{overflow:hidden;text-overflow:ellipsis;min-width:0}.sidebar_toggle{width:28px;height:28px}.sidebar_toggle svg{width:18px;height:18px}
  [data-sidebar-right-panel]{position:absolute;right:0;top:50px;width:640px;height:200px;display:none}
  </style></head><body><div class="host_frame" data-sidebar-collapsed ${native ? 'data-sidebar-drawer' : ''}>
  ${native ? '<div data-sidebar-mask></div>' : ''}<aside class="host_sidebarCol"><div>${nativeClose ? `<button class="sidebar_toggle" aria-label="Native sidebar toggle">${icon}</button>` : ''}<button data-row-key="session:a">会话 A</button><button data-row-key="session:b">会话 B</button></div></aside>
  <main class="host_centerCol">${conversation('primary')}${multiple ? conversation('embedded') : ''}</main><aside class="host_rightbarCol"><section data-sidebar-right-panel></section></aside></div></body></html>`;
}
async function mount(options) {
  await page.setContent(fixture(options));
  await page.evaluate(() => {
    window.nativeRaf ??= window.requestAnimationFrame.bind(window);
    window.rafRequests = 0;
    window.requestAnimationFrame = callback => { window.rafRequests++; return window.nativeRaf(callback); };
    window.__ModuleLoader__ = { load({ factory }) { window.plugin = factory(() => {}); } };
    window.toggles = 0;
    window.toggleSidebar = () => { document.querySelector('.host_frame').toggleAttribute('data-sidebar-collapsed'); window.toggles++; };
    document.querySelector('.sidebar_toggle')?.addEventListener('click', window.toggleSidebar);
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => { window.stopPlugin = window.plugin.install(document, { toggleSidebar: window.toggleSidebar }); });
  await settle();
}
async function clean() {
  await page.evaluate(() => window.stopPlugin());
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => a.name.startsWith('data-dfl')).map(a => a.name))), [], 'all owned attributes removed');
  assert.equal(await page.locator('[inert]').count(), 0, 'inert restored');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('*')].some(el => [...el.style].some(key => key.startsWith('--dfl-')))), false, 'all measured CSS variables removed');
  assert.equal(await page.locator('#dfl-sidebar').count(), 0, 'generated ID removed');
}
async function checkComposer(width) {
  const metrics = await page.locator('[data-editor-id="primary"]').evaluate(root => {
    const scroll = root.querySelector('.input_scroll'), editor = root.querySelector('.input_input');
    const labels = [...root.querySelectorAll('.stats_label')];
    return { left: root.getBoundingClientRect().left, right: root.getBoundingClientRect().right, scrollHeight: scroll.scrollHeight, height: scroll.clientHeight, overflow: getComputedStyle(scroll).overflowY, editorWidth: editor.getBoundingClientRect().width, width: root.clientWidth, labels: labels.map(el => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).fontSize), overflow: getComputedStyle(el).overflow, ellipsis: getComputedStyle(el).textOverflow })), wrap: getComputedStyle(root.querySelector('.input_modes')).flexWrap };
  });
  assert.ok(metrics.left >= 0 && metrics.right <= width, `composer fits ${width}px`);
  assert.ok(metrics.editorWidth <= metrics.width, 'editor fits composer');
  assert.ok(metrics.scrollHeight > metrics.height && metrics.height >= 36, 'long draft has bounded scroll region');
  assert.equal(metrics.overflow, 'auto');
  assert.equal(metrics.wrap, 'nowrap', 'host controls keep native compact layout');
  if (width <= 430) assert.ok(metrics.labels.some(label => label.height > label.lineHeight * 1.5), 'long footer labels wrap on phones');
  assert.ok(metrics.labels.every(label => label.overflow === 'visible' && label.ellipsis === 'clip'), 'footer labels are not ellipsized');
  await page.locator('[data-editor-id="primary"] .input_scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator('[data-editor-id="primary"] .input_scroll').evaluate(el => el.scrollTop > 0), 'last draft lines reachable');
}
try {
  const draft = Array.from({ length: 28 }, (_, i) => `第 ${i + 1} 行 ${'longword'.repeat(12)}`).join('\n');
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await mount();
    const idleFrames = await page.evaluate(() => window.rafRequests); await settle();
    assert.ok(await page.evaluate(() => window.rafRequests) <= idleFrames + 1, 'owned hidden attributes do not cause an idle layout loop');
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), width);
    assert.equal(await page.locator('[data-dfl="sidebar"]').evaluate(el => el.inert), true);
    const toggle = page.locator('[data-dfl-toggle]');
    assert.equal(await toggle.getAttribute('data-dfl-inline'), 'true');
    assert.equal(await toggle.locator('svg').evaluate(el => el.outerHTML), await page.locator('.host_sidebarCol svg').evaluate(el => el.outerHTML), 'native glyph reused');
    assert.deepEqual(await toggle.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, position: getComputedStyle(el).position })), { width: 32, height: 32, position: 'static' });
    await page.getByRole('textbox', { name: 'Draft primary' }).fill(draft);
    await checkComposer(width);
    await toggle.click(); await settle();
    assert.equal(await toggle.isVisible(), false, 'native close replaces fallback while open');
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.inert), true);
    await page.getByRole('button', { name: 'Native sidebar toggle' }).click(); await settle();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); await settle();
    await page.getByRole('button', { name: '会话 A' }).click(); await settle();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'session selection closes drawer');
    await page.locator('[data-sidebar-right-panel]').evaluate(el => { el.style.display = 'block'; });
    assert.ok((await page.locator('[data-sidebar-right-panel]').boundingBox()).width <= width - 16, 'right panel bounded');
    await clean();
  }
  await page.setViewportSize({ width: 390, height: 844 }); await mount({ nativeClose: false });
  await page.locator('[data-dfl-toggle]').click(); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').evaluate(el => !!el.closest('[inert]')), false, 'fallback close must escape inert center');
  await page.locator('[data-dfl-toggle]').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '会话 A');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-dfl-toggle')), true);
  await page.keyboard.press('Escape'); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false');
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.locator('[data-dfl-toggle]').click(); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false', 'fallback close is pointer-accessible');
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('data-dfl-inline'), 'true', 'fallback returns inline after close');
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.locator('[data-dfl-backdrop]').click({ position: { x: 380, y: 300 } }); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false');
  await clean();

  for (const [width, height] of [[667, 375], [844, 390], [932, 430]]) {
    await page.setViewportSize({ width: height, height: width }); await mount();
    await page.getByRole('textbox', { name: 'Draft primary' }).fill(draft);
    await page.setViewportSize({ width, height }); await settle();
    assert.equal(await page.locator('html').getAttribute('data-dfl-size'), 'compact', 'touch landscape stays compact');
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), width);
    await checkComposer(width);
    await page.setViewportSize({ width: height, height: width }); await settle();
    assert.equal(await page.getByRole('textbox', { name: 'Draft primary' }).innerText(), draft, 'rotation preserves draft');
    await clean();
  }

  await page.setViewportSize({ width: 390, height: 844 }); await mount({ multiple: true });
  for (const role of ['conversation-root', 'input-root', 'input-scroll', 'input-input']) assert.equal(await page.locator(`[data-dfl="${role}"]`).count(), 2, `both embedded ${role} regions adapted`);
  await clean();
  await mount();
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.evaluate(() => {
    const view = document.createElement('div'); view.dataset.canvasConversationView = '';
    view.innerHTML = '<div class="chat-stage"></div><div class="chat-dock" style="height:64px"></div>';
    document.querySelector('.conv_scrollBody').append(view);
  }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').getAttribute('data-dfl-canvas'), 'true');
  assert.equal(await page.locator('[data-dfl-toggle]').isVisible(), false);
  assert.equal(await page.locator('[data-dfl-backdrop]').isVisible(), false);
  assert.equal(await page.locator('[inert]').count(), 0, 'canvas owns interaction, no inert layers');
  assert.equal(await page.locator('[data-canvas-conversation-view]').evaluate(el => el.style.getPropertyValue('--dfl-canvas-dock-height')), '64px');
  await page.locator('.chat-dock').evaluate(el => { el.style.height = '96px'; }); await settle();
  assert.equal(await page.locator('[data-canvas-conversation-view]').evaluate(el => el.style.getPropertyValue('--dfl-canvas-dock-height')), '96px', 'dock measurement follows resize');
  await clean();

  await mount();
  await page.evaluate(() => { const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.style.width = '800px'; dialog.textContent = '设置'; document.body.append(dialog); }); await settle();
  assert.ok((await page.locator('[data-dfl="dialog"]').boundingBox()).width <= 390);
  await page.evaluate(() => { const viewport = new EventTarget(); Object.assign(viewport, { height: 410, offsetTop: 12, scale: 1 }); Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport }); window.dispatchEvent(new Event('resize')); }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').evaluate(el => el.clientHeight), 410, 'keyboard viewport height');
  await page.evaluate(() => { window.visualViewport.scale = 2; window.dispatchEvent(new Event('resize')); }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').evaluate(el => el.clientHeight), 844, 'pinch zoom stays browser-owned');
  await page.evaluate(() => { delete window.visualViewport; });
  await page.setViewportSize({ width: 1280, height: 900 }); await settle();
  assert.equal(await page.locator('html').getAttribute('data-dfl-size'), 'wide');
  assert.equal(await page.locator('[data-dfl="sidebar"]').evaluate(el => el.inert), false);
  assert.equal(await page.locator('[data-dfl-toggle]').isVisible(), false);
  await clean();

  await page.setViewportSize({ width: 390, height: 844 }); await mount({ native: true });
  assert.equal(await page.locator('[data-dfl-toggle], [data-dfl-backdrop]').count(), 0, 'native drawer is not replaced');
  assert.equal(await page.locator('[data-sidebar-mask]').count(), 1);
  assert.equal(await page.locator('[data-dfl="center"]').evaluate(el => el.clientWidth), 334);
  await page.evaluate(() => { document.querySelector('.host_frame').removeAttribute('data-sidebar-drawer'); document.querySelector('[data-sidebar-mask]').remove(); }); await settle();
  assert.equal(await page.locator('[data-dfl="frame"]').getAttribute('data-dfl-legacy'), 'false', 'native capability persists across breakpoint changes');
  assert.equal(await page.locator('[data-dfl-toggle]').count(), 0);
  await clean();
  // Only an actually visible, interactive portal may suspend drawer keys.
  await mount({ nativeClose: false });
  for (const state of ['display-none', 'visibility-hidden', 'inert']) {
    await page.evaluate(state => {
      const menu = document.createElement('div'); menu.id = 'portal-menu'; menu.setAttribute('role', 'menu'); menu.textContent = 'Portal menu';
      if (state === 'display-none') menu.style.display = 'none';
      if (state === 'visibility-hidden') menu.style.visibility = 'hidden';
      if (state === 'inert') menu.inert = true;
      document.body.append(menu);
    }, state);
    await page.locator('[data-dfl-toggle]').click(); await settle();
    await page.locator('[data-dfl-toggle]').focus(); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '会话 B', `${state} menu does not disable drawer focus trap`);
    await page.keyboard.press('Escape'); await settle();
    assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'false', `${state} menu does not swallow drawer Escape`);
    await page.locator('#portal-menu').evaluate(el => el.remove());
  }
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.evaluate(() => {
    const menu = document.createElement('div'); menu.id = 'portal-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = '<button>Portal action</button>'; document.body.append(menu);
    window.portalEscapePrevented = null;
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') queueMicrotask(() => { window.portalEscapePrevented = event.defaultPrevented; }); });
    menu.querySelector('button').focus();
  }); await settle();
  await page.keyboard.press('Escape'); await settle();
  assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('aria-expanded'), 'true', 'visible non-inert portal owns Escape');
  assert.equal(await page.evaluate(() => window.portalEscapePrevented), false, 'drawer does not prevent portal Escape');
  await page.locator('#portal-menu').evaluate(el => el.remove());
  await page.keyboard.press('Escape'); await settle();
  await clean();

  // Replacing a frame must synchronize even an identical glyph into the NEW control.
  await mount();
  for (const replacementIcon of [icon, icon.replace('M3 4h18v16H3zM9 4v16', 'M4 5h16v14H4zM10 5v14')]) {
    await page.evaluate(markup => {
      const parsed = new DOMParser().parseFromString(markup, 'text/html');
      document.querySelector('.host_frame').replaceWith(document.importNode(parsed.querySelector('.host_frame'), true));
      document.querySelector('.sidebar_toggle').addEventListener('click', window.toggleSidebar);
    }, fixture().replace(icon, replacementIcon)); await settle();
    assert.equal(await page.locator('[data-dfl-toggle]').count(), 1, 'one fallback after frame replacement');
    assert.equal(await page.locator('[data-dfl-toggle] svg').evaluate(el => el.outerHTML), await page.locator('.host_sidebarCol svg').evaluate(el => el.outerHTML), 'replacement native glyph resynchronized');
    assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('class'), 'sidebar_toggle', 'replacement native classes resynchronized');
  }
  await clean();

  // Preserve exact host-owned values and CSS priorities, not merely their presence.
  await mount(); await clean();
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-dfl-active', 'preexisting-active');
    document.documentElement.setAttribute('data-dfl-size', 'preexisting-size');
    document.documentElement.style.setProperty('--dfl-height', '777px', 'important');
    document.documentElement.style.setProperty('--dfl-top', '13px', 'important');
    document.documentElement.style.setProperty('--host-unrelated', 'preserve-me');
    document.querySelector('.host_frame').setAttribute('data-dfl-open', 'preexisting-open');
    document.querySelector('.host_frame').setAttribute('data-dfl', 'preexisting-frame');
    document.querySelector('.host_sidebarCol').id = 'host-sidebar-id';
    document.querySelector('.host_rightbarCol').inert = true;
  });
  const snapshot = () => page.evaluate(() => [...document.querySelectorAll('*')].map(el => ({
    attributes: [...el.attributes].filter(a => a.name.startsWith('data-dfl') || a.name === 'id' || a.name === 'inert').map(a => [a.name, a.value]).sort(),
    variables: [...el.style].filter(key => key.startsWith('--')).map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]).sort(),
  })));
  const before = await snapshot();
  await page.evaluate(() => { window.stopPlugin = window.plugin.install(document, { toggleSidebar: window.toggleSidebar }); }); await settle();
  await page.locator('[data-dfl-toggle]').click(); await settle();
  await page.evaluate(() => window.stopPlugin());
  assert.deepEqual(await snapshot(), before, 'attributes, root CSS variable values/priorities, original ID and inert restored exactly');
  await page.evaluate(() => {
    const view = document.createElement('div'); view.dataset.canvasConversationView = '';
    view.style.setProperty('--dfl-canvas-dock-height', '27px', 'important');
    view.innerHTML = '<div class="chat-dock" style="height:64px"></div>';
    document.querySelector('.conv_scrollBody').append(view);
  });
  const beforeCanvas = await snapshot();
  await page.evaluate(() => { window.stopPlugin = window.plugin.install(document, { toggleSidebar: window.toggleSidebar }); }); await settle();
  assert.equal(await page.locator('[data-canvas-conversation-view]').evaluate(el => el.style.getPropertyValue('--dfl-canvas-dock-height')), '64px');
  await page.evaluate(() => window.stopPlugin());
  assert.deepEqual(await snapshot(), beforeCanvas, 'preexisting measured canvas variable and priority restored exactly');
  assert.deepEqual(errors, []);
  console.log('PASS: four phone widths; touch landscape/rotation/draft; native icon/close and fallback focus; session/Escape/backdrop; long editor/footer/right panel; multiple composers; canvas/inert/dock resize; keyboard/zoom/desktop; native drawer coexistence; portal keyboard arbitration; frame replacement; exact teardown restoration');
} finally { await browser.close(); }
