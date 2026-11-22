'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8');
const code = html.slice(html.indexOf('var disposeDashboardLogin = null;'), html.indexOf('\nfunction unlockDashboardUser('));
let mounts = 0, disposals = 0, locks = 0, form = null;
const note = {}, pinScreen = { style: {}, querySelector(selector) { return selector === '#login' ? form : note; } };
const appNode = { style: {} }, app = { unlocked: true, currentUser: { id: 'synthetic-admin' } };
const context = { APP: app, document: { getElementById(id) { return id === 'pin-screen' ? pinScreen : appNode; } },
  unlockDashboardUser() {}, window: {
    WOSDashboardAuth: { lockIdentity(value) { locks++; value.unlocked = false; value.currentUser = null; } },
    WOSDashboardLogin: { mount() { mounts++; form = {}; return () => { disposals++; form = null; }; } }
  } };
vm.runInNewContext(code, context);
context.showDashboardLogin('Synthetic sign in');
const firstForm = form;
for (let index = 0; index < 20; index++) context.showDashboardLogin('Synthetic session ended');
assert.equal(mounts, 1, 'repeated unauthorized responses do not detach a live sign-in form');
assert.equal(disposals, 0);
assert.equal(form, firstForm);
assert.equal(locks, 21, 'every unauthorized event still clears identity and private component caches');
assert.equal(app.unlocked, false); assert.equal(app.currentUser, null);
assert.equal(appNode.style.display, 'none'); assert.equal(pinScreen.style.display, 'flex');
assert.equal(note.textContent, 'Synthetic session ended');
form = null;
context.showDashboardLogin('<synthetic status>');
assert.equal(mounts, 2, 'a removed sign-in form is recreated'); assert.equal(disposals, 1);
context.disposeDashboardLogin(); context.disposeDashboardLogin = null;
context.showDashboardLogin('New synthetic session');
assert.equal(mounts, 3, 'new session loss mounts a fresh form after disposal');
console.log('session-login-stability: actual classic sign-in entry, repeated401 identity/cache clearing without detached controls, removed-form recovery and fresh-session disposal PASS');
