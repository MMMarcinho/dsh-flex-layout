/** Real DSH + sibling canvas plugin; synthetic sessions only.
 * Uses a disposable profile under work/mobile-regression. No model requests,
 * user history, normal profile edits or active browser/session reloads.
 * DSH_CANVAS_ROOT may point to a built dsh-canvas-workspace checkout.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { constants, zstdCompressSync } from "node:zlib";
import { chromium } from "@playwright/test";
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
            text: "## 保留当前会话\n\n这条历史回复用于验证原生对话与画布切换，不发送模型请求。",
          },
        ],
      },
    },
    true,
  ),
  event("step/end", 4, { turn: 1, step: 1 }),
  event("turn/end", 5, { turn: 1, reason: { kind: "completed" } }),
];
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
const blankId = `session-${randomUUID()}`;
const extraId = `session-${randomUUID()}`;
for (const [extra, blank, child] of [
  [archiveId, false, false],
  [childId, false, true],
  [extraId, false, false],
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
          sessionIds: [id, archiveId, childId],
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
  const draft = '移动端未发送草稿：中文 English 和 verylongword'.repeat(40)+'\n最后一行 END';
  const snap = name => page.screenshot({path:resolve(root,'artifacts',name+'.png')});
  const within = (box, width, height, name) => assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${name}: ${JSON.stringify(box)} in ${width}x${height}`);
  const closeDrawer = async () => {
    if (await toggle.getAttribute('aria-expanded') === 'true') { await page.keyboard.press('Escape'); await settle(); }
  };
  const checkHeader = async (width, height) => {
    const bounds = await page.locator('[data-dfl="conversation-header"] button').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length && el.offsetWidth && getComputedStyle(el).visibility !== 'hidden').map(el => ({name:el.getAttribute('aria-label') || el.textContent, rect:el.getBoundingClientRect().toJSON()})));
    for (const b of bounds) within(b.rect, width, height, `header ${b.name}`);
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
  assert.equal(await page.locator('[data-dfl="stat-label"]').first().evaluate(el=>getComputedStyle(el).textOverflow),'clip');
  await page.locator('[data-composer-stat="activity"] button').click(); await settle();
  const statDialog=page.locator('[data-dfl="stats-dialog"]');
  await statDialog.waitFor();
  within(await statDialog.boundingBox(),390,844,'statistics details');
  await page.keyboard.press('Escape'); await settle();
  await editor.fill('旋转和切换画布时保留的草稿');
  // The host hides extra tabs under its native overflow menu on phone widths.
  await page.getByRole('button',{name:'更多会话视图',exact:true}).click(); await settle();
  await page.getByRole('menuitem',{name:'画布',exact:true}).click(); await settle();
  await page.locator('[data-canvas-conversation-view] .chat-reply').waitFor();
  for (const [width,height] of [[390,844],[844,390],[320,568],[667,375],[430,932],[932,430],[375,667]]) {
    await page.setViewportSize({width,height}); await settle(); await checkHeader(width,height);
    assert.equal(await toggle.isVisible(),false,'canvas owns navigation');
    assert.equal(await page.locator('[data-dfl="center"]').evaluate(el=>el.inert),false);
    assert.equal(await editor.innerText(),'旋转和切换画布时保留的草稿');
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
  assert.deepEqual(errors,[]);
  await writeFile(resolve(root,'result.json'),JSON.stringify({checks:results,errors,modelRequestsSent:0,syntheticSessionsOnly:true},null,2));
  console.log(`PASS: real host ${results.length} portrait/landscape layouts, native drawers/rightbar, editor, stats, canvas menus, view switching and draft preservation`);
} finally { await browser?.close(); server.kill('SIGTERM'); }
