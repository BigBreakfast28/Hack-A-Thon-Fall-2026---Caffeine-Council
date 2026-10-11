#!/bin/sh
# audit-compliance.sh - Owned by Shubhang
#
# A tripwire, not a proof. It greps the source, and the page shell (HTML entry, public
# folder, vite.config.ts, the site config and package.json), for storage, tracking, logging
# and disk-writing code and for container settings that would persist data. A clean run
# means "none of these known patterns appear", not "this app is compliant". It can see the
# names of dependencies but not what a dependency does, and it cannot see what a host
# provider logs or what the law requires. A plugin that phones home without a URL in the
# config, or a tracker with an innocent package name, would pass.
#
# Run from anywhere:  sh audit-compliance.sh     (exit code 1 on any finding)
cd "$(dirname "$0")" || exit 2

echo "🕵️‍♂️ Initiating Project Muse Zero-Data Architecture Verification Audit..."
FAIL_AUDIT=0

# Client and server code: browser storage, trackers, third-party fonts, logging libraries,
# and anything that writes to disk.
ILLEGAL_PATTERNS="AsyncStorage|SQLite|localStorage|sessionStorage|indexedDB|cookie|mixpanel|amplitude|google-analytics|googletagmanager|gtag\(|sentry|postman-log|fonts\.googleapis|gstatic|morgan|winston|pino|bunyan|createWriteStream|writeFile|appendFile|from ['\"](node:)?fs(/promises)?['\"]|require\(['\"](node:)?fs"

# Lines that are only comments are skipped so explanations of what the code avoids do not fail the audit.
FORBIDDEN_HOOKS=$(grep -rniE \
  --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json --exclude=pnpm-lock.yaml \
  "$ILLEGAL_PATTERNS" ./src ./server 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|#)')

if [ -n "$FORBIDDEN_HOOKS" ]; then
    echo "❌ CRITICAL COMPLIANCE FAILURE: Found illegal data storage hooks:"
    echo "$FORBIDDEN_HOOKS"
    FAIL_AUDIT=1
else
    echo "✅ SUCCESS: Zero persistent disk storage or tracking scripts detected."
fi

# Page shell and build config. The check above reads only ./src and ./server, but a tracker can
# also arrive through the HTML entry, the public folder, the site config or a dependency.
# vite.config.ts legitimately holds the code that adds Google Analytics when
# .figma/make/site.json asks for it, so that file is checked for unexpected hosts, and the
# switch itself is checked in site.json. Hosts are written with [.] so the same text works in
# grep and in both macOS and GNU awk.
ALLOWED_HOSTS='www[.]w3[.]org|vitejs[.]dev|www[.]googletagmanager[.]com'
SHELL_FILES="vite.config.ts"
for page in *.html; do [ -f "$page" ] && SHELL_FILES="$SHELL_FILES $page"; done
if [ -d public ]; then SHELL_FILES="$SHELL_FILES $(find public -type f | tr '\n' ' ')"; fi

# Any http(s) host that is not on the short allow-list, outside comment lines.
EXTERNAL_HOSTS=$(grep -nHE "https?://" $SHELL_FILES 2>/dev/null | awk -v allow="^https?://($ALLOWED_HOSTS)\$" '
  {
    match($0, /^[^:]+:[0-9]+:/)
    loc = substr($0, 1, RLENGTH)
    text = substr($0, RLENGTH + 1)
    if (text ~ /^[ \t]*(\/\/|\*|\/\*|#|<!--)/) next
    while (match(text, /https?:\/\/[A-Za-z0-9.-]+/)) {
      host = substr(text, RSTART, RLENGTH)
      text = substr(text, RSTART + RLENGTH)
      if (host !~ allow) print loc " " host
    }
  }')

# The switches that make the site shell add Google Analytics or custom scripts. Empty is fine.
SITE_SWITCHES=""
if [ -f .figma/make/site.json ]; then
    SITE_SWITCHES=$(grep -nE '"(googleAnalyticsId|headStart|headEnd|bodyStart|bodyEnd)"[[:space:]]*:[[:space:]]*"[^"]+"' .figma/make/site.json)
fi

# Dependency names that are trackers, error reporters or logging libraries (names only).
TRACKER_DEPS=$(grep -nHE '^[[:space:]]*"[^"]*(sentry|posthog|mixpanel|amplitude|segment|hotjar|fullstory|logrocket|datadog|newrelic|bugsnag|rollbar|honeybadger|vercel/analytics|react-ga|google-analytics|gtag|plausible|umami|clarity|pino|winston|morgan|bunyan)[^"]*"[[:space:]]*:' package.json server/package.json 2>/dev/null)

if [ -n "$EXTERNAL_HOSTS" ] || [ -n "$SITE_SWITCHES" ] || [ -n "$TRACKER_DEPS" ]; then
    echo "❌ CRITICAL COMPLIANCE FAILURE: the page shell or build config could load third-party code:"
    if [ -n "$EXTERNAL_HOSTS" ]; then echo "  unexpected external hosts:"; echo "$EXTERNAL_HOSTS" | sed 's/^/    /'; fi
    if [ -n "$SITE_SWITCHES" ]; then echo "  analytics or custom-script switch set in .figma/make/site.json:"; echo "$SITE_SWITCHES" | sed 's/^/    /'; fi
    if [ -n "$TRACKER_DEPS" ]; then echo "  tracker or logging packages in package.json:"; echo "$TRACKER_DEPS" | sed 's/^/    /'; fi
    FAIL_AUDIT=1
else
    echo "✅ SUCCESS: Page shell and build config: no unexpected external hosts, no analytics or custom-script switch, no tracker packages."
fi

# Container: no volumes, and a read-only root filesystem.
if grep -nE '^[[:space:]]*volumes:' server/docker-compose.yml >/dev/null 2>&1; then
    echo "❌ CRITICAL COMPLIANCE FAILURE: server/docker-compose.yml declares volumes."
    FAIL_AUDIT=1
elif ! grep -nE '^[[:space:]]*read_only:[[:space:]]*true' server/docker-compose.yml >/dev/null 2>&1; then
    echo "❌ CRITICAL COMPLIANCE FAILURE: server/docker-compose.yml does not set read_only: true."
    FAIL_AUDIT=1
else
    echo "✅ SUCCESS: Container has no volumes and a read-only root filesystem."
fi

# Vultr kit: the Muse service keeps the same promises as the local compose file. Only the
# Caddy service may have a volume (TLS certificates), and Caddy must not log requests to a file.
VULTR_COMPOSE=deploy/vultr/docker-compose.yml
if [ -f "$VULTR_COMPOSE" ]; then
    MUSE_BLOCK=$(awk '/^  muse:/{f=1; next} /^  [A-Za-z0-9_-]+:/{f=0} /^[A-Za-z]/{f=0} f' "$VULTR_COMPOSE")
    if echo "$MUSE_BLOCK" | grep -E '^[[:space:]]*volumes:' >/dev/null; then
        echo "❌ CRITICAL COMPLIANCE FAILURE: the muse service in $VULTR_COMPOSE declares volumes."
        FAIL_AUDIT=1
    elif ! echo "$MUSE_BLOCK" | grep -E '^[[:space:]]*read_only:[[:space:]]*true' >/dev/null; then
        echo "❌ CRITICAL COMPLIANCE FAILURE: the muse service in $VULTR_COMPOSE is not read_only."
        FAIL_AUDIT=1
    elif ! echo "$MUSE_BLOCK" | grep -E '^[[:space:]]*driver:[[:space:]]*none' >/dev/null; then
        echo "❌ CRITICAL COMPLIANCE FAILURE: the muse service in $VULTR_COMPOSE does not turn off Docker logging."
        FAIL_AUDIT=1
    elif grep -nE '^[[:space:]]*output[[:space:]]+file' deploy/vultr/Caddyfile >/dev/null 2>&1; then
        echo "❌ CRITICAL COMPLIANCE FAILURE: deploy/vultr/Caddyfile writes a log file."
        FAIL_AUDIT=1
    else
        echo "✅ SUCCESS: Vultr kit: muse has no volumes, is read-only, has logging off; proxy writes no log file."
    fi
fi

# Secrets must never be committed.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    TRACKED_ENV=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.example$')
    if [ -n "$TRACKED_ENV" ]; then
        echo "❌ CRITICAL COMPLIANCE FAILURE: environment files are tracked by git:"
        echo "$TRACKED_ENV"
        FAIL_AUDIT=1
    else
        echo "✅ SUCCESS: No environment files are tracked by git."
    fi
fi

exit $FAIL_AUDIT
