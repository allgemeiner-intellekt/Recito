#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
extension_dir="$project_dir/dist"
repository="allgemeiner-intellekt/Recito"
staging_dir=""

cleanup() {
  local status=$?
  if [[ -n "$staging_dir" ]]; then
    # Restore the installed build if replacing it was interrupted.
    if [[ -d "$staging_dir/previous" && ! -e "$extension_dir" ]]; then
      mv "$staging_dir/previous" "$extension_dir"
    fi
    rm -rf "$staging_dir"
  fi
  if [[ -t 0 && -t 1 ]]; then
    read -r -p "Press Enter to close this window... " || true
  fi
  exit "$status"
}
trap cleanup EXIT

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

# Finder-launched terminals may not include Homebrew in PATH.
gh_bin="$(command -v gh || true)"
if [[ -z "$gh_bin" ]]; then
  for candidate in /opt/homebrew/bin/gh /usr/local/bin/gh; do
    if [[ -x "$candidate" ]]; then
      gh_bin="$candidate"
      break
    fi
  done
fi
[[ -n "$gh_bin" ]] || fail "Install GitHub CLI from https://cli.github.com, then run gh auth login once."
"$gh_bin" auth status --hostname github.com >/dev/null 2>&1 || fail "Sign in first with: gh auth login --hostname github.com"

# Only install successful main builds, never pull-request previews.
printf 'Finding the latest successful cloud build...\n'
run_id="$("$gh_bin" run list --repo "$repository" --workflow ci.yml \
  --branch main --status success --limit 30 \
  --json databaseId,event \
  --jq '[.[] | select(.event == "push" or .event == "workflow_dispatch")][0].databaseId // empty')"
[[ -n "$run_id" ]] || fail "No successful main build is available. Run CI on main in GitHub Actions first."

[[ ! -L "$extension_dir" ]] || fail "dist is a symbolic link. Use a regular dist directory so the installed extension path stays fixed."
[[ ! -e "$extension_dir" || -d "$extension_dir" ]] || fail "dist exists but is not a directory."

staging_dir="$(mktemp -d "$project_dir/.recito-update.XXXXXX")"
printf 'Downloading build %s...\n' "$run_id"
"$gh_bin" run download "$run_id" --repo "$repository" \
  --name recito-chrome --dir "$staging_dir/build" || \
  fail "Could not download recito-chrome. Check your connection or run a fresh CI build if the artifact has expired. Your installed build was not changed."

[[ -s "$staging_dir/build/manifest.json" && -s "$staging_dir/build/service-worker-loader.js" ]] || \
  fail "The download is missing extension files. Your installed build was not changed."

# Stage on the same filesystem, then swap directories to remove stale assets.
if [[ -d "$extension_dir" ]]; then
  mv "$extension_dir" "$staging_dir/previous"
fi
mv "$staging_dir/build" "$extension_dir"

printf '\nUpdated: %s\n' "$extension_dir"
printf 'Build: https://github.com/%s/actions/runs/%s\n' "$repository" "$run_id"
printf 'In brave://extensions, click Reload on Recito, then refresh pages using it.\n'
printf 'For a first install, enable Developer mode and Load unpacked from the folder above.\n'

if [[ "$OSTYPE" == darwin* && -t 1 ]]; then
  open -a "Brave Browser" "brave://extensions" || true
fi
