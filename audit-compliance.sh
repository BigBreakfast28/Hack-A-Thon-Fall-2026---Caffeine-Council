#!/bin/sh
# audit-compliance.sh - Owned by Shubhang
#
# A tripwire, not a proof. It greps the source for storage, tracking, logging and
# disk-writing code and for container settings that would persist data. A clean run
# means "none of these known patterns appear", not "this app is compliant". It cannot
# see what a dependency does, what a host provider logs, or what the law requires.
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
