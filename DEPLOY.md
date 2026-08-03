# Deploying The Ante-Chamber on a Proxmox LXC

A runbook for self-hosting the app on a home Proxmox server, reachable
publicly via a Cloudflare Tunnel (no port-forwarding required). Written for
whoever's doing the deploy — read top to bottom once, then it's a reference.

## 1. Create the LXC

- Template: Debian 12 or Ubuntu 22.04, unprivileged is fine.
- Resources: 1 vCPU, 512MB–1GB RAM, ~8GB disk. This app is a single small
  Node process with a JSON-file store — there's plenty of headroom here.
- Give it a static IP (or a DHCP reservation) on the LAN.

## 2. Install Node and the app

Inside the container:

```bash
apt update && apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

git clone https://github.com/dan-konton-abs/Game-night.git
cd Game-night
git checkout main
npm install
npm run build
```

`npm run build` produces `client/dist`; the server serves it directly, so
this is the only build step needed — one process, one port.

## 3. Run it as a service (systemd)

So it survives reboots and restarts itself if it ever crashes. This is also
where the account system's secrets and mail settings live — generate a real
`JWT_SECRET` (don't skip this one; without it, everyone gets logged out on
every restart) and fill in your mail server's SMTP details so password
resets actually get emailed instead of just logged to the console:

```bash
openssl rand -hex 32   # use the output as JWT_SECRET below

cat > /etc/systemd/system/gamenight.service <<'EOF'
[Unit]
Description=The Ante-Chamber
After=network.target

[Service]
WorkingDirectory=/root/Game-night
ExecStart=/usr/bin/npm start
Restart=always
Environment=PORT=4000
Environment=PUBLIC_URL=https://game.yourdomain.com
Environment=JWT_SECRET=<paste the openssl output here>
Environment=SMTP_HOST=<your mail server host>
Environment=SMTP_PORT=587
Environment=SMTP_USER=<smtp username, if required>
Environment=SMTP_PASS=<smtp password, if required>
Environment=MAIL_FROM=The Ante-Chamber <no-reply@yourdomain.com>
Environment=GEMINI_API_KEY=<your Gemini API key, for the Rules Keeper - optional>

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now gamenight
systemctl status gamenight   # confirm it's active and listening
```

Room data (`server/data/rooms/`), accounts (`server/data/users.json`), and
uploaded map/token images (`server/uploads/`) all live on the container's
normal filesystem, so unlike an ephemeral cloud host, they persist across
restarts with no extra setup.
Worth including in whatever backup routine the rest of the Proxmox host
uses, but not required for it to work.

## 4. Expose it publicly (Cloudflare Tunnel)

`cloudflared` runs inside the LXC and makes an *outbound* connection to
Cloudflare — nothing needs to be opened on the router/firewall, and TLS is
handled for you. This only ever adds a **CNAME record for one new
subdomain**; it has zero effect on other DNS records (MX/SPF/DKIM/etc. for
an existing mail setup on the same domain are completely unaffected). Pick
a subdomain that isn't already in use for something else — `game.` or
`board.` are good choices.

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

cloudflared tunnel login          # opens a browser link, pick the domain's zone
cloudflared tunnel create game-night
cloudflared tunnel route dns game-night game.yourdomain.com

mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: game-night
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: game.yourdomain.com
    service: http://localhost:4000
  - service: http_status:404
EOF

cloudflared service install
systemctl enable --now cloudflared
```

`<tunnel-id>` and the exact credentials filename are printed by
`cloudflared tunnel create` — copy them from there rather than guessing.

Once both `gamenight` and `cloudflared` are enabled, `https://game.yourdomain.com`
is a stable link — drop it in the Discord server topic or a pinned message.

**No domain / just want to test right now:** skip the DNS setup above and run
`cloudflared tunnel --url http://localhost:4000` directly. It prints a random
`https://something.trycloudflare.com` URL immediately, no account or domain
needed — but it's ephemeral and changes every time `cloudflared` restarts, so
it's for a one-off test, not a link to bookmark.

## 5. Updating to a new version

Whenever new changes are merged to `main`:

```bash
cd /root/Game-night
git pull
npm install
npm run build
systemctl restart gamenight
```

`cloudflared` doesn't need touching for an app update — it just proxies to
`localhost:4000`, whatever's running there.

## 6. Things worth knowing

- **GM-hosted private chat.** The app's whisper/DM feature is private
  *between players*, enforced server-side. If the GM is also the one running
  this server, they'd still have disk access to the stored messages
  (`server/data/rooms/<ROOM_CODE>.json`) — private from the table, not from
  whoever operates the box. Same goes for `server/data/users.json`: passwords
  are bcrypt-hashed (never recoverable), but the account list itself is
  readable by whoever has disk access. See the README for more detail.
- **Health check.** `systemctl status gamenight` and `systemctl status
  cloudflared` are the first two things to check if the site's unreachable.
  `journalctl -u gamenight -f` / `journalctl -u cloudflared -f` for live logs.
- **Real accounts now required.** Every player needs to sign up (name, email,
  password) to join a game — there's no anonymous/guest join anymore. If
  you're upgrading a server that was already running an older version of
  this app (pre-accounts), any existing rooms won't be reachable under the
  old anonymous identities; clear `server/data/` for a clean start before
  your next real session.
- **Password resets need working SMTP.** If `SMTP_HOST` isn't set (or your
  mail server isn't reachable), reset links only get logged to the server's
  console (`journalctl -u gamenight`) instead of emailed — someone would need
  to fetch the link from there manually. Worth testing a real reset once
  after deploying, to confirm mail delivery actually works end-to-end.
