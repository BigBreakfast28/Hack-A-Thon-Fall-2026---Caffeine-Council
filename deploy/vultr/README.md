# Deploying Muse on Vultr

**Status: dry-run on a real Vultr instance (Ubuntu 26.04, 1 GB, Oct 2026), with a placeholder Gemini key.** Verified there: the Docker build, `docker compose config`, `caddy validate`, a real Let's Encrypt certificate for an `sslip.io` name, HTTPS `/api/health`, a refusal for a request without a ticket, a 403 for a wrong origin, and the container settings under "Evidence" below. **Not yet verified:** a real Gemini call from the server, a ticket-authorized exchange, latency numbers, and an update with `docker compose up -d`. Steps 4 and 5 below are what was actually done; the first draft of this file said otherwise.

## What you get

```
browser --wss--> Caddy (TLS, no logs) --ws, private network--> muse (Node) --> Gemini API
                    ports 80/443                                  no ports on the host
```

- `muse` has no volumes, a read-only root filesystem, a 16 MB RAM-only `/tmp`, no Linux capabilities, and Docker logging turned off.
- `caddy` keeps one volume, `caddy_certs`, for its TLS certificates and account key. It holds no user data. Without it, Caddy requests a new certificate on every restart and will hit Let's Encrypt limits.
- `sh audit-compliance.sh` checks these promises in `docker-compose.yml` and the Caddyfile. It is a tripwire for regressions, not a proof.

## Steps

1. **Create the server.** In Vultr, deploy a Cloud Compute instance on Ubuntu LTS in the region nearest to where you will demo. A small plan is enough: the server holds no state and does no heavy work. Leave automatic backups off.
2. **Open the firewall.** Create a Vultr Firewall Group and attach it to the instance: allow TCP 22 from your own IP only, TCP 80, TCP 443, and UDP 443 (optional, for HTTP/3). Use Vultr's firewall, not `ufw`: Docker publishes ports by editing iptables and bypasses `ufw` rules.
3. **Point a domain at it.** Create an `A` record for, say, `muse.yourdomain.com` pointing at the instance IP. With no domain, `1-2-3-4.sslip.io` (your IP with dashes) resolves to that IP by itself. That path worked in the dry run (Let's Encrypt issued a certificate for it); if it ever refuses a shared domain, use a real one.
4. **Install Docker** from Ubuntu's own packages, which avoids adding a third-party apt source: `apt-get install -y docker.io docker-compose-v2 docker-buildx rsync`. On a small instance the background updater may still be running for a minute or two; wait until `pgrep -a dpkg` shows nothing. Optional hardening done in the dry run: key-only SSH with `PasswordAuthentication no` in `/etc/ssh/sshd_config.d/00-keyonly.conf`.
5. **Get the code.** From your laptop, copy only what the build needs, so the server needs no GitHub access: `rsync -a --delete --exclude node_modules --exclude '.env*' server deploy root@YOUR_IP:/root/muse/`, then `cd /root/muse/deploy/vultr` on the server. This sends your working tree as it is, committed or not.
6. **Set secrets in your shell, not a file.** These commands keep the key out of shell history:
   ```sh
   read -rs GEMINI_API_KEY && export GEMINI_API_KEY      # paste the key, press Enter
   read -rs MAGIC_TICKET_SECRET && export MAGIC_TICKET_SECRET
   read -rs HISTORY_SECRET && export HISTORY_SECRET      # optional: signs the chat history; unset means a random one per start
   export MUSE_DOMAIN=muse.yourdomain.com
   export ALLOWED_ORIGIN=https://your-front-end.example.com   # exact origin, no trailing slash
   ```
7. **Validate, then start.**
   ```sh
   docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose up --build -d
   ```
8. **Prove it works from your laptop** (from the repo root, with `npm install` done in `server/`):
   ```sh
   npm run smoke -- --url wss://muse.yourdomain.com/ws --origin https://your-front-end.example.com --expect-denied
   MAGIC_TICKET_SECRET=... npm run smoke -- --url wss://muse.yourdomain.com/ws --origin https://your-front-end.example.com
   ```
   The first run must report a refusal for lack of access, and its reply time is the cost of your network plus Vultr plus Caddy, with no Gemini call in it. The second run's round trip includes the Gemini call. Quote both numbers if you quote either, and say they were measured from your laptop.
9. **Point the front end at it** with `VITE_MUSE_WS_URL=wss://muse.yourdomain.com/ws` at build time.

## Evidence for the Zero Data claim

Run these on the server and keep the output. Each one shows a setting, which is stronger than saying it.

```sh
MUSE=$(docker compose ps -q muse)
docker inspect "$MUSE" --format 'readonly={{.HostConfig.ReadonlyRootfs}} mounts={{json .Mounts}} logdriver={{.HostConfig.LogConfig.Type}}'
# expect: readonly=true mounts=[] logdriver=none
docker diff "$MUSE"
# expect: nothing, or only /tmp entries (which are RAM)
docker inspect "$(docker compose ps -q caddy)" --format 'logdriver={{.HostConfig.LogConfig.Type}} mounts={{range .Mounts}}{{.Destination}} {{end}}'
# expect: logdriver=none mounts=/etc/caddy/Caddyfile /data
```

## What this does not cover

- **Your API key is on the server's disk.** Docker stores a container's environment in its configuration under `/var/lib/docker/containers/`, readable by root. Use a key restricted to the Gemini API and rotate it after the event.
- **Vultr and the network.** Vultr can see network metadata and runs the host. Nothing here changes that. A request still passes through Caddy's memory.
- **Gemini.** Google still processes and may retain what you send, per its API terms. See `ARCHITECTURE.md`. The server cannot make that zero.
- **Caddy's own messages** are discarded by default. If certificates fail to issue you will see nothing. Set `CADDY_LOG_DRIVER=json-file` for one run to read Caddy's messages, then unset it and run `docker compose up -d --force-recreate caddy`. Those messages can include client IP addresses while it is on.
- **Single instance, no scaling, no failover.** One VM is fine for a demo.
- **The Caddyfile is mounted from the host.** If Caddy cannot read it, check that the file is world-readable (`chmod 644 Caddyfile`), because Caddy runs without the capability to bypass file permissions.

## Updating or removing

```sh
# update: repeat step 5 (rsync) from your laptop, then, with the step 6 variables exported on the server:
docker compose up --build -d
docker compose down                           # stop; certificates are kept
docker compose down -v                        # stop and delete the certificate volume too
```

Destroy the Vultr instance after the event, and rotate the Gemini key and the ticket secret.
