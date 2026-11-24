#!/usr/bin/env bash
#
# Run Plugin Check on the built directory variant in a throwaway wp-env site.
#
#   bin/plugin-check.sh            check build/<slug>/, then stop the site
#   bin/plugin-check.sh --keep     leave the site running (http://localhost:8892)
#
# Build first with bin/build-directory.sh. The site has only the variant and
# the Plugin Check plugin (latest from WordPress.org), on its own ports, so it
# never touches the repo's main wp-env site. Every category is checked.
#
# Prints every error and warning, writes them to build/plugin-check.csv, and
# exits non-zero when there is at least one error.

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
# shellcheck source=directory/identity.env
source "$ROOT/directory/identity.env"

keep=0
for arg in "$@"; do
    case "$arg" in
        --keep) keep=1 ;;
        -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
        *) echo "error: unknown argument $arg" >&2; exit 2 ;;
    esac
done

if [ ! -f "$ROOT/build/$SLUG/$SLUG.php" ]; then
    echo "error: build/$SLUG is missing; run bin/build-directory.sh first" >&2
    exit 1
fi

WP_ENV="$ROOT/node_modules/.bin/wp-env"
if [ ! -x "$WP_ENV" ]; then
    echo "error: wp-env isn't installed; run npm install" >&2
    exit 1
fi

ENV_DIR="$ROOT/build/plugin-check-env"
mkdir -p "$ENV_DIR"
cat > "$ENV_DIR/.wp-env.json" <<JSON
{
    "core": null,
    "plugins": [
        "../$SLUG",
        "https://downloads.wordpress.org/plugin/plugin-check.zip"
    ],
    "port": 8892,
    "testsPort": 8893,
    "config": { "WP_DEBUG": true, "WP_DEBUG_LOG": true }
}
JSON

cd "$ENV_DIR"
cleanup() {
    if [ $keep = 0 ]; then
        "$WP_ENV" stop > /dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

"$WP_ENV" start > /dev/null 2>&1

CSV="$ROOT/build/plugin-check.csv"
# Runtime checks need Plugin Check's CLI loaded before WordPress (--require).
"$WP_ENV" run cli -- wp plugin check "$SLUG" \
    --format=csv --fields=file,line,column,type,code,message \
    --include-experimental \
    --require=./wp-content/plugins/plugin-check/cli.php \
    2> "$ROOT/build/plugin-check.stderr" | tr -d '\r' | grep -v '^\(ℹ\|✔\)' > "$CSV" || true

# Plugin Check prints one CSV block per file: "FILE: <name>" then a header row.
errors="$( grep -c ',ERROR,' "$CSV" || true )"
warnings="$( grep -c ',WARNING,' "$CSV" || true )"

if [ "$errors" = 0 ] && [ "$warnings" = 0 ]; then
    if grep -qi 'error' "$ROOT/build/plugin-check.stderr"; then
        echo "error: Plugin Check didn't run:" >&2
        cat "$ROOT/build/plugin-check.stderr" >&2
        exit 1
    fi
    echo "Plugin Check: no errors or warnings for $SLUG"
    exit 0
fi

cat "$CSV"
echo
echo "Plugin Check: $errors error(s), $warnings warning(s) for $SLUG (build/plugin-check.csv)"
[ "$errors" = 0 ]
