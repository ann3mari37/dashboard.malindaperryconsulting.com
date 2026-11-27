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

  // One icon and one color for each kind of thing, used everywhere it appears: the dock, the section headers, the
  // Numbers lines and the views. Change a kind here and every place follows.
  var KINDS = {
    calendar: { bg: 'linear-gradient(135deg,#5AB6F5,#2F7FD0)', solid: '#2F7FD0', svg: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
    email: { bg: 'linear-gradient(135deg,#FF9A52,#E0602E)', solid: '#E0602E', svg: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>' },
    tasks: { bg: 'linear-gradient(135deg,#3CC68A,#1E8E5A)', solid: '#22A06B', svg: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12l3 3 5-6"/>' },
    sales: { bg: 'linear-gradient(135deg,#8B6CF0,#5B3FC4)', solid: '#7A5CE6', svg: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>' },
    numbers: { bg: 'linear-gradient(135deg,#F2C14E,#C98A12)', solid: '#C98A12', svg: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
    links: { bg: 'linear-gradient(135deg,#3A5357,#10292C)', solid: '#10292C', svg: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' },
    sitempc: { bg: 'linear-gradient(135deg,#2BB5AE,#1E9E98)', solid: '#1E9E98', svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>' },
    settings: { bg: 'linear-gradient(135deg,#7A8986,#53625F)', solid: '#53625F', svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>' },
    sun: { bg: 'linear-gradient(135deg,#FF9A52,#F2607F)', solid: '#F2607F', svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' }
  };
  var kSvg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + KINDS[k].svg + '</svg>'; };
  document.querySelectorAll('[data-ic]').forEach(function (el) { var k = KINDS[el.dataset.ic]; if (!k) return; el.style.background = k.bg; el.innerHTML = kSvg(el.dataset.ic); });

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
      '2. Tasks: call get_today and get_overview. Tell me what is due or overdue. get_today also returns yesterday: list what was on yesterday\'s plan but not finished (not_finished) and offer to carry it over, mention what I did finish, and read my end-of-day note.',
      '3. Yesterday: look back at what we talked about yesterday (our chats and anything you remember) and pull out anything that should become a to-do or shape today: promises I made, follow-ups, ideas I said I\'d act on, things I was waiting on.',
      '4. Suggest 3 to 5 things for today that fit around my calendar, counting the carry-overs and anything from yesterday\'s conversations. Keep my pinned first thing first.',
      '5. Give me one short plan for the day: which emails to answer first, my tasks in order, and when to do them between meetings, for MaLinda Perry Consulting and Happy Girls Don\'t Do That.',
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
      S.events = mapEvents(ev.events);
      S.calError = null;
    } catch (e) {
      S.calError = e.message;
    }
    S.calLoaded = true;
    renderLegend(); renderCal();
    if (cxd && cxd.open) { renderCXSide(); renderCXMain(); }
  }
  function mapEvents(list) {
    return (list || []).map(function (e) {
      var s = e.all_day ? new Date(e.start + 'T00:00:00') : new Date(e.start);
      var en = e.all_day ? new Date(e.end + 'T00:00:00') : new Date(e.end);
      return Object.assign({}, e, { s: s, e: en, key: calKey(e.account_id, e.calendar_id) });
    });
  }
  // Events for any range (the expanded calendar moves around freely). Kept per range and calendar set until an
  // event is added, so going back and forth is instant.
  var RANGE = {};
  function fetchRange(from, to) {
    var shown = S.cals.filter(function (c) { return c.shown; }).slice(0, 20);
    var key = from.getTime() + '|' + to.getTime() + '|' + shown.map(function (c) { return c.key; }).join(',');
    if (RANGE[key]) return RANGE[key];
    var p = shown.length ? api('/api/calendar/events', { from: from.toISOString(), to: to.toISOString(), calendars: shown.map(function (c) { return { account_id: c.account_id, calendar_id: c.id }; }) }).then(function (r) { return mapEvents(r.events); }) : Promise.resolve([]);
    RANGE[key] = p;
    p.catch(function () { delete RANGE[key]; });
    return p;
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
    // A side list like Google Calendar's: calendars grouped under their Google address (sorted), each with a box
    // to show or hide it. The account's own calendar comes first and is called "Main calendar".
    el.innerHTML = calListHtml();
  }
  function calListHtml() {
    var cals = S.cals.filter(function (c) { return inView(calCo(c.account_id, c.id)); });
    var needs = S.calAccounts.filter(function (a) { return a.status === 'needs_calendar_access'; });
    var groups = {};
    cals.forEach(function (c) { (groups[c.email] = groups[c.email] || []).push(c); });
    var html = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }).map(function (email) {
      var list = groups[email].slice().sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.name.localeCompare(b.name); });
      return '<div class="cgroup"><p class="caddr" title="' + esc(email) + '">' + esc(email).replace('@', '@<wbr>') + '</p>' + list.map(function (c) {
        return '<button type="button" data-cal="' + esc(c.key) + '" aria-pressed="' + c.shown + '" title="' + (c.shown ? 'Hide ' : 'Show ') + esc(c.name) + '"><i style="border-color:' + esc(c.color) + ';background:' + esc(c.color) + '"></i><span>' + esc(c.primary ? 'Main calendar' : c.name) + '</span></button>';
      }).join('') + '</div>';
    }).join('');
    return (html || '<p class="caddr">No calendars yet</p>') +
      (needs.length ? '<button type="button" class="addcal" data-open-btn="settings" data-tab="google"><span class="warn">Reconnect ' + needs.length + ' for calendar</span></button>' : '') +
      '<button type="button" class="addcal" data-open-btn="settings" data-tab="google">+ Add account</button>';
  }
  function toggleCal(key) {
    var c = S.cals.find(function (x) { return x.key === key; }); if (!c) return;
    c.shown = !c.shown;
    saveSource('calendar', c.key, { shown: c.shown, company: calCo(c.account_id, c.id) }).then(function () { if (c.shown) { loadCalendar(); if (cxd.open) loadCX(); } });
    renderLegend(); renderCal();
    if (cxd.open) { renderCXSide(); renderCXMain(); }
  }
  // The calendar list is a side menu with its own ☰ button, like a classic menu; when collapsed only that button
  // stays. The choice is kept on this device. On a phone there's no room for it: a Calendars button opens Settings.
  var SIDE_KEY = 'cockpit.calSide';
  function setCalSide(open) {
    $('.calzone').classList.toggle('side-closed', !open);
    var mb = $('#calMenuBtn'); mb.setAttribute('aria-expanded', String(open)); mb.title = open ? 'Hide the calendar list' : 'Show the calendar list'; mb.setAttribute('aria-label', mb.title);
    mb.innerHTML = open ? '<span class="mbi" aria-hidden="true">☰</span><span class="mbt">Collapse</span>' : '<span class="mbi" aria-hidden="true">☰</span>';
    try { localStorage.setItem(SIDE_KEY, open ? '1' : '0'); } catch (e) { /* not kept */ }
  }
  (function () { var v = null; try { v = localStorage.getItem(SIDE_KEY); } catch (e) { /* default */ } setCalSide(v !== '0'); })();
  $('#calMenuBtn').addEventListener('click', function () { setCalSide($('.calzone').classList.contains('side-closed')); });
  $('#legend').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cal]'); if (b) toggleCal(b.dataset.cal);
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
  // Gmail's way of dating mail in a list: the time for today, "Nov 24" for earlier this year, the full date before that.
  var gmTime = function (iso) {
    var d = new Date(iso), now = new Date();
    if (sameDay(d, now)) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'numeric', day: 'numeric', year: '2-digit' });
  };
  var sender = function (m) { return m.from_name || m.from_address || '(unknown sender)'; };
  // One email as Gmail shows it: sender, subject, then the summary; the address and full date on hover.
  function mailHead(m) {
    return '<div class="l1"><b class="from" title="' + esc(m.from_address || '') + '">' + esc(sender(m)) + '</b>' + (acctOf(m) ? '<small class="to">to ' + esc(acctOf(m).email_address) + '</small>' : '') + (S.view === 'all' ? tag(mailCo(m.account_id)) : '') +
      '<time title="' + esc(new Date(m.received_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) + '">' + esc(gmTime(m.received_at)) + '</time></div>' +
      '<div class="subj">' + esc(m.subject || '(no subject)') + '</div>';
  }
  function renderMail() {
    var list = needsInView();
    var fresh = S.recent.filter(function (m) { return inView(mailCo(m.account_id)); }).length;
    $('#mailSt').textContent = S.chatList ? list.length + ' left from ' + chatName() : fresh + ' new today';
    if (!S.accounts.length) {
      $('#asks').innerHTML = '<div class="empty"><b>No Gmail connected.</b>Connect your Google account once in Settings.<button type="button" class="btnl" data-open-btn="settings">Open Settings</button></div>';
      return;
    }
    var max = (innerWidth < 760 ? 2 : 3) - (S.chatList && S.digest.summary ? 1 : 0) - (S.chatList ? 0 : 1);
    $('#asks').innerHTML = '<p class="lead">' + (S.chatList ? (list.length ? '<span>' + list.length + '</span> to do first · ' + esc(chatName()) : 'All done from ' + esc(chatName()) + '’s list.') : (list.length ? '<span>' + list.length + '</span> need' + (list.length === 1 ? 's' : '') + ' a reply' : 'Nothing needs a reply.')) + '</p>' + (S.chatList ? '' : sodCta()) +
      (S.chatList && S.digest.summary ? '<div class="wait">' + esc(plainSummary(S.digest.summary).slice(0, 220)) + '</div>' : '') +
      list.slice(0, max).map(function (m) {
        var more = m.why || m.summary || m.snippet || '';
        return '<div class="ask gm" data-msg="' + esc(m.id) + '"><span class="av" style="background:' + esc(acctColor(m.account_id)) + '">' + esc(initials(m)) + '</span><span class="tx"><span class="r1"><b class="from" title="' + esc(m.from_address || '') + '">' + esc(sender(m)) + '</b>' + (S.view === 'all' ? tag(mailCo(m.account_id)) : '') + '<time>' + esc(gmTime(m.received_at)) + '</time></span><span class="r2"><b>' + esc(m.subject || '(no subject)') + '</b>' + (more ? '<span> – ' + esc(more) + '</span>' : '') + '</span></span><button class="open2" type="button" data-open-btn="email">Open</button></div>';
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
      '<button class="nr" type="button" data-open-btn="tasks"><span class="ni" style="background:' + KINDS.tasks.bg + '">' + kSvg('tasks') + '</span><span class="nm"><b>Tasks today</b>' + (split(tFor) || '<span>' + (tasks.length - done) + ' left' + (S.taskSource === 'due' ? ' · due today' : '') + '</span>') + '</span><span class="v num">' + done + '<small>of ' + tasks.length + '</small></span><span class="bar"><i style="width:' + (tasks.length ? Math.round(done / tasks.length * 100) : 0) + '%;background:' + KINDS.tasks.solid + '"></i></span><span class="chev">›</span></button>' +
      '<button class="nr" type="button" data-open-btn="email"><span class="ni" style="background:' + KINDS.email.bg + '">' + kSvg('email') + '</span><span class="nm"><b>Emails</b>' + (split(eFor) || '<span>' + needs + (S.chatList ? ' to do first' : ' need a reply') + '</span>') + '</span><span class="v num">' + fresh + '<small>new</small></span><span class="bar"><i style="width:' + (fresh ? Math.max(6, Math.round(needs / fresh * 100)) : 0) + '%;background:' + KINDS.email.solid + '"></i></span><span class="chev">›</span></button>' +
      '<button class="nr" type="button" data-open-btn="sales"><span class="ni" style="background:' + KINDS.sales.bg + '">' + kSvg('sales') + '</span><span class="nm"><b>Sales' + (S.stores.length ? '<span class="payhip"><i></i>Payhip live</span>' : '') + '</b>' + salesNote + '</span><span class="v num">' + money(sn.today) + '<small class="under">' + money(sn.week) + ' last 7 days</small></span><svg class="mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + '" fill="none" stroke="' + KINDS.sales.solid + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="chev">›</span></button>';
  }

  /* ---------------- company switch ---------------- */
  $('#coSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.view = b.dataset.co; try { localStorage.setItem('cockpit.co', S.view); } catch (err) {}
    renderAll();
  });

  /* ---------------- calendar helpers ---------------- */
  var SV2 = function (p, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IC = {
    left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    check: '<path d="M5 12l5 5L20 7"/>', warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
  };
  var sameDay = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  var parseIso = function (s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  // Google Calendar's way of writing times: 9am, 1:30pm.
  var fmtMin = function (m) { var h = Math.floor(m / 60) % 24, mm = m % 60; return ((h + 11) % 12 + 1) + (mm ? ':' + pad(mm) : '') + (h < 12 ? 'am' : 'pm'); };
  var minOf = function (d) { return d.getHours() * 60 + d.getMinutes(); };
  var durLabel = function (m) { if (m < 60) return m + ' mins'; var h = m / 60; return (h % 1 ? h.toFixed(2).replace(/0$/, '') : h) + (h === 1 ? ' hr' : ' hrs'); };
  var tzLong = function () { try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' }).formatToParts(new Date()).find(function (p) { return p.type === 'timeZoneName'; }).value; } catch (e) { return Intl.DateTimeFormat().resolvedOptions().timeZone; } };
  var tzShort = function () { try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find(function (p) { return p.type === 'timeZoneName'; }).value; } catch (e) { return ''; } };
  var calsInView = function (list) { return list.filter(function (e) { var c = S.cals.find(function (x) { return x.key === e.key; }); return c && c.shown && inView(calCo(e.account_id, e.calendar_id)); }); };
  var writableCals = function () { return S.cals.filter(function (c) { return c.can_add && inView(calCo(c.account_id, c.id)); }).sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.email.localeCompare(b.email) || a.name.localeCompare(b.name); }); };
  var calLabel = function (c) { return c.primary ? 'Main calendar' : c.name; };
  function whenText(ev) {
    var dl = function (d) { return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); };
    if (ev.all_day) { var last = addDays(ev.e, -1); return sameDay(ev.s, last) || last < ev.s ? dl(ev.s) : ev.s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    if (!sameDay(ev.s, ev.e) && ev.e - ev.s > 864e5 / 2) return ev.s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + fmtMin(minOf(ev.s)) + ' – ' + ev.e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + fmtMin(minOf(ev.e));
    return dl(ev.s) + ' · ' + fmtMin(minOf(ev.s)) + ' – ' + fmtMin(minOf(ev.e));
  }

  // A small month like the one in Google Calendar's side bar. Used by the expanded calendar and the date picker.
  function miniMonth(month, selected, range) {
    var first = new Date(month.getFullYear(), month.getMonth(), 1), start = addDays(first, -first.getDay()), today = startOfDay(new Date());
    var h = '<div class="mm"><div class="mmh"><b>' + esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) + '</b>' +
      '<button type="button" class="mmnav" data-mm="-1" aria-label="Previous month">' + SV2(IC.left, 2.4) + '</button><button type="button" class="mmnav" data-mm="1" aria-label="Next month">' + SV2(IC.right, 2.4) + '</button></div><div class="mmg">';
    for (var w = 0; w < 7; w++) h += '<span class="mmw">' + esc(addDays(start, w).toLocaleDateString(undefined, { weekday: 'narrow' })) + '</span>';
    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i), cls = [];
      if (d.getMonth() !== first.getMonth()) cls.push('out');
      if (sameDay(d, today)) cls.push('today');
      if (selected && sameDay(d, selected)) cls.push('sel');
      if (range && d >= range[0] && d < range[1]) cls.push('rng');
      h += '<button type="button" data-mmd="' + isoDay(d) + '" class="' + cls.join(' ') + '" aria-label="' + esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '"' + (cls.indexOf('sel') >= 0 ? ' aria-current="date"' : '') + '>' + d.getDate() + '</button>';
    }
    return h + '</div></div>';
  }

  // Dialogs grow out of whatever opened them: the zone, the dock icon or the button.
  var lastSrc = null;
  document.addEventListener('pointerdown', function (e) { lastSrc = e.target.closest('.zone, .dock button, .nr, .ask, .tgc, .mc, button'); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') lastSrc = document.activeElement; }, true);
  var calm = function () { return !document.body.animate || matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function growFrom(dlg, src) {
    if (calm()) return;
    var to = dlg.getBoundingClientRect(), el = src && src.isConnected && !dlg.contains(src) ? src : null;
    if (el && to.width) {
      var f = el.getBoundingClientRect();
      var inside = f.left >= to.left - 2 && f.right <= to.right + 2 && f.top >= to.top - 2 && f.bottom <= to.bottom + 2;
      if (inside) { // the source sits inside the dialog's area: open it out from the source's edges
        var clip = 'inset(' + (f.top - to.top) + 'px ' + (to.right - f.right) + 'px ' + (to.bottom - f.bottom) + 'px ' + (f.left - to.left) + 'px round 1.4rem)';
        dlg.animate([{ clipPath: clip, opacity: .6 }, { clipPath: 'inset(0 0 0 0 round 1.6rem)', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.85,.2,1)' });
        var kids = dlg.querySelectorAll('.cxh, .cxs, .cxm, .mh, .mb > *');
        kids.forEach(function (k, i) { k.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120 + Math.min(i, 8) * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); });
        return;
      }
      var dx = (f.left + f.width / 2) - (to.left + to.width / 2), dy = (f.top + f.height / 2) - (to.top + to.height / 2);
      dlg.animate([{ transform: 'translate(' + dx * .6 + 'px,' + dy * .6 + 'px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1.1)' });
      return;
    }
    dlg.animate([{ transform: 'translateY(14px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function shrinkClose(dlg, after) {
    if (!dlg.open) return;
    var done = function () { if (dlg.open) dlg.close(); if (after) after(); };
    if (calm()) return done();
    dlg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97) translateY(6px)' }], { duration: 170, easing: 'ease-in' }).finished.then(done, done);
  }

  /* ---------------- add an event (Gmail / Google Calendar quick create) ---------------- */
  var evd = $('#evDlg'), EV = { date: null, s: 540, e: 600, cal: null, mini: null }, lastAddedId = null;
  function openCreate(o) {
    o = o || {};
    var now = new Date(), d = startOfDay(o.date || now);
    var s = o.start != null ? o.start : sameDay(d, now) ? Math.ceil((minOf(now) + 1) / 30) * 30 : 9 * 60;
    if (s > 23 * 60 + 30) { d = addDays(d, 1); s = 9 * 60; }
    EV.date = d; EV.s = s; EV.e = Math.min(s + (o.len || 60), 1439); EV.mini = d;
    var cals = writableCals();
    if (!cals.find(function (c) { return c.key === EV.cal; })) { var keep = null; try { keep = localStorage.getItem('cockpit.addCal'); } catch (e) { /* none */ } EV.cal = (cals.find(function (c) { return c.key === keep; }) || cals[0] || {}).key || null; }
    $('#evTitle').value = o.title || ''; $('#evLoc').value = '';
    $('#evMini').hidden = true; $('#evCalMenu').hidden = true;
    $('#evSave').disabled = false; $('#evSave').textContent = 'Save';
    renderEv();
    if (!evd.open) { evd.showModal(); growFrom(evd, o.src || lastSrc); }
    $('#addBtn').setAttribute('aria-expanded', 'true');
    setTimeout(function () { $('#evTitle').focus(); }, 40);
  }
  function closeCreate() { shrinkClose(evd); }
  evd.addEventListener('close', function () { $('#addBtn').setAttribute('aria-expanded', 'false'); drawGhost(); });
  evd.addEventListener('cancel', function (e) {
    // Esc closes an open menu first, then the dialog.
    if (!$('#evMini').hidden || !$('#evCalMenu').hidden) { e.preventDefault(); $('#evMini').hidden = true; $('#evCalMenu').hidden = true; $('#evDateBtn').setAttribute('aria-expanded', 'false'); $('#evCalBtn').setAttribute('aria-expanded', 'false'); return; }
    e.preventDefault(); closeCreate();
  });
  evd.addEventListener('click', function (e) { if (e.target === evd) closeCreate(); });
  $('#evClose').addEventListener('click', closeCreate);

  function renderEv() {
    var d = EV.date, c = S.cals.find(function (x) { return x.key === EV.cal; });
    evd.style.setProperty('--ac', c ? c.color : '#2F7FD0');
    $('#evDateBtn').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var so = '', eo = '';
    for (var m = 0; m < 1440; m += 15) so += '<option value="' + m + '"' + (m === EV.s ? ' selected' : '') + '>' + fmtMin(m) + '</option>';
    if (so.indexOf(' selected') < 0) so = '<option value="' + EV.s + '" selected>' + fmtMin(EV.s) + '</option>' + so;
    for (var x = EV.s + 15; x <= 1439; x += 15) eo += '<option value="' + x + '"' + (x === EV.e ? ' selected' : '') + '>' + fmtMin(x) + '</option>';
    if (EV.s + 15 <= 1439 && (1439 - EV.s) % 15) eo += '<option value="1439"' + (EV.e === 1439 ? ' selected' : '') + '>11:59pm</option>';
    if (!eo) eo = '<option value="1439" selected>11:59pm</option>';
    $('#evStart').innerHTML = so; $('#evEnd').innerHTML = eo;
    $('#evTz').textContent = durLabel(EV.e - EV.s) + ' · ' + tzLong() + ' · Does not repeat';
    $('#evCalBtn').innerHTML = c ? '<i class="evdot" style="background:' + esc(c.color) + '"></i><span class="evcn"><b>' + esc(calLabel(c)) + '</b><small>' + esc(c.email) + '</small></span><span class="evcaret" aria-hidden="true">▾</span>' : '<span class="evcn"><b>No calendar you can add to</b><small>Connect Google in Settings</small></span>';
    var cals = writableCals();
    $('#evCalMenu').innerHTML = cals.map(function (k) { return '<button type="button" role="option" data-evcal="' + esc(k.key) + '" aria-selected="' + (k.key === EV.cal) + '"><i class="evdot" style="background:' + esc(k.color) + '"></i><span class="evcn"><b>' + esc(calLabel(k)) + '</b><small>' + esc(k.email) + '</small></span>' + (k.key === EV.cal ? SV2(IC.check, 2.6) : '') + '</button>'; }).join('');
    if (!$('#evMini').hidden) $('#evMini').innerHTML = miniMonth(EV.mini, EV.date);
    renderBusy(); drawGhost();
  }
  // Like Google's "busy" hint: shows what the new event would overlap.
  function renderBusy() {
    var a = addDays(EV.date, 0), s = new Date(a.getTime() + EV.s * 6e4), en = new Date(a.getTime() + EV.e * 6e4), seen = {};
    var hits = calsInView(S.events.concat(CX.events || [])).filter(function (e) { var k = e.key + e.id; if (seen[k]) return false; seen[k] = 1; return !e.all_day && e.s < en && e.e > s; }).sort(function (x, y) { return x.s - y.s; });
    var b = $('#evBusy');
    b.hidden = !hits.length;
    if (hits.length) b.innerHTML = SV2(IC.warn, 2.2) + '<span>Overlaps ' + hits.slice(0, 2).map(function (e) { return '<b>' + esc(e.title) + '</b> (' + fmtMin(minOf(e.s)) + '–' + fmtMin(minOf(e.e)) + ')'; }).join(' and ') + (hits.length > 2 ? ' and ' + (hits.length - 2) + ' more' : '') + '</span>';
  }
  $('#evStart').addEventListener('change', function () { var dur = EV.e - EV.s; EV.s = +this.value; EV.e = Math.min(EV.s + dur, 1439); if (EV.e <= EV.s) EV.e = Math.min(EV.s + 15, 1439); renderEv(); });
  $('#evEnd').addEventListener('change', function () { EV.e = +this.value; renderEv(); });
  $('#evTitle').addEventListener('input', drawGhost);
  $('#evDateBtn').addEventListener('click', function () {
    var m = $('#evMini'), open = m.hidden; m.hidden = !open; this.setAttribute('aria-expanded', String(open)); $('#evCalMenu').hidden = true;
    if (open) { EV.mini = EV.date; m.innerHTML = miniMonth(EV.mini, EV.date); }
  });
  $('#evMini').addEventListener('click', function (e) {
    var nav = e.target.closest('[data-mm]'), day = e.target.closest('[data-mmd]');
    if (nav) { EV.mini = new Date(EV.mini.getFullYear(), EV.mini.getMonth() + +nav.dataset.mm, 1); this.innerHTML = miniMonth(EV.mini, EV.date); return; }
    if (day) { EV.date = parseIso(day.dataset.mmd); this.hidden = true; $('#evDateBtn').setAttribute('aria-expanded', 'false'); renderEv(); }
  });
  $('#evCalBtn').addEventListener('click', function () { var m = $('#evCalMenu'), open = m.hidden && writableCals().length > 0; m.hidden = !open; this.setAttribute('aria-expanded', String(open)); $('#evMini').hidden = true; });
  $('#evCalMenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-evcal]'); if (!b) return;
    EV.cal = b.dataset.evcal; try { localStorage.setItem('cockpit.addCal', EV.cal); } catch (err) { /* not kept */ }
    this.hidden = true; $('#evCalBtn').setAttribute('aria-expanded', 'false'); renderEv();
  });
  evd.addEventListener('click', function (e) {
    // a click anywhere else closes the date picker or calendar menu
    if (!e.target.closest('#evMini, #evDateBtn')) { $('#evMini').hidden = true; $('#evDateBtn').setAttribute('aria-expanded', 'false'); }
    if (!e.target.closest('#evCalMenu, #evCalBtn')) { $('#evCalMenu').hidden = true; $('#evCalBtn').setAttribute('aria-expanded', 'false'); }
  });
  var evStartDate = function () { return new Date(EV.date.getTime() + EV.s * 6e4); };
  var evEndDate = function () { return new Date(EV.date.getTime() + EV.e * 6e4); };
  // "More options" hands everything to Google Calendar's full editor (guests, description, repeat, Meet).
  $('#evMore').addEventListener('click', function () {
    var c = S.cals.find(function (x) { return x.key === EV.cal; });
    var g = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
    var q = new URLSearchParams({ action: 'TEMPLATE', text: $('#evTitle').value.trim(), dates: g(evStartDate()) + '/' + g(evEndDate()), ctz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if ($('#evLoc').value.trim()) q.set('location', $('#evLoc').value.trim());
    if (c) q.set('authuser', c.email);
    window.open('https://calendar.google.com/calendar/render?' + q.toString(), '_blank', 'noopener');
    closeCreate();
  });
  $('#evForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var c = S.cals.find(function (x) { return x.key === EV.cal; });
    var title = $('#evTitle').value.trim();
    if (!title) { $('#evTitle').focus(); $('.evtitlewrap').classList.remove('shake'); void $('.evtitlewrap').offsetWidth; $('.evtitlewrap').classList.add('shake'); return; }
    if (!c) { toast('Pick a calendar first.'); return; }
    var btn = $('#evSave'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      var body = { account_id: c.account_id, calendar_id: c.id, title: title, start: evStartDate().toISOString(), end: evEndDate().toISOString(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if ($('#evLoc').value.trim()) body.location = $('#evLoc').value.trim();
      var r = await api('/api/calendar/create', body);
      lastAddedId = r && r.id;
      closeCreate();
      toast('Saved to ' + calLabel(c) + ' · ' + EV.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + fmtMin(EV.s));
      RANGE = {};
      loadCalendar();
      if (cxd.open) loadCX();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Save';
      toast(err.message === 'end_before_start' ? 'The end time has to be after the start.' : 'Couldn’t save it (' + err.message + ').');
    }
  });
  $('#addBtn').addEventListener('click', function () { openCreate({ src: $('#addBtn') }); });

  /* ---------------- calendar, expanded ---------------- */
  var cxd = $('#calx');
  var CX = { view: innerWidth < 760 ? 'day' : 'week', at: startOfDay(new Date()), mini: null, events: [], req: 0, scrolled: '' };
  try { var v0 = localStorage.getItem('cockpit.calView'); if (v0 && innerWidth >= 760) CX.view = v0; } catch (e) { /* default */ }
  function cxRange() {
    var a = CX.at;
    if (CX.view === 'day') return [a, addDays(a, 1)];
    if (CX.view === 'week') { var s = addDays(a, -a.getDay()); return [s, addDays(s, 7)]; }
    if (CX.view === 'month') { var f = new Date(a.getFullYear(), a.getMonth(), 1), s2 = addDays(f, -f.getDay()); return [s2, addDays(s2, 42)]; }
    return [a, addDays(a, 14)];
  }
  function cxTitle() {
    var r = cxRange(), a = CX.at, last = addDays(r[1], -1);
    if (CX.view === 'day') return a.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (CX.view === 'month') return a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (CX.view === 'week' && r[0].getMonth() === last.getMonth()) return r[0].toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var y = r[0].getFullYear() !== last.getFullYear();
    return r[0].toLocaleDateString(undefined, { month: 'short', day: CX.view === 'agenda' ? 'numeric' : undefined, year: y ? 'numeric' : undefined }) + ' – ' + last.toLocaleDateString(undefined, { month: 'short', day: CX.view === 'agenda' ? 'numeric' : undefined, year: 'numeric' });
  }
  function openCalX() {
    CX.at = startOfDay(new Date()); CX.mini = null; CX.scrolled = ''; CX.events = S.events.slice();
    renderCX();
    if (!cxd.open) { cxd.showModal(); growFrom(cxd, lastSrc); }
    scrollCX();
    loadCX();
  }
  function closeCalX() { hidePop(); shrinkClose(cxd); }
  $('#cxClose').addEventListener('click', closeCalX);
  cxd.addEventListener('cancel', function (e) { e.preventDefault(); if (!$('#evPop').hidden) { hidePop(); return; } closeCalX(); });
  async function loadCX() {
    var r = cxRange(), id = ++CX.req;
    $('#cxLoad').hidden = false;
    try {
      var ev = await fetchRange(r[0], r[1]);
      if (id !== CX.req) return;
      CX.events = ev; CX.err = null;
    } catch (e) { if (id !== CX.req) return; CX.err = e.message; }
    $('#cxLoad').hidden = true;
    renderCXMain();
  }
  function go(view, at) {
    if (view) { CX.view = view; try { localStorage.setItem('cockpit.calView', view); } catch (e) { /* not kept */ } }
    if (at) CX.at = startOfDay(at);
    CX.mini = null; hidePop();
    renderCX(); scrollCX(); loadCX();
  }
  function step(n) {
    var a = CX.at;
    if (CX.view === 'day') go(null, addDays(a, n));
    else if (CX.view === 'week') go(null, addDays(a, 7 * n));
    else if (CX.view === 'month') go(null, new Date(a.getFullYear(), a.getMonth() + n, 1));
    else go(null, addDays(a, 14 * n));
  }
  $('#cxToday').addEventListener('click', function () { go(null, new Date()); });
  $('#cxPrev').addEventListener('click', function () { step(-1); });
  $('#cxNext').addEventListener('click', function () { step(1); });
  $('#cxSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) go(b.dataset.v); });
  $('#cxCreate').addEventListener('click', function () { var t = new Date(); openCreate({ date: CX.view === 'day' || CX.at > t ? CX.at : t, src: $('#cxCreate') }); });
  document.addEventListener('keydown', function (e) {
    if (!cxd.open || evd.open || modal.open || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, select, textarea')) return;
    var k = e.key.toLowerCase(), map = { d: 'day', w: 'week', m: 'month', a: 'agenda' };
    if (map[k]) { go(map[k]); e.preventDefault(); }
    else if (k === 't') { go(null, new Date()); e.preventDefault(); }
    else if (k === 'c') { openCreate({ date: CX.at > new Date() ? CX.at : new Date() }); e.preventDefault(); }
    else if (k === 'arrowleft' || k === 'p' || k === 'k') { step(-1); e.preventDefault(); }
    else if (k === 'arrowright' || k === 'n' || k === 'j') { step(1); e.preventDefault(); }
  });

  function renderCX() {
    $('#cxTitle').textContent = cxTitle();
    cxd.querySelectorAll('#cxSeg [data-v]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === CX.view)); });
    renderCXSide(); renderCXMain();
  }
  function renderCXSide() {
    $('#cxMini').innerHTML = miniMonth(CX.mini || CX.at, CX.at, CX.view === 'month' ? null : cxRange());
    $('#cxCals').innerHTML = '<p class="cxlab">My calendars</p>' + calListHtml();
  }
  $('#cxMini').addEventListener('click', function (e) {
    var nav = e.target.closest('[data-mm]'), day = e.target.closest('[data-mmd]');
    if (nav) { var m = CX.mini || CX.at; CX.mini = new Date(m.getFullYear(), m.getMonth() + +nav.dataset.mm, 1); renderCXSide(); return; }
    if (day) go(null, parseIso(day.dataset.mmd));
  });
  $('#cxCals').addEventListener('click', function (e) { var b = e.target.closest('button[data-cal]'); if (b) toggleCal(b.dataset.cal); });

  function renderCXMain() {
    var el = $('#cxMain');
    CX.list = calsInView(CX.events);
    if (!S.calAccounts.length && S.calLoaded) { el.innerHTML = '<div class="empty"><b>No Google account connected.</b>Connect it once; every device uses the same connection.<button type="button" class="btnl" data-connect="1">Connect Google</button></div>'; return; }
    var r = cxRange(), days = [], oldSc = $('#cxScroll'), keepTop = oldSc ? oldSc.scrollTop : null;
    if (CX.view === 'day' || CX.view === 'week') {
      for (var d = r[0]; d < r[1]; d = addDays(d, 1)) days.push(d);
      el.innerHTML = cxGrid(days);
      if (keepTop != null) $('#cxScroll').scrollTop = keepTop; // a refresh keeps the place
    }
    else if (CX.view === 'month') el.innerHTML = cxMonth();
    else el.innerHTML = cxAgenda();
    el.dataset.view = CX.view;
    if (CX.err) el.insertAdjacentHTML('afterbegin', '<div class="cxerr">' + SV2(IC.warn, 2.2) + 'Couldn’t load these dates (' + esc(CX.err) + '). <button type="button" class="linkbtn" id="cxRetry">Try again</button></div>');
    drawGhost();
  }
  $('#cxMain').addEventListener('click', function (e) {
    if (e.target.id === 'cxRetry') { RANGE = {}; loadCX(); return; }
    var evb = e.target.closest('[data-ev]');
    if (evb) { showPop(CX.list[+evb.dataset.ev], evb); return; }
    var gd = e.target.closest('[data-goday]');
    if (gd) { go('day', parseIso(gd.dataset.goday)); return; }
    hidePop();
    var col = e.target.closest('.tgc');
    if (col) { // click an empty slot: start a new event there, on the half hour, like Google Calendar
      var rc = col.getBoundingClientRect(), m = Math.floor((e.clientY - rc.top) / rc.height * 48) * 30;
      openCreate({ date: parseIso(col.dataset.col), start: Math.max(0, Math.min(m, 1410)), src: col });
      return;
    }
    var cell = e.target.closest('.mc');
    if (cell) openCreate({ date: parseIso(cell.dataset.cell), src: cell });
  });

  // Side-by-side columns for events that overlap, as Google does.
  function layoutDay(items) {
    items.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var group = [], end = -1, cols = [];
    var flush = function () { group.forEach(function (x) { x.cols = cols.length; }); group = []; cols = []; };
    items.forEach(function (x) {
      var ve = Math.max(x.e, x.s + 25);
      if (x.s >= end && group.length) flush();
      var i = cols.findIndex(function (ce) { return ce <= x.s; }); if (i < 0) { i = cols.length; cols.push(0); }
      cols[i] = ve; x.col = i; group.push(x); end = Math.max(end, ve);
    });
    flush();
    return items;
  }
  function cxGrid(days) {
    var now = new Date(), list = CX.list, n = days.length;
    var h = '<div class="tgs" id="cxScroll" style="--n:' + n + '"><div class="tgtop"><div class="tgh"><div class="tgz">' + esc(tzShort()) + '</div>' + days.map(function (d) {
      return '<div class="tgd' + (sameDay(d, now) ? ' today' : '') + (d < startOfDay(now) ? ' pastd' : '') + '"><span>' + esc(d.toLocaleDateString(undefined, { weekday: 'short' })) + '</span><button type="button" class="tgn" data-goday="' + isoDay(d) + '" aria-label="Open ' + esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' + d.getDate() + '</button></div>';
    }).join('') + '</div><div class="tga"><div class="tgz"></div>' + days.map(function (d) {
      var nx = addDays(d, 1);
      return '<div class="tgac">' + list.map(function (e, i) { return e.all_day && e.s < nx && e.e > d ? '<button type="button" class="xad" data-ev="' + i + '" style="--c:' + esc(calOf(e).color) + '">' + esc(e.title) + '</button>' : ''; }).join('') + '</div>';
    }).join('') + '</div></div><div class="tgb"><div class="tgt">';
    for (var x = 1; x < 24; x++) h += '<span style="top:calc(var(--hh) * ' + x + ')">' + fmtMin(x * 60).replace(':00', '') + '</span>';
    h += '</div>';
    days.forEach(function (d) {
      var nx = addDays(d, 1);
      var items = [];
      list.forEach(function (e, i) {
        if (e.all_day || !(e.s < nx && e.e > d)) return;
        items.push({ i: i, ev: e, s: e.s < d ? 0 : minOf(e.s), e: e.e >= nx ? 1440 : minOf(e.e) });
      });
      h += '<div class="tgc' + (sameDay(d, now) ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' wk' : '') + '" data-col="' + isoDay(d) + '">';
      layoutDay(items).forEach(function (x) {
        var e = x.ev, c = calOf(e), dur = x.e - x.s, short = dur < 45;
        var w = 100 / x.cols, left = x.col * w, width = x.col === x.cols - 1 ? w : w * 1.6;
        h += '<button type="button" class="xev' + (short ? ' short' : '') + (e.e <= now ? ' past' : '') + (lastAddedId && e.id === lastAddedId ? ' fresh' : '') + '" data-ev="' + x.i + '" style="--c:' + esc(c.color) + ';--bg:' + tint(c.color) + ';top:calc(var(--hh) * ' + (x.s / 60) + ');height:calc(var(--hh) * ' + (Math.max(dur, 20) / 60) + ' - 2px);left:calc(' + left + '% + 1px);width:calc(' + Math.min(width, 100 - left) + '% - 4px);z-index:' + (2 + x.col) + '">' +
          '<b>' + esc(e.title) + (short ? '<small>, ' + fmtMin(minOf(e.s)) + '</small>' : '') + '</b>' + (short ? '' : '<small>' + fmtMin(minOf(e.s)) + ' – ' + fmtMin(minOf(e.e)) + (e.location && dur >= 60 ? '<br>' + esc(e.location) : '') + '</small>') + '</button>';
      });
      if (sameDay(d, now)) h += '<div class="xnow" style="top:calc(var(--hh) * ' + (minOf(now) / 60) + ')" aria-label="Now"></div>';
      h += '</div>';
    });
    return h + '</div></div>';
  }
  function scrollCX() {
    var sc = $('#cxScroll'), key = CX.view + isoDay(cxRange()[0]);
    if (!sc || CX.scrolled === key) return;
    CX.scrolled = key;
    var r = cxRange(), now = new Date(), hh = sc.querySelector('.tgc') ? sc.querySelector('.tgc').offsetHeight / 24 : 48;
    var firstEv = CX.list.filter(function (e) { return !e.all_day; }).map(function (e) { return minOf(e.s); }).sort(function (a, b) { return a - b; })[0];
    var hour = now >= r[0] && now < r[1] ? Math.max(0, minOf(now) / 60 - 2) : Math.min(7.5, firstEv != null ? firstEv / 60 - .5 : 7.5);
    sc.scrollTop = Math.max(0, hour * hh);
  }
  function cxMonth() {
    var r = cxRange(), list = CX.list, m = CX.at.getMonth(), today = startOfDay(new Date());
    var h = '<div class="mgrid"><div class="mwk">';
    for (var w = 0; w < 7; w++) h += '<span>' + esc(addDays(r[0], w).toLocaleDateString(undefined, { weekday: 'short' })) + '</span>';
    h += '</div><div class="mcells">';
    for (var i = 0; i < 42; i++) {
      var d = addDays(r[0], i), nx = addDays(d, 1);
      var evs = list.map(function (e, k) { return { e: e, k: k }; }).filter(function (x) { return x.e.s < nx && x.e.e > d; }).sort(function (a, b) { return (b.e.all_day ? 1 : 0) - (a.e.all_day ? 1 : 0) || a.e.s - b.e.s; });
      h += '<div class="mc' + (d.getMonth() !== m ? ' out' : '') + (sameDay(d, today) ? ' today' : '') + (d < today ? ' pastd' : '') + '" data-cell="' + isoDay(d) + '"><button type="button" class="mcn" data-goday="' + isoDay(d) + '">' + (d.getDate() === 1 ? esc(d.toLocaleDateString(undefined, { month: 'short' })) + ' 1' : d.getDate()) + '</button>' +
        evs.slice(0, 3).map(function (x) { var c = calOf(x.e); return x.e.all_day ? '<button type="button" class="mch ad" data-ev="' + x.k + '" style="--c:' + esc(c.color) + '">' + esc(x.e.title) + '</button>' : '<button type="button" class="mch' + (x.e.e <= new Date() ? ' past' : '') + '" data-ev="' + x.k + '" style="--c:' + esc(c.color) + '"><i></i><span>' + fmtMin(minOf(x.e.s)) + '</span> ' + esc(x.e.title) + '</button>'; }).join('') +
        (evs.length > 3 ? '<button type="button" class="mcm" data-goday="' + isoDay(d) + '">' + (evs.length - 3) + ' more</button>' : '') + '</div>';
    }
    return h + '</div></div>';
  }
  function cxAgenda() {
    var r = cxRange(), list = CX.list, today = startOfDay(new Date()), h = '<div class="ag">', any = false;
    for (var d = r[0]; d < r[1]; d = addDays(d, 1)) {
      var nx = addDays(d, 1), dd = d;
      var evs = list.map(function (e, k) { return { e: e, k: k }; }).filter(function (x) { return x.e.s < nx && x.e.e > dd; }).sort(function (a, b) { return (b.e.all_day ? 1 : 0) - (a.e.all_day ? 1 : 0) || a.e.s - b.e.s; });
      if (!evs.length) continue;
      any = true;
      h += '<section class="agd' + (sameDay(d, today) ? ' today' : '') + '"><button type="button" class="agdate" data-goday="' + isoDay(d) + '"><b>' + d.getDate() + '</b><span>' + esc(d.toLocaleDateString(undefined, { month: 'short', weekday: 'short' })) + '</span></button><div class="agl">' +
        evs.map(function (x) { var e = x.e, c = calOf(e); return '<button type="button" class="agr' + (e.e <= new Date() ? ' past' : '') + '" data-ev="' + x.k + '"><i style="background:' + esc(c.color) + '"></i><span class="agt">' + (e.all_day ? 'All day' : fmtMin(minOf(e.s)) + ' – ' + fmtMin(minOf(e.e))) + '</span><span class="agn"><b>' + esc(e.title) + '</b>' + (e.location ? '<small>' + esc(e.location) + '</small>' : '') + '</span><span class="agc">' + esc(calLabel(c)) + '</span></button>'; }).join('') + '</div></section>';
    }
    return h + (any ? '' : '<div class="empty"><b>Nothing on the calendar.</b>Nothing for these two weeks on the calendars shown.</div>') + '</div>';
  }

  // The placeholder block that previews the new event while the add dialog is open, like Google's "(No title)".
  function drawGhost() {
    var old = cxd.querySelector('.ghost'); if (old) old.remove();
    if (!evd.open || !cxd.open || !EV.date) return;
    var kc = S.cals.find(function (x) { return x.key === EV.cal; });
    cxd.style.setProperty('--ac', kc ? kc.color : '#1A73E8');
    var col = cxd.querySelector('.tgc[data-col="' + isoDay(EV.date) + '"]');
    if (col) {
      var g = document.createElement('div'); g.className = 'ghost';
      g.style.cssText = 'top:calc(var(--hh) * ' + EV.s / 60 + ');height:calc(var(--hh) * ' + Math.max(EV.e - EV.s, 20) / 60 + ' - 2px)';
      g.innerHTML = '<b>' + esc($('#evTitle').value.trim() || '(No title)') + '</b><small>' + fmtMin(EV.s) + ' – ' + fmtMin(EV.e) + '</small>';
      col.appendChild(g);
      return;
    }
    var cell = cxd.querySelector('.mc[data-cell="' + isoDay(EV.date) + '"]');
    if (cell) { var gm = document.createElement('div'); gm.className = 'ghost gm'; gm.textContent = ($('#evTitle').value.trim() || '(No title)') + ' · ' + fmtMin(EV.s); cell.appendChild(gm); }
  }

  // Event details card, next to the event.
  var pop = $('#evPop');
  function showPop(ev, anchor) {
    if (!ev) return;
    var c = calOf(ev);
    pop.style.setProperty('--c', c.color);
    pop.innerHTML = '<div class="eph">' + (ev.link ? '<a class="ix" href="' + esc(ev.link) + '" target="_blank" rel="noopener" title="Open in Google Calendar" aria-label="Open in Google Calendar">' + SV2(IC.ext, 2.2) + '</a>' : '') + '<button type="button" class="ix" data-pclose aria-label="Close">' + SV2(IC.x, 2.4) + '</button></div>' +
      '<div class="epr"><i class="eps"></i><div><h3>' + esc(ev.title) + '</h3><p>' + esc(whenText(ev)) + '</p></div></div>' +
      (ev.location ? '<div class="epr"><span class="epi">' + SV2(IC.pin) + '</span><div>' + (/^https?:\/\//.test(ev.location) ? '<a href="' + esc(ev.location) + '" target="_blank" rel="noopener">' + esc(ev.location) + '</a>' : '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ev.location) + '" target="_blank" rel="noopener">' + esc(ev.location) + '</a>') + '</div></div>' : '') +
      '<div class="epr"><span class="epi">' + SV2(IC.cal) + '</span><div><b>' + esc(calLabel(c)) + '</b>' + (c.email ? '<small>' + esc(c.email) + '</small>' : '') + '</div></div>' +
      (ev.link ? '<a class="epgo" href="' + esc(ev.link) + '" target="_blank" rel="noopener">Open in Google Calendar ' + SV2(IC.ext, 2.2) + '</a>' : '');
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, ht = pop.offsetHeight, x = r.right + 10;
    if (x + w > innerWidth - 12) x = r.left - w - 10;
    if (x < 12) x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    var y = Math.max(12, Math.min(innerHeight - ht - 12, r.top));
    if (x === Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))) y = r.bottom + 8 + ht < innerHeight ? r.bottom + 8 : Math.max(12, r.top - ht - 8);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    if (!calm()) pop.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    pop.querySelector('[data-pclose]').focus({ preventScroll: true });
  }
  function hidePop() { pop.hidden = true; }
  pop.addEventListener('click', function (e) { if (e.target.closest('[data-pclose]')) hidePop(); });
  cxd.addEventListener('click', function (e) { if (!pop.hidden && !e.target.closest('#evPop, [data-ev]')) hidePop(); });
  cxd.addEventListener('scroll', hidePop, true);

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
  var ICONS = {}; Object.keys(KINDS).forEach(function (k) { ICONS[k] = [KINDS[k].bg, KINDS[k].svg]; });
  var who = function () { return S.view === 'all' ? 'Both businesses' : CO[S.view].name; };
  // Gmail opens the message in the inbox it came to (authuser = that address). If that Google account isn't signed in
  // on this browser, Gmail falls back to whichever account is, so each email also says which inbox it is in and offers
  // Google's own "sign in to this account" step, which comes back to the message afterwards.
  var acctOf = function (m) { return S.accounts.find(function (x) { return x.id === m.account_id; }); };
  var gmailLink = function (m) {
    var a = acctOf(m);
    if (m.web_link && (!a || m.web_link.indexOf('authuser=') > 0)) return m.web_link;
    return 'https://mail.google.com/mail/u/?authuser=' + encodeURIComponent(a ? a.email_address : '') + '#all/' + encodeURIComponent(m.thread_id || '');
  };
  function gmailActs(m, label, extra) {
    return '<div class="macts"><a class="mact" href="' + esc(gmailLink(m)) + '" target="_blank" rel="noopener">' + label + ' ↗</a>' + (extra || '') + '</div>';
  }
  // Once per view: if Gmail opens a different signed-in account, sign in to the right inbox and land in it.
  function gmailHelp(accts) {
    if (!accts.length) return '';
    return '<p class="gmhelp">Gmail opening the wrong account? Sign in as ' + accts.map(function (a) {
      var inbox = 'https://mail.google.com/mail/u/?authuser=' + encodeURIComponent(a.email_address);
      return '<a href="' + esc('https://accounts.google.com/AddSession?Email=' + encodeURIComponent(a.email_address) + '&continue=' + encodeURIComponent(inbox)) + '" target="_blank" rel="noopener">' + esc(a.email_address) + '</a>';
    }).join(' or ') + '.</p>';
  }
  // Shown wherever ChatGPT's summary would be, until ChatGPT has summarized today.
  function sodCta() {
    return '<button type="button" class="sodcta" data-sod="1"><span class="sodi" style="background:' + KINDS.sun.bg + '">' + kSvg('sun') + '</span><span class="sodt"><b>Start my day</b><small>ChatGPT hasn’t summarized today yet. Have it look at your tasks and emails.</small></span><span class="sodgo" aria-hidden="true">›</span></button>';
  }

  // The last four weeks of sales as bars, one a day, today on the right.
  function salesChart() {
    var d0 = startOfDay(new Date()), days = [], list = salesInView();
    for (var i = 27; i >= 0; i--) { var a = addDays(d0, -i), b = addDays(a, 1); var l = list.filter(function (s) { var t = new Date(s.sold_at); return t >= a && t < b; }); days.push({ d: a, amt: l.reduce(function (x, s) { return x + Number(s.amount); }, 0), n: l.length }); }
    var max = Math.max.apply(null, days.map(function (x) { return x.amt; }).concat([1])), total = days.reduce(function (x, y) { return x + y.amt; }, 0);
    return '<div><p class="mlabel">Last 4 weeks · ' + money(total) + '</p><div class="schart" role="img" aria-label="Daily sales for the last four weeks">' + days.map(function (x, i) {
      return '<span class="sb' + (i === 27 ? ' now' : '') + '" title="' + esc(x.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ': ' + money(x.amt) + ' · ' + x.n + ' sale' + (x.n === 1 ? '' : 's')) + '"><i style="height:' + (x.amt ? Math.max(4, x.amt / max * 100) : 0) + '%;--i:' + i + '"></i></span>';
    }).join('') + '</div><div class="saxis"><span>' + esc(days[0].d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</span><span>Today</span></div></div>';
  }
  var VIEWS = {
    email: function () {
      var groups = S.accounts.filter(function (a) { return inView(mailCo(a.id)); });
      var body = (S.chatList ? '' : sodCta()) + (S.digest ? '<p class="mtext">' + esc(plainSummary(S.digest.summary)) + '</p>' : '');
      body += groups.map(function (a) {
        var list = S.needs.filter(function (m) { return m.account_id === a.id; });
        return '<div><p class="mlabel">' + esc(a.email_address) + ' ' + tag(mailCo(a.id)) + ' · ' + list.length + (S.chatList ? ' to do first' : ' need a reply') + '</p><div class="mlist">' +
          (list.length ? list.map(function (m) {
            var steps = Array.isArray(m.thread_next_steps) ? m.thread_next_steps.slice(0, 2).join(' · ') : '';
            return '<div class="msg" data-msg="' + esc(m.id) + '"><span class="av" style="background:' + esc(acctColor(m.account_id)) + '">' + esc(initials(m)) + '</span>' + mailHead(m) +
              (m.why ? '<p><b>Why first:</b> ' + esc(m.why) + '</p>' : '') + '<p>' + esc(m.summary || m.snippet || '') + '</p>' + (steps ? '<p><b>Next:</b> ' + esc(steps) + '</p>' : '') +
              gmailActs(m, 'Reply in Gmail', '<button type="button" class="mact" data-archive="' + esc(m.id) + '">Archive</button>') + '</div>';
          }).join('') : '<div class="msg"><p style="color:var(--muted)">' + (S.chatList ? 'Nothing left to do first here.' : 'Nothing needs a reply here.') + '</p></div>') + '</div></div>';
      }).join('');
      // The "new" count on the Numbers row is mail from the last 24 hours, so list it here too, or that number points at nothing.
      var fresh = S.recent.filter(function (m) { return inView(mailCo(m.account_id)); });
      if (S.accounts.length) body += '<div><p class="mlabel">New in the last 24 hours · ' + fresh.length + '</p><div class="mlist">' +
        (fresh.length ? fresh.slice(0, 30).map(function (m) {
          return '<div class="msg"><span class="av" style="background:' + esc(acctColor(m.account_id)) + '">' + esc(initials(m)) + '</span>' + mailHead(m) +
            '<p>' + esc(m.summary || m.snippet || '') + '</p>' + gmailActs(m, 'Open in Gmail') + '</div>';
        }).join('') : '<div class="msg"><p style="color:var(--muted)">No new mail in the last 24 hours.</p></div>') + '</div></div>';
      body += gmailHelp(groups);
      return { t: 'ChatGPT’s summary', sub: who() + (S.digest ? ' · summary from ' + esc(S.digest.author || 'your assistant') : ''), note: 'Replies happen in Gmail', body: body || '<div class="empty"><b>No Gmail connected.</b></div>' };
    },
    sales: function () {
      var body = '<div class="mstats">' + salesCos().map(function (co) { var n = salesNumbers([co]); return '<div class="mstat"><span>' + esc(CO[co].short) + ' today</span><b class="num">' + money(n.today) + '</b><span>' + money(n.week) + ' last 7 days · ' + n.wn + ' sale' + (n.wn === 1 ? '' : 's') + '</span></div><div class="mstat"><span>' + esc(CO[co].short) + ' this month</span><b class="num">' + money(n.month) + '</b><span>' + (n.pct === null ? 'first month' : (n.pct >= 0 ? '▲' : '▼') + Math.abs(n.pct) + '% vs last month') + '</span></div>'; }).join('') + '</div>';
      body += salesChart();
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
        return '<button type="button" role="tab" data-stab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>';
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

  // Links opens LinkHub in a new tab, already signed in: the Tasks Worker gives the signed-in owner a one-time pass
  // (good once, for two minutes). The tab is opened at the click so the browser doesn't block it, then sent on.
  // If no pass comes back, the tab shows LinkHub's normal sign-in.
  async function openLinks() {
    var w = window.open('about:blank', '_blank');
    if (w) w.opener = null;
    var to = C.linksApp;
    try { to = (await api('/api/links/handoff')).url || to; } catch (e) { /* normal sign-in */ }
    if (w) w.location.href = to; else location.href = to;
  }

  var modal = $('#modal');
  function openView(k) {
    if (k === 'calendar') { openCalX(); return; }
    var v = VIEWS[k] && VIEWS[k](); if (!v) return;
    var ic = ICONS[k], wasOpen = modal.open;
    $('#mIcon').style.background = ic[0];
    modal.style.setProperty('--mbg', ic[0]);
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
    if (!wasOpen) growFrom(modal, lastSrc);
  }
  function closeView() { if (modal.open) { if (modal.close) shrinkClose(modal); else modal.removeAttribute('open'); } }
  modal.addEventListener('cancel', function (e) { e.preventDefault(); closeView(); });
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
    if (e.target.closest('[data-sod]')) { startDay(); return; }
    if (e.target.closest('[data-connect]')) { connectGoogle(); return; }
    var btn = e.target.closest('[data-open-btn]');
    if (btn && btn.dataset.openBtn === 'links') { openLinks(); return; }
    // Tasks opens in its own tab like Links. It shares the cockpit's sign-in cookie, so it opens signed in.
    if (btn && btn.dataset.openBtn === 'tasks') { window.open(C.tasksApp, '_blank', 'noopener'); return; }
    if (btn) { if (btn.dataset.tab) S.setTab = btn.dataset.tab; openView(btn.dataset.openBtn); return; }
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
