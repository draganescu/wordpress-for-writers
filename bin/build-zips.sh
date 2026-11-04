#!/usr/bin/env bash
#
# Build one installable zip per package: the Writer plugin at the repo root,
# every plugin in plugins/ and every theme in themes/.
#
#   bin/build-zips.sh                   build every package
#   bin/build-zips.sh writer-subscribe  build only the named packages
#   bin/build-zips.sh --list            print "slug version type dir" per package
#
# Each zip unpacks to a folder named after the slug, so WordPress installs it
# in the right place. Zips land in build/<slug>-<version>.zip.
#
# Dev files are left out (see EXCLUDES). A package can leave out more by
# listing rsync patterns, one per line, in a .distignore file in its folder.

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BUILD="$ROOT/build"

EXCLUDES=(
    '.git' '.git*' '.DS_Store' '.claude' '.distignore'
    'node_modules' '.wp-env.json' 'package.json' 'package-lock.json'
    '*.map' '*.log'
)

# Only the root plugin: things that belong to the repo, not the plugin.
ROOT_EXCLUDES=(
    '/plugins' '/themes' '/bin' '/build' '/.github'
    '/playground' '/blueprint.json' '/screenshots'
)

# Print "slug type dir" for every package.
packages() {
    echo "wordpress-for-writers plugin ."
    local d
    for d in "$ROOT"/plugins/*/; do
        [ -d "$d" ] && echo "$( basename "$d" ) plugin plugins/$( basename "$d" )"
    done
    for d in "$ROOT"/themes/*/; do
        [ -d "$d" ] && echo "$( basename "$d" ) theme themes/$( basename "$d" )"
    done
    return 0
}

# Read "Version:" from the plugin's main file or the theme's style.css.
version_of() {
    local slug="$1" type="$2" dir="$3" file
    if [ "$type" = theme ]; then
        file="$ROOT/$dir/style.css"
    else
        file="$ROOT/$dir/$slug.php"
    fi
    if [ ! -f "$file" ]; then
        echo "error: $slug has no $( basename "$file" )" >&2
        return 1
    fi
    sed -n 's/^[[:space:]*]*Version:[[:space:]]*\([^[:space:]]*\).*/\1/p' "$file" | head -n 1
}

build() {
    local slug="$1" type="$2" dir="$3" version stage args=()
    version="$( version_of "$slug" "$type" "$dir" )"
    if [ -z "$version" ]; then
        echo "error: no Version: header found for $slug" >&2
        return 1
    fi

    stage="$BUILD/stage/$slug"
    rm -rf "$stage"
    mkdir -p "$stage"

    local p
    for p in "${EXCLUDES[@]}"; do args+=( --exclude "$p" ); done
    if [ "$dir" = . ]; then
        for p in "${ROOT_EXCLUDES[@]}"; do args+=( --exclude "$p" ); done
    fi
    if [ -f "$ROOT/$dir/.distignore" ]; then
        args+=( --exclude-from "$ROOT/$dir/.distignore" )
    fi

    rsync -a "${args[@]}" "$ROOT/$dir/" "$stage/"

    local zip="$BUILD/$slug-$version.zip"
    rm -f "$zip"
    ( cd "$BUILD/stage" && zip -qrX "$zip" "$slug" )
    echo "$zip"
}

main() {
    local list=0 wanted=()
    for arg in "$@"; do
        case "$arg" in
            --list) list=1 ;;
            -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
            *) wanted+=( "$arg" ) ;;
        esac
    done

    local found=() slug type dir
    while read -r slug type dir; do
        if [ ${#wanted[@]} -gt 0 ]; then
            local hit=0 w
            for w in "${wanted[@]}"; do [ "$w" = "$slug" ] && hit=1; done
            [ $hit = 1 ] || continue
        fi
        found+=( "$slug" )
        if [ $list = 1 ]; then
            echo "$slug $( version_of "$slug" "$type" "$dir" ) $type $dir"
        else
            mkdir -p "$BUILD"
            build "$slug" "$type" "$dir"
        fi
    done < <( packages )

    local w
    for w in "${wanted[@]+"${wanted[@]}"}"; do
        if [[ ! " ${found[*]-} " == *" $w "* ]]; then
            echo "error: no package named $w" >&2
            exit 1
        fi
    done

    if [ $list = 0 ]; then
        rm -rf "$BUILD/stage"
    fi
}

main "$@"
