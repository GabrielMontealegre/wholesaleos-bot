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
    return includeJson ? { 'Content-Type': 'application/json' } : {};
  }

  function apiRequestOptions(options) {
    return Object.assign({}, options || {}, { credentials: 'include' });
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
      credentials: 'include',
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

  async function sessionStatus(options) {
    var opts = options || {};
    var fetchImpl = opts.fetch_impl || root.fetch;
    if (typeof fetchImpl !== 'function') return { authenticated: false, code: 'SESSION_TRANSPORT_UNAVAILABLE' };
    try {
      var response = await fetchImpl('/api/auth/session', { credentials: 'include', cache: 'no-store' });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) return { authenticated: false, code: data.code || 'SESSION_STATUS_FAILED' };
      return data;
    } catch (_) {
      return { authenticated: false, code: 'SESSION_STATUS_FAILED' };
    }
  }

  async function restoreSession(app, options) {
    var status = await sessionStatus(options);
    if (!status.authenticated) {
      lockIdentity(app);
      return { ok: false, status: status };
    }
    var user = { id: 'admin', role: status.role || 'user' };
    applyAuthenticatedUser(app, user);
    return { ok: true, user: user, status: status };
  }

  async function logout(app, options) {
    var opts = options || {};
    var fetchImpl = opts.fetch_impl || root.fetch;
    try {
      if (typeof fetchImpl === 'function') {
        await fetchImpl('/api/auth/logout', { method: 'POST', credentials: 'include' });
      }
    } finally {
      lockIdentity(app);
    }
    return { ok: true };
  }

  function installFetchGuard(app, options) {
    var opts = options || {};
    if (!root || typeof root.fetch !== 'function') return false;
    if (root.fetch.__wosSessionGuard) return true;
    var original = root.fetch.bind(root);
    var guarded = async function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url || '';
      var sameApi = /^\/api\//.test(url);
      if (!sameApi) {
        try { sameApi = new URL(url, root.location && root.location.href).origin === root.location.origin && /\/api\//.test(new URL(url, root.location.href).pathname); }
        catch (_) { sameApi = false; }
      }
      var request = sameApi ? apiRequestOptions(init) : init;
      var response = await original(input, request);
      if (sameApi && response.status === 401) {
        lockIdentity(app);
        if (typeof opts.onUnauthorized === 'function') opts.onUnauthorized();
      }
      return response;
    };
    guarded.__wosSessionGuard = true;
    guarded.__wosOriginalFetch = original;
    root.fetch = guarded;
    return true;
  }

  return {
    LOCKED_USER_ID: LOCKED_USER_ID,
    applyAuthenticatedUser: applyAuthenticatedUser,
    authenticate: authenticate,
    authHeaders: authHeaders,
    installFetchGuard: installFetchGuard,
    lockIdentity: lockIdentity,
    logout: logout,
    restoreSession: restoreSession,
    sessionStatus: sessionStatus
  };
});
