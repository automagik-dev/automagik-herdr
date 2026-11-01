#!/bin/sh
# Automagik Herdr installer (A17): turns a plain Herdr into Automagik Herdr on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
#   ... | bash -s -- --yes            answer yes to every question (for agents)
#   ... | bash -s -- --version 1.2.3  a given release instead of the latest
#   ... | bash -s -- --uninstall      put the pack that was there before back
#
# It checks macOS, Node and Herdr (offering Homebrew for the missing ones, asking first),
# downloads the release's pack and SHA256SUMS, checks the hash, and installs the pack through
# the pack's own update.mjs (the same entry checks and kept copy as `automagik-herdr update`).
# Then it links the `automagik-herdr` command into ~/.local/bin. Safe to run again.
# It never touches a project's .herdr/bots.json or Herdr's settings. Apache-2.0.
#
# For tests: AUTOMAGIK_HERDR_RELEASE_URL (default https://github.com/<repo>/releases; files at
# <url>/latest/download/<file> and <url>/download/v<version>/<file>), AUTOMAGIK_HERDR_TTY
# (default /dev/tty), AUTOMAGIK_HERDR_APPS (default /Applications), HERDR_APP_HOME.

set -eu
# Under `curl | bash` the script itself is stdin: every program it runs gets </dev/null, so
# none can read (eat) the rest of the script; questions read the terminal instead.

REPO=automagik-dev/automagik-herdr
RELEASES=${AUTOMAGIK_HERDR_RELEASE_URL:-https://github.com/$REPO/releases}
TTY=${AUTOMAGIK_HERDR_TTY:-/dev/tty}
APPS=${AUTOMAGIK_HERDR_APPS:-/Applications}
APP_HOME=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
MODS=$APP_HOME/mods
PACK=$MODS/spaces-agents
STATE=$APP_HOME/automagik-herdr
MARK=$STATE/installed-by-install.sh
BIN_DIR=$HOME/.local/bin
LINK=$BIN_DIR/automagik-herdr
NODE_MIN=22.7
CASK=penso/tap/herdr-gpui

YES=0
UNINSTALL=0
WANT=
usage() {
  cat <<'EOF'
Automagik Herdr installer

  install.sh [--yes] [--version <v>]   install or update the pack and the automagik-herdr command
  install.sh --uninstall [--yes]       put back the pack that was there before; remove the command
  install.sh --help

--yes answers yes to every question (installing Node or Herdr with Homebrew included).
EOF
}
while [ $# -gt 0 ]; do
  case $1 in
    --yes|-y) YES=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --version) [ $# -ge 2 ] || { echo "--version needs a version, like 1.2.3" >&2; exit 2; }; WANT=${2#v}; shift ;;
    --version=*) WANT=${1#--version=}; WANT=${WANT#v} ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
fail() { printf 'automagik-herdr install: %s\n' "$*" >&2; exit 1; }

# A yes/no question. Stdin is the downloaded script under `curl | bash`, so the answer comes
# from the terminal; with none (an agent, CI) the answer is no unless --yes was given.
ask() {
  [ "$YES" = 1 ] && return 0
  if ( : <"$TTY" ) 2>/dev/null; then
    printf '%s [y/N] ' "$1" >"$TTY" 2>/dev/null || printf '%s [y/N] ' "$1"
    read -r reply <"$TTY" || reply=
    case $reply in [yY]|[yY][eE][sS]) return 0 ;; esac
  fi
  return 1
}

# ---- uninstall ----

if [ "$UNINSTALL" = 1 ]; then
  [ -f "$MARK" ] || { say "Nothing to uninstall: this installer did not install the pack in $MODS."; exit 0; }
  command -v node >/dev/null 2>&1 || fail "uninstalling needs node (the pack's update.mjs puts the old pack back)."
  if [ -f "$STATE/spaces-agents.prev/main.js" ]; then
    out=$(node "$PACK/update.mjs" rollback --mods "$MODS" </dev/null) || fail "could not put the old pack back: $out"
    say "Put back the pack that was there before ($PACK); the installed one is kept in $STATE/spaces-agents.prev."
  elif [ -d "$PACK" ] && [ ! -L "$PACK" ]; then
    rm -rf "$STATE/spaces-agents.prev"
    mkdir -p "$STATE"
    mv "$PACK" "$STATE/spaces-agents.prev"
    say "Moved the pack out of $MODS (nothing was there before); it is kept in $STATE/spaces-agents.prev."
  fi
  if [ -L "$LINK" ]; then rm -f "$LINK"; say "Removed $LINK."; fi
  rm -f "$MARK"
  say "Done. Your bots (.herdr/bots.json in each project) and Herdr's settings are untouched. Reload Herdr's mods."
  exit 0
fi

# ---- a. macOS ----

os=$(uname -s)
[ "$os" = Darwin ] || fail "Automagik Herdr runs on macOS (Herdr is a Mac app); this is $os."
say "macOS: ok."

# ---- b. Node ----

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a, b] = process.versions.node.split(".").map(Number); const [x, y] = process.argv[1].split(".").map(Number); process.exit(a > x || (a === x && b >= y) ? 0 : 1)' "$NODE_MIN" 2>/dev/null
}
if ! node_ok; then
  have=$(node --version 2>/dev/null || echo none)
  if command -v brew >/dev/null 2>&1; then
    if ask "Node $NODE_MIN or later is needed (found: $have). Install it with 'brew install node'?"; then
      brew install node </dev/null
      node_ok || fail "Node is still older than $NODE_MIN after brew; open a new terminal and run this again."
    else
      fail "Node $NODE_MIN or later is needed (found: $have). Run: brew install node   then run this again."
    fi
  else
    fail "Node $NODE_MIN or later is needed (found: $have). Install it from https://nodejs.org (or Homebrew: brew install node), then run this again."
  fi
fi
say "Node $(node --version): ok."

# ---- c. Herdr ----

herdr_ok() { [ -d "$APPS/Herdr.app" ] || command -v herdr-app >/dev/null 2>&1; }
if ! herdr_ok; then
  if command -v brew >/dev/null 2>&1; then
    if ask "Herdr is not installed. Install it with 'brew install --cask $CASK'?"; then
      brew install --cask "$CASK" </dev/null
      herdr_ok || fail "Herdr still isn't in $APPS after brew; install it from https://herdrui.dev and run this again."
    else
      fail "Herdr is not installed. Run: brew install --cask $CASK   (or get it from https://herdrui.dev), then run this again."
    fi
  else
    fail "Herdr is not installed. Get it from https://herdrui.dev (or install Homebrew, then: brew install --cask $CASK), then run this again."
  fi
fi
say "Herdr: ok."

# ---- d. the pack ----

TMP=$(mktemp -d "${TMPDIR:-/tmp}/automagik-herdr.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

if [ -n "$WANT" ]; then base=$RELEASES/download/v$WANT; else base=$RELEASES/latest/download; fi
curl -fsSL "$base/SHA256SUMS" -o "$TMP/SHA256SUMS" || fail "could not download $base/SHA256SUMS."
# The release names its tarball automagik-herdr-<version>.tgz; SHA256SUMS lists it.
TGZ=$(sed -n 's/^[0-9a-fA-F]\{64\} [ *]\(automagik-herdr-[0-9][0-9A-Za-z.+-]*\.tgz\)$/\1/p' "$TMP/SHA256SUMS" | head -n 1)
[ -n "$TGZ" ] || fail "$base/SHA256SUMS names no automagik-herdr-<version>.tgz."
VERSION=${TGZ#automagik-herdr-}
VERSION=${VERSION%.tgz}
[ -z "$WANT" ] || [ "$WANT" = "$VERSION" ] || fail "release v$WANT lists $TGZ, not automagik-herdr-$WANT.tgz."

installed=$(cat "$PACK/VERSION" 2>/dev/null || echo none)
target=$PACK/bin/automagik-herdr.mjs
if [ "$installed" = "$VERSION" ] && [ -f "$MARK" ] && [ "$(readlink "$LINK" 2>/dev/null || true)" = "$target" ] && [ -x "$target" ]; then
  say "Automagik Herdr $VERSION is already up to date ($PACK, $LINK)."
  exit 0
fi

if [ "$installed" != "$VERSION" ]; then
  say "Downloading Automagik Herdr $VERSION..."
  curl -fsSL "$base/$TGZ" -o "$TMP/$TGZ" || fail "could not download $base/$TGZ."
  if command -v shasum >/dev/null 2>&1; then sum=$(shasum -a 256 "$TMP/$TGZ"); else sum=$(sha256sum "$TMP/$TGZ"); fi
  sum=${sum%% *}
  want=$(sed -n "s/^\([0-9a-fA-F]\{64\}\) [ *]$TGZ\$/\1/p" "$TMP/SHA256SUMS" | tr 'A-F' 'a-f')
  [ "$sum" = "$want" ] || fail "$TGZ does not match SHA256SUMS (sha256 $sum, expected $want): nothing was installed."
  say "Checksum: ok."
  # Only the installer's two files come out here, to run them; update.mjs then lists every
  # entry, extracts beside mods/, checks again, keeps the old pack and swaps the new one in.
  mkdir "$TMP/x"
  tar -xzf "$TMP/$TGZ" -C "$TMP/x" spaces-agents/update.mjs spaces-agents/release.js 2>/dev/null \
    || fail "$TGZ holds no spaces-agents/update.mjs: nothing was installed."
  for f in update.mjs release.js; do
    { [ -f "$TMP/x/spaces-agents/$f" ] && [ ! -L "$TMP/x/spaces-agents/$f" ]; } || fail "$TGZ: spaces-agents/$f is not a plain file: nothing was installed."
  done
  had=no
  [ -e "$PACK" ] && had=yes
  if ! out=$(node "$TMP/x/spaces-agents/update.mjs" install --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" </dev/null 2>&1); then
    why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
    fail "nothing was installed: ${why:-$out}"
  fi
  say "Installed the pack $VERSION in $PACK."
  if [ "$had" = yes ]; then
    say "The pack that was there ($installed) is kept in $STATE/spaces-agents.prev; 'install.sh --uninstall' puts it back."
  fi
fi
mkdir -p "$STATE"
printf '%s\n' "$VERSION" >"$MARK"

# ---- e. the command ----

chmod +x "$target"
mkdir -p "$BIN_DIR"
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  say "Left $LINK alone: it is a file, not a link. Remove it and run this again to link automagik-herdr."
else
  ln -sfn "$target" "$LINK"
  say "Linked $LINK."
fi
case ":${PATH}:" in
  *":$BIN_DIR:"*) ;;
  *) say "Add ~/.local/bin to your PATH: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc" ;;
esac

# ---- f. next ----

say "Done: Automagik Herdr $VERSION. Open Herdr (or reload its mods), or in a project folder run:"
say "  automagik-herdr create --kind=main --name=<name> --agent=claude && automagik-herdr start <name>"
