import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// One selection policy for every suite, including real-host regressions.
export function browserExecutable({ env = process.env, platform = process.platform,
  bundled = chromium.executablePath(), exists = existsSync } = {}) {
  const override = env.CHROME_PATH || env.CHROMIUM_PATH;
  if (override) {
    if (!exists(override)) throw new Error(`Browser executable does not exist: ${override}. Check CHROME_PATH.`);
    return override;
  }
  const installed = platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : platform === 'win32'
      ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
          .filter(Boolean).map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const executable = [bundled, ...installed].find(path => path && exists(path));
  if (!executable) throw new Error('No Chromium browser found. Run npx playwright install chromium, or set CHROME_PATH to an installed browser executable.');
  return executable;
}

export function launchBrowser(options = {}) {
  return chromium.launch({ headless: true, ...options, executablePath: browserExecutable() });
}
