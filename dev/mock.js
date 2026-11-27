// Local preview only (never deployed): stands in for Supabase and the Tasks Worker with sample data, so the
// cockpit can be tried without signing in. Served by dev/serve.mjs in place of config.js and session.js.
(function () {
  window.COCKPIT = {
    supabaseUrl: 'https://mock.local', supabaseAnonKey: 'mock', api: 'https://api.mock.local',
    tasksApp: '/placeholder?app=Tasks', linksApp: '/placeholder?app=Links',
    companies: {
      mpc: { name: 'MaLinda Perry Consulting', short: 'MPC', color: '#1E9E98', bg: '#E1F4F1', ink: '#0C4F4B', site: '/placeholder?app=MPC%20website' },
      hg: { name: 'Happy Girls Don’t Do That', short: 'Happy Girls', color: '#F2607F', bg: '#FDE3E9', ink: '#7A1F35', site: null }
    }
  };
  window.cockpitSessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  try { localStorage.setItem('cockpit.startDay', new Date().toISOString().slice(0, 10)); } catch (e) {}

  var A1 = '11111111-1111-4111-8111-111111111111', A2 = '22222222-2222-4222-8222-222222222222';
  var day = function (n, h, m) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); d.setHours(h || 0, m || 0); return d; };
  var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var EVENTS = [];
  var add = function (n, h, m, dur, title, cal, loc) { var s = day(n, h, m); EVENTS.push({ id: 'e' + EVENTS.length, account_id: cal[0], calendar_id: cal[1], title: title, location: loc || null, all_day: false, start: s.toISOString(), end: new Date(s.getTime() + dur * 6e4).toISOString(), link: 'https://calendar.google.com' }); };
  var allday = function (n, len, title, cal) { EVENTS.push({ id: 'e' + EVENTS.length, account_id: cal[0], calendar_id: cal[1], title: title, location: null, all_day: true, start: iso(day(n)), end: iso(day(n + len)), link: 'https://calendar.google.com' }); };
  var MAIN = [A1, 'malinda@malindaperryconsulting.com'], COACH = [A1, 'coaching'], HG = [A2, 'hello@happygirlsdontdothat.com'];
  for (var n = -40; n < 45; n++) {
    var wd = day(n).getDay(); if (wd === 0 || wd === 6) { if (n % 9 === 0) add(n, 10, 0, 90, 'Saturday workshop prep', HG); continue; }
    add(n, 9, 0, 30, 'Morning planning', MAIN);
    if (n % 2 === 0) add(n, 10, 30, 60, 'Coaching · Dana R.', COACH, 'Zoom');
    if (n % 3 === 0) add(n, 11, 0, 45, 'Book launch sync', HG, 'https://meet.google.com/abc-defg-hij');
    if (n % 2 === 1) add(n, 13, 0, 90, 'Workshop: Unstuck chapter 3', MAIN, '123 Main St, Seattle');
    add(n, 15, 30, 30, 'Podcast interview', HG);
    if (n % 4 === 0) add(n, 15, 45, 60, 'Client call · Rivera', COACH);
  }
  allday(0, 1, 'Thanksgiving', MAIN); allday(2, 3, 'Retreat in Leavenworth', HG); allday(-5, 1, 'Payhip payout', MAIN);

  var CALS = { accounts: [
    { account_id: A1, email: 'malinda@malindaperryconsulting.com', status: 'ok', calendars: [
      { id: 'malinda@malindaperryconsulting.com', name: 'MaLinda Perry', color: '#1E9E98', primary: true, can_add: true },
      { id: 'coaching', name: 'Coaching clients', color: '#8B6CF0', primary: false, can_add: true },
      { id: 'holidays', name: 'Holidays in United States', color: '#E0A92E', primary: false, can_add: false }] },
    { account_id: A2, email: 'hello@happygirlsdontdothat.com', status: 'ok', calendars: [
      { id: 'hello@happygirlsdontdothat.com', name: 'Happy Girls', color: '#F2607F', primary: true, can_add: true }] }
  ] };

  var origFetch = window.fetch.bind(window);
  window.fetch = function (url, init) {
    if (String(url).indexOf('https://api.mock.local') !== 0) return origFetch(url, init);
    var path = String(url).replace('https://api.mock.local', ''), body = init && init.body ? JSON.parse(init.body) : {}, out = {};
    if (path === '/api/calendar/list') out = CALS;
    else if (path === '/api/calendar/events') {
      var f = new Date(body.from), t = new Date(body.to), want = {};
      (body.calendars || []).forEach(function (c) { want[c.account_id + ':' + c.calendar_id] = 1; });
      out = { events: EVENTS.filter(function (e) { var s = e.all_day ? new Date(e.start + 'T00:00') : new Date(e.start), en = e.all_day ? new Date(e.end + 'T00:00') : new Date(e.end); return want[e.account_id + ':' + e.calendar_id] && s < t && en > f; }) };
    } else if (path === '/api/calendar/create') {
      var id = 'new' + Date.now();
      EVENTS.push({ id: id, account_id: body.account_id, calendar_id: body.calendar_id, title: body.title, location: body.location || null, all_day: false, start: body.start, end: body.end, link: 'https://calendar.google.com' });
      console.log('[mock] created', body);
      out = { id: id, link: null };
    } else if (path === '/api/email/sync') out = { accounts: [] };
    return new Promise(function (r) { setTimeout(function () { r(new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })); }, 250); });
  };

  // Supabase stand-in: a signed-in user and a few tables.
  var now = Date.now();
  var TABLES = {
    cockpit_sources: [],
    email_accounts: [{ id: A1, email_address: 'malinda@malindaperryconsulting.com', color: '#1E9E98', status: 'active', provider: 'gmail' }, { id: A2, email_address: 'hello@happygirlsdontdothat.com', color: '#F2607F', status: 'active', provider: 'gmail' }],
    life_areas: [],
    email_messages: [
      { id: 'm1', account_id: A1, thread_id: 't1', from_name: 'Dana Rivera', from_address: 'dana@example.com', subject: 'Document review for Thursday', summary: 'Dana sent the revised contract and wants your notes before Thursday’s call.', received_at: new Date(now - 36e5).toISOString(), category: 'action_needed', importance: 3, thread_next_steps: ['Read the contract', 'Reply with notes'] },
      { id: 'm2', account_id: A2, thread_id: 't2', from_name: 'Jordan Lee', from_address: 'jordan@example.com', subject: 'Podcast guest slot', summary: 'Jordan offers two recording dates next week and needs one picked.', received_at: new Date(now - 72e5).toISOString(), category: 'action_needed', importance: 2 },
      { id: 'm3', account_id: A1, thread_id: 't3', from_name: 'Payhip', from_address: 'no-reply@payhip.com', subject: 'You made a sale!', summary: 'Unstuck Workbook sold for $19.', received_at: new Date(now - 9e6).toISOString(), category: 'fyi', importance: 1 }
    ],
    email_digests: [{ summary: 'Two emails need you today: Dana’s contract notes, and Jordan’s podcast date. Everything else can wait.', digest_date: iso(new Date()), source: 'rules', author: 'ChatGPT', do_first: null }],
    daily_checkins: [],
    payhip_stores: [{ id: 's1', name: 'MPC Books', company: 'mpc', created_at: new Date(now - 30 * 864e5).toISOString() }],
    payhip_sales: (function () { var l = []; for (var i = 0; i < 60; i++) l.push({ id: 'p' + i, store_id: 's1', amount: [19, 29, 9.99, 49][i % 4], currency: 'USD', items: [['Unstuck Workbook'], ['Unstuck'], ['Coaching guide'], ['Bundle']][i % 4], sold_at: new Date(now - (i * 0.9 + (i % 3)) * 864e5).toISOString(), refunded: false }); return l; })(),
    actions: [{ id: 'a1', title: 'Send Dana notes', status: 'open', due_date: iso(new Date()) }, { id: 'a2', title: 'Record podcast intro', status: 'completed', completed_at: new Date().toISOString() }]
  };
  function q(table) {
    var rows = (TABLES[table] || []).slice(), single = false;
    var b = {
      select: function () { return b; }, eq: function () { return b; }, is: function () { return b; }, in: function () { return b; }, or: function () { return b; },
      order: function () { return b; }, limit: function () { return b; }, gte: function () { return b; }, lte: function () { return b; }, not: function () { return b; },
      maybeSingle: function () { single = true; return b; }, upsert: function () { return Promise.resolve({ error: null }); },
      then: function (ok, bad) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(ok, bad); }
    };
    return b;
  }
  var session = { access_token: 'mock', user: { id: 'u1', email: 'preview@example.com' } };
  window.supabase = { createClient: function () { return {
    auth: { getSession: function () { return Promise.resolve({ data: { session: session } }); }, onAuthStateChange: function () {}, signOut: function () { return Promise.resolve(); }, signInWithPassword: function () { return Promise.resolve({}); } },
    from: q,
    channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; }
  }; } };
})();
