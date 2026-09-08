'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstErrorLine(error) {
  return cleanText(String(error && error.message || error || '').split(/\r?\n/)[0]) || 'launch_failed';
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function browserRootCandidates(options = {}) {
  const env = options.env || process.env;
  const roots = [];
  if (cleanText(options.browser_root)) roots.push(cleanText(options.browser_root));
  if (cleanText(env.PLAYWRIGHT_BROWSERS_PATH) && cleanText(env.PLAYWRIGHT_BROWSERS_PATH) !== '0') {
    roots.push(cleanText(env.PLAYWRIGHT_BROWSERS_PATH));
  }
  if (cleanText(env.LOCALAPPDATA)) roots.push(path.join(cleanText(env.LOCALAPPDATA), 'ms-playwright'));
  roots.push(path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'));
  roots.push(path.join(os.homedir(), '.cache', 'ms-playwright'));
  roots.push('/ms-playwright');
  return unique(roots.map((root) => path.resolve(root)));
}

function executableCandidatesForBrowserDir(dir) {
  return [
    path.join(dir, 'chrome-win', 'chrome.exe'),
    path.join(dir, 'chrome-linux', 'chrome'),
    path.join(dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    path.join(dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    path.join(dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    path.join(dir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
    path.join(dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')
  ];
}

function discoverInstalledChromiumExecutables(options = {}) {
  const fsImpl = options.fs_impl || fs;
  const found = [];
  for (const root of browserRootCandidates(options)) {
    let names = [];
    try {
      names = fsImpl.readdirSync(root);
    } catch (error) {
      continue;
    }
    const chromiumDirs = names
      .filter((name) => /^chromium(?:_headless_shell)?-\d+$/i.test(name))
      .sort()
      .reverse();
    for (const name of chromiumDirs) {
      const dir = path.join(root, name);
      for (const executablePath of executableCandidatesForBrowserDir(dir)) {
        try {
          const stat = fsImpl.statSync(executablePath);
          if (stat && stat.isFile()) found.push(executablePath);
        } catch (error) {
          // Keep looking across the installed browser cache.
        }
      }
    }
  }
  return unique(found);
}

async function launchChromiumWithResolvedBrowser(playwright, launchOptions = {}, options = {}) {
  if (!playwright || !playwright.chromium || typeof playwright.chromium.launch !== 'function') {
    throw new Error('playwright_chromium_unavailable');
  }
  const defaultOptions = Object.assign({}, launchOptions);
  try {
    const browser = await playwright.chromium.launch(defaultOptions);
    return { browser, runtime: { resolution: 'playwright_default' } };
  } catch (defaultError) {
    const defaultReason = firstErrorLine(defaultError) || 'unknown_default_launch_failure';
    const attempts = [];
    const executablePaths = discoverInstalledChromiumExecutables(options);
    for (const executablePath of executablePaths) {
      try {
        const browser = await playwright.chromium.launch(Object.assign({}, launchOptions, { executablePath }));
        return { browser, runtime: { resolution: 'discovered_playwright_browser', executablePath, default_failure: defaultReason } };
      } catch (error) {
        attempts.push({ executablePath, reason: firstErrorLine(error) });
      }
    }
    const discovered = attempts.length
      ? attempts.map((attempt) => `${attempt.executablePath}: ${attempt.reason}`).join(' | ')
      : 'none_found';
    throw new Error(`playwright_browser_unavailable: default_failed=${defaultReason}; discovered=${discovered}`);
  }
}

module.exports = {
  browserRootCandidates,
  discoverInstalledChromiumExecutables,
  launchChromiumWithResolvedBrowser
};
