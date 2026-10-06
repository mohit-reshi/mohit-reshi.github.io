/*
 * Shared strip for the hosted apps: a demo notice, a download button, and an owner-only progress sync.
 * Loaded with: <script defer src="./app-chrome.js" data-app="<slug>" data-keys="key1,key2" data-zip="<slug>-local.zip">
 * No third-party requests. Does nothing when the app is opened from a file (the downloaded copy).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var APP = script.getAttribute('data-app') || 'app';
  var KEYS = (script.getAttribute('data-keys') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var ZIP = script.getAttribute('data-zip') || '';
  // Address of the progress-sync worker (not a secret). Left empty until deployed; the owner can also paste it once at sign-in.
  var SYNC_URL = '';
  var P = 'app-chrome:';

  if (location.protocol === 'file:') return;

  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  var ss = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }

  // ---------- style ----------
  var css = document.createElement('style');
  css.textContent =
    '.acx{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:8px 16px;background:#0f2428;color:#e6efed;' +
    'font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;position:relative;z-index:50}' +
    '.acx p{margin:0;flex:1 1 320px}.acx b{font-weight:700}' +
    '.acx a,.acx button{font:inherit;cursor:pointer;border-radius:999px;padding:5px 14px;border:1px solid #6fb3a8;background:transparent;color:#e6efed;text-decoration:none}' +
    '.acx a.acx-dl{background:#e6efed;color:#0f2428;border-color:#e6efed;font-weight:700}' +
    '.acx a:hover,.acx button:hover{filter:brightness(1.1)}.acx a:focus-visible,.acx button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.acx .acx-x{border:0;padding:4px 8px;opacity:.8}.acx .acx-own{border-color:#e1ae4c;color:#e1ae4c}' +
    '.acx-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100}' +
    '.acx-card{background:#fff;color:#111;border-radius:12px;padding:20px;width:min(92vw,380px);font:15px system-ui,sans-serif}' +
    '.acx-card h2{margin:0 0 10px;font-size:18px}.acx-card label{display:block;margin:10px 0 4px;font-size:13px}' +
    '.acx-card input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #888;border-radius:6px;font:inherit}' +
    '.acx-card .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}' +
    '.acx-card button{padding:7px 14px;border-radius:8px;border:1px solid #444;background:#fff;color:#111;font:inherit;cursor:pointer}' +
    '.acx-card button.go{background:#0f2428;color:#fff}.acx-card .msg{margin:8px 0 0;font-size:13px;color:#a00;min-height:1em}' +
    '@media print{.acx{display:none}}';
  document.head.appendChild(css);

  // ---------- banner ----------
  var bar = null;
  var ownerChip = null;
  function buildBar() {
    if (ss.get(P + 'dismissed:' + APP) === '1' && !ownerKey()) return;
    bar = el('div', { 'class': 'acx', role: 'region', 'aria-label': 'About this demo' });
    var msg = el('p');
    var b = el('b', {}, 'Live demo. ');
    msg.appendChild(b);
    msg.appendChild(document.createTextNode(
      'Have a look and see if you like it. Anything you do here stays only in this browser and is lost if you clear site data. ' +
      'To use it every day and keep a reliable personal track, download it and run it on your computer.'));
    bar.appendChild(msg);
    if (ZIP) {
      var dl = el('a', { 'class': 'acx-dl', href: ZIP, download: ZIP }, 'Download for local use');
      bar.appendChild(dl);
    }
    ownerChip = el('button', { type: 'button', 'class': 'acx-own', hidden: '' });
    ownerChip.addEventListener('click', function () { signOut(); });
    bar.appendChild(ownerChip);
    var x = el('button', { type: 'button', 'class': 'acx-x', 'aria-label': 'Hide this notice' }, '×');
    x.addEventListener('click', function () { ss.set(P + 'dismissed:' + APP, '1'); if (bar) bar.remove(); bar = null; });
    bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild);
    renderChip();
  }

  // ---------- owner sync ----------
  var status = '';
  function ownerKey() { return ls.get(P + 'owner-key'); }
  function syncUrl() { return (SYNC_URL || ls.get(P + 'sync-url') || '').replace(/\/+$/, ''); }
  function renderChip() {
    if (!ownerChip) return;
    if (ownerKey()) { ownerChip.hidden = false; ownerChip.textContent = 'Owner: ' + (status || 'signed in'); ownerChip.title = 'Click to sign out'; }
    else ownerChip.hidden = true;
  }
  function setStatus(s) { status = s; renderChip(); }

  function snapshot() {
    var out = {};
    KEYS.forEach(function (k) { var v = ls.get(k); if (v !== null) out[k] = v; });
    return out;
  }
  function metaGet() { try { return JSON.parse(ls.get(P + 'meta:' + APP) || '{}'); } catch (e) { return {}; } }
  function metaSet(m) { ls.set(P + 'meta:' + APP, JSON.stringify(m)); }

  function api(method, body) {
    var url = syncUrl() + '/state/' + encodeURIComponent(APP);
    return fetch(url, {
      method: method,
      headers: { Authorization: 'Bearer ' + ownerKey(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: !!body && body.length < 60000
    });
  }

  var pushing = false;
  function push() {
    if (!ownerKey() || !syncUrl() || pushing) return Promise.resolve();
    var snap = JSON.stringify(snapshot());
    var m = metaGet();
    // Never overwrite the saved copy with an empty one (a fresh browser that has not pulled yet).
    if (snap === m.pushed || snap === '{}') return Promise.resolve();
    pushing = true;
    var at = Date.now();
    return api('PUT', { updatedAt: at, data: JSON.parse(snap) }).then(function (r) {
      if (r.status === 401) { signOut(); setStatus('wrong key'); return; }
      if (!r.ok) { setStatus('sync failed'); return; }
      metaSet({ pushed: snap, updatedAt: at }); setStatus('saved');
    }).catch(function () { setStatus('offline'); }).then(function () { pushing = false; });
  }

  // Pull once on load. A different remote copy replaces the local one and the page reloads once, before the app is used.
  function pull() {
    if (!ownerKey() || !syncUrl()) return Promise.resolve();
    return api('GET').then(function (r) {
      if (r.status === 401) { signOut(); setStatus('wrong key'); return; }
      if (r.status === 404) { return push(); }
      if (!r.ok) { setStatus('sync failed'); return; }
      return r.json().then(function (remote) {
        var m = metaGet();
        var local = JSON.stringify(snapshot());
        var remoteSnap = JSON.stringify(remote.data || {});
        if (remoteSnap === local) { metaSet({ pushed: local, updatedAt: remote.updatedAt }); setStatus('synced'); return; }
        var localChanged = local !== (m.pushed === undefined ? '{}' : m.pushed);
        if (remote.updatedAt > (m.updatedAt || 0) && !localChanged) {
          KEYS.forEach(function (k) { if (remote.data && k in remote.data) ls.set(k, remote.data[k]); else ls.del(k); });
          metaSet({ pushed: remoteSnap, updatedAt: remote.updatedAt });
          if (ss.get(P + 'reloaded') !== '1') { ss.set(P + 'reloaded', '1'); location.reload(); return; }
          setStatus('synced');
        } else {
          return push();
        }
      });
    }).catch(function () { setStatus('offline'); });
  }

  var timer = null;
  function startSync() {
    ss.set(P + 'reloaded', '');
    setStatus('syncing');
    pull().then(function () {
      if (timer) clearInterval(timer);
      timer = setInterval(push, 4000);
    });
  }
  window.addEventListener('pagehide', function () { push(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') push(); });

  function signOut() { ls.del(P + 'owner-key'); if (timer) { clearInterval(timer); timer = null; } renderChip(); }

  // ---------- owner sign-in (Ctrl+Shift+L) ----------
  function openSignIn() {
    if (document.querySelector('.acx-modal')) return;
    var wrap = el('div', { 'class': 'acx-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Owner sign-in' });
    var card = el('form', { 'class': 'acx-card' });
    card.appendChild(el('h2', {}, 'Owner sign-in'));
    var needUrl = !syncUrl();
    var urlIn = null;
    if (needUrl) {
      card.appendChild(el('label', { 'for': 'acx-url' }, 'Sync address'));
      urlIn = el('input', { id: 'acx-url', type: 'url', placeholder: 'https://…', autocomplete: 'off' });
      card.appendChild(urlIn);
    }
    card.appendChild(el('label', { 'for': 'acx-key' }, 'Key'));
    var keyIn = el('input', { id: 'acx-key', type: 'password', autocomplete: 'current-password' });
    card.appendChild(keyIn);
    var msg = el('p', { 'class': 'msg', 'aria-live': 'polite' });
    card.appendChild(msg);
    var row = el('div', { 'class': 'row' });
    var cancel = el('button', { type: 'button' }, 'Cancel');
    var go = el('button', { type: 'submit', 'class': 'go' }, 'Sign in');
    row.appendChild(cancel); row.appendChild(go);
    card.appendChild(row);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    (urlIn || keyIn).focus();
    function close() { wrap.remove(); }
    cancel.addEventListener('click', close);
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      if (urlIn) { var u = urlIn.value.trim(); if (!/^https:\/\//.test(u)) { msg.textContent = 'Enter the https address.'; return; } ls.set(P + 'sync-url', u); }
      if (!keyIn.value) { msg.textContent = 'Enter the key.'; return; }
      ls.set(P + 'owner-key', keyIn.value.trim());
      msg.textContent = 'Checking…';
      api('GET').then(function (r) {
        if (r.status === 401) { ls.del(P + 'owner-key'); msg.textContent = 'That key was not accepted.'; return; }
        if (!r.ok && r.status !== 404) { ls.del(P + 'owner-key'); msg.textContent = 'Could not reach the sync service.'; return; }
        close();
        if (!bar) buildBar();
        renderChip();
        startSync();
      }).catch(function () { ls.del(P + 'owner-key'); msg.textContent = 'Could not reach the sync service.'; });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); openSignIn(); }
  });

  function init() {
    buildBar();
    if (ownerKey()) startSync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
