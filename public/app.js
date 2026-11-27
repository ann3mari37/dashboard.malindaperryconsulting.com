// MPC Cockpit: one screen for MaLinda Perry Consulting and Happy Girls Don't Do That.
// Reads the Tasks app's database with the signed-in user's session (RLS: her rows only), and calls the Tasks app's
// Worker for Google Calendar and Payhip. Nothing here leaves the page: every app opens as a view first, with an
// Open button (website on a computer, the phone app on mobile).
(function () {
  'use strict';
  var C = window.COCKPIT, CO = C.companies;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var isoDay = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var startOfDay = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var fmtTime = function (d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }); };
  var hours = function (d) { return d.getHours() + d.getMinutes() / 60; };

  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { storage: window.cockpitSessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  /* ---------------- state ---------------- */
  var S = {
    user: null, view: 'all',
    sources: {}, accounts: [], areas: [],
    calAccounts: [], cals: [], events: [], calLoaded: false, calError: null,
    needs: [], recent: [], digest: null,
    tasks: [], stores: [], sales: []
  };
  try { S.view = localStorage.getItem('cockpit.co') || 'all'; } catch (e) {}

  var src = function (kind, ref) { return S.sources[kind + '|' + ref]; };
  // Until a business is picked in Settings, an inbox goes by its address: any part of malindaperryconsulting means
  // MPC, any part of happy girls means Happy Girls, anything else counts for both.
  var coFromAddress = function (email) {
    var e = String(email || '').toLowerCase().replace(/[^a-z]/g, '');
    if (/malinda|perryconsult/.test(e)) return 'mpc';
    if (/happy|girlsdont/.test(e)) return 'hg';
    return 'both';
  };
  var mailCo = function (acct) {
    var s = src('mailbox', acct); if (s) return s.company;
    var a = (S.accounts || []).find(function (x) { return x.id === acct; });
    return coFromAddress(a && a.email_address);
  };
  var calKey = function (acct, cal) { return acct + ':' + cal; };
  var calCo = function (acct, cal) { var s = src('calendar', calKey(acct, cal)); return s ? s.company : mailCo(acct); };
  var areaCo = function (id) { var s = id && src('area', id); return s ? s.company : 'both'; };
  var storeCo = function (id) { var st = S.stores.find(function (x) { return x.id === id; }); return st ? st.company : 'both'; };
  var inView = function (co) { return S.view === 'all' || co === 'both' || co === S.view; };
  var cosInView = function () { return S.view === 'all' ? ['mpc', 'hg'] : [S.view]; };
  // Sales show only the businesses that have a Payhip store, so a business with no products stays out of the numbers.
  var salesCos = function () { var l = cosInView().filter(function (co) { return S.stores.some(function (st) { return st.company === co || st.company === 'both'; }); }); return l.length ? l : cosInView(); };
  var tag = function (co) { return co === 'both' || !CO[co] ? '' : '<span class="cotag" style="background:' + CO[co].bg + ';color:' + CO[co].ink + '">' + esc(CO[co].short) + '</span>'; };

  /* ---------------- api ---------------- */
  async function api(path, body) {
    var sess = (await sb.auth.getSession()).data.session;
    if (!sess) throw new Error('signed_out');
    var res = await fetch(C.api + path, { method: 'POST', headers: { Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(j.error || 'http_' + res.status);
    return j;
  }

  /* ---------------- sign in ---------------- */
  async function boot() {
    var sess = (await sb.auth.getSession()).data.session;
    if (!sess) return showSignIn();
    S.user = sess.user;
    $('#signin').hidden = true; $('#app').hidden = false;
    handleReturn();
    renderStatic();
    await loadAll();
    syncMail();
    setInterval(function () { syncMail().then(loadData); }, 5 * 60 * 1000);
    setInterval(loadCalendar, 15 * 60 * 1000);
    var last = Date.now();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - last > 2 * 60 * 1000) { last = Date.now(); loadData(); syncMail(); }
    });
    subscribeSales();
    maybeAskStartDay();
  }

  /* ---------------- start my day ---------------- */
  // ChatGPT can't be shown inside the page, so "Start my day" opens it in a new tab with the prompt filled in. The
  // prompt carries today's calendar (the connector has no calendar tool) and asks ChatGPT to use the Momentum
  // connector for email and tasks. Asked once a day: not again after Start or Not now on this device, or once the
  // day has been started (a plan in Tasks, or ChatGPT's briefing saved today).
  var SOD_KEY = 'cockpit.startDay';
  function sodSeen() { try { return localStorage.getItem(SOD_KEY) === isoDay(new Date()); } catch (e) { return false; } }
  function sodMark() { try { localStorage.setItem(SOD_KEY, isoDay(new Date())); } catch (e) { /* asks again next load */ } }
  function maybeAskStartDay() {
    var started = S.taskSource === 'plan' || S.chatList;
    if (started || sodSeen() || new Date().getHours() < 4) return;
    var d = $('#sod'); if (d && !d.open && d.showModal) d.showModal();
  }
  function startDayPrompt() {
    var now = new Date(), d0 = startOfDay(now), d1 = addDays(d0, 1);
    var evs = (S.events || []).filter(function (e) { return e.s < d1 && e.e > d0; }).sort(function (a, b) { return a.s - b.s; }).slice(0, 15);
    var cal = evs.length ? evs.map(function (e) { return '- ' + (e.all_day ? 'All day' : fmtTime(e.s) + '–' + fmtTime(e.e)) + ': ' + e.title + ' (' + calOf(e).name + ')'; }).join('\n') : '- Nothing scheduled';
    return [
      'Start my day. Use the Momentum connector.',
      'Today is ' + now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '.',
      '',
      'My calendar today:',
      cal,
      '',
      'Please:',
      '1. Email: call get_inbox, read the threads that matter with read_email_thread, then save_email_briefing with a short summary and a ranked do_first list.',
      '2. Tasks: call get_today and get_overview. Tell me what is due or overdue, and suggest 3 to 5 things for today that fit around my calendar. Keep my pinned first thing first.',
      '3. Give me one short plan for the day: which emails to answer first, my tasks in order, and when to do them between meetings, for MaLinda Perry Consulting and Happy Girls Don\'t Do That.',
      'Ask me before adding, completing or changing anything.'
    ].join('\n');
  }
  function startDay() {
    window.open('https://chatgpt.com/?q=' + encodeURIComponent(startDayPrompt()), '_blank', 'noopener');
    sodMark();
    var d = $('#sod'); if (d && d.open) d.close();
  }
  $('#sodGo').addEventListener('click', startDay);
  $('#sodBtn').addEventListener('click', startDay);
  $('#sodLater').addEventListener('click', function () { sodMark(); $('#sod').close(); });
  function showSignIn() { $('#app').hidden = true; $('#signin').hidden = false; setTimeout(function () { $('#siEmail').focus(); }, 50); }
  $('#signinForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    $('#siErr').textContent = '';
    var r = await sb.auth.signInWithPassword({ email: $('#siEmail').value.trim(), password: $('#siPass').value });
    if (r.error) { $('#siErr').textContent = 'That email and password didn’t match. Try again, or reset your password in Tasks.'; return; }
    boot();
  });
  sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') showSignIn(); });

  function handleReturn() {
    var q = new URLSearchParams(location.search);
    if (q.get('connected')) toast('Google account connected. Its calendars are loading.');
    if (q.get('email_error')) toast('Google didn’t connect (' + q.get('email_error') + '). Try again from Settings.');
    if (q.toString()) history.replaceState(null, '', location.pathname);
  }

  /* ---------------- loading ---------------- */
  async function loadAll() { await Promise.all([loadData(), loadCalendar()]); }
  // The page only reads mail already in the database, so ask the Worker to fetch new mail from Gmail first
  // (it skips an inbox fetched in the last 2 minutes), then show what arrived.
  async function syncMail() {
    try { var r = await api('/api/email/sync', {}); if (r.accounts && r.accounts.some(function (a) { return a.fetched; })) await loadData(); }
    catch (e) { console.warn('mail sync failed', e && e.message); }
  }

  async function loadData() {
    var uid = S.user.id, today = startOfDay(new Date()), todayIso = isoDay(today);
    var monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    var since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    var q = await Promise.all([
      sb.from('cockpit_sources').select('kind,ref,company,shown,color,label'),
      sb.from('email_accounts').select('id,email_address,display_name,color,status,provider,webmail_url'),
      sb.from('life_areas').select('id,name,color').is('archived_at', null).order('sort_order'),
      sb.from('email_messages').select('id,account_id,thread_id,from_name,from_address,subject,summary,snippet,received_at,web_link,category,importance,thread_next_steps')
        .eq('user_id', uid).eq('is_archived', false).in('status', ['new', 'reviewed']).or('category.eq.action_needed,importance.eq.3')
        .order('received_at', { ascending: false }).limit(40),
      sb.from('email_messages').select('id,account_id,thread_id,category,from_name,from_address,subject,summary,snippet,received_at,web_link').eq('user_id', uid).gte('received_at', since24).order('received_at', { ascending: false }).limit(500),
      sb.from('email_digests').select('summary,digest_date,source,author,do_first').order('digest_date', { ascending: false }).limit(1),
      sb.from('daily_checkins').select('plan').eq('user_id', uid).eq('day', todayIso).maybeSingle(),
      sb.from('payhip_stores').select('id,name,company,created_at').order('created_at'),
      sb.from('payhip_sales').select('id,store_id,amount,currency,items,sold_at,refunded').gte('sold_at', monthStart.toISOString()).order('sold_at', { ascending: false }).limit(3000)
    ]);
    S.sources = {};
    (q[0].data || []).forEach(function (r) { S.sources[r.kind + '|' + r.ref] = r; });
    S.accounts = q[1].data || [];
    S.areas = q[2].data || [];
    S.needs = q[3].data || [];
    S.recent = q[4].data || [];
    S.digest = (q[5].data || [])[0] || null;
    // Once the AI chat has written today's briefing, the list is its do-first emails, in its order, with its reason for
    // each. Emails archived, dismissed or turned into tasks since then drop off. Before that, the rule-based list above.
    S.chatList = false;
    var df = S.digest && S.digest.source === 'chat' && S.digest.digest_date === todayIso && Array.isArray(S.digest.do_first) ? S.digest.do_first : null;
    if (df) {
      var ids = df.map(function (d) { return d.message_id; });
      var got = ids.length ? (await sb.from('email_messages').select('id,account_id,thread_id,from_name,from_address,subject,summary,snippet,received_at,web_link,category,importance,thread_next_steps').in('id', ids).eq('is_archived', false).in('status', ['new', 'reviewed'])).data || [] : [];
      var byId = {}; got.forEach(function (m) { byId[m.id] = m; });
      S.needs = df.filter(function (d) { return byId[d.message_id]; }).map(function (d) { var m = byId[d.message_id]; m.why = d.why; return m; });
      S.chatList = true;
    }
    S.stores = q[7].data || [];
    S.sales = (q[8].data || []).filter(function (s) { return !s.refunded; });
    await loadTasks(q[6].data, uid, today);
    renderAll();
  }

  async function loadTasks(checkin, uid, today) {
    var plan = checkin && checkin.plan;
    var idOf = function (x) { return typeof x === 'string' ? x : x && (x.action_id || x.id); };
    var ids = plan ? [].concat(plan.picks || [], plan.done || []).map(idOf).filter(Boolean) : [];
    var cols = 'id,title,status,life_area_id,completed_at,estimated_minutes,due_date';
    if (ids.length) {
      var r = await sb.from('actions').select(cols).in('id', ids);
      S.tasks = r.data || [];
      S.taskSource = 'plan';
    } else {
      // No "Start my day" yet: today's due tasks plus what was finished today.
      var a = await Promise.all([
        sb.from('actions').select(cols).eq('user_id', uid).lte('due_date', isoDay(today)).not('status', 'in', '(completed,dismissed,suggested)').limit(50),
        sb.from('actions').select(cols).eq('user_id', uid).gte('completed_at', today.toISOString()).limit(50)
      ]);
      S.tasks = (a[0].data || []).concat(a[1].data || []);
      S.taskSource = 'due';
    }
  }

  var calStart = function () { return startOfDay(new Date()); };
  async function loadCalendar() {
    try {
      var list = await api('/api/calendar/list');
      S.calAccounts = list.accounts || [];
      S.cals = [];
      S.calAccounts.forEach(function (a) {
        (a.calendars || []).forEach(function (c) {
          var s = src('calendar', calKey(a.account_id, c.id));
          S.cals.push({
            key: calKey(a.account_id, c.id), account_id: a.account_id, id: c.id, email: a.email, name: (s && s.label) || c.name,
            color: (s && s.color) || c.color || '#2F7FD0', can_add: c.can_add, primary: c.primary,
            // New calendars: show the ones she owns, hide subscribed ones (holidays, birthdays) until she turns them on.
            shown: s ? s.shown : (c.primary || c.can_add)
          });
        });
      });
      var shown = S.cals.filter(function (c) { return c.shown; }).slice(0, 20);
      var from = calStart(), to = addDays(from, 7);
      var ev = shown.length ? await api('/api/calendar/events', { from: from.toISOString(), to: to.toISOString(), calendars: shown.map(function (c) { return { account_id: c.account_id, calendar_id: c.id }; }) }) : { events: [] };
      S.events = (ev.events || []).map(function (e) {
        var s = e.all_day ? new Date(e.start + 'T00:00:00') : new Date(e.start);
        var en = e.all_day ? new Date(e.end + 'T00:00:00') : new Date(e.end);
        return Object.assign({}, e, { s: s, e: en, key: calKey(e.account_id, e.calendar_id) });
      });
      S.calError = null;
    } catch (e) {
      S.calError = e.message;
    }
    S.calLoaded = true;
    renderLegend(); renderCal();
  }

  /* ---------------- render ---------------- */
  function renderStatic() {
    $('#dateLine').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function renderAll() {
    document.querySelectorAll('#coSwitch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.co === S.view)); });
    renderLegend(); renderCal(); renderMail(); renderRows();
  }

  // The chat writes email chips as [[email:<id>|Dana · Document review]]; show just the label.
  function plainSummary(t) { return String(t || '').replace(/\[\[email:[^|\]]*\|([^\]]*)\]\]/g, '$1'); }
  function chatName() { return (S.digest && S.digest.author) || 'ChatGPT'; }
  function needsInView() { return S.needs.filter(function (m) { return inView(mailCo(m.account_id)); }); }
  function tasksInView() { return S.tasks.filter(function (t) { return inView(areaCo(t.life_area_id)); }); }
  function salesInView() { return S.sales.filter(function (s) { return inView(storeCo(s.store_id)); }); }
  function eventsInView() {
    return S.events.filter(function (e) { var c = S.cals.find(function (x) { return x.key === e.key; }); return c && c.shown && inView(calCo(e.account_id, e.calendar_id)); });
  }

  /* calendar */
  function renderLegend() {
    var el = $('#legend');
    if (!S.calLoaded) { el.innerHTML = '<span class="gsrc">Loading calendars…</span>'; return; }
    var cals = S.cals.filter(function (c) { return inView(calCo(c.account_id, c.id)); });
    var needs = S.calAccounts.filter(function (a) { return a.status === 'needs_calendar_access'; });
    el.innerHTML = cals.map(function (c) {
      return '<button type="button" data-cal="' + esc(c.key) + '" aria-pressed="' + c.shown + '" title="' + esc(c.email) + '"><i style="border-color:' + esc(c.color) + ';background:' + esc(c.color) + '"></i>' + esc(c.name) + '</button>';
    }).join('') +
      (needs.length ? '<button type="button" class="addcal" data-open-btn="settings"><span class="warn">Reconnect ' + needs.length + ' for calendar</span></button>' : '') +
      '<button type="button" class="addcal" data-open-btn="settings">+ Calendar</button><span class="gsrc">Tap a calendar to show or hide it</span>';
  }
  $('#legend').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cal]'); if (!b) return;
    var c = S.cals.find(function (x) { return x.key === b.dataset.cal; }); if (!c) return;
    c.shown = !c.shown;
    saveSource('calendar', c.key, { shown: c.shown, company: calCo(c.account_id, c.id) }).then(function () { if (c.shown) loadCalendar(); });
    renderLegend(); renderCal();
  });

  function renderCal() {
    var el = $('#cal');
    if (!S.calLoaded) { el.innerHTML = ''; el.classList.add('loading'); return; }
    el.classList.remove('loading');
    if (S.calError && !S.cals.length) {
      el.style.display = 'flex';
      el.innerHTML = '<div class="empty"><b>Your calendar isn’t connected yet.</b>Connect your Google account once and every calendar shows up here.<button type="button" class="btnl" data-connect="1">Connect Google</button></div>';
      return;
    }
    if (!S.calAccounts.length) {
      el.style.display = 'flex';
      el.innerHTML = '<div class="empty"><b>No Google account connected.</b>Connect it once; every device uses the same connection.<button type="button" class="btnl" data-connect="1">Connect Google</button></div>';
      return;
    }
    el.style.display = '';
    var start = calStart(), days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(start, i));
    var evs = eventsInView(), timed = evs.filter(function (e) { return !e.all_day; });
    var START = 8, END = 18;
    timed.forEach(function (e) { START = Math.min(START, Math.floor(hours(e.s))); END = Math.max(END, Math.ceil(e.e.getDate() !== e.s.getDate() ? 24 : hours(e.e))); });
    START = Math.max(6, START); END = Math.min(23, Math.max(END, START + 6));
    var span = END - START, now = new Date();
    var html = '<div></div>' + days.map(function (d, i) {
      var wk = d.getDay() === 0 || d.getDay() === 6;
      return '<div class="dh d' + (i + 1) + (i === 0 ? ' today' : '') + (wk ? ' wk' : '') + '"><b>' + d.getDate() + '</b><span>' + (i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })) + '</span></div>';
    }).join('');
    html += '<div></div>' + days.map(function (d, i) {
      var next = addDays(d, 1);
      var ad = evs.filter(function (e) { return e.all_day && e.s < next && e.e > d; });
      return '<div class="allday d' + (i + 1) + '">' + ad.slice(0, 2).map(function (e) { var c = calOf(e); return '<i class="ad" style="background:' + tint(c.color) + ';color:' + c.color + '" title="' + esc(e.title) + '">' + esc(e.title) + '</i>'; }).join('') + (ad.length > 2 ? '<i class="ad">+' + (ad.length - 2) + '</i>' : '') + '</div>';
    }).join('');
    var hrs = '<div class="hours">';
    for (var x = START + 1; x < END; x++) hrs += '<span style="top:' + ((x - START) / span * 100) + '%">' + (((x + 11) % 12) + 1) + (x < 12 ? 'a' : 'p') + '</span>';
    html += hrs + '</div>';
    days.forEach(function (d, i) {
      var wk = d.getDay() === 0 || d.getDay() === 6, next = addDays(d, 1);
      html += '<div class="day d' + (i + 1) + (i === 0 ? ' today' : '') + (wk ? ' wk' : '') + '" style="background-size:100% ' + (100 / span) + '%">';
      timed.filter(function (e) { return e.s < next && e.e > d; }).forEach(function (e) {
        var c = calOf(e), s = Math.max(START, e.s < d ? 0 : hours(e.s)), en = Math.min(END, e.e > next ? 24 : hours(e.e));
        if (en <= START || s >= END) return;
        var past = e.e <= now;
        html += '<div class="ev' + (past ? ' past' : '') + '" style="--evbg:' + tint(c.color) + ';--evc:' + esc(c.color) + ';--evink:#10292C;top:' + ((s - START) / span * 100) + '%;height:calc(' + (Math.max(en - s, 0.4) / span * 100) + '% - 3px)" title="' + esc(c.name + ': ' + e.title) + '"><b>' + esc(e.title) + '</b><small>' + fmtTime(e.s) + (e.location ? ' · ' + esc(e.location) : '') + '</small></div>';
      });
      if (i === 0 && hours(now) > START && hours(now) < END) html += '<div class="nowline" style="top:' + ((hours(now) - START) / span * 100) + '%" aria-label="Now"></div>';
      html += '</div>';
    });
    el.innerHTML = html;
    var nx = timed.filter(function (e) { return e.s > now && e.s < addDays(start, 1); }).sort(function (a, b) { return a.s - b.s; })[0];
    $('#calNext').textContent = nx ? 'Next: ' + nx.title + ' at ' + fmtTime(nx.s) : 'Nothing else today';
  }
  function calOf(e) { return S.cals.find(function (x) { return x.key === e.key; }) || { color: '#2F7FD0', name: 'Calendar' }; }
  function tint(hex) { // a light background version of a calendar color
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#E3F0FC';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var mix = function (v) { return Math.round(v + (255 - v) * 0.82); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  /* email */
  var initials = function (m) { var n = (m.from_name || m.from_address || '?').replace(/[^A-Za-z ]/g, '').trim().split(/\s+/); return ((n[0] || '?')[0] + ((n[1] || '')[0] || '')).toUpperCase(); };
  var acctColor = function (id) { var a = S.accounts.find(function (x) { return x.id === id; }); return (a && a.color) || '#E0602E'; };
  function renderMail() {
    var list = needsInView();
    var fresh = S.recent.filter(function (m) { return inView(mailCo(m.account_id)); }).length;
    $('#mailSt').textContent = S.chatList ? list.length + ' left from ' + chatName() : fresh + ' new today';
    if (!S.accounts.length) {
      $('#asks').innerHTML = '<div class="empty"><b>No Gmail connected.</b>Connect your Google account once in Settings.<button type="button" class="btnl" data-open-btn="settings">Open Settings</button></div>';
      return;
    }
    var max = (innerWidth < 760 ? 2 : 3) - (S.chatList && S.digest.summary ? 1 : 0);
    $('#asks').innerHTML = '<p class="lead">' + (S.chatList ? (list.length ? '<span>' + list.length + '</span> to do first · ' + esc(chatName()) : 'All done from ' + esc(chatName()) + '’s list.') : (list.length ? '<span>' + list.length + '</span> need' + (list.length === 1 ? 's' : '') + ' a reply' : 'Nothing needs a reply.') + ' <small>· ChatGPT hasn’t sorted today’s email yet</small>') + '</p>' +
      (S.chatList && S.digest.summary ? '<div class="wait">' + esc(plainSummary(S.digest.summary).slice(0, 220)) + '</div>' : '') +
      list.slice(0, max).map(function (m) {
        return '<div class="ask" data-msg="' + esc(m.id) + '"><span class="av" style="background:' + esc(acctColor(m.account_id)) + '">' + esc(initials(m)) + '</span><span class="tx"><b>' + esc(m.from_name || m.from_address) + ' · ' + esc(m.subject || '(no subject)') + ' ' + (S.view === 'all' ? tag(mailCo(m.account_id)) : '') + '</b><span>' + esc(m.why || m.summary || m.snippet || '') + '</span></span><button class="open2" type="button" data-open-btn="email">Open</button></div>';
      }).join('') +
      (list.length > max ? '<div class="wait">+' + (list.length - max) + (S.chatList ? ' more to do first.' : ' more need a reply.') + '</div>' : (S.digest && !S.chatList ? '<div class="wait">' + esc(plainSummary(S.digest.summary).slice(0, 160)) + '</div>' : ''));
  }

  /* numbers */
  function salesNumbers(cos) {
    var now = new Date(), d0 = startOfDay(now), m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    var p0 = new Date(now.getFullYear(), now.getMonth() - 1, 1), pEnd = new Date(p0.getFullYear(), p0.getMonth(), Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), now.getHours(), now.getMinutes());
    var list = S.sales.filter(function (s) { var co = storeCo(s.store_id); return cos.indexOf(co) >= 0 || co === 'both'; });
    var sum = function (from, to) { return list.filter(function (s) { var t = new Date(s.sold_at); return t >= from && t < to; }).reduce(function (a, s) { return a + Number(s.amount); }, 0); };
    var cnt = list.filter(function (s) { return new Date(s.sold_at) >= d0; }).length;
    // A rolling 7 days: exactly 7 x 24 hours back from this moment, not since a day or week began.
    var w0 = new Date(now.getTime() - 7 * 864e5), wList = list.filter(function (s) { return new Date(s.sold_at) >= w0; });
    var spark = []; for (var i = 13; i >= 0; i--) { var a = addDays(d0, -i); spark.push(sum(a, addDays(a, 1))); }
    var month = sum(m0, addDays(d0, 1)), prev = sum(p0, pEnd);
    return { today: sum(d0, addDays(d0, 1)), n: cnt, week: wList.reduce(function (a, s) { return a + Number(s.amount); }, 0), wn: wList.length, month: month, prev: prev, pct: prev ? Math.round((month - prev) / prev * 100) : null, spark: spark };
  }
  function renderRows() {
    var SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    var split = function (fn) { return S.view === 'all' ? '<span class="split">' + ['mpc', 'hg'].map(function (co) { return '<span><b>' + esc(CO[co].short) + '</b> ' + fn(co) + '</span>'; }).join('') + '</span>' : ''; };
    var tasks = tasksInView(), done = tasks.filter(function (t) { return t.status === 'completed'; }).length;
    var tFor = function (co) { var l = S.tasks.filter(function (t) { var c = areaCo(t.life_area_id); return c === co || c === 'both'; }); return l.filter(function (t) { return t.status === 'completed'; }).length + '/' + l.length; };
    var needs = needsInView().length, fresh = S.recent.filter(function (m) { return inView(mailCo(m.account_id)); }).length;
    var eFor = function (co) { return S.needs.filter(function (m) { var c = mailCo(m.account_id); return c === co || c === 'both'; }).length + (S.chatList ? ' to do first' : ' to reply'); };
    var sn = salesNumbers(cosInView());
    var max = Math.max.apply(null, sn.spark.concat([1]));
    var path = sn.spark.map(function (v, i) { return (i ? 'L' : 'M') + (i * 100 / 13).toFixed(1) + ' ' + (22 - v / max * 20).toFixed(1); }).join(' ');
    var salesNote = !S.stores.length ? '<span>Add your Payhip stores in Settings</span>' :
      (salesCos().length > 1 && split(function (co) { return money(salesNumbers([co]).week); }) || '<span>' + money(sn.month) + ' this month' + (sn.pct !== null ? ' <span class="up">' + (sn.pct >= 0 ? '▲' : '▼') + Math.abs(sn.pct) + '%</span>' : '') + '</span>');
    $('#rows').innerHTML =
      '<button class="nr" type="button" data-open-btn="tasks"><span class="ni" style="background:linear-gradient(135deg,#2BB5AE,#126E72)">' + SV + '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12l3 3 5-6"/></svg></span><span class="nm"><b>Tasks today</b>' + (split(tFor) || '<span>' + (tasks.length - done) + ' left' + (S.taskSource === 'due' ? ' · due today' : '') + '</span>') + '</span><span class="v num">' + done + '<small>of ' + tasks.length + '</small></span><span class="bar"><i style="width:' + (tasks.length ? Math.round(done / tasks.length * 100) : 0) + '%;background:#1E9E98"></i></span><span class="chev">›</span></button>' +
      '<button class="nr" type="button" data-open-btn="email"><span class="ni" style="background:linear-gradient(135deg,#FF9A52,#E0602E)">' + SV + '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg></span><span class="nm"><b>Emails</b>' + (split(eFor) || '<span>' + needs + (S.chatList ? ' to do first' : ' need a reply') + '</span>') + '</span><span class="v num">' + fresh + '<small>new</small></span><span class="bar"><i style="width:' + (fresh ? Math.max(6, Math.round(needs / fresh * 100)) : 0) + '%;background:#FF8A4C"></i></span><span class="chev">›</span></button>' +
      '<button class="nr" type="button" data-open-btn="sales"><span class="ni" style="background:linear-gradient(135deg,#8B6CF0,#5B3FC4)">' + SV + '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg></span><span class="nm"><b>Sales' + (S.stores.length ? '<span class="payhip"><i></i>Payhip live</span>' : '') + '</b>' + salesNote + '</span><span class="v num">' + money(sn.today) + '<small class="under">' + money(sn.week) + ' last 7 days</small></span><svg class="mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + '" fill="none" stroke="#8B6CF0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="chev">›</span></button>';
  }

  /* ---------------- company switch ---------------- */
  $('#coSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.view = b.dataset.co; try { localStorage.setItem('cockpit.co', S.view); } catch (err) {}
    renderAll();
  });

  /* ---------------- quick add ---------------- */
  var pop = $('#addPop'), add = { cal: null, day: 0, s: 15, len: 1 };
  function pickers() {
    var cals = S.cals.filter(function (c) { return c.can_add && inView(calCo(c.account_id, c.id)); });
    if (!cals.find(function (c) { return c.key === add.cal; })) add.cal = cals[0] ? cals[0].key : null;
    $('#pickCal').innerHTML = cals.length ? cals.map(function (c) { return '<button type="button" data-pc="' + esc(c.key) + '" aria-pressed="' + (add.cal === c.key) + '"><span style="display:inline-block;width:.55rem;height:.55rem;border-radius:2px;background:' + esc(c.color) + ';margin-right:.3rem"></span>' + esc(c.name) + '</button>'; }).join('') : '<span class="note">Connect Google in Settings first.</span>';
    var days = []; for (var i = 0; i < 7; i++) days.push(addDays(calStart(), i));
    $('#pickDay').innerHTML = days.map(function (d, i) { return '<button type="button" data-day="' + i + '" aria-pressed="' + (add.day === i) + '">' + (i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })) + '</button>'; }).join('');
    $('#pickTime').innerHTML = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(function (t) { var d = new Date(); d.setHours(t, 0, 0, 0); return '<button type="button" data-t="' + t + '" aria-pressed="' + (add.s === t) + '">' + fmtTime(d) + '</button>'; }).join('');
    $('#pickLen').innerHTML = [[0.5, '30 min'], [1, '1 hour'], [1.5, '90 min'], [2, '2 hours']].map(function (v) { return '<button type="button" data-len="' + v[0] + '" aria-pressed="' + (add.len === v[0]) + '">' + v[1] + '</button>'; }).join('');
  }
  function openAdd(open) { pop.hidden = !open; $('#addBtn').setAttribute('aria-expanded', String(open)); if (open) { pickers(); setTimeout(function () { $('#addWhat').focus(); }, 30); } }
  $('#addBtn').addEventListener('click', function () { openAdd(pop.hidden); });
  $('#addCancel').addEventListener('click', function () { openAdd(false); });
  pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') openAdd(false); });
  pop.addEventListener('click', function (e) {
    var b = e.target.closest('.pick button'); if (!b) return;
    if (b.dataset.pc) add.cal = b.dataset.pc;
    if (b.dataset.day) add.day = +b.dataset.day;
    if (b.dataset.t) add.s = +b.dataset.t;
    if (b.dataset.len) add.len = +b.dataset.len;
    pickers();
  });
  pop.addEventListener('submit', async function (e) {
    e.preventDefault();
    var c = S.cals.find(function (x) { return x.key === add.cal; });
    if (!c) { toast('Pick a calendar first.'); return; }
    var s = addDays(calStart(), add.day); s.setHours(Math.floor(add.s), (add.s % 1) * 60, 0, 0);
    var en = new Date(s.getTime() + add.len * 3600 * 1000);
    try {
      await api('/api/calendar/create', { account_id: c.account_id, calendar_id: c.id, title: $('#addWhat').value.trim(), start: s.toISOString(), end: en.toISOString(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      $('#addWhat').value = ''; openAdd(false);
      toast('Added to ' + c.name + ' in Google Calendar.');
      loadCalendar();
    } catch (err) { toast('Couldn’t add it (' + err.message + ').'); }
  });

  /* ---------------- connect Google ---------------- */
  async function connectGoogle() {
    try { var r = await api('/api/email/connect', { provider: 'gmail', return_to: location.origin + '/?connected=1' }); location.href = r.url; }
    catch (e) { toast('Couldn’t start Google sign-in (' + e.message + ').'); }
  }

  async function saveSource(kind, ref, patch) {
    var cur = src(kind, ref) || { kind: kind, ref: ref, company: 'both', shown: true };
    var row = Object.assign({}, { kind: cur.kind, ref: cur.ref, company: cur.company, shown: cur.shown, label: cur.label || null, color: cur.color || null }, patch, { user_id: S.user.id, updated_at: new Date().toISOString() });
    S.sources[kind + '|' + ref] = row;
    var r = await sb.from('cockpit_sources').upsert(row);
    if (r.error) toast('Couldn’t save that change.');
  }

  /* ---------------- views (modals) ---------------- */
  var ua = navigator.userAgent, isIOS = /iPhone|iPad|iPod/.test(ua), isAndroid = /Android/.test(ua);
  var isPhone = isIOS || isAndroid;
  var APPS = {
    email: { name: 'Gmail', web: 'https://mail.google.com', ios: 'googlegmail://', android: 'intent://#Intent;package=com.google.android.gm;end' },
    calendar: { name: 'Google Calendar', web: 'https://calendar.google.com', ios: 'googlecalendar://', android: 'intent://#Intent;package=com.google.android.calendar;end' },
    sales: { name: 'Payhip', web: 'https://payhip.com/analytics' },
    tasks: { name: 'Tasks', web: C.tasksApp },
    links: { name: 'Links', web: C.linksApp },
    sitempc: { name: 'the MPC website', web: CO.mpc.site },
    settings: null
  };
  var ICONS = {
    calendar: ['linear-gradient(135deg,#5AB6F5,#2F7FD0)', '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    email: ['linear-gradient(135deg,#FF9A52,#E0602E)', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>'],
    sales: ['linear-gradient(135deg,#8B6CF0,#5B3FC4)', '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'],
    tasks: ['linear-gradient(135deg,#2BB5AE,#126E72)', '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12l3 3 5-6"/>'],
    links: ['#10292C', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'],
    sitempc: ['#1E9E98', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'],
    settings: ['#53625F', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>']
  };
  var who = function () { return S.view === 'all' ? 'Both businesses' : CO[S.view].name; };
  var gmailLink = function (m) {
    if (m.web_link) return m.web_link;
    var a = S.accounts.find(function (x) { return x.id === m.account_id; });
    return 'https://mail.google.com/mail/u/' + encodeURIComponent(a ? a.email_address : '0') + '/#all/' + encodeURIComponent(m.thread_id || '');
  };

  var VIEWS = {
    calendar: function () {
      var evs = eventsInView().sort(function (a, b) { return a.s - b.s; }), start = calStart(), body = '';
      for (var i = 0; i < 7; i++) {
        var d = addDays(start, i), n = addDays(d, 1);
        var list = evs.filter(function (e) { return e.s < n && e.e > d; });
        body += '<div><p class="mlabel">' + (i === 0 ? 'Today · ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + '</p><div class="mlist">' +
          (list.length ? list.map(function (e) { var c = calOf(e); return '<div class="mrow"><time>' + (e.all_day ? 'All day' : fmtTime(e.s)) + '</time><span class="grow">' + esc(e.title) + (e.location ? '<small>' + esc(e.location) + '</small>' : '') + '</span><span class="cotag" style="background:' + tint(c.color) + ';color:#10292C">' + esc(c.name) + '</span></div>'; }).join('') : '<div class="mrow"><span class="grow" style="color:var(--muted)">Nothing scheduled</span></div>') + '</div></div>';
      }
      return { t: 'Calendar', sub: who() + ' · next 7 days · Google Calendar', note: S.cals.filter(function (c) { return c.shown; }).length + ' calendars shown', body: body };
    },
    email: function () {
      var groups = S.accounts.filter(function (a) { return inView(mailCo(a.id)); });
      var body = S.digest ? '<p class="mtext">' + esc(plainSummary(S.digest.summary)) + '</p>' : '';
      body += groups.map(function (a) {
        var list = S.needs.filter(function (m) { return m.account_id === a.id; });
        return '<div><p class="mlabel">' + esc(a.email_address) + ' ' + tag(mailCo(a.id)) + ' · ' + list.length + (S.chatList ? ' to do first' : ' need a reply') + '</p><div class="mlist">' +
          (list.length ? list.map(function (m) {
            var steps = Array.isArray(m.thread_next_steps) ? m.thread_next_steps.slice(0, 2).join(' · ') : '';
            return '<div class="msg" data-msg="' + esc(m.id) + '"><div class="l1"><b>' + esc(m.from_name || m.from_address) + '</b><span>' + esc(m.subject || '(no subject)') + '</span><small>' + new Date(m.received_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '</small></div>' +
              (m.why ? '<p><b>Why first:</b> ' + esc(m.why) + '</p>' : '') + '<p>' + esc(m.summary || m.snippet || '') + '</p>' + (steps ? '<p><b>Next:</b> ' + esc(steps) + '</p>' : '') +
              '<div class="acts2"><a href="' + esc(gmailLink(m)) + '" target="_blank" rel="noopener">Reply in Gmail ↗</a><button type="button" data-archive="' + esc(m.id) + '">Done · archive</button></div></div>';
          }).join('') : '<div class="msg"><p style="color:var(--muted)">' + (S.chatList ? 'Nothing left to do first here.' : 'Nothing needs a reply here.') + '</p></div>') + '</div></div>';
      }).join('');
      // The "new" count on the Numbers row is mail from the last 24 hours, so list it here too, or that number points at nothing.
      var fresh = S.recent.filter(function (m) { return inView(mailCo(m.account_id)); });
      if (S.accounts.length) body += '<div><p class="mlabel">New in the last 24 hours · ' + fresh.length + '</p><div class="mlist">' +
        (fresh.length ? fresh.slice(0, 30).map(function (m) {
          return '<div class="msg"><div class="l1"><b>' + esc(m.from_name || m.from_address || '') + '</b><span>' + esc(m.subject || '(no subject)') + '</span><small>' + new Date(m.received_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '</small></div>' +
            '<p>' + esc(m.summary || m.snippet || '') + '</p><div class="acts2"><a href="' + esc(gmailLink(m)) + '" target="_blank" rel="noopener">Open in Gmail ↗</a></div></div>';
        }).join('') : '<div class="msg"><p style="color:var(--muted)">No new mail in the last 24 hours.</p></div>') + '</div></div>';
      return { t: 'ChatGPT’s summary', sub: who() + (S.digest ? ' · summary from ' + esc(S.digest.author || 'your assistant') : ''), note: 'Replies happen in Gmail', body: body || '<div class="empty"><b>No Gmail connected.</b></div>' };
    },
    sales: function () {
      var body = '<div class="mstats">' + salesCos().map(function (co) { var n = salesNumbers([co]); return '<div class="mstat"><span>' + esc(CO[co].short) + ' today</span><b class="num">' + money(n.today) + '</b><span>' + money(n.week) + ' last 7 days · ' + n.wn + ' sale' + (n.wn === 1 ? '' : 's') + '</span></div><div class="mstat"><span>' + esc(CO[co].short) + ' this month</span><b class="num">' + money(n.month) + '</b><span>' + (n.pct === null ? 'first month' : (n.pct >= 0 ? '▲' : '▼') + Math.abs(n.pct) + '% vs last month') + '</span></div>'; }).join('') + '</div>';
      var m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      var prod = {};
      salesInView().filter(function (s) { return new Date(s.sold_at) >= m0; }).forEach(function (s) { var k = (s.items && s.items.length ? s.items.join(', ') : 'Sale') + '|' + storeCo(s.store_id); prod[k] = prod[k] || { n: 0, amt: 0 }; prod[k].n++; prod[k].amt += Number(s.amount); });
      var rows = Object.keys(prod).sort(function (a, b) { return prod[b].amt - prod[a].amt; });
      body += '<div><p class="mlabel">This month by product</p><div class="mlist">' + (rows.length ? rows.slice(0, 12).map(function (k) { var p = k.split('|'); return '<div class="mrow"><span class="grow">' + esc(p[0]) + '<small>' + prod[k].n + ' sold</small></span>' + tag(p[1]) + '<span class="n num">' + money(prod[k].amt) + '</span></div>'; }).join('') : '<div class="mrow"><span class="grow" style="color:var(--muted)">No sales yet this month</span></div>') + '</div></div>';
      body += '<div><p class="mlabel">Latest sales</p><div class="mlist">' + (salesInView().slice(0, 12).map(function (s) { return '<div class="mrow"><time>' + new Date(s.sold_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</time><span class="grow">' + esc((s.items || []).join(', ') || 'Sale') + '</span>' + tag(storeCo(s.store_id)) + '<span class="n num">' + money(Number(s.amount)) + '</span></div>'; }).join('') || '<div class="mrow"><span class="grow" style="color:var(--muted)">' + (S.stores.length ? 'No sales yet' : 'Add a Payhip store in Settings') + '</span></div>') + '</div></div>';
      return { t: 'Payhip sales', sub: who() + ' · updates the moment a sale comes in', note: S.stores.length + ' store' + (S.stores.length === 1 ? '' : 's') + ' connected', body: body };
    },
    tasks: function () { return { t: 'Tasks', sub: 'Your Tasks app', note: 'Same sign-in as the cockpit', frame: C.tasksApp }; },
    links: function () { return { t: 'Links', sub: 'Your LinkHub', note: 'Sign in to LinkHub once on this device', frame: C.linksApp }; },
    sitempc: function () { return { t: 'MPC website', sub: 'malindaperryconsulting.com', note: 'Live site', frame: CO.mpc.site }; },
    settings: function () {
      var co = function (val, attrs) { return '<select ' + attrs + '><option value="both"' + (val === 'both' ? ' selected' : '') + '>Both</option><option value="mpc"' + (val === 'mpc' ? ' selected' : '') + '>MPC</option><option value="hg"' + (val === 'hg' ? ' selected' : '') + '>Happy Girls</option></select>'; };
      var empty = function (t) { return '<div class="srow empty1">' + t + '</div>'; };
      var pill = function (ok, t) { return '<span class="spill ' + (ok ? 'ok' : 'warn') + '">' + t + '</span>'; };
      var gmail = S.accounts.filter(function (a) { return a.provider === 'gmail'; });
      var gWarn = gmail.some(function (a) { var ca = S.calAccounts.find(function (x) { return x.account_id === a.id; }); return a.status !== 'active' || (ca && ca.status === 'needs_calendar_access'); });
      var chatUsed = S.digest && S.digest.source === 'chat' ? new Date(S.digest.digest_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      // One section at a time, picked with the tabs, so the page stays short. A dot on a tab shows its state.
      var TABS = [
        ['google', 'Google', gmail.length ? (gWarn ? 'warn' : 'ok') : 'todo'],
        ['calendars', 'Calendars', ''],
        ['areas', 'Task areas', ''],
        ['payhip', 'Payhip', S.stores.length ? 'ok' : 'todo'],
        ['chatgpt', 'ChatGPT', chatUsed ? 'ok' : 'todo']
      ];
      var tab = S.setTab || 'google';
      var sec = function (k, title, line, inner) { return '<section class="ssec" data-ssec="' + k + '"' + (k === tab ? '' : ' hidden') + '><div class="shead"><h3>' + title + '</h3><p>' + line + '</p></div>' + inner + '</section>'; };

      var body = '<nav class="stabs" role="tablist" aria-label="Settings sections">' + TABS.map(function (t) {
        return '<button type="button" role="tab" data-stab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + (t[2] ? '<i class="dot ' + t[2] + '"></i>' : '') + '</button>';
      }).join('') + '</nav>';

      body += sec('google', 'Google accounts', 'Gmail and Google Calendar. Connected once, works on every device.',
        '<div class="mlist">' + (gmail.map(function (a) {
          var ca = S.calAccounts.find(function (x) { return x.account_id === a.id; });
          var st = a.status !== 'active' ? pill(false, 'Reconnect') : ca && ca.status === 'needs_calendar_access' ? pill(false, 'Reconnect for calendar') : pill(true, 'Connected');
          return '<div class="srow"><span class="swatch" style="background:' + esc(a.color || '#E0602E') + '"></span><span class="grow"><b>' + esc(a.email_address) + '</b></span>' + st + co(mailCo(a.id), 'data-src="mailbox" data-ref="' + esc(a.id) + '" aria-label="Business for ' + esc(a.email_address) + '"') + '</div>';
        }).join('') || empty('No Google account yet.')) + '</div>' +
        '<div class="sacts"><button type="button" class="btnl primary" data-connect="1">+ Connect a Google account</button><span class="hint">Also reconnects an account that needs it.</span></div>');

      body += sec('calendars', 'Calendars', 'Choose which calendars show on the cockpit, and which business each is for.',
        '<div class="mlist">' + (S.cals.map(function (c) {
          return '<div class="srow"><span class="swatch" style="background:' + esc(c.color) + '"></span><span class="grow"><b>' + esc(c.name) + '</b><small>' + esc(c.email) + (c.can_add ? '' : ' · view only') + '</small></span><label class="tog"><input type="checkbox" data-show="' + esc(c.key) + '"' + (c.shown ? ' checked' : '') + '><span>Show</span></label>' + co(calCo(c.account_id, c.id), 'data-src="calendar" data-ref="' + esc(c.key) + '" aria-label="Business for ' + esc(c.name) + '"') + '</div>';
        }).join('') || empty('Calendars appear after you connect Google.')) + '</div>');

      body += sec('areas', 'Task areas', 'Which business each area in Tasks belongs to.',
        '<div class="mlist">' + (S.areas.map(function (a) {
          return '<div class="srow"><span class="swatch" style="background:' + esc(a.color || '#1E9E98') + '"></span><span class="grow"><b>' + esc(a.name) + '</b></span>' + co(areaCo(a.id), 'data-src="area" data-ref="' + esc(a.id) + '" aria-label="Business for ' + esc(a.name) + '"') + '</div>';
        }).join('') || empty('No areas in Tasks yet.')) + '</div>');

      body += sec('payhip', 'Payhip', 'New sales arrive by themselves. For earlier sales, import Payhip’s sales export (CSV) once.',
        '<div class="mlist" id="storeList">' + (S.stores.map(function (s) {
          var n = S.sales.filter(function (x) { return x.store_id === s.id; }).length;
          return '<div class="srow"><span class="grow"><b>' + esc(s.name) + '</b> ' + tag(s.company) + '<small>Added ' + new Date(s.created_at).toLocaleDateString() + ' · ' + n + ' sale' + (n === 1 ? '' : 's') + ' since last month</small></span>' + pill(true, 'Live') +
            '<label class="btnl" style="cursor:pointer">Import past sales<input type="file" accept=".csv,text/csv" data-import="' + esc(s.id) + '" hidden></label><button type="button" class="btnl quiet" data-delstore="' + esc(s.id) + '">Remove</button></div>';
        }).join('') || empty('No store yet.')) + '</div>' +
        '<details class="sadd"' + (S.stores.length ? '' : ' open') + '><summary>+ Add a Payhip store</summary>' +
        '<form class="addstore" id="addStore"><input id="stName" placeholder="Store name" required maxlength="80" aria-label="Store name">' + co('mpc', 'id="stCo" aria-label="Business"') + '<input id="stKey" placeholder="Payhip API key (optional)" aria-label="Payhip API key, optional" autocomplete="off"><button type="submit" class="btnl primary">Add store</button></form><div id="hookOut"></div></details>');

      // ChatGPT: the Momentum connector is added once to the ChatGPT account, so it works on every device signed in to ChatGPT.
      var testPrompt = 'Use the Momentum connector: call get_today and tell me my first three tasks. If you can’t reach Momentum, tell me how to turn the connector on in this chat.';
      body += sec('chatgpt', 'ChatGPT', (chatUsed ? pill(true, 'Connected') + ' Last briefing ' + esc(chatUsed) + '. ' : '') + 'Add the Momentum connector once to your ChatGPT account; it then works on every device.',
        '<ol class="steps">' +
        '<li><span class="grow"><b>Copy the connector address</b><code id="mcpUrl">' + esc(C.api + '/api/mcp') + '</code></span><button type="button" class="btnl" id="copyMcp">Copy</button></li>' +
        '<li><span class="grow"><b>Add it in ChatGPT</b><small>Settings → Connectors → add a custom one named Momentum, then sign in with this cockpit’s account.</small></span><a class="btnl" href="https://chatgpt.com/#settings/Connectors" target="_blank" rel="noopener">Open ChatGPT ↗</a></li>' +
        '<li><span class="grow"><b>Test it</b><small>Opens ChatGPT with a short test question.</small></span><a class="btnl" href="https://chatgpt.com/?q=' + encodeURIComponent(testPrompt) + '" target="_blank" rel="noopener">Test ↗</a></li>' +
        '</ol>');

      body += '<div class="sfoot"><button type="button" class="linkbtn" id="signOut">Sign out of this device</button></div>';
      return { t: 'Settings', sub: 'Your connections, and which business each one belongs to', note: 'Saved for every device', body: body };
    }
  };

  var modal = $('#modal');
  function openView(k) {
    var v = VIEWS[k] && VIEWS[k](); if (!v) return;
    var ic = ICONS[k];
    $('#mIcon').style.background = ic[0];
    $('#mIcon').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic[1] + '</svg>';
    $('#mTitle').textContent = v.t; $('#mSub').innerHTML = v.sub; $('#mNote').textContent = v.note || '';
    modal.classList.toggle('framed', !!v.frame);
    $('#mBody').innerHTML = v.frame ? '<iframe src="' + esc(v.frame) + '" title="' + esc(v.t) + '" allow="clipboard-write"></iframe>' : v.body;
    var app = APPS[k], g = $('#mGo'), g2 = $('#mGo2');
    $('#mFoot').hidden = !app || !app.web;
    if (app && app.web) {
      if (isPhone && (app.ios || app.android)) {
        g.textContent = 'Open the ' + app.name + ' app'; g.href = isIOS ? app.ios : app.android; g.removeAttribute('target');
        g2.hidden = false; g2.textContent = 'Open in browser ↗'; g2.href = app.web;
      } else {
        g.textContent = 'Open ' + app.name + ' ↗'; g.href = app.web; g.setAttribute('target', '_blank'); g2.hidden = true;
      }
    }
    modal.dataset.view = k;
    if (!modal.open) { if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', ''); }
  }
  function closeView() { if (modal.open) { if (modal.close) modal.close(); else modal.removeAttribute('open'); } $('#mBody').innerHTML = ''; }
  $('#mClose').addEventListener('click', closeView);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeView(); });
  modal.addEventListener('close', function () { $('#mBody').innerHTML = ''; });

  document.addEventListener('click', function (e) {
    var stab = e.target.closest('[data-stab]');
    if (stab) {
      S.setTab = stab.dataset.stab;
      document.querySelectorAll('[data-stab]').forEach(function (b) { b.setAttribute('aria-selected', String(b === stab)); });
      document.querySelectorAll('[data-ssec]').forEach(function (x) { x.hidden = x.dataset.ssec !== S.setTab; });
      return;
    }
    if (e.target.closest('[data-connect]')) { connectGoogle(); return; }
    var btn = e.target.closest('[data-open-btn]');
    if (btn) { openView(btn.dataset.openBtn); return; }
    if (e.target.closest('.ask')) { openView('email'); return; }
    if (e.target.closest('button, a, input, select, label, form, dialog')) return;
    var z = e.target.closest('[data-open]');
    if (z) openView(z.dataset.open);
  });

  /* settings + email actions inside the modal */
  modal.addEventListener('change', async function (e) {
    // Past sales: Payhip's API can't list sales and webhooks start when a store is added, so history comes from
    // Payhip's sales export (CSV). The Worker reads it and skips sales already here.
    var imp = e.target.closest('input[data-import]');
    if (imp) {
      var file = imp.files && imp.files[0]; if (!file) return;
      if (file.size > 5000000) { toast('That file is too big. Export a shorter date range.'); imp.value = ''; return; }
      toast('Importing…');
      try {
        var r = await api('/api/payhip/import', { store_id: imp.dataset.import, csv: await file.text() });
        toast(r.added ? 'Imported ' + r.added + ' past sale' + (r.added === 1 ? '' : 's') + '.' : r.found ? 'Those sales were already here.' : 'No sales found in that file.');
        await loadData();
      } catch (err) { toast(err.message === 'not_a_sales_export' ? 'That doesn’t look like a Payhip sales export.' : 'Couldn’t import it. Try again.'); }
      imp.value = '';
      return;
    }
    var sel = e.target.closest('select[data-src]');
    if (sel) {
      saveSource(sel.dataset.src, sel.dataset.ref, { company: sel.value }).then(function () { renderAll(); });
      return;
    }
    var chk = e.target.closest('input[data-show]');
    if (chk) {
      var c = S.cals.find(function (x) { return x.key === chk.dataset.show; }); if (!c) return;
      c.shown = chk.checked;
      saveSource('calendar', c.key, { shown: c.shown, company: calCo(c.account_id, c.id) }).then(loadCalendar);
    }
  });
  modal.addEventListener('submit', async function (e) {
    if (e.target.id !== 'addStore') return;
    e.preventDefault();
    try {
      var body = { name: $('#stName').value.trim(), company: $('#stCo').value };
      var key = $('#stKey').value.trim(); if (key) body.api_key = key;
      var r = await api('/api/payhip/stores', body);
      S.stores.push(r.store);
      $('#hookOut').innerHTML = '<div class="hookbox"><code id="hookUrl">' + esc(r.webhook_url) + '</code><button type="button" class="btnl" id="copyHook">Copy</button></div><p class="note" style="padding:.4rem .8rem">Paste this into Payhip’s webhook settings for ' + esc(r.store.name) + '. It is shown only once.</p>';
      $('#stName').value = ''; $('#stKey').value = '';
      renderRows();
    } catch (err) { toast('Couldn’t add the store (' + err.message + ').'); }
  });
  modal.addEventListener('click', async function (e) {
    if (e.target.id === 'copyHook' || e.target.id === 'copyMcp') {
      var box = $(e.target.id === 'copyHook' ? '#hookUrl' : '#mcpUrl'), t = box.textContent;
      try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch (err) { var r = document.createRange(); r.selectNodeContents(box); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Copy it with your keyboard.'); }
      return;
    }
    if (e.target.id === 'signOut') { await sb.auth.signOut(); closeView(); showSignIn(); return; }
    var del = e.target.closest('[data-delstore]');
    if (del) {
      if (del.dataset.confirm !== '1') { del.dataset.confirm = '1'; del.textContent = 'Tap again to remove'; return; }
      try { await api('/api/payhip/stores/delete', { store_id: del.dataset.delstore }); S.stores = S.stores.filter(function (s) { return s.id !== del.dataset.delstore; }); S.sales = S.sales.filter(function (s) { return s.store_id !== del.dataset.delstore; }); openView('settings'); renderRows(); }
      catch (err) { toast('Couldn’t remove it.'); }
      return;
    }
    var arc = e.target.closest('[data-archive]');
    if (arc) {
      try {
        await api('/api/email/modify', { message_ids: [arc.dataset.archive], op: 'archive' });
        S.needs = S.needs.filter(function (m) { return m.id !== arc.dataset.archive; });
        arc.closest('.msg').remove(); renderMail(); renderRows(); toast('Archived in Gmail.');
      } catch (err) { toast('Couldn’t archive it.'); }
    }
  });

  /* ---------------- live sales ---------------- */
  function subscribeSales() {
    try {
      sb.channel('cockpit-sales').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payhip_sales' }, function (p) {
        var s = p.new; if (!s || s.refunded) return;
        S.sales.unshift(s); renderRows();
        toast('New sale: ' + money(Number(s.amount)) + ((s.items || []).length ? ' · ' + s.items[0] : ''));
      }).subscribe();
    } catch (e) { /* live updates are a bonus; the page refreshes every 5 minutes anyway */ }
  }

  var tt;
  function toast(m) { var el = $('#toast'); el.textContent = m; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove('show'); }, 2800); }

  boot();
})();
