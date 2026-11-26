// One sign-in for every MaLinda Perry address: the Supabase session lives in a cookie for the whole
// malindaperryconsulting.com domain, so the cockpit and the Tasks app shown inside it share it.
// This is a plain-JS copy of Momentum's app/src/lib/sharedSession.ts. Keep the two the same.
(function () {
  var DOMAIN = 'malindaperryconsulting.com';
  var CHUNK = 3000;
  var MAX_AGE = 60 * 60 * 24 * 400;
  var onDomain = location.hostname === DOMAIN || location.hostname.slice(-(DOMAIN.length + 1)) === '.' + DOMAIN;
  var attrs = function (maxAge) { return '; Domain=.' + DOMAIN + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax; Secure'; };

  function all() {
    var out = {};
    document.cookie.split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    return out;
  }
  function read(key) {
    var c = all(), v = '';
    for (var i = 0; (key + '.' + i) in c; i++) v += c[key + '.' + i];
    if (!v) return null;
    try { return decodeURIComponent(v); } catch (e) { return null; }
  }
  function remove(key) {
    var c = all();
    for (var i = 0; (key + '.' + i) in c; i++) document.cookie = key + '.' + i + '=' + attrs(0);
  }
  function write(key, value) {
    var enc = encodeURIComponent(value);
    remove(key);
    for (var i = 0, n = 0; i < enc.length; i += CHUNK, n++) document.cookie = key + '.' + n + '=' + enc.slice(i, i + CHUNK) + attrs(MAX_AGE);
  }
  var local = null;
  try { local = window.localStorage; } catch (e) { local = null; }

  // Off the shared domain (local preview), fall back to localStorage.
  window.cockpitSessionStorage = onDomain ? {
    getItem: function (k) { return read(k); },
    setItem: function (k, v) { write(k, v); },
    removeItem: function (k) { remove(k); }
  } : {
    getItem: function (k) { try { return local && local.getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) { try { local && local.setItem(k, v); } catch (e) {} },
    removeItem: function (k) { try { local && local.removeItem(k); } catch (e) {} }
  };
})();
