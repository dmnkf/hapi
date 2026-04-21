#!/usr/bin/env bash
#
# Helper for manually syncing the fork with upstream (tiann/hapi).
#
# Usage:
#   scripts/upstream-sync.sh            # fetch, preview diff, attempt merge, stop on conflicts
#   scripts/upstream-sync.sh --force    # proceed even if working tree dirty
#
# The daily GitHub Actions workflow (.github/workflows/upstream-sync.yml)
# will open a PR when a clean fast-forward / three-way merge is possible,
# and open an issue when conflicts are present. Use this script to resolve
# those conflicts locally.

set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="https://github.com/tiann/hapi.git"
UPSTREAM_BRANCH="main"
FORK_BRANCH="main"

msg() { printf '%s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Ensure upstream remote exists and points at the right URL
if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    msg ">>> Adding upstream remote"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
else
    current_url="$(git remote get-url "$UPSTREAM_REMOTE")"
    if [ "$current_url" != "$UPSTREAM_URL" ] && [ "$current_url" != "git@github.com:tiann/hapi.git" ]; then
        err "upstream remote points at $current_url, expected $UPSTREAM_URL"
    fi
fi

# Check clean tree unless --force
if [ "${1:-}" != "--force" ]; then
    if ! git diff --quiet HEAD; then
        err "working tree has uncommitted changes. Commit/stash first, or pass --force"
    fi
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$FORK_BRANCH" ]; then
    msg ">>> Switching to $FORK_BRANCH (was on $current_branch)"
    git checkout "$FORK_BRANCH"
fi

msg ">>> Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --no-tags

behind="$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
ahead="$(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH..HEAD")"

msg ""
msg "Fork is $ahead commit(s) ahead, $behind commit(s) behind."
msg ""

if [ "$behind" -eq 0 ]; then
    msg ">>> Already up to date. Nothing to do."
    exit 0
fi

msg ">>> New upstream commits:"
git log --pretty=format:'  %h %s (%an, %ar)' "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | head -20
total=$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
if [ "$total" -gt 20 ]; then
    msg ""
    msg "  ... and $((total - 20)) more"
fi
msg ""

printf 'Proceed with merge? [y/N] '
read -r reply
case "$reply" in
    y|Y|yes|YES)
        ;;
    *)
        msg "Aborted."
        exit 0
        ;;
esac

msg ""
msg ">>> Merging $UPSTREAM_REMOTE/$UPSTREAM_BRANCH into $FORK_BRANCH"
if git merge --no-edit --no-ff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
    msg ""
    msg ">>> Clean merge. Running validation..."
    if command -v bun >/dev/null 2>&1; then
        bun install
        bun run typecheck
        bun run test
        bun run build:web
        msg ""
        msg ">>> All gates pass. Push with:"
        msg "       git push origin $FORK_BRANCH"
    else
        msg ">>> bun not found — skipping validation. Run typecheck/test/build manually before pushing."
    fi
else
    msg ""
    msg "!! Merge has conflicts. Resolve them with:"
    msg ""
    msg "       git status                 # see conflicted files"
    msg "       # edit files, remove <<<<<<< / ======= / >>>>>>> markers"
    msg "       git add <resolved-files>"
    msg "       git commit                 # completes the merge"
    msg "       bun install && bun run typecheck && bun run test && bun run build:web"
    msg "       git push origin $FORK_BRANCH"
    msg ""
    msg "To bail out entirely: git merge --abort"
    exit 1
fi
