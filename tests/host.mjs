import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from './browser-launch.mjs';

const root = resolve('work/host');
await mkdir(root, { recursive: true });
const env = { ...process.env, DSH_HOME: resolve(root, 'dsh') };
const redact = text => text.replace(/token=[^\s"'<>]+/g, 'token=[redacted]');
await new Promise((done, fail) => {
  const child = spawn('dsh', ['plugin', '--profile', 'web', 'add', `link:${process.cwd()}`], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  child.on('error', fail);
  child.on('exit', code => code === 0 ? done() : fail(new Error(redact(output))));
});
const server = spawn('dsh', ['web', '--host', '127.0.0.1', '--port', '0', '--no-open'], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const url = await new Promise((done, fail) => {
    let output = '';
    const timer = setTimeout(() => fail(new Error(`Host timeout: ${redact(output)}`)), 45000);
    const read = data => {
      output += data;
      const match = output.match(/https?:\/\/127\.0\.0\.1:\d+\/[^\s]*/);
      if (match?.[0].includes('token=')) { clearTimeout(timer); done(match[0]); }
    };
    server.stdout.on('data', read); server.stderr.on('data', read);
    server.on('error', error => { clearTimeout(timer); fail(error); });
    server.on('exit', code => { clearTimeout(timer); fail(new Error(`Host exited ${code}: ${redact(output)}`)); });
  });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('[data-dfl="frame"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  const proceed = page.getByRole('button', { name: /^(继续|Continue)$/ });
  if (await proceed.count()) await proceed.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const dismiss = page.getByRole('button', { name: /^(关闭|Close)$/ });
  if (await dismiss.count()) await dismiss.first().click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(root, 'initial.png') });
  await writeFile(resolve(root, 'page.txt'), await page.locator('body').innerText());
  const compact = await page.locator('[data-dfl="center"]').boundingBox();
  assert.ok(compact.width >= 380, `compact center: ${compact.width}`);
  const toggle = page.locator('[data-dfl-toggle]');
  if (await toggle.getAttribute('aria-expanded') === 'true') { await page.keyboard.press('Escape'); await page.waitForTimeout(100); }
  await toggle.click(); await page.waitForTimeout(100);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const sidebar = await page.locator('[data-dfl="sidebar"]').boundingBox();
  assert.ok(sidebar.width >= 260 && sidebar.x >= 0, 'real sidebar has usable overlay geometry');
  await page.screenshot({ path: resolve(root, 'drawer.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator('[data-dfl="input-standardControls"]').count(), 'real input controls matched');
  await page.screenshot({ path: resolve(root, 'compact.png') });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(200);
  assert.equal(await page.locator('html').getAttribute('data-dfl-size'), 'wide');
  assert.equal(await toggle.isVisible(), false);
  await page.screenshot({ path: resolve(root, 'wide.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(root, 'result.json'), JSON.stringify({ host: '0.2.1-rc.3', compactWidth: compact.width, errors, checks: ['real bundle loading', 'semantic anchors', 'compact center', 'sidebar open/close', 'wide restore'] }, null, 2));
  console.log('PASS: isolated DSH host, plugin bundle loading, compact conversation, native controls, sidebar open/close, desktop restore');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
