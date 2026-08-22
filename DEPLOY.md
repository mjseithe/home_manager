# Deploying to the Raspberry Pi

This assumes Raspberry Pi OS (with Desktop, so we can run a kiosk browser on
the touchscreen) and that you've already worked through `readme.md` locally
at least once (so you have real Google OAuth + SMTP credentials).

## 1. One-time Pi setup

SSH into the Pi (or use a terminal on the touchscreen itself).

```sh
# Node 22 via nvm (matches .nvmrc)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22

# sqlite3 CLI is handy for poking at the db directly, optional
sudo apt install -y sqlite3

git clone <your-repo-url> ~/home_manager
cd ~/home_manager
npm install
```

Find the Pi's address other devices can reach it at — usually its mDNS name:

```sh
hostname   # e.g. "homepi" -> reachable at homepi.local
```

## 2. Configure `.env` for the Pi

```sh
cp .env.example .env
nano .env
```

Set `GOOGLE_REDIRECT_URI` to match the Pi, e.g.:

```
GOOGLE_REDIRECT_URI=http://homepi.local:3000/calendar/connect/callback
```

**Add this exact URL to the "Authorized redirect URIs" list** on the OAuth
client in Google Cloud Console (Credentials page) — Google rejects any
redirect URI that isn't registered there, and it must match exactly
(scheme, host, port, path).

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the `SMTP_*` values
the same way you did locally.

## 3. Build and initialize the database

```sh
npm run build
npm run db:migrate
npm run db:seed
```

`local.db` now lives in the project directory — back it up occasionally
(`cp local.db local.db.bak`) since it holds your calendar tokens, grocery
list, and chores.

## 4. Run the server on boot (systemd)

Create `/etc/systemd/system/home-manager.service`:

```ini
[Unit]
Description=Home Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/home_manager
EnvironmentFile=/home/pi/home_manager/.env
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=ORIGIN=http://homepi.local:3000
ExecStart=/home/pi/.nvm/versions/node/v22.22.3/bin/node build/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Adjust the `User`, `WorkingDirectory`, and the Node binary path in
`ExecStart` (find it with `which node` while `nvm use 22` is active) to match
your actual setup. `ORIGIN` should match `GOOGLE_REDIRECT_URI`'s
scheme+host+port (SvelteKit uses it to validate form submissions).

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now home-manager
sudo systemctl status home-manager   # confirm it's running
```

The app is now live at `http://homepi.local:3000` — from the Pi itself, from
your phone, and from your wife's phone, as long as they're on the same
Wi-Fi/network.

## 5. Kiosk mode on the touchscreen

Disable screen blanking (Raspberry Pi OS with Desktop):

```sh
sudo raspi-config
# Display Options -> Screen Blanking -> Disable
```

Autostart Chromium pointed at the app, full-screen, no UI chrome. Create
`~/.config/autostart/home-manager-kiosk.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Home Manager Kiosk
Exec=chromium-browser --kiosk --incognito --noerrdialogs --disable-infobars --no-first-run --check-for-update-interval=31536000 http://localhost:3000
X-GNOME-Autostart-enabled=true
```

(`--incognito` avoids the "restore session" prompt on crashes/reboots.)
Reboot the Pi — it should boot straight into the app full-screen. Tap the
first profile to test.

If Chromium is on the same machine as the server, `http://localhost:3000` is
fine here even though `ORIGIN` above uses the mDNS hostname — that's just for
the OAuth redirect, not for the kiosk browser's URL.

## 6. Updating the app

```sh
cd ~/home_manager
git pull
npm install
npm run db:migrate   # no-op if there's nothing new to migrate
npm run build
sudo systemctl restart home-manager
```

## Troubleshooting

- **"Google OAuth is not configured"**: `.env` is missing
  `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`, or systemd isn't picking up
  `EnvironmentFile` — check `sudo systemctl status home-manager` and
  `journalctl -u home-manager -e`.
- **Google redirects to an error page after consent**: the redirect URI in
  `.env` doesn't exactly match what's registered in Google Cloud Console.
- **Reminders aren't sending**: check `SMTP_*` values, and make sure each
  family member has an email set on the Settings page — reminders are
  per-person, not global.
- **Can't reach the app from a phone**: confirm the phone is on the same
  Wi-Fi network as the Pi, and try the Pi's IP address
  (`hostname -I`) instead of the `.local` mDNS name if your router doesn't
  support mDNS.
