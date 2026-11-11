/** Latest DSH + both plugins in a disposable profile. No user history/model calls.
 * DSH_TEST_NODE/DSH_TEST_CLI select the host, CHROMIUM_PATH the browser.
 * CDP page scale tests real Chromium visualViewport geometry; offsetLeft/Top
 * injection below is explicitly a modeled Safari-pan contract, not Safari QA.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { constants, zstdCompressSync } from "node:zlib";
import { chromium } from "@playwright/test";
const root = resolve(".host-test/sidebar");
const cwd = resolve(root, "workdir");
const executable =
  process.env.DSH_TEST_NODE ||
  "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
const cli =
  process.env.DSH_TEST_CLI ||
  "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js";
const env = {
  PATH: `${resolve(".research/pnpm/node_modules/.bin")}:${process.env.PATH}`,
  LANG: "zh_CN.UTF-8",
  HOME: resolve(root, "home"),
  DSH_HOME: resolve(root, "dsh"),
  XDG_DATA_HOME: resolve(root, "xdg-data"),
  XDG_CACHE_HOME: resolve(root, "xdg-cache"),
  XDG_CONFIG_HOME: resolve(root, "xdg-config"),
  ELECTRON_RUN_AS_NODE: "1",
};
if (!process.env.REUSE_PROFILE) {
await rm(root, { recursive: true, force: true });
await Promise.all(
  [cwd, env.HOME, env.DSH_HOME, "artifacts"].map((path) =>
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
await run(["plugin", "--profile", "web", "add", `link:${resolve("../canvas-visual-20261111")}`]);
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
}
const redact = text => text.replace(/token=[^\s"'<>]+/g,"token=[redacted]");
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
      process.env.CHROMIUM_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }, isMobile: true, hasTouch: true,
    locale: "zh-CN",
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

  await page.locator('[data-dfl=frame]').waitFor();
  const cdp = await page.context().newCDPSession(page);
  const record = async (label) => {
    const data = await page.evaluate(() => {
      const side = document.querySelector('[data-dfl="sidebar"]');
      const frame = document.querySelector('[data-dfl="frame"]');
      const root=side.querySelector("[role=dialog]")??side;
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      return {viewport:{width:innerWidth,height:innerHeight,scale:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop,visualWidth:visualViewport.width},side:rect(side),root:rect(root),frame:rect(frame),scrollX,htmlWidth:document.documentElement.scrollWidth,attrs:frame.outerHTML.slice(0,450)};
    });
    console.log(label,JSON.stringify(data));
    await page.screenshot({path:'artifacts/'+label+'.png'});
  };
  for(const size of [{width:184,height:224},{width:198,height:242},{width:320,height:568},{width:393,height:852},{width:430,height:932},{width:667,height:375},{width:844,height:390},{width:932,height:430},{width:1440,height:900},{width:393,height:852}]){
    await page.setViewportSize(size);await page.waitForTimeout(500);
    const open=page.locator("[data-sidebar-opener]");
    if(await open.isVisible())await open.click();
    else if(await page.locator('[data-dfl=frame]').getAttribute('data-sidebar-collapsed')) await page.locator('[data-sidebar-toggle]').first().click();
    await page.waitForTimeout(500);
    const sideBounds=await page.locator('[data-dfl=sidebar]').boundingBox(); assert.ok(sideBounds.x>=-1 && sideBounds.x+sideBounds.width<=size.width+1,'drawer stays within unzoomed viewport');
    const closeBounds=await page.locator('[data-sidebar-toggle]').first().boundingBox();assert.ok(closeBounds.x>=sideBounds.x && closeBounds.x+closeBounds.width<=sideBounds.x+sideBounds.width+1,'close control stays within drawer');
    if(await page.locator('[data-shortcut-modal=sidebar]').count())assert.equal(await page.locator('[data-shortcut-modal=sidebar]').getAttribute('data-dfl'),null);
    await record('sidebar-'+size.width+'-'+Date.now());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if(await page.locator('[data-dfl=frame]').getAttribute('data-sidebar-drawer')) assert.ok(await page.locator('[data-dfl=frame]').getAttribute('data-sidebar-collapsed'),'Escape closes native drawer');
  }
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});
  await page.waitForTimeout(300);
  const open=page.locator("[data-sidebar-opener]");
  if(await open.isVisible())await open.click();
  await page.waitForTimeout(500);
  await cdp.send('Input.synthesizeScrollGesture',{x:200,y:200,xDistance:-80,yDistance:0,gestureSourceType:'touch'}); await page.waitForTimeout(300); await record('sidebar-pinch');
  for(let cycle=0;cycle<3;cycle++){await page.locator('[data-sidebar-toggle]').first().click();await page.waitForTimeout(300);assert.ok(await page.locator('[data-dfl=frame]').getAttribute('data-sidebar-collapsed'),'zoomed close remains clickable');await page.locator('[data-sidebar-opener]').click();await page.waitForTimeout(300);}
  const zoomBounds=await page.locator('[data-dfl=sidebar]').boundingBox(); const visibleWidth=await page.evaluate(()=>visualViewport.width); assert.ok(zoomBounds.width <= visibleWidth-31, 'zoomed native drawer retains a visible dismiss area');
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'offsetLeft',{configurable:true,get:()=>70});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,get:()=>60});visualViewport.dispatchEvent(new Event('scroll'));});
  await page.waitForTimeout(100);const offsetBounds=await page.locator('[data-dfl=sidebar]').boundingBox();assert.ok(Math.abs(offsetBounds.x-70)<1 && Math.abs(offsetBounds.y-60)<1,'drawer follows modeled Safari viewport pan');
  await page.evaluate(()=>{delete visualViewport.offsetLeft;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('scroll'));});
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await page.waitForTimeout(100);assert.equal(await page.locator('[data-dfl=frame]').getAttribute('data-dfl-visual-drawer'),'false');
  console.log('ERRORS',JSON.stringify(errors));
} finally { await browser?.close(); server.kill('SIGTERM'); }
