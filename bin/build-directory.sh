#!/usr/bin/env bash
#
# Build the WordPress.org directory variant of the root plugin.
#
#   bin/build-directory.sh         build build/<slug>/ and verify it
#   bin/build-directory.sh --zip   also zip it to build/<slug>-<version>.zip
#
# The variant's name and slug come from directory/identity.env. From the
# files the root zip ships (see bin/build-zips.sh) it:
#
#   - renames the main file to <slug>.php and replaces its Plugin Name;
#   - replaces the quoted text domain 'wordpress-for-writers' in PHP and JS,
#     and the Text Domain header, with the new slug;
#   - replaces the product name "WordPress for Writers" with the new name;
#   - removes the Update URI header (the directory serves updates);
#   - adds directory/readme.txt with its Stable tag set to the Version header.
#
# The GitHub repository URL is left alone. The wfw_/WFW_ prefix, hooks,
# handles, meta keys and query args are never touched.
#
# Then it checks its own output and exits non-zero, saying why, when the old
# slug or name is left anywhere but the GitHub URL, a PHP file fails php -l,
# readme.txt has no changelog entry for this version, or the zip is over
# 10 MB.

set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
# shellcheck source=bin/build-zips.sh
source "$ROOT/bin/build-zips.sh"

OLD_SLUG=wordpress-for-writers
OLD_NAME='WordPress for Writers'
GITHUB_URL="https://github.com/draganescu/$OLD_SLUG"
MAX_ZIP_BYTES=$(( 10 * 1024 * 1024 ))

zip=0
for arg in "$@"; do
    case "$arg" in
        --zip) zip=1 ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "error: unknown argument $arg" >&2; exit 2 ;;
    esac
done

# shellcheck source=directory/identity.env
source "$ROOT/directory/identity.env"
: "${NAME:?directory/identity.env must set NAME}"
: "${SLUG:?directory/identity.env must set SLUG}"

VERSION="$( version_of "$OLD_SLUG" plugin . )"
if [ -z "$VERSION" ]; then
    echo "error: no Version: header in $OLD_SLUG.php" >&2
    exit 1
fi

OUT="$BUILD/$SLUG"
# Empty the folder rather than replace it: a running wp-env site (see
# bin/plugin-check.sh) has it mounted, and would lose a replaced one.
mkdir -p "$OUT"
find "$OUT" -mindepth 1 -delete
stage_package . "$OUT"

# sed -i that works with both BSD (macOS) and GNU sed.
sed_inplace() {
    local expr="$1" file="$2"
    sed -e "$expr" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

# 1. Main file and headers.
mv "$OUT/$OLD_SLUG.php" "$OUT/$SLUG.php"
MAIN="$OUT/$SLUG.php"
sed_inplace "s|^\( \* Plugin Name:\).*|\1 $NAME|" "$MAIN"
sed_inplace "s|^\( \* Text Domain:\).*|\1 $SLUG|" "$MAIN"
sed_inplace '/^ \* Update URI:/d' "$MAIN"

# 2. Text domain and product name in code. The GitHub URL holds the old slug
#    but never in quotes, and never the name, so it is left as it is.
while IFS= read -r -d '' file; do
    sed_inplace "s|'$OLD_SLUG'|'$SLUG'|g; s|$OLD_NAME|$NAME|g" "$file"
done < <( find "$OUT" -type f \( -name '*.php' -o -name '*.js' -o -name '*.css' \) -print0 )

# 3. readme.txt with this version as its Stable tag.
cp "$ROOT/directory/readme.txt" "$OUT/readme.txt"
sed_inplace "s|^Stable tag:.*|Stable tag: $VERSION|" "$OUT/readme.txt"

# 4. Verify.
failures=0
fail() {
    echo "FAIL: $*" >&2
    failures=$(( failures + 1 ))
}

# Relative paths, so the checkout's own folder name can't match. Each hit is
# "file:line:text"; only the text is checked once the GitHub URL is taken out.
leftovers="$( cd "$OUT" && grep -rnI -e "$OLD_SLUG" -e "$OLD_NAME" . \
    | awk -F: -v url="$GITHUB_URL" -v slug="$OLD_SLUG" -v name="$OLD_NAME" '{
        text = substr( $0, length( $1 ) + length( $2 ) + 3 )
        gsub( url, "", text )
        if ( index( text, slug ) || index( text, name ) ) print
    }' || true )"
if [ -n "$leftovers" ]; then
    fail "the old slug or name is still in the build (outside the GitHub URL):"
    echo "$leftovers" | sed 's|^\./|    |' >&2
fi

if [ -n "$( find "$OUT" -iname '*.zip' -o -iname '*.phar' -o -iname '*.exe' -o -iname '*.mp4' | head -n 1 )" ]; then
    fail "the build contains archives or binaries:"
    find "$OUT" -iname '*.zip' -o -iname '*.phar' -o -iname '*.exe' -o -iname '*.mp4' | sed "s|^$OUT/|    |" >&2
fi

while IFS= read -r -d '' file; do
    if ! out="$( php -l "$file" 2>&1 )"; then
        fail "php -l failed for ${file#"$OUT"/}:"
        echo "$out" | sed 's/^/    /' >&2
    fi
done < <( find "$OUT" -type f -name '*.php' -print0 )

if ! awk -v v="$VERSION" '
    /^== *Changelog *==/ { in_log = 1; next }
    /^== / { in_log = 0 }
    in_log && $0 ~ "^= *" v " *=" { found = 1 }
    END { exit found ? 0 : 1 }
' "$OUT/readme.txt"; then
    fail "directory/readme.txt has no changelog entry for $VERSION (add '= $VERSION =' under == Changelog ==)"
fi

if [ $zip = 1 ]; then
    ZIP="$BUILD/$SLUG-$VERSION.zip"
    rm -f "$ZIP"
    ( cd "$BUILD" && zip -qrX "$ZIP" "$SLUG" )
    size="$( wc -c < "$ZIP" | tr -d ' ' )"
    if [ "$size" -gt "$MAX_ZIP_BYTES" ]; then
        fail "$( basename "$ZIP" ) is $(( size / 1024 )) KB, over the 10 MB limit"
    fi
fi

if [ $failures -gt 0 ]; then
    echo "error: $failures check(s) failed; $OUT is not ready for the directory" >&2
    exit 1
fi

echo "$NAME $VERSION built in ${OUT#"$ROOT"/}"
if [ $zip = 1 ]; then
    echo "${ZIP#"$ROOT"/} ($(( size / 1024 )) KB)"
fi
