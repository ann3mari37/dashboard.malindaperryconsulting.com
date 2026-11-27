# MPC Cockpit

One screen for **MaLinda Perry Consulting** and **Happy Girls Don't Do That**, at
**https://admin.malindaperryconsulting.com**. It never scrolls. A switch at the top shows Both, MPC or Happy Girls.

| Area | What it shows | Where the data comes from |
|---|---|---|
| Calendar (biggest) | The next 7 days from every Google calendar, color-coded, with **+ Add** | Google Calendar, through the Tasks app's Worker |
| Email | Emails that need a reply, and ChatGPT's summary | Gmail, as synced and sorted by the Tasks app |
| Numbers | Tasks today, emails, Payhip sales (live) | The Tasks app's database, and Payhip webhooks |
| Dock | Tasks, Gmail, Calendar, Payhip, Links, website, Settings | |

Every icon and section opens a **view inside the cockpit first**, except Tasks and Links, which open the real apps in a new tab, already signed in
(Momentum at `tasks.malindaperryconsulting.com`, LinkHub at `links.malindaperryconsulting.com`), each in its own look.
From a view, **Open** goes to the app itself: the website on a computer, the Gmail or Google Calendar app on a phone.

## Signing in and staying signed in

- **Google and Payhip are connected once**, in Settings. The connections live on the server (encrypted), so every
  device uses them. Nothing is stored on the device.
- **The cockpit itself needs one sign-in per new device** (same account as the Tasks app). The session sits in a cookie
  for all of `malindaperryconsulting.com` (`public/session.js`), so that one sign-in also covers Tasks inside the cockpit.

## How it's built

Plain HTML, CSS and JavaScript in `public/`, no build step. Hosted on **Cloudflare Pages**, so loading the page costs
no Worker requests. The page reads the Tasks app's Supabase database directly with the signed-in user's session
(row-level security limits it to her rows). Only Google Calendar (loading the week, adding an event), archiving an
email and Payhip (one request per sale) go through the Tasks app's Worker.

- `public/config.js`: Supabase address and public key, the Worker address, the two businesses' names and colors.
- `public/session.js`: the shared sign-in cookie (a copy of the Tasks app's `app/src/lib/sharedSession.ts`).
- `public/app.js`: everything else.
- `public/_headers`: security headers; only the three apps above may be shown inside the page.

## One-time setup

1. **Tasks app (repo `todos.jamry.us`)**: merge the cockpit branch, apply the migration
   `supabase/migrations/20261126000000_cockpit.sql`, and follow *MaLinda Perry cockpit* in `docs/OPERATIONS.md`
   (enable the Google Calendar API, add the calendar scopes and the `tasks.malindaperryconsulting.com` redirect URI).
   All of it is switched on only for malindaperryconsulting.com addresses; todos.jamry.us is unchanged.
2. **LinkHub (repo `linkhub`)**: merge the cockpit branch and `npm run deploy`. It adds `links.malindaperryconsulting.com`,
   the only address the cockpit may show it on; links.kittigutierrez.com and links.jamry.us are unchanged.
3. **This site**: in Cloudflare (the account that holds `malindaperryconsulting.com`), create a Pages project
   `mpc-cockpit` connected to this repo with build output directory `public` and no build command, then add the custom
   domain `admin.malindaperryconsulting.com`. Or deploy by hand: `npm run deploy`.
4. **In the cockpit**: Settings → *Connect a Google account* for each Gmail (reconnect existing ones once for the
   calendar), choose MPC or Happy Girls for each inbox, calendar and task area, and add each Payhip store. Paste the
   webhook address it shows into Payhip's webhook settings.

## Preview

`npm run preview` serves `public/` locally. Sign-in and data only work on `*.malindaperryconsulting.com` addresses
that the Tasks app's Worker allows.
