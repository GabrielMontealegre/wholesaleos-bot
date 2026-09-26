'use strict';

const resolver = require('../../modules/research/playwright-browser-resolver');

function browserVersionLabel(filePath) {
  const parts = String(filePath || '').split(/[\\/]/);
  return parts.find((part) => /^chromium(?:_headless_shell)?-\d+$/i.test(part)) || 'unknown';
}

async function probeBrowser() {
  const playwright = require('playwright');
  try {
    const result = await resolver.launchChromiumWithResolvedBrowser(playwright, { headless: true });
    await result.browser.close();
    return { available: true };
  } catch (error) {
    if (!String(error && error.message || error).startsWith('playwright_browser_unavailable:')) throw error;
    const expectedPath = typeof playwright.chromium.executablePath === 'function'
      ? playwright.chromium.executablePath() : '';
    const foundPaths = resolver.discoverInstalledChromiumExecutables();
    return {
      available: false,
      reason: `SKIPPED: no compatible Chromium (library expects ${browserVersionLabel(expectedPath)}, found ${foundPaths.map(browserVersionLabel).join(', ') || 'none'})`
    };
  }
}

module.exports = { probeBrowser };
