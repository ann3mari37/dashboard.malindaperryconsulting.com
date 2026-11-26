// Public settings for the cockpit. The Supabase anon key is safe in a browser: every table is protected by RLS.
// It is the same project and key the Tasks app (Momentum) uses.
window.COCKPIT = {
  supabaseUrl: 'https://noyenmjdzfglniennbdo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5veWVubWpkemZnbG5pZW5uYmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4ODQ3NjAsImV4cCI6MjEwODQ2MDc2MH0.BneAlF7k9nVoO5rC3G0DhxiOQRQN_FhIOfXvBl-9W_o',
  // Momentum's Worker: Google Calendar and Payhip routes. Same site as the cockpit, so the sign-in cookie is shared.
  api: 'https://dashboard.malindaperryconsulting.com',
  // Apps shown inside the cockpit (each keeps its own look).
  tasksApp: 'https://dashboard.malindaperryconsulting.com',
  linksApp: 'https://links.malindaperryconsulting.com',
  companies: {
    mpc: { name: 'MaLinda Perry Consulting', short: 'MPC', color: '#1E9E98', bg: '#E1F4F1', ink: '#0C4F4B', site: 'https://malindaperryconsulting.com' },
    hg: { name: 'Happy Girls Don’t Do That', short: 'Happy Girls', color: '#F2607F', bg: '#FDE3E9', ink: '#7A1F35', site: null }
  }
};
