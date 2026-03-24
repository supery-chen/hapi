#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_bun() {
    if command -v bun >/dev/null 2>&1; then
        command -v bun
        return 0
    fi

    local candidates=(
        "${BUN_BIN:-}"
        "$HOME/.bun/bin/bun"
        "$HOME/.local/bin/bun"
        "/usr/local/bin/bun"
        "/opt/homebrew/bin/bun"
	"/tmp/bun/bin/bun"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -n "$candidate" && -x "$candidate" ]]; then
            echo "$candidate"
            return 0
        fi
    done

    return 1
}

BUN_BIN_PATH="$(resolve_bun || true)"

if [[ -z "$BUN_BIN_PATH" ]]; then
    echo "bun not found." >&2
    echo "Checked PATH, \$BUN_BIN, ~/.bun/bin/bun, ~/.local/bin/bun, /usr/local/bin/bun, /opt/homebrew/bin/bun" >&2
    exit 1
fi

export HAPI_LISTEN_PORT=3016

if [[ "${HAPI_SKIP_WEB_BUILD:-0}" != "1" ]]; then
    echo "[start-hapi-hub] building web app..."
    cd "$ROOT_DIR/web"
    "$BUN_BIN_PATH" run build
fi

echo "[start-hapi-hub] starting hapi hub on port ${HAPI_LISTEN_PORT}..."
cd "$ROOT_DIR/cli"
exec "$BUN_BIN_PATH" src/index.ts hub "$@"
