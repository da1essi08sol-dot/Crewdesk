# Crewdesk

An all-in-one job tracker and team chat for your company. It runs on your own computer, and everyone uses it from their phone or a browser.

**What it does**
- Accounts with profile pictures, job titles, phone numbers and bios
- Companies that people join with a **6-letter code + join password**, with teams inside each company (people can join or leave teams)
- Jobs with client, site address, start date, deadline, priority, status, team and assigned people
- Tasks inside each job, each with its own checklist, people and deadline
- Optional money tracking per job (price, cost lines, profit and margin). Only admins see money unless you turn it on for everyone.
- Client contacts list with tap-to-call, text, email and directions
- Announcements for the whole company (everyone gets notified)
- A live **group chat for every job** plus a **company-wide chat**, with photo sharing
- See who's online, and live GPS positions on a map for anyone who switches sharing on
- Notifications when you're added to a job, given a task, or a new announcement goes up
- Works in light and dark mode, and installs on phones like an app

---

## 1. Start it on your computer

You need **Node.js 18 or newer** (you already have it if Lumen runs). Nothing else needs installing.

1. Unzip the `crewdesk` folder somewhere, e.g. `Documents\crewdesk`.
2. Double-click **`start.bat`**.
3. Open **http://localhost:3000** in your browser and create your account, then your company.

The window shows a "Same Wi-Fi" address (like `http://192.168.1.20:3000`). Phones on your home or office Wi-Fi can use that address.

All data is saved in the `data` folder. Back that folder up to keep everything safe.

## 2. Let your crew use it from anywhere (and turn on GPS)

Phones only allow GPS on secure `https://` links, and your crew will be on mobile data at job sites. The easiest free fix is a Cloudflare tunnel:

1. Install it once. Open Command Prompt and run:
   `winget install --id Cloudflare.cloudflared`
2. With Crewdesk running, double-click **`start-public.bat`**.
3. It prints a link like `https://something-random.trycloudflare.com`. Send that link to your crew.

That quick link changes every time you restart the tunnel. For a link that never changes, set up a free named Cloudflare Tunnel with your own domain, or use Tailscale Funnel.

## Or: host it online (no computer needed)

Crewdesk runs on **Render** (free web hosting) with a **Neon** Postgres database (free), so data is kept even when the server restarts.

1. Push this folder to a GitHub repository.
2. On neon.tech, create a project and copy its connection string (`postgresql://…`).
3. On render.com, choose **New → Blueprint**, pick the repository, and paste the Neon connection string when it asks for `DATABASE_URL`.
4. Render gives you a link like `https://crewdesk-xxxx.onrender.com`. It's https, so GPS works.

On Render's free plan the app sleeps after 15 minutes without visitors, and the next visit takes about a minute to wake it up. A paid plan keeps it awake.

## 3. Get your crew in

1. Go to **Company** (or **More → Company & invites**) and tap **Copy invite message**.
2. Send it to them along with the join password you chose.
3. They open the link, create an account and tap **Join a company**.

**Install on a phone:** on iPhone, open the link in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome and choose Install app from the menu.

## Roles

| | Owner | Admin | Member |
|---|---|---|---|
| Create and edit jobs, tasks, clients | ✓ | ✓ | ✓ (job creation can be switched off) |
| Delete jobs | ✓ | ✓ | Only their own |
| Post announcements, manage teams | ✓ | ✓ | |
| See prices, costs and profit | ✓ | ✓ | If you turn it on |
| Change join password and code, remove people | ✓ | ✓ | |
| Delete the company, hand over ownership | ✓ | | |

Tap a person on the **Team** page to make them an admin, remove them, or hand over ownership.

## Good to know

- **GPS only updates while the app is open on the phone.** Phones stop web apps from tracking in the background, which also protects battery and privacy. Each person's last known position stays on the map with an "updated X ago" label.
- The computer running Crewdesk has to stay on and awake for others to use it.
- To change the port, run `set PORT=8080` and then `node server.js`.
- You can also serve it over HTTPS directly: put `key.pem` and `cert.pem` in a `certs` folder and it will also listen on port 3443.
