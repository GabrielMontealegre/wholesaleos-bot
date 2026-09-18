'use strict';

(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSDashboardAuth = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  var LOCKED_USER_ID = '__wos_unauthenticated__';

  function lockIdentity(app) {
    if (app) {
      app.currentUser = null;
      app.userId = LOCKED_USER_ID;
      app.isAdmin = false;
      app.role = 'user';
      app.unlocked = false;
    }
    root._uid = LOCKED_USER_ID;
    root._APP_USER_ID = LOCKED_USER_ID;
    root._APP_ROLE = 'user';
    root._userRole = 'user';
    root._isAdmin = false;
    root.WOS_DASHBOARD_UNLOCKED = false;
    return LOCKED_USER_ID;
  }

  function applyAuthenticatedUser(app, user) {
    if (!app || !user || !user.id) return false;
    app.currentUser = user;
    app.userId = user.id;
    app.isAdmin = user.role === 'admin';
    app.role = user.role || 'user';
    app.unlocked = true;
    root._uid = user.id;
    root._APP_USER_ID = user.id;
    root._APP_ROLE = app.role;
    root._userRole = app.role;
    root._isAdmin = app.isAdmin;
    root.WOS_DASHBOARD_UNLOCKED = true;
    return true;
  }

  function authHeaders(app, includeJson) {
    var headers = includeJson ? { 'Content-Type': 'application/json' } : {};
    var userId = app && app.unlocked && app.currentUser && app.currentUser.id;
    if (userId) headers['x-user-id'] = userId;
    return headers;
  }

  async function authenticate(pin, options) {
    var opts = options || {};
    var fetchImpl = opts.fetch_impl || root.fetch;
    if (typeof fetchImpl !== 'function') {
      return { ok: false, code: 'LOGIN_TRANSPORT_UNAVAILABLE', status: 0 };
    }

    var request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: String(pin || '') })
    };
    if (root.AbortSignal && typeof root.AbortSignal.timeout === 'function') {
      request.signal = root.AbortSignal.timeout(Number(opts.timeout_ms) || 3000);
    }

    try {
      var response = await fetchImpl('/api/auth/login', request);
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok || !data.user || !data.user.id) {
        return { ok: false, status: Number(response.status) || 0, code: data.code || 'LOGIN_REJECTED' };
      }
      return { ok: true, status: response.status, user: data.user };
    } catch (error) {
      return { ok: false, status: 0, code: 'LOGIN_REQUEST_FAILED' };
    }
  }

  return {
    LOCKED_USER_ID: LOCKED_USER_ID,
    applyAuthenticatedUser: applyAuthenticatedUser,
    authenticate: authenticate,
    authHeaders: authHeaders,
    lockIdentity: lockIdentity
  };
});
