#!/bin/sh
# Automagik Herdr installer (A17): turns a plain Herdr into Automagik Herdr on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
#   ... | bash -s -- --yes            answer yes to every question (for agents)
#   ... | bash -s -- --version 1.2.3  a given release (v0.1.0 or later) instead of the latest
#   ... | bash -s -- --uninstall      put the pack that was there before back
#
# It checks macOS, Node and Herdr (offering Homebrew for the missing ones, asking first),
# downloads the release's pack and SHA256SUMS, checks the hash, and installs the pack through
# the pack's own update.mjs (the same entry checks and kept copy as `automagik-herdr update`).
# It adds the pack's `bots` layout when the app home has none, and links the `automagik-herdr`
# command into ~/.local/bin. Safe to run again. It never touches a project's .herdr/bots.json
# or Herdr's settings. Apache-2.0.
#
# The whole script is one function, called on its last line: a download cut short by the
# network defines part of it and runs nothing.
#
# For tests: AUTOMAGIK_HERDR_RELEASE_URL, a file:// folder (files at <url>/latest/download/<file>
# and <url>/download/v<version>/<file>) or a page of this repository on github.com; with a
# file:// one also AUTOMAGIK_HERDR_TTY (default /dev/tty) and AUTOMAGIK_HERDR_APPS (default
# /Applications). HERDR_APP_HOME as Herdr reads it.

main() {
  set -eu
  # Under `curl | bash` the script itself is stdin: every program it runs gets </dev/null, so
  # none can read (eat) the rest of the script; questions read the terminal instead.

  REPO=automagik-dev/automagik-herdr
  RELEASES=https://github.com/$REPO/releases
  TTY=/dev/tty
  APPS=/Applications
  APP_HOME=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
  MODS=$APP_HOME/mods
  PACK=$MODS/spaces-agents
  STATE=$APP_HOME/automagik-herdr
  MARK=$STATE/installed-by-install.sh
  BEFORE=$STATE/spaces-agents.before-install
  LAYOUT=$APP_HOME/layouts/bots.json
  BIN_DIR=$HOME/.local/bin
  LINK=$BIN_DIR/automagik-herdr
  NODE_MIN=22.7
  CASK=penso/tap/herdr-gpui

  YES=0
  UNINSTALL=0
  WANT=
  while [ $# -gt 0 ]; do
    case $1 in
      --yes|-y) YES=1 ;;
      --uninstall) UNINSTALL=1 ;;
      --version) [ $# -ge 2 ] || { echo "--version needs a version, like 0.1.0" >&2; exit 2; }; WANT=${2#v}; shift ;;
      --version=*) WANT=${1#--version=}; WANT=${WANT#v} ;;
      --help|-h) usage; exit 0 ;;
      *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done

  # The test hooks: a release from a file:// folder or this repository's GitHub pages only.
  if [ -n "${AUTOMAGIK_HERDR_RELEASE_URL:-}" ]; then
    case $AUTOMAGIK_HERDR_RELEASE_URL in
      file://*|"https://github.com/$REPO/"*) RELEASES=$AUTOMAGIK_HERDR_RELEASE_URL ;;
      *) fail "AUTOMAGIK_HERDR_RELEASE_URL must be a file:// folder or https://github.com/$REPO/…; not $AUTOMAGIK_HERDR_RELEASE_URL." ;;
    esac
    say "Releases from $RELEASES (AUTOMAGIK_HERDR_RELEASE_URL)."
    case $RELEASES in
      file://*) TTY=${AUTOMAGIK_HERDR_TTY:-$TTY}; APPS=${AUTOMAGIK_HERDR_APPS:-$APPS} ;;
    esac
  fi

  TMP=
  trap 'rm -rf "$TMP"' EXIT
  trap 'exit 130' INT TERM

  if [ "$UNINSTALL" = 1 ]; then uninstall; else install; fi
}

usage() {
  cat <<'EOF'
Automagik Herdr installer

  install.sh [--yes] [--version <v>]   install or update the pack and the automagik-herdr command
  install.sh --uninstall [--yes]       put back the pack that was there before; remove the command
  install.sh --help

--yes answers yes to every question (installing Node or Herdr with Homebrew, switching
Herdr to the bots layout). --version installs that release; it needs v0.1.0 or later.
EOF
}

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

# The marker's `before=` line: "kept" when a pack was there at the first install (copied to
# $BEFORE), "none" when there was none.
before_state() { sed -n 's/^before=//p' "$MARK" 2>/dev/null | head -n 1; }

uninstall() {
  [ -f "$MARK" ] || { say "Nothing to uninstall: this installer did not install the pack in $MODS."; exit 0; }
  before=$(before_state)
  # The bots layout goes only when it is still the pack's own (cmp): an edited one stays.
  if [ -f "$LAYOUT" ] && [ -f "$PACK/layouts/bots.json" ] && cmp -s "$LAYOUT" "$PACK/layouts/bots.json"; then
    rm -f "$LAYOUT"
    say "Removed the bots layout ($LAYOUT). If Herdr shows it, switch back: herdr-app do layout.switch '{\"name\":\"main\"}'"
  fi
  mkdir -p "$STATE"
  if [ -d "$BEFORE" ]; then
    # The pack from before the first install; the installed one is kept as the rollback copy.
    if [ -e "$PACK" ] && [ ! -L "$PACK" ]; then rm -rf "$STATE/spaces-agents.prev"; mv "$PACK" "$STATE/spaces-agents.prev"; fi
    mv "$BEFORE" "$PACK"
    say "Put back the pack that was there before the first install ($PACK); the installed one is kept in $STATE/spaces-agents.prev."
  elif [ "$before" != none ] && [ -f "$STATE/spaces-agents.prev/main.js" ]; then
    command -v node >/dev/null 2>&1 || fail "uninstalling needs node (the pack's update.mjs puts the old pack back)."
    out=$(node "$PACK/update.mjs" rollback --mods "$MODS" </dev/null) || fail "could not put the old pack back: $out"
    say "Put back the kept pack ($PACK); the installed one is kept in $STATE/spaces-agents.prev."
  elif [ -d "$PACK" ] && [ ! -L "$PACK" ]; then
    rm -rf "$STATE/spaces-agents.prev"
    mv "$PACK" "$STATE/spaces-agents.prev"
    say "Moved the pack out of $MODS (nothing was there before); it is kept in $STATE/spaces-agents.prev."
  fi
  if [ -L "$LINK" ]; then rm -f "$LINK"; say "Removed $LINK."; fi
  rm -f "$MARK"
  say "Done. Your bots (.herdr/bots.json in each project) and Herdr's settings are untouched. Reload Herdr's mods."
}

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a, b] = process.versions.node.split(".").map(Number); const [x, y] = process.argv[1].split(".").map(Number); process.exit(a > x || (a === x && b >= y) ? 0 : 1)' "$NODE_MIN" </dev/null 2>/dev/null
}
herdr_ok() { [ -d "$APPS/Herdr.app" ] || command -v herdr-app >/dev/null 2>&1; }

install() {
  # ---- a. macOS ----
  os=$(uname -s)
  [ "$os" = Darwin ] || fail "Automagik Herdr runs on macOS (Herdr is a Mac app); this is $os."
  say "macOS: ok."

  # ---- b. Node ----
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
  if [ -n "$WANT" ]; then base=$RELEASES/download/v$WANT; else base=$RELEASES/latest/download; fi
  curl -fsSL "$base/SHA256SUMS" -o "$TMP/SHA256SUMS" </dev/null || fail "could not download $base/SHA256SUMS."
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

  mkdir -p "$STATE"
  copied=no
  # What --uninstall puts back: "kept" (the pack there at the first install, copied once to
  # $BEFORE and never overwritten) or "none". Later runs keep what the first one found.
  if [ -f "$MARK" ]; then first=$(before_state); elif [ -e "$PACK" ] && [ ! -L "$PACK" ]; then first=kept; else first=none; fi

  if [ "$installed" != "$VERSION" ]; then
    say "Downloading Automagik Herdr $VERSION..."
    curl -fsSL "$base/$TGZ" -o "$TMP/$TGZ" </dev/null || fail "could not download $base/$TGZ."
    if command -v shasum >/dev/null 2>&1; then sum=$(shasum -a 256 "$TMP/$TGZ"); else sum=$(sha256sum "$TMP/$TGZ"); fi
    sum=${sum%% *}
    want=$(sed -n "s/^\([0-9a-fA-F]\{64\}\) [ *]$TGZ\$/\1/p" "$TMP/SHA256SUMS" | tr 'A-F' 'a-f')
    [ "$sum" = "$want" ] || fail "$TGZ does not match SHA256SUMS (sha256 $sum, expected $want): nothing was installed."
    say "Checksum: ok."
    # Only the installer's two files come out here, to run them; update.mjs then lists every
    # entry, extracts beside mods/, checks again, keeps the old pack and swaps the new one in.
    mkdir "$TMP/x"
    tar -xzf "$TMP/$TGZ" -C "$TMP/x" spaces-agents/update.mjs spaces-agents/release.js </dev/null 2>/dev/null \
      || fail "$TGZ holds no spaces-agents/update.mjs: nothing was installed."
    for f in update.mjs release.js; do
      { [ -f "$TMP/x/spaces-agents/$f" ] && [ ! -L "$TMP/x/spaces-agents/$f" ]; } || fail "$TGZ: spaces-agents/$f is not a plain file: nothing was installed."
    done
    if [ ! -f "$MARK" ] && [ "$first" = kept ] && [ ! -e "$BEFORE" ]; then cp -RP "$PACK" "$BEFORE"; copied=yes; fi
    if ! out=$(node "$TMP/x/spaces-agents/update.mjs" install --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" </dev/null 2>&1); then
      why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
      if [ "$copied" = yes ]; then rm -rf "$BEFORE"; fi
      fail "nothing was installed: ${why:-$out}"
    fi
    say "Installed the pack $VERSION in $PACK."
    if [ "$installed" != none ]; then say "The pack it replaced ($installed) is kept in $STATE/spaces-agents.prev: 'automagik-herdr update --rollback' swaps it back."; fi
    if [ "$copied" = yes ]; then say "The pack from before the first install is kept in $BEFORE: 'install.sh --uninstall' puts it back."; fi
    # The marker is written only here, by a run that installed the pack, beside the
    # before-install copy: a pack already at this version (placed by hand) gets no marker,
    # so --uninstall leaves it in mods/.
    printf 'version=%s\nbefore=%s\n' "$VERSION" "$first" >"$MARK"
  elif [ ! -f "$MARK" ]; then
    say "The pack in $PACK is already $VERSION and was not installed by this script: it is left as it is, and --uninstall won't move it."
  fi

  # ---- the bots layout: added when the app home has none, switched to when you say so ----
  if [ -f "$PACK/layouts/bots.json" ] && [ ! -e "$LAYOUT" ]; then
    mkdir -p "$APP_HOME/layouts"
    cp "$PACK/layouts/bots.json" "$LAYOUT"
    say "Added the bots layout ($LAYOUT): Herdr's main layout with the bot view in its sidebar."
    if command -v herdr-app >/dev/null 2>&1 && ask "Switch Herdr to the bots layout now?"; then
      if herdr-app do layout.switch '{"name":"bots"}' </dev/null >/dev/null 2>&1; then say "Switched Herdr to the bots layout."
      else say "Herdr didn't switch (is it open?). Later: herdr-app do layout.switch '{\"name\":\"bots\"}'"; fi
    else
      say "To use it: herdr-app do layout.switch '{\"name\":\"bots\"}'"
    fi
  fi

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
}

main "$@"
