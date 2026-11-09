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
  const stats = [['activity', '10 轮 405 步 · 总耗时 2 小时 16 分钟'], ['usage', '1.21M tok · 缓存命中 98.76% · 输入 987654 输出 223456'], ['context', '45%']];
  return `<div class="conv_composerSeat" data-composer-seat><div class="input_root" data-editor-id="${id}"><div class="input_card"><div class="input_grow"><div class="input_scroll"><div class="input_input" role="textbox" contenteditable="true" aria-label="Draft ${id}"></div></div></div><div class="input_row"><div class="input_standardControls"><div class="input_modes"><button>模式</button><button>权限</button><button>模型</button></div><div class="input_trailing"><button>发送</button></div></div></div></div><div data-composer-dock>${stats.map(([kind, label]) => `<span ${kind === 'context' ? '' : `data-composer-stat="${kind}"`}><button class="${kind === 'context' ? 'context_pill' : 'stats_pill'}" aria-label="${kind} details ${id}" aria-haspopup="dialog"><span class="${kind === 'context' ? 'context_label' : 'stats_label'}">${label}</span></button></span>`).join('')}</div></div></div>`;
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
    window.nativeStatClicks = {};
    window.nativeStats = [...document.querySelectorAll('[data-composer-dock] button')];
    window.nativeDockMarkup = document.querySelector('[data-composer-dock]').innerHTML;
    for (const button of window.nativeStats) button.addEventListener('click', () => {
      const name = button.getAttribute('aria-label');
      window.nativeStatClicks[name] = (window.nativeStatClicks[name] || 0) + 1;
    });
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
  assert.equal(await page.locator('[id^="dfl-stats-"]').count(), 0, 'generated stats IDs removed');
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
  await checkStats('primary', false);
  await page.locator('[data-editor-id="primary"] .input_scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await page.locator('[data-editor-id="primary"] .input_scroll').evaluate(el => el.scrollTop > 0), 'last draft lines reachable');
}
async function checkStats(id, expanded) {
  const root = page.locator(`[data-editor-id="${id}"]`);
  const toggle = root.locator('button[data-dfl-stats-toggle]');
  assert.equal(await toggle.count(), 1, `one stats toggle for ${id}`);
  assert.equal(await toggle.getAttribute('aria-expanded'), String(expanded));
  assert.equal(await toggle.getAttribute('type'), 'button', 'stats toggle never submits a draft');
  assert.equal(await toggle.getAttribute('aria-controls'), await root.locator('[data-composer-dock]').getAttribute('id'), 'disclosure controls its own native dock');
  assert.ok(await toggle.getAttribute('aria-label') || await toggle.innerText(), 'stats toggle has an accessible name');
  const geometry = await root.evaluate(root => {
    const dock = root.querySelector('[data-composer-dock]');
    return {height: dock.getBoundingClientRect().height, buttons: [...root.querySelectorAll('button[aria-haspopup="dialog"]')].map(button => ({same: window.nativeStats.includes(button), top: button.getBoundingClientRect().top, height: button.getBoundingClientRect().height, ellipsis: getComputedStyle(button.querySelector('span')).textOverflow, kind: button.getAttribute('aria-label').split(' ')[0]}))};
  });
  assert.equal(geometry.buttons.length, 3, 'all three native statistics controls remain mounted');
  assert.ok(geometry.buttons.every(button => button.same), 'original statistics buttons and their listeners survive');
  if (!expanded) assert.ok(geometry.height <= 36, `collapsed stats take one compact row: ${JSON.stringify(geometry)}`);
  else {
    assert.ok(geometry.buttons.every(button => button.ellipsis !== 'ellipsis'), 'expanded statistics retain full labels');
    const activity = geometry.buttons.find(button => button.kind === 'activity');
    const usage = geometry.buttons.find(button => button.kind === 'usage');
    const context = geometry.buttons.find(button => button.kind === 'context');
    assert.ok(usage.top >= activity.top + activity.height - 1, 'expanded activity and usage occupy two rows');
    assert.ok(Math.abs(usage.top + usage.height / 2 - context.top - context.height / 2) <= 1, 'usage and context share the second row');
    const endpoints = await root.locator('[data-dfl="stat-pill"]').evaluateAll(buttons => buttons.map(button => {
      const label = button.querySelector('[data-dfl="stat-label"]'), node = label.firstChild;
      const glyph = last => { const range = document.createRange(); range.setStart(node, last ? node.length - 1 : 0); range.setEnd(node, last ? node.length : 1); return range.getBoundingClientRect().toJSON(); };
      button.scrollLeft = 0; const first = glyph(false), box = button.getBoundingClientRect().toJSON();
      button.scrollLeft = button.scrollWidth; const last = glyph(true), scrolled = button.scrollLeft; button.scrollLeft = 0;
      return {first, last, box, scrolled, overflow: getComputedStyle(button).overflowX};
    }));
    assert.ok(endpoints.every(item => item.first.left >= item.box.left - 1 && item.last.right <= item.box.right + 1), `full statistics remain reachable within each native pill: ${JSON.stringify(endpoints)}`);
  }
  return geometry;
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
  // A native disclosure keeps the default footer compact and preserves the
  // host's three original detail actions, including keyboard activation.
  await page.setViewportSize({width: 390, height: 844}); await mount();
  await page.getByRole('textbox', {name: 'Draft primary'}).fill(draft);
  const statsToggle = page.locator('[data-editor-id="primary"] [data-dfl-stats-toggle]');
  const collapsedStats = await checkStats('primary', false);
  await statsToggle.focus(); await page.keyboard.press('Enter'); await settle();
  const expandedStats = await checkStats('primary', true);
  assert.ok(expandedStats.height > collapsedStats.height, 'details expand only on request');
  for (const kind of ['activity', 'usage', 'context']) {
    await page.getByRole('button', {name: `${kind} details primary`, exact: true}).click();
    assert.equal(await page.evaluate(name => window.nativeStatClicks[name], `${kind} details primary`), 1, `native ${kind} listener retained`);
  }
  await page.setViewportSize({width: 844, height: 390}); await settle(); await checkStats('primary', true);
  await page.setViewportSize({width: 390, height: 844}); await settle(); await checkStats('primary', true);
  assert.equal(await page.getByRole('textbox', {name: 'Draft primary'}).innerText(), draft, 'stats and rotation preserve draft');
  await statsToggle.focus(); await page.keyboard.press('Space'); await settle(); await checkStats('primary', false);
  for (let index = 0; index < 4; index++) { await statsToggle.click(); await settle(); await checkStats('primary', index % 2 === 0); }
  await clean();

  // Medium viewports still reserve the native 56px rail. The composer needs
  // its own inner gutter rather than relying on the phone-only frame rules.
  for (const [width, height] of [[768,1024],[820,1180],[900,1200]]) {
    await page.setViewportSize({width,height}); await mount();
    const boxes = await page.evaluate(() => ({center: document.querySelector('[data-dfl="center"]').getBoundingClientRect().toJSON(), card: document.querySelector('[data-dfl="input-card"]').getBoundingClientRect().toJSON()}));
    assert.equal(boxes.center.x, 56, 'collapsed native rail remains visible');
    assert.ok(boxes.card.x - boxes.center.x >= 8, `${width}px left composer gutter: ${JSON.stringify(boxes)}`);
    assert.ok(boxes.center.right - boxes.card.right >= 8, `${width}px right composer gutter: ${JSON.stringify(boxes)}`);
    await checkStats('primary', false); await clean();
  }
  for (const [width,height] of [[150,180],[162,197],[184,224],[200,240],[240,320]]) {
    await page.setViewportSize({width,height}); await mount(); await checkStats('primary', false);
    await page.locator('[data-dfl-stats-toggle]').click(); await settle(); await checkStats('primary', true);
    assert.ok(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth + 1), `${width}px footer does not widen the page`);
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
  await checkStats('primary', false); await checkStats('embedded', false);
  await page.locator('[data-editor-id="primary"] [data-dfl-stats-toggle]').click(); await settle();
  await checkStats('primary', true); await checkStats('embedded', false);
  await page.locator('[data-editor-id="embedded"] [data-dfl-stats-toggle]').click(); await settle();
  await checkStats('primary', true); await checkStats('embedded', true);
  await page.locator('[data-editor-id="primary"] [data-dfl-stats-toggle]').click(); await settle();
  await checkStats('primary', false); await checkStats('embedded', true);
  await clean();
  // A host can clear and later rebuild a footer without replacing the input.
  await mount();
  await page.evaluate(() => {
    document.querySelector('[data-composer-dock]').replaceChildren();
  }); await settle();
  assert.equal(await page.locator('[data-dfl-stats-toggle]').count(), 0, 'empty dock removes its disclosure');
  assert.equal(await page.locator('[data-composer-dock]').getAttribute('data-dfl-stats-expanded'), null, 'empty dock releases its layout state');
  await page.evaluate(() => {
    const dock = document.querySelector('[data-composer-dock]');
    dock.innerHTML = window.nativeDockMarkup;
  }); await settle();
  assert.equal(await page.locator('[data-dfl-stats-toggle]').count(), 1, 'rebuilt native statistics get exactly one disclosure');
  assert.equal(await page.locator('[data-dfl-stats-toggle]').getAttribute('aria-expanded'), 'false');
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
  // Container adaptation must not turn a wide frame into a global drawer.
  // Each embedded conversation keeps its own density and cleanup ownership.
  await page.setViewportSize({ width: 1280, height: 900 }); await mount({ multiple: true });
  await page.locator('.conv_root').evaluateAll(nodes => nodes.forEach((node,index) => { node.style.flex='none'; node.style.width=index ? '430px' : '180px'; })); await settle();
  assert.equal(await page.locator('html').getAttribute('data-dfl-size'),'wide');
  assert.equal(await page.locator('[data-dfl-toggle]').isVisible(),false);
  assert.deepEqual(await page.locator('.conv_root').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-dfl-conversation-size'))),['micro','compact']);
  assert.deepEqual(await page.locator('.input_root').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-dfl-input-size'))),['micro','compact']);
  for(const id of ['primary','embedded']) {
    await page.getByRole('textbox',{name:`Draft ${id}`}).fill('保留的容器草稿');
    await checkStats(id, false);
    await page.locator(`[data-editor-id="${id}"] [data-dfl-stats-toggle]`).click(); await settle();
    await checkStats(id, true);
  }
  const settledFrames = await page.evaluate(()=>window.rafRequests); await settle();
  assert.ok(await page.evaluate(()=>window.rafRequests)<=settledFrames+1,'local container density settles without resize feedback');
  await page.locator('.conv_root').first().evaluate(node=>node.style.width='430px'); await settle();
  assert.equal(await page.locator('.conv_root').first().getAttribute('data-dfl-conversation-size'),'compact');
  assert.equal(await page.getByRole('textbox',{name:'Draft primary'}).innerText(),'保留的容器草稿');
  await clean();

  await page.setViewportSize({ width: 1280, height: 900 }); await mount();
  await page.locator('.conv_body').evaluate(body=>{
    const shell=document.createElement('section'); shell.style.cssText='width:180px;height:180px;flex:none';
    shell.innerHTML='<div class="conv_body" style="height:180px" data-conversation-content><div class="conv_scrollBody" data-conversation-scroll>Rootless embedded conversation</div></div>';
    body.append(shell);
  }); await settle();
  assert.equal(await page.locator('.conv_root').getAttribute('data-dfl-conversation-size'),'regular','rootless embed does not classify its outer root');
  assert.equal(await page.locator('.conv_body').last().getAttribute('data-dfl-conversation-size'),null);
  assert.equal(await page.locator('.conv_body').last().getAttribute('data-dfl-content-size'),'micro');
  assert.ok((await page.locator('.conv_body').last().boundingBox()).height<=180,'rootless embedded body keeps its allotted height');
  await clean();

  // A local short conversation must not borrow the outer desktop's height.
  await page.setViewportSize({ width: 1440, height: 1000 }); await mount();
  await page.locator('.conv_root').evaluate(root=>{root.style.flex='none';root.style.width='430px';root.style.height='180px';}); await settle();
  assert.equal(await page.locator('.conv_root').getAttribute('data-dfl-short'),'true');
  assert.equal(await page.locator('.conv_body').getAttribute('data-dfl-content-short'),'true');
  assert.equal(await page.locator('.conv_body').evaluate(el=>el.style.getPropertyValue('--dfl-content-height')),'180px');
  await page.getByRole('textbox',{name:'Draft primary'}).fill(draft); await settle();
  assert.ok(await page.locator('.input_scroll').evaluate(el=>el.clientHeight<=72 && el.scrollHeight>el.clientHeight),'short local editor has its own scroll budget');
  await clean();

  // Only an actually visible, interactive portal may suspend drawer keys.
  await page.setViewportSize({ width: 390, height: 844 });
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
    await page.locator('[data-dfl-stats-toggle]').click(); await settle();
    assert.equal(await page.locator('[data-dfl-stats-toggle]').getAttribute('aria-expanded'), 'true');
    await page.evaluate(markup => {
      const parsed = new DOMParser().parseFromString(markup, 'text/html');
      document.querySelector('.host_frame').replaceWith(document.importNode(parsed.querySelector('.host_frame'), true));
      document.querySelector('.sidebar_toggle').addEventListener('click', window.toggleSidebar);
    }, fixture().replace(icon, replacementIcon)); await settle();
    assert.equal(await page.locator('[data-dfl-toggle]').count(), 1, 'one fallback after frame replacement');
    assert.equal(await page.locator('[data-dfl-toggle] svg').evaluate(el => el.outerHTML), await page.locator('.host_sidebarCol svg').evaluate(el => el.outerHTML), 'replacement native glyph resynchronized');
    assert.equal(await page.locator('[data-dfl-toggle]').getAttribute('class'), 'sidebar_toggle', 'replacement native classes resynchronized');
    assert.equal(await page.locator('[data-dfl-stats-toggle]').count(), 1, 'frame replacement does not duplicate disclosure');
    assert.equal(await page.locator('[data-dfl-stats-toggle]').getAttribute('aria-expanded'), 'false', 'new composer starts collapsed rather than inheriting another draft state');
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
    document.querySelector('[data-composer-dock]').id = 'host-native-stats-id';
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
