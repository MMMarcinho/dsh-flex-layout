/** Real DSH + sibling canvas plugin; synthetic sessions only.
 * Uses a disposable profile under work/mobile-regression. No model requests,
 * user history, normal profile edits or active browser/session reloads.
 * DSH_CANVAS_ROOT may point to a built dsh-canvas-workspace checkout.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { constants, zstdCompressSync } from "node:zlib";
import { chromium } from "@playwright/test";
const sourceHashes = Object.fromEntries(await Promise.all(["src/client.ts", "src/layout.css", "dist/client.js"].map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
const root = resolve("work/mobile-regression");
const cwd = resolve(root, "workdir");
const executable =
  "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
const cli =
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js";
const env = {
  PATH: process.env.PATH,
  LANG: "zh_CN.UTF-8",
  HOME: resolve(root, "home"),
  DSH_HOME: resolve(root, "dsh"),
  XDG_DATA_HOME: resolve(root, "xdg-data"),
  XDG_CACHE_HOME: resolve(root, "xdg-cache"),
  XDG_CONFIG_HOME: resolve(root, "xdg-config"),
  ELECTRON_RUN_AS_NODE: "1",
};
await rm(root, { recursive: true, force: true });
await Promise.all(
  [cwd, env.HOME, env.DSH_HOME, resolve(root,"artifacts")].map((path) =>
    mkdir(path, { recursive: true }),
  ),
);
const redact = (text) => text.replace(/token=[^\s"'<>]+/g, "token=[redacted]");
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, ["--expose-internals", cli, ...args], {
      env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(redact(output))),
    );
    child.once("error", reject);
  });
await run(["plugin", "--profile", "web", "add", `link:${process.cwd()}`]);
const canvasRoot = resolve(process.env.DSH_CANVAS_ROOT || "../dsh-canvas-workspace");
await run(["plugin", "--profile", "web", "add", `link:${canvasRoot}`]);
// Synthetic durable history gives the native header real nonblank Session scope;
// no real user history, credentials or model requests are used.
await rm(resolve(env.DSH_HOME, "sessions"), { recursive: true, force: true });
const id = `session-${randomUUID()}`;
const sessionDir = resolve(
  env.DSH_HOME,
  "sessions",
  `--${cwd.slice(1).replaceAll("/", "-")}--`,
  id,
);
await mkdir(sessionDir, { recursive: true });
const time = Date.now();
const event = (type, seq, data, surface = false) => ({
  type,
  seq,
  time: time + seq,
  data,
  ...(surface ? { surfaceOp: "append" } : {}),
});
const rows = [
  {
    type: "session",
    version: 4,
    id,
    createdAt: time,
    cwd,
    isSeeded: false,
    delegationDepth: 0,
    agentPreset: "standard",
  },
  event("turn/start", 0, { turn: 1 }),
  event("step/start", 1, { turn: 1, step: 1 }),
  event(
    "user/message",
    2,
    {
      role: "user",
      id: randomUUID(),
      source: { kind: "user", rpcId: randomUUID() },
      content: [{ type: "text", text: "原生画布视图隔离验证" }],
    },
    true,
  ),
  event(
    "assistant/message",
    3,
    {
      turn: 1,
      step: 1,
      stream: [],
      message: {
        role: "assistant",
        source: { kind: "model", provider: "fixture", model: "fixture" },
        id: randomUUID(),
        content: [
          {
            type: "text",
            text: "合成短回复：验证对话与画布切换，不发送模型请求。",
          },
        ],
      },
    },
    true,
  ),
  event("step/end", 4, { turn: 1, step: 1 }),
  event("turn/end", 5, { turn: 1, reason: { kind: "completed" } }),
];
// Multi-turn history includes lists, code, a wide table and unbroken text.
// These are synthetic durable events, not requests to a model or user history.
for (let turn = 2; turn <= 12; turn++) {
  const seq = (turn - 1) * 6;
  const text = turn % 3 === 0
    ? `## 第 ${turn} 轮：复杂内容\n\n| 字段 | 很长的说明列 | 结果 |\n| --- | --- | --- |\n| layout | ${'mixed中文说明 '.repeat(12)} | ready |\n\n\`\`\`ts\nconst veryLongIdentifier = "${'unbroken'.repeat(30)}";\n\`\`\``
    : `## 第 ${turn} 轮：多轮历史\n\n${'- 中文、English 与长段落用于真实宿主滚动检查。\n'.repeat(8)}\n${'不应被输入区遮住的回复内容。'.repeat(16)}`;
  rows.push(
    event('turn/start', seq, {turn}),
    event('step/start', seq + 1, {turn, step: 1}),
    event('user/message', seq + 2, {role: 'user', id: randomUUID(), source: {kind: 'user', rpcId: randomUUID()}, content: [{type: 'text', text: `合成第 ${turn} 轮：请核对窄容器、多轮历史与草稿保留。${'更多中文 English 内容。'.repeat(turn % 4)}`}]}, true),
    event('assistant/message', seq + 3, {turn, step: 1, stream: [], message: {role: 'assistant', source: {kind: 'model', provider: 'fixture', model: 'fixture'}, id: randomUUID(), content: [{type: 'text', text}]}}, true),
    event('step/end', seq + 4, {turn, step: 1}),
    event('turn/end', seq + 5, {turn, reason: {kind: 'completed'}}),
  );
}
for (const row of rows) if (row.type === 'assistant/message') row.data.usage = {inputTokens: 82304, outputTokens: 18621, cacheReadTokens: 81283, cacheWriteTokens: 0};
const compress = (text) =>
  zstdCompressSync(Buffer.from(text), {
    params: { [constants.ZSTD_c_checksumFlag]: 1 },
  });
await writeFile(
  resolve(sessionDir, "session.v4.jsonl.zstd"),
  Buffer.concat([
    compress(JSON.stringify(rows[0]) + "\n"),
    compress(
      rows
        .slice(1)
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    ),
  ]),
);
const archiveId = `session-${randomUUID()}`;
const childId = `session-${randomUUID()}`;
const menuSessionIds = Array.from({length: 18}, () => `session-${randomUUID()}`);
const extraId = `session-${randomUUID()}`;
for (const [extra, blank, child] of [
  [archiveId, false, false],
  [childId, false, true],
  [extraId, false, false],
  ...menuSessionIds.map(sessionId => [sessionId, false, false]),
]) {
  const extraCwd = extra === extraId ? resolve(root, "other-workdir") : cwd;
  const dir = resolve(
    env.DSH_HOME,
    "sessions",
    `--${extraCwd.slice(1).replaceAll("/", "-")}--`,
    extra,
  );
  await mkdir(dir, { recursive: true });
  const header = {
    ...rows[0],
    id: extra,
    ...(extra === extraId ? { cwd: resolve(root, "other-workdir") } : {}),
    ...(child
      ? { parentSession: id, delegationDepth: 1, origin: "subagent" }
      : {}),
  };
  await writeFile(
    resolve(dir, "session.v4.jsonl.zstd"),
    Buffer.concat([
      compress(JSON.stringify(header) + "\n"),
      ...(blank
        ? []
        : [
            compress(
              rows
                .slice(1)
                .map((row) => JSON.stringify(row))
                .join("\n") + "\n",
            ),
          ]),
    ]),
  );
}
await mkdir(resolve(root, "other-workdir"), { recursive: true });
const extraWorkspaceId = randomUUID();
const workspaceId = randomUUID();
await mkdir(resolve(env.DSH_HOME, "storages"), { recursive: true });
await writeFile(
  resolve(env.DSH_HOME, "storages/workspace.json"),
  JSON.stringify({
    unit: { name: "workspace", version: 2 },
    global: {
      initialized: true,
      workspaceIds: [workspaceId, extraWorkspaceId],
      archivedSessionIds: [archiveId],
      pinnedSessionIds: [],
      defaultWorkspaceId: workspaceId,
    },
    tables: {
      workspaces: {
        [extraWorkspaceId]: {
          path: resolve(root, "other-workdir"),
          title: "default-workspace",
          sessionIds: [extraId],
          createdAt: new Date(time).toISOString(),
          updatedAt: new Date(time).toISOString(),
        },
        [workspaceId]: {
          path: cwd,
          title: "隔离测试工作区",
          sessionIds: [id, archiveId, childId, ...menuSessionIds],
          createdAt: new Date(time).toISOString(),
          updatedAt: new Date(time).toISOString(),
        },
      },
    },
  }),
);
const server = spawn(
  executable,
  [
    "--expose-internals",
    cli,
    "web",
    "--host",
    "127.0.0.1",
    "--port",
    "0",
    "--no-open",
  ],
  { env, cwd, stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
let diagnostics = "";
server.stderr.on("data", (chunk) => (diagnostics += chunk));
try {
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`Host timeout: ${redact(output)}`)),
      45000,
    );
    const onData = (data) => {
      output += data;
      const match = output.match(/https?:\/\/127\.0\.0\.1:\d+\/[^\s]*/);
      if (match && match[0].includes("token=")) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Host exited ${code}: ${redact(output)}`));
    });
  });
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }, hasTouch: true,
  });
  const errors = [];
  const blockedRequests = [];
  // No external provider requests are permitted, even if a host regression
  // unexpectedly tries to contact one. Only this disposable local host is used.
  await page.route('**/*', route => {
    const requested = new URL(route.request().url());
    if (/^https?:$/.test(requested.protocol) && requested.origin !== new URL(url).origin) {
      blockedRequests.push(`${requested.origin}${requested.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  const proceed = page.getByRole("button", { name: "继续", exact: true });
  if (await proceed.count()) await proceed.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const openSidebar = page.getByRole("button", {
    name: "打开侧边栏",
    exact: true,
  });
  if (await openSidebar.count()) await openSidebar.click();
  const workspace = page
    .getByRole("button", { name: "隔离测试工作区", exact: true })
    .first();
  if (await workspace.count()) {
    await workspace.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);
  const closeWelcome = page
    .getByRole("button", { name: "关闭", exact: true })
    .first();
  if (await closeWelcome.isVisible()) await closeWelcome.click();
  await page.keyboard.press("Escape");
  const session = page.getByText("未命名", { exact: true }).first();
  if (!(await session.count())) {
    await page.screenshot({ path: "artifacts/native-view-before.png" });
    console.log((await page.locator("body").innerText()).slice(0, 2000));
  }
  await session.click();
  const canvasTab = page.getByRole("tab", { name: "画布", exact: true });
  if (!(await canvasTab.count())) {
    await page.screenshot({ path: "artifacts/native-view-before.png" });
    console.log((await page.locator("body").innerText()).slice(0, 2000));
  }


  const results = [];
  const settle = () => page.waitForTimeout(180);
  const editor = page.locator('[data-composer-seat] [contenteditable="true"]').first();
  const toggle = page.locator('[data-dfl-toggle]');
  const statsToggle = page.locator('button[data-dfl-stats-toggle]').first();
  // This credential-free history has activity/usage controls. The real host
  // adds context only when a selected model supplies a context-window size.
  // Preserve whichever native controls it mounted, rather than synthesizing
  // a replacement UI or configuring an external model account for this test.
  await page.locator('[data-composer-stat="activity"] button').waitFor();
  const nativeStatKinds = await page.locator('[data-composer-dock] button[aria-haspopup="dialog"]').evaluateAll(buttons => buttons.map(button => button.closest('[data-composer-stat]')?.getAttribute('data-composer-stat') ?? 'context'));
  const draft = '移动端未发送草稿：中文 English 和 verylongword'.repeat(40)+'\n最后一行 END';
  const snap = name => page.screenshot({path:resolve(root,'artifacts',name+'.png')});
  const within = (box, width, height, name) => assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${name}: ${JSON.stringify(box)} in ${width}x${height}`);
  const closeDrawer = async () => {
    if (await toggle.getAttribute('aria-expanded') === 'true') { await page.keyboard.press('Escape'); await settle(); }
  };
  const checkHeader = async (width, height) => {
    const bounds = await page.locator('[data-dfl="conversation-header"] button').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length && el.offsetWidth && getComputedStyle(el).visibility !== 'hidden').map(el => ({name:el.getAttribute('aria-label') || el.textContent, rect:el.getBoundingClientRect().toJSON()})));
    for (const b of bounds) within(b.rect, width, height, `header ${b.name}`);
    if ([375,390].includes(width) && !(await page.locator('[data-canvas-conversation-view]').count())) {
      const canvas = page.getByRole('tab', {name: '画布', exact: true});
      if (await canvas.isVisible()) within(await canvas.boundingBox(), width, height, 'native canvas view tab');
      else {
        const more = page.getByRole('button', {name: '更多会话视图', exact: true});
        within(await more.boundingBox(), width, height, 'native view overflow entry');
        await more.click(); await settle();
        const item = page.getByRole('menuitem', {name: '画布', exact: true});
        await item.click({trial: true}); within(await item.boundingBox(), width, height, 'native canvas menu item');
        await page.keyboard.press('Escape'); await settle();
      }
    }
  };
  const setStatsExpanded = async expanded => {
    assert.equal(await page.locator('button[data-dfl-stats-toggle]').count(), 1, 'one disclosure per active native composer');
    if (await statsToggle.getAttribute('aria-expanded') !== String(expanded)) {
      await statsToggle.scrollIntoViewIfNeeded(); await statsToggle.click(); await settle();
    }
    assert.equal(await statsToggle.getAttribute('aria-expanded'), String(expanded));
  };
  const checkStatScroll = async () => {
    const endpoints = await page.locator('[data-composer-stat] [data-dfl="stat-pill"]').evaluateAll(buttons => buttons.map(button => {
      const label = button.querySelector('[data-dfl="stat-label"]');
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
      const glyph = last => {
        const node = last ? nodes.at(-1) : nodes[0], range = document.createRange();
        range.setStart(node, last ? node.length - 1 : 0); range.setEnd(node, last ? node.length : 1);
        return range.getBoundingClientRect().toJSON();
      };
      button.scrollLeft = 0; const first = glyph(false), bounds = button.getBoundingClientRect().toJSON();
      button.scrollLeft = button.scrollWidth; const last = glyph(true), scrolled = button.scrollLeft; button.scrollLeft = 0;
      return {kind: button.closest('[data-composer-stat]').getAttribute('data-composer-stat'), first, last, bounds, scrolled, overflow: getComputedStyle(button).overflowX};
    }));
    assert.ok(endpoints.length >= 2, 'activity and usage labels are present');
    assert.ok(endpoints.every(item => item.first.left >= item.bounds.left - 1 && item.last.right <= item.bounds.right + 1), `full labels are reachable in their native pills: ${JSON.stringify(endpoints)}`);
  };
  const checkInput = async (width, height) => {
    await editor.fill(draft); await settle();
    await page.locator('[data-dfl="input-scroll"]').evaluate(el => { el.scrollTop=el.scrollHeight; });
    const geometry = await page.locator('[data-dfl="input-scroll"]').evaluate(el => {
      const editor=el.querySelector('[contenteditable]'), walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
      let last; while(walker.nextNode()) last=walker.currentNode;
      const range=document.createRange(); range.setStart(last,Math.max(0,last.length-3)); range.setEnd(last,last.length);
      return {box:el.getBoundingClientRect().toJSON(), last:range.getBoundingClientRect().toJSON(), scroll:el.scrollHeight, client:el.clientHeight, bottomPadding:parseFloat(getComputedStyle(editor).paddingBottom)};
    });
    assert.ok(geometry.scroll > geometry.client, 'long editor scrolls');
    assert.ok(geometry.last.top >= geometry.box.top - 1 && geometry.last.bottom <= geometry.box.bottom + 1 && geometry.last.left >= geometry.box.left - 1 && geometry.last.right <= geometry.box.right + 1, JSON.stringify(geometry));
    assert.ok(geometry.bottomPadding >= 8, 'caret has bottom clearance');
    within(await page.locator('[data-dfl="input-card"]').boundingBox(),width,height,'input card');
    const inputBottom=geometry.box.bottom, row=await page.locator('[data-dfl="input-row"]').boundingBox();
    assert.ok(row.y>=inputBottom-1,'controls do not overlap editor');
    assert.equal(await editor.innerText(), draft);
  };
  async function runContainerRegression() {
    const audit = [], failures = [], onboardingDiagnostics = [];
    const sections = (process.env.DSH_MOBILE_SECTIONS || 'containers,resize,tiny,blank').split(',');
    const saveAudit = () => writeFile(resolve(root,'container-result.json'),JSON.stringify({sourceHashes,sections,checks:audit,failures,onboardingDiagnostics,blockedRequests,syntheticTurns:12,syntheticMenuSessions:18,modelRequestsSent:0},null,2));
    const persistentDraft = '容器断点草稿：中文 English 0123456789，未发送。';
    const record = (name, ok, detail) => {
      if (!ok) failures.push({name, detail});
    };
    const attempt = async (name, fn) => {
      try { await fn(); } catch (error) { record(name, false, error.message); await snap(`failure-${name.replace(/[^a-z0-9-]+/gi,'-')}`); await page.keyboard.press('Escape'); }
    };
    const rectInside = (inner, outer) => inner && outer && inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
    const separate = (a, b) => a && b && (a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1);
    const fixtureStats = async () => {
      await page.locator('[data-composer-stat] [data-dfl="stat-label"]').evaluateAll(labels => labels.forEach((el, index) => {
        const texts = ['10 轮 405 步 · 总耗时 2 小时 16 分钟', '1.21M tok · 缓存命中 98.76% · 输入 987654 输出 223456', '45% · 上下文 123456 / 262144 tokens'];
        el.textContent = texts[index % texts.length];
      }));
      await settle();
    };
    const snapshot = () => page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
      const labels = [...document.querySelectorAll('[data-composer-stat] [data-dfl="stat-label"]')].map(el => {
        const style = getComputedStyle(el), box = el.getBoundingClientRect();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), textRects = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          textRects.push(...[...range.getClientRects()].map(r => r.toJSON()));
        }
        const clippedBy = [];
        for (let ancestor = el; ancestor && !ancestor.matches('[data-conversation-content]'); ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
          const clipX = /hidden|clip|auto|scroll/.test(css.overflowX);
          const clipY = /hidden|clip|auto|scroll/.test(css.overflowY);
          if (textRects.some(r => clipX && (r.left < bounds.left - 1 || r.right > bounds.right + 1) || clipY && (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1))) {
            clippedBy.push({tag: ancestor.tagName, role: ancestor.getAttribute('data-dfl'), className: ancestor.className, overflowX: css.overflowX, overflowY: css.overflowY, box: bounds.toJSON()});
          }
        }
        return {kind: el.closest('[data-composer-stat]').getAttribute('data-composer-stat'), text: el.textContent, visible: !!el.getClientRects().length && style.visibility !== 'hidden', box: box.toJSON(), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, fontSize: style.fontSize, textRects, clippedBy};
      });
      const history = document.querySelector('.chat-user-history');
      const stats = {expanded: document.querySelector('[data-dfl-stats-toggle]')?.getAttribute('aria-expanded'), dock: rect('[data-composer-dock]'), buttons: [...document.querySelectorAll('[data-composer-dock] button[aria-haspopup="dialog"]')].map(button => ({kind: button.closest('[data-composer-stat]')?.getAttribute('data-composer-stat') ?? 'context', box: button.getBoundingClientRect().toJSON()}))};
      return {canvasLayout: document.querySelector('[data-dfl-canvas-layout]')?.getAttribute('data-dfl-canvas-layout'), size: document.documentElement.dataset.dflSize, orientation: document.documentElement.dataset.dflOrientation, viewport: {x: 0, y: 0, width: innerWidth, height: innerHeight}, center: rect('[data-dfl="center"]'), seat: rect('[data-composer-seat]'), card: rect('[data-dfl="input-card"]'), stage: rect('.chat-stage'), rail: rect('.chat-dock'), history: history ? {clientHeight: history.clientHeight, scrollHeight: history.scrollHeight} : null, labels, stats, bodyWidth: document.body.scrollWidth, sidebarCollapsed: document.querySelector('[data-dfl="frame"]')?.hasAttribute('data-sidebar-collapsed'), rightPanel: rect('[data-sidebar-right-panel]')};
    });
    const switchView = async name => {
      if ((name === '画布') === !!(await page.locator('[data-canvas-conversation-view]').count())) return;
      const tab = page.getByRole('tab', {name, exact: true});
      if (await tab.isVisible()) await tab.click();
      else {
        await page.getByRole('button', {name: '更多会话视图', exact: true}).click();
        await page.getByRole('menuitem', {name, exact: true}).click();
      }
      await settle();
    };
    const setNativeBars = async open => {
      // Change preferences through the real host controls, never force grid CSS.
      const left = page.locator('[data-dfl="frame"]');
      if ((await left.getAttribute('data-sidebar-collapsed') === null) !== open) {
        const button = page.getByRole('button', {name: open ? '打开侧边栏' : '收起侧边栏', exact: true});
        await button.first().click(); await settle();
      }
      const button = page.getByRole('button', {name: open ? '打开右侧边栏' : '收起右侧边栏', exact: true});
      if (await button.isVisible()) { await button.click(); await settle(); }
    };
    const checkStats = (name, shot, expanded = false) => {
      record(`${name}: all native stat labels mounted`, shot.labels.length >= 2, shot.labels);
      record(`${name}: disclosure state`, shot.stats.expanded === String(expanded), shot.stats);
      record(`${name}: native statistics controls preserved`, JSON.stringify(shot.stats.buttons.map(button => button.kind)) === JSON.stringify(nativeStatKinds), shot.stats);
      if (!expanded) {
        record(`${name}: collapsed statistics use one row`, shot.stats.dock?.height <= 36, shot.stats);
        for (const label of shot.labels) record(`${name}: ${label.kind} compact summary`, label.visible && label.whiteSpace === 'nowrap', label);
        return;
      }
      const activity = shot.stats.buttons.find(button => button.kind === 'activity')?.box;
      const usage = shot.stats.buttons.find(button => button.kind === 'usage')?.box;
      const context = shot.stats.buttons.find(button => button.kind === 'context')?.box;
      record(`${name}: activity and usage use two rows`, activity && usage && usage.top >= activity.bottom - 1, shot.stats);
      if (nativeStatKinds.includes('context')) record(`${name}: usage and context share second row`, usage && context && Math.abs(usage.top + usage.height / 2 - context.top - context.height / 2) <= 1, shot.stats);
      for (const label of shot.labels) {
        // Expanded labels may be wider than a pill, but only a genuinely
        // scrollable ancestor may clip them. Endpoints are checked separately.
        const clipped = label.clippedBy.filter(ancestor => !/auto|scroll/.test(ancestor.overflowX + ancestor.overflowY));
        record(`${name}: ${label.kind} full label available`, label.visible && label.textOverflow !== 'ellipsis' && clipped.length === 0, label);
      }
    };
    const checkMenu = async (name, width, height) => {
      const button = page.getByRole('button', {name: '导航与工作区', exact: true});
      await button.scrollIntoViewIfNeeded(); await button.click({timeout: 2000}); await settle();
      const menu = page.getByRole('dialog', {name: '导航与工作区', exact: true});
      await menu.scrollIntoViewIfNeeded();
      within(await menu.boundingBox(), width, height, `${name} canvas navigation`);
      const sessions = menu.locator('.chat-sidebar-session');
      assert.ok(await sessions.count() >= 18, 'long synthetic native session menu');
      const last = sessions.last();
      await last.scrollIntoViewIfNeeded();
      await last.click({trial: true, timeout: 2000});
      const scrolling = await last.evaluate(el => {
        const candidates = [];
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) { p.scrollTop = p.scrollHeight; candidates.push({top: p.scrollTop, height: p.clientHeight, full: p.scrollHeight}); }
        }
        return candidates;
      });
      assert.ok(scrolling.every(el => el.top > 0), `overflowing session menu scrolls: ${JSON.stringify(scrolling)}`);
      await last.scrollIntoViewIfNeeded(); await last.click({trial: true, timeout: 2000});
      await button.click({timeout:2000}); await settle();
      assert.equal(await menu.isVisible(),false,'same native navigation button closes menu');
      await button.scrollIntoViewIfNeeded(); await button.click({timeout:2000}); await settle();
      await page.keyboard.press('Escape'); await settle();
      assert.equal(await menu.isVisible(),false,'reopened menu closes on Escape');
    };
    await page.setViewportSize({width: 1440, height: 1000}); await settle();
    await switchView('对话'); await setNativeBars(false);
    await editor.fill(persistentDraft);
    const cases = [
      ...[[768,600],[768,1024],[820,600],[820,1180],[900,768],[900,1200],[1024,768],[1024,1366],[430,180],[800,240],[1200,240]].map(([width,height]) => ({width,height,bars:false})),
      ...[[1100,800],[1280,900],[1440,1000]].map(([width,height]) => ({width,height,bars:true})),
    ];
    if (sections.includes('containers')) for (const view of ['对话', '画布']) {
      await page.setViewportSize({width: 1440,height: 1000}); await settle();
      for (const {width,height,bars} of cases) {
        // Open/close at a full desktop size so native controls are reachable.
        await page.setViewportSize({width: 1440,height: 1000}); await settle(); await switchView('对话'); await setNativeBars(bars); await switchView(view);
        await page.setViewportSize({width,height}); await settle(); await fixtureStats(); await setStatsExpanded(false);
        const name = `${view === '画布' ? 'canvas' : 'chat'}-${width}x${height}-${bars ? 'native-bars' : 'no-bars'}`;
        const shot = await snapshot(); audit.push({name,...shot});
        checkStats(name,shot);
        if (view === '对话' && [768,820].includes(width) && height >= 600 && shot.center.x >= 55) {
          record(`${name}: collapsed rail has left composer gutter`, shot.card.x - shot.center.x >= 8, shot);
          record(`${name}: composer keeps right gutter`, shot.center.right - shot.card.right >= 8, shot);
        }
        await setStatsExpanded(true);
        const expanded = await snapshot(); audit.push({name: `${name}-stats-expanded`, ...expanded}); checkStats(`${name}-stats-expanded`, expanded, true);
        await attempt(`${name}: full labels scroll within native pills`, checkStatScroll);
        await snap(`${name}-stats-expanded`); await setStatsExpanded(false);
        if(height>=300) record(`${name}: card inside center`,rectInside(shot.card,shot.center),shot);
        else await attempt(`${name}: short viewport composer reachable`,async()=>{
          await editor.scrollIntoViewIfNeeded(); await editor.click({timeout:2000});
          const send=page.locator('[data-dfl="input-trailing"] button').last();
          await send.scrollIntoViewIfNeeded(); await send.click({trial:true,timeout:2000});
          within(await send.boundingBox(),width,height,`${name} send`);
        });
        record(`${name}: no page horizontal overflow`,shot.bodyWidth <= width + 1,shot.bodyWidth);
        record(`${name}: draft preserved`,await editor.innerText() === persistentDraft,await editor.innerText());
        if (bars) record(`${name}: desktop sidebar preference preserved`,shot.sidebarCollapsed === false && shot.rightPanel?.width > 100,shot);
        if (view === '画布') {
          record(`${name}: stage usable`,shot.stage?.height >= 80 && shot.stage?.width >= 120,shot);
          if(shot.canvasLayout !== 'native') {
            record(`${name}: canvas/history do not overlap`,separate(shot.stage,shot.rail),shot);
            record(`${name}: canvas/input do not overlap`,separate(shot.stage,shot.seat),shot);
          }
          record(`${name}: history/input do not overlap`,separate(shot.rail,shot.seat),shot);
          await attempt(`${name}: native menu clickable and scrollable`,() => checkMenu(name,width,height));
        }
        await snap(name); await saveAudit();
        console.log(`${name}: center=${shot.center?.width}, card=${shot.card?.width}, stats=${shot.labels.map(l=>`${l.kind}:${l.clientWidth}/${l.scrollWidth}`).join(',')}, cumulativeFailures=${failures.length}`);
      }
    }
    if (sections.includes('resize')) {
    // Continuous resize crosses both viewport breakpoints and narrow-center
    // sizes with native desktop rails left open. Revisit sizes to catch loops.
    await page.setViewportSize({width:1440,height:1000}); await settle(); await switchView('对话'); await setNativeBars(true); await switchView('画布');
    await setStatsExpanded(true);
    const preferences = await snapshot();
    await editor.evaluate(el => { window.__mobileRegressionEditor = el; });
    const resizePath = [
      ...[1101,1100,1099,1025,1024,1023,901,900,899,821,820,819,769,768,767,768,769,820,1024,1100,1101,1440].map(width => [width,800]),
      [319,800],[320,800],[321,800],[820,599],[820,600],[820,601],[1024,599],[1024,600],[1024,601],[1440,1000],
    ];
    for (const [width,height] of resizePath) {
      await page.setViewportSize({width,height}); await settle();
      const samples = [];
      for (let i=0;i<4;i++) { const shot=await snapshot(); samples.push({size:shot.size,center:shot.center,card:shot.card,stage:shot.stage,rail:shot.rail}); await page.waitForTimeout(70); }
      const stable = samples.every(sample => sample.size === samples[0].size && ['center','card','stage','rail'].every(key => ['x','y','width','height'].every(axis => Math.abs((sample[key]?.[axis] ?? 0) - (samples[0][key]?.[axis] ?? 0)) <= 1)));
      record(`resize-${width}x${height}: settled geometry does not oscillate`,stable,samples);
      record(`resize-${width}x${height}: same editor and draft`,await editor.evaluate(el => el === window.__mobileRegressionEditor) && await editor.innerText() === persistentDraft,await editor.innerText());
      record(`resize-${width}x${height}: expanded statistics preserved`,await statsToggle.getAttribute('aria-expanded') === 'true',await statsToggle.getAttribute('aria-expanded'));
      audit.push({name:`resize-${width}x${height}`,samples});
    }
    const restored = await snapshot();
    record('resize: native desktop rail preferences restored',restored.sidebarCollapsed === preferences.sidebarCollapsed && Math.abs(restored.rightPanel.width - preferences.rightPanel.width) <= 1,{preferences,restored});
    await setStatsExpanded(false);
    }
    // These are browser CSS viewport tests, not watchOS/device certification.
    // Tiny layouts may scroll vertically; each native action must be reachable.
    if (sections.includes('tiny')) for (const view of ['对话','画布']) {
      await page.setViewportSize({width:1440,height:1000}); await settle(); await switchView('对话'); await setNativeBars(false); await switchView(view);
      for (const [width,height] of [[150,180],[162,197],[184,224],[200,240],[240,320]]) {
        await page.setViewportSize({width,height}); await settle(); await fixtureStats(); await setStatsExpanded(false);
        const name=`tiny-${view === '画布' ? 'canvas' : 'chat'}-${width}x${height}`;
        const shot=await snapshot(); audit.push({name,...shot}); checkStats(name,shot);
        await snap(`${name}-collapsed`); await setStatsExpanded(true);
        const expanded=await snapshot(); audit.push({name:`${name}-stats-expanded`,...expanded}); checkStats(`${name}-stats-expanded`,expanded,true);
        await attempt(`${name}: full statistics reachable within each pill`,checkStatScroll);
        record(`${name}: no horizontal page overflow`,shot.bodyWidth <= width + 1,shot);
        await attempt(`${name}: editor and send reachable`,async()=>{
          await editor.scrollIntoViewIfNeeded(); await editor.click({timeout:2000});
          assert.equal(await editor.innerText(),persistentDraft);
          const send=page.locator('[data-dfl="input-trailing"] button').last();
          await send.scrollIntoViewIfNeeded(); await send.click({trial:true,timeout:2000});
          within(await send.boundingBox(),width,height,`${name} send`);
        });
        await attempt(`${name}: stats details reachable`,async()=>{
          const stats=page.locator('[data-composer-dock] button[aria-haspopup="dialog"]');
          assert.equal(await stats.count(), nativeStatKinds.length, 'all original native details are present');
          for(let index=0;index<await stats.count();index++) {
            const stat=stats.nth(index);
            await stat.scrollIntoViewIfNeeded(); await stat.click({timeout:2000}); await settle();
            const dialog=page.locator('[role="dialog"]').last(); await dialog.waitFor({timeout:2000});
            within(await dialog.boundingBox(),width,height,`${name} stats dialog ${index}`);
            const lastDetail=dialog.locator('dd').last();
            if(await lastDetail.count()) { await lastDetail.scrollIntoViewIfNeeded(); within(await lastDetail.boundingBox(),width,height,`${name} final stats detail ${index}`); }
            await page.keyboard.press('Escape'); await settle();
          }
        });
        await attempt(`${name}: native menu reachable`,async()=>{
          if(view === '画布') await checkMenu(name,width,height);
          else {
            const tools=page.locator('[data-slot="conversation.input.permission"] button').first();
            await tools.scrollIntoViewIfNeeded(); await tools.click({timeout:2000});
            const menu=page.getByRole('menu').first(); await menu.waitFor({timeout:2000});
            within(await menu.boundingBox(),width,height,`${name} native permission menu`);
            await page.keyboard.press('Escape'); await settle();
            const more=page.getByRole('button',{name:'更多会话视图',exact:true});
            await more.scrollIntoViewIfNeeded(); await more.click({timeout:2000}); await settle();
            const canvas=page.getByRole('menuitem',{name:'画布',exact:true});
            await canvas.scrollIntoViewIfNeeded(); await canvas.click({trial:true,timeout:2000});
            within(await canvas.boundingBox(),width,height,`${name} native canvas entry`);
            await page.keyboard.press('Escape'); await settle();
          }
        });
        await snap(name); await saveAudit();
        await setStatsExpanded(false);
        console.log(`${name}: center=${shot.center?.width}, card=${shot.card?.width}, stats=${shot.labels.map(l=>`${l.kind}:${l.clientWidth}/${l.scrollWidth}`).join(',')}, cumulativeFailures=${failures.length}`);
      }
    }
    if(sections.includes('blank')) {
      // Exercise the actual native blank/home flow, not a fake empty fixture.
      await page.setViewportSize({width:1440,height:1000}); await settle();
      await switchView('对话'); await setNativeBars(false);
      await page.locator('[data-dfl="sidebar"]').getByRole('button',{name:'新建会话',exact:true}).click();
      await settle(); await editor.waitFor();
      assert.equal(await editor.innerText(),'','native new-session editor starts empty');
      for(const [width,height] of [[150,180],[240,320]]) {
        const name=`blank-${width}x${height}`;
        await page.setViewportSize({width,height}); await settle(); await closeDrawer();
        await editor.fill(''); await editor.scrollIntoViewIfNeeded(); await settle();
        // A credential-free native blank session may show its onboarding
        // dialog on first focus. Dismiss it via its own visible close action.
        const dismiss=page.getByRole('button',{name:'关闭',exact:true}).first();
        if(await dismiss.isVisible()) {
          const ancestors=await dismiss.evaluate(button=>{
            const chain=[];
            for(let el=button;el && el!==document.body;el=el.parentElement) {
              const style=getComputedStyle(el);
              chain.push({tag:el.tagName,role:el.getAttribute('role'),className:el.className,box:el.getBoundingClientRect().toJSON(),width:style.width,minWidth:style.minWidth,maxWidth:style.maxWidth,padding:style.padding,display:style.display,flex:style.flex,overflow:style.overflow,fontSize:style.fontSize,lineHeight:style.lineHeight});
            }
            return chain;
          });
          const titleLayout=await dismiss.evaluate(button=>{
            const title=button.closest('[role="dialog"]')?.querySelector('[data-dfl="dialog-title"]');
            if(!title) return null;
            const range=document.createRange(); range.selectNodeContents(title);
            const fragments=[...range.getClientRects()].filter(r=>r.width>0 && r.height>0).map(r=>r.toJSON());
            return {text:title.textContent,box:title.getBoundingClientRect().toJSON(),fontSize:getComputedStyle(title).fontSize,clientWidth:title.clientWidth,scrollWidth:title.scrollWidth,fragments};
          });
          record(`${name}: onboarding title readable on one line`,titleLayout?.text==='开始使用' && parseFloat(titleLayout.fontSize)>=16 && new Set(titleLayout.fragments.map(r=>Math.round(r.top))).size===1 && titleLayout.scrollWidth<=titleLayout.clientWidth+1,titleLayout);
          onboardingDiagnostics.push({name:`${name}-onboarding`,width,height,titleLayout,ancestors});
          await snap(`${name}-onboarding`); await saveAudit();
          console.log(`ONBOARDING ${width}x${height}: ${JSON.stringify(ancestors)}`);
          await dismiss.click({timeout:2000}); await settle();
        }
        await snap(`${name}-empty`);
        await attempt(`${name}: native editor/add/permission/send reachable`,async()=>{
          await editor.click({timeout:2000}); await editor.fill('空白新会话草稿，未发送');
          const add=page.locator('[data-dfl="input-tools"] button').first();
          await add.scrollIntoViewIfNeeded(); await add.click({trial:true,timeout:2000});
          within(await add.boundingBox(),width,height,`${name} add`);
          const permission=page.locator('[data-slot="conversation.input.permission"] button').first();
          await permission.scrollIntoViewIfNeeded(); await permission.click({timeout:2000});
          const menu=page.getByRole('menu').first(); await menu.waitFor({timeout:2000});
          within(await menu.boundingBox(),width,height,`${name} permission menu`);
          await page.keyboard.press('Escape'); await settle();
          const send=page.locator('[data-dfl="input-trailing"] button').last();
          await send.scrollIntoViewIfNeeded(); await send.click({trial:true,timeout:2000});
          within(await send.boundingBox(),width,height,`${name} send`);
          assert.equal(await editor.innerText(),'空白新会话草稿，未发送');
          assert.equal(await page.locator('[data-composer-stat]').count(),0,'blank/home still has no sent turns');
          assert.equal(await page.locator('[data-dfl-stats-toggle]').count(),0,'blank/home has no unnecessary stats disclosure');
        });
        const shot=await snapshot(); audit.push({name,...shot}); await snap(name); await saveAudit();
        console.log(`${name}: center=${shot.center?.width}, card=${shot.card?.width}, cumulativeFailures=${failures.length}`);
      }
    }
    await saveAudit();
    for(const failure of failures) console.error(`FAIL: ${failure.name}: ${JSON.stringify(failure.detail).slice(0,1200)}`);
    console.log(`Container regression: ${audit.length} geometry/resize cases, ${failures.length} failures; details: ${resolve(root,'container-result.json')}`);
    assert.equal(failures.length,0,'container/tiny-viewport regressions (see container-result.json)');
    results.push(...audit.map(({name})=>({name,containerRegression:true})));
  }

  if (process.env.DSH_MOBILE_AUDIT_ONLY !== '1') {
  for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430]]) {
    await page.setViewportSize({width,height}); await settle(); await closeDrawer();
    assert.equal(await page.locator('html').getAttribute('data-dfl-size'),'compact');
    await checkHeader(width,height);
    assert.ok((await toggle.boundingBox()).width <=32);
    await checkInput(width,height);
    await snap(`chat-${width}x${height}`);
    await editor.fill('保留这份草稿'); await settle();
    await toggle.click(); await settle();
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el=>el.inert),true);
    within(await page.locator('[data-dfl="sidebar"]').boundingBox(),width,height,'drawer');
    await page.locator('[data-dfl="sidebar"]').getByRole('button',{name:'收起侧边栏',exact:true}).click(); await settle();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    const openRight=page.getByRole('button',{name:'打开右侧边栏',exact:true});
    await openRight.click(); await settle();
    within(await page.locator('[data-sidebar-right-panel]').boundingBox(),width,height,'right panel');
    await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click(); await settle();
    results.push({width,height,chat:true,editor:true,drawer:true,rightPanel:true});
  }
  // Real native stats controls with synthetic long labels exercise typography,
  // independently of model billing data. Keep the original click handler.
  await page.setViewportSize({width:390,height:844}); await settle();
  await page.locator('[data-composer-stat="activity"] [data-dfl="stat-label"]').evaluate(el => el.textContent='10 轮 405 步 · 总耗时 2 小时 16 分钟');
  await settle();
  assert.equal(await statsToggle.getAttribute('aria-expanded'),'false','native host statistics start collapsed');
  await snap('stats-collapsed-390');
  await statsToggle.focus(); await page.keyboard.press('Enter'); await settle();
  assert.equal(await statsToggle.getAttribute('aria-expanded'),'true','native host statistics expand with Enter');
  assert.equal(await page.locator('[data-dfl="stat-label"]').first().evaluate(el=>getComputedStyle(el).textOverflow),'clip');
  await checkStatScroll();
  await snap('stats-expanded-390');
  await page.locator('[data-composer-stat="activity"] button').click(); await settle();
  const statDialog=page.locator('[data-dfl="stats-dialog"]');
  await statDialog.waitFor();
  within(await statDialog.boundingBox(),390,844,'statistics details');
  await page.keyboard.press('Escape'); await settle();
  await statsToggle.focus(); await page.keyboard.press('Space'); await settle();
  assert.equal(await statsToggle.getAttribute('aria-expanded'),'false','native host statistics collapse with Space');
  await setStatsExpanded(true);
  await editor.evaluate(el=>{window.__statsDraftEditor=el;window.__statsNativeButtons=[...document.querySelectorAll('[data-composer-dock] button[aria-haspopup="dialog"]')];});
  await editor.fill('旋转和切换画布时保留的草稿');
  // The host hides extra tabs under its native overflow menu on phone widths.
  await page.getByRole('button',{name:'更多会话视图',exact:true}).click(); await settle();
  await page.getByRole('menuitem',{name:'画布',exact:true}).click(); await settle();
  await page.locator('[data-canvas-conversation-view] .chat-reply').first().waitFor();
  for (const [width,height] of [[390,844],[844,390],[320,568],[667,375],[430,932],[932,430],[375,667]]) {
    await page.setViewportSize({width,height}); await settle(); await checkHeader(width,height);
    assert.equal(await toggle.isVisible(),false,'canvas owns navigation');
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el=>el.inert),false);
    assert.equal(await editor.innerText(),'旋转和切换画布时保留的草稿');
    assert.equal(await statsToggle.getAttribute('aria-expanded'),'true','view switches and rotation preserve expanded statistics');
    assert.ok(await editor.evaluate(el=>el===window.__statsDraftEditor && window.__statsNativeButtons.every(button=>button.isConnected)),'view switches preserve native composer and detail buttons');
    await editor.click(); await settle();
    within(await page.locator('[data-dfl="input-card"]').boundingBox(),width,height,'canvas input');
    const stage=await page.locator('.chat-stage').boundingBox();
    const rail=await page.locator('.chat-dock').boundingBox();
    const seat=await page.locator('[data-composer-seat]').boundingBox();
    assert.ok(stage.height>30,`canvas usable: ${JSON.stringify(stage)}`);
    assert.ok(stage.y+stage.height<=rail.y+1,'canvas does not sit behind history');
    const separated = rail.y+rail.height<=seat.y+1 || rail.x+rail.width<=seat.x+1;
    assert.ok(separated,'history does not sit behind input');
    await page.getByRole('button',{name:'导航与工作区',exact:true}).click(); await settle();
    within(await page.getByRole('dialog',{name:'导航与工作区',exact:true}).boundingBox(),width,height,'canvas sidebar');
    const menu=page.getByRole('dialog',{name:'导航与工作区',exact:true});
    const sessionButton=menu.locator('.chat-sidebar-session').first();
    await sessionButton.scrollIntoViewIfNeeded();
    const menuBounds=await menu.boundingBox(), sessionBounds=await sessionButton.boundingBox();
    assert.ok(sessionBounds.y>=menuBounds.y && sessionBounds.y+sessionBounds.height<=menuBounds.y+menuBounds.height,'canvas session list reachable in short menu');
    await snap(`canvas-sidebar-${width}x${height}`);
    await page.keyboard.press('Escape'); await settle();
    await page.getByRole('button',{name:'账户与版本',exact:true}).click(); await settle();
    within(await page.getByRole('dialog',{name:'账户与版本',exact:true}).boundingBox(),width,height,'canvas account');
    await page.keyboard.press('Escape'); await settle();
    await page.getByRole('button',{name:'自动排布画布内容',exact:true}).click(); await settle();
    const reply=await page.locator('.chat-reply').first().boundingBox();
    const updatedStage=await page.locator('.chat-stage').boundingBox();
    assert.ok(reply.y>=updatedStage.y-1 && reply.x>=updatedStage.x-1 && reply.x+reply.width<=updatedStage.x+updatedStage.width+1 && reply.y+reply.height<=updatedStage.y+updatedStage.height+1,`short canvas reply fits: ${JSON.stringify({reply,updatedStage})}`);
    await snap(`canvas-${width}x${height}`);
    results.push({width,height,canvas:true,canvasSidebar:true,canvasAccount:true,draftPreserved:true});
  }
  // A tall native queue/notice must remain scrollable at both ends in the
  // landscape composer column (safe alignment, no negative overflow).
  await page.setViewportSize({width:844,height:390}); await settle();
  const composerSeat=page.locator('[data-composer-seat]');
  await page.locator('[data-dfl="conversation-composerStack"]').evaluate(stack=>{
    const notice=document.createElement('div'); notice.dataset.testNotice=''; notice.style.cssText='height:500px;flex:none'; notice.textContent='合成的长队列/审批内容'; stack.prepend(notice);
  }); await settle();
  await composerSeat.evaluate(el=>{el.scrollTop=0;});
  const tallSeat=await composerSeat.boundingBox(), notice=await page.locator('[data-test-notice]').boundingBox();
  assert.ok(notice.y>=tallSeat.y-1,'tall composer top remains reachable');
  await composerSeat.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  within(await page.locator('[data-dfl="input-card"]').boundingBox(),844,390,'tall composer bottom remains reachable');
  await page.locator('[data-test-notice]').evaluate(el=>el.remove()); await settle();
  const stageLocator=page.locator('.chat-stage');
  const panBox=await stageLocator.boundingBox();
  const beforePan=await page.locator('.chat-world').evaluate(el=>el.style.transform);
  await page.mouse.move(panBox.x+panBox.width-8,panBox.y+panBox.height-8);
  await page.mouse.down(); await page.mouse.move(panBox.x+panBox.width-38,panBox.y+panBox.height-28,{steps:5}); await page.mouse.up();
  assert.notEqual(await page.locator('.chat-world').evaluate(el=>el.style.transform),beforePan,'native canvas pan still works');
  await page.getByRole('tab',{name:'对话',exact:true}).click(); await settle();
  assert.equal(await page.locator('[data-canvas-conversation-view]').count(),0);
  assert.equal(await toggle.isVisible(),true);
  assert.equal(await editor.innerText(),'旋转和切换画布时保留的草稿');
  assert.equal(await statsToggle.getAttribute('aria-expanded'),'true','returning to chat preserves statistics state');
  await setStatsExpanded(false);
  await page.setViewportSize({width:390,height:360}); await settle();
  await checkInput(390,360);
  await editor.fill('键盘关闭后保留草稿');
  await page.setViewportSize({width:390,height:844}); await settle();
  assert.equal(await editor.innerText(),'键盘关闭后保留草稿');
  await editor.fill(''); await settle();
  const placeholder=page.locator('[data-composer-placeholder]').first();
  const placeholderBounds=await placeholder.boundingBox(), inputBounds=await editor.boundingBox();
  assert.ok(placeholderBounds.y+placeholderBounds.height<=inputBounds.y+inputBounds.height+1,'two-line placeholder fits');
  await snap('placeholder-390');
  // Long model + effort text is a presentation fixture on the real native
  // control. The host may use its icon mode, but must not clip a partial name.
  const model=page.locator('[data-slot="conversation.input.model"] button[aria-haspopup="menu"]').first();
  await model.evaluate(button=>{
    const label=[...button.children].find(n=>n.tagName==='SPAN');
    label.innerHTML='<span style="white-space:nowrap">DeepSeek-V4.1-Flash · Extended reasoning 1017</span>';
  }); await settle();
  const modelLayout=await model.evaluate(button=>{const label=[...button.children].find(n=>n.tagName==='SPAN');return {hidden:getComputedStyle(label).display==='none',clipped:label.scrollWidth>label.clientWidth+1};});
  assert.ok(modelLayout.hidden || !modelLayout.clipped,JSON.stringify(modelLayout));
  within(await model.boundingBox(),390,844,'long model control');
  within(await page.locator('[data-dfl="input-row"]').boundingBox(),390,844,'long model controls row');
  for(const [width,height] of [[768,1024],[1024,768]]) {
    await page.setViewportSize({width,height}); await settle();
    assert.equal(await page.locator('html').getAttribute('data-dfl-size'),'medium');
    assert.equal(await toggle.isVisible(),false);
    assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1),'tablet does not overflow page');
  }
  await page.setViewportSize({width:1280,height:900}); await settle();
  assert.equal(await page.locator('html').getAttribute('data-dfl-size'),'wide');
  assert.equal(await toggle.isVisible(),false);
  await snap('desktop-restored');
  }
  await runContainerRegression();
  assert.deepEqual(blockedRequests, [], 'no external/model requests attempted');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(root,'result.json'),JSON.stringify({sourceHashes,checks:results,errors,blockedRequests,modelRequestsSent:0,syntheticSessionsOnly:true},null,2));
  console.log(`PASS: real host ${results.length} layout/resize cases, native drawers/rightbar, editor, full stats, scrollable menus, tiny viewports and draft preservation`);
} finally { await browser?.close(); server.kill('SIGTERM'); }
