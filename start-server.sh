#!/bin/bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

port=8080
build=true
open=true

usage() {
    printf '%s\n' \
        'Usage: ./start-server.sh [--no-build] [--clean] [--port PORT] [--no-open]' \
        'Build and serve docs on http://127.0.0.1:8080.' \
        'Vite cleans docs during each build.' \
        'Use --no-open to prevent the browser from opening.'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build|-NoBuild) build=false ;;
        --clean|-Clean) ;; # Vite cleans the output during each build.
        --no-open) open=false ;;
        --port|-Port)
            if [[ $# -lt 2 ]]; then
                printf '%s\n' 'Error: --port requires a number.' >&2
                exit 1
            fi
            port="$2"
            shift
            ;;
        --help|-h) usage; exit 0 ;;
        *)
            printf 'Error: Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 1
            ;;
    esac
    shift
done

if [[ ! "$port" =~ ^[1-9][0-9]{0,4}$ ]] || (( port > 65535 )); then
    printf '%s\n' 'Error: Use a port from 1 to 65535.' >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    printf '%s\n' 'Error: Install Node.js 22.12 or later, with npm.' >&2
    exit 1
fi

if [[ ! -f node_modules/vite/bin/vite.js ]]; then
    printf '%s\n' 'Error: Dependencies are missing. Run npm ci first.' >&2
    exit 1
fi

if [[ "$build" == true ]]; then
    npm run build
fi

if [[ ! -f docs/index.html ]]; then
    printf '%s\n' 'Error: docs/index.html is missing. Run without --no-build.' >&2
    exit 1
fi

args=(--host 127.0.0.1 --port "$port" --strictPort)
if [[ "$open" == true ]]; then
    args+=(--open)
fi

exec npm run preview -- "${args[@]}"
