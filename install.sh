#!/bin/sh
# Automagik Herdr installer (A17): turns a plain Herdr into Automagik Herdr on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
#   ... | bash -s -- --yes            answer yes to every question (for agents)
#   ... | bash -s -- --version 1.2.3  a given release (v0.3.0 or later) instead of the latest
#   ... | bash -s -- --adopt          also replace pack-named mods this installer did not install
#   ... | bash -s -- --uninstall      put back what was there before
#
# It checks macOS, Node and Herdr (offering Homebrew for the missing ones, asking first),
# downloads the release's SHA256SUMS and pack tarball (automagik-herdr-pack-<v>.tgz: every pack
# mod and layouts/automagik.json), checks the hash before anything is written, and installs every
# pack mod through the pack's own update.mjs: each folder staged, then swapped in, the replaced
# ones kept together in <app home>/automagik-herdr/.prev. Its ownership record (the marker)
# lists every folder it put in mods/; only those are ever replaced. Any other folder is left
# alone, or with --adopt moved to automagik-herdr/backup/ first. Pocket Link is never touched.
# It merges the pack's free keys, points the mod manager at the catalog, adds the `automagik`
# layout (replacing only v0.2's unchanged copy), runs `herdr-app check` on each mod, and links
# the `automagik-herdr` command into ~/.local/bin. Safe to run again: a rerun of the installed
# release downloads it all the same, checks every installed pack file against it, reinstalls a
# missing or damaged folder (the damaged copy kept in backup/), puts back a missing automagik
# layout and runs the checks again; it says "up to date" only when all of that passed. It never
# touches a project's .herdr/bots.json or Herdr's settings. Apache-2.0.
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
  LAYOUT=$APP_HOME/layouts/automagik.json
  REF=$STATE/automagik.json
  HINT=no
  BIN_DIR=$HOME/.local/bin
  LINK=$BIN_DIR/automagik-herdr
  NODE_MIN=22.7
  CASK=penso/tap/herdr-gpui

  YES=0
  ADOPT=0
  UNINSTALL=0
  WANT=
  while [ $# -gt 0 ]; do
    case $1 in
      --yes|-y) YES=1 ;;
      --uninstall) UNINSTALL=1 ;;
      --adopt) ADOPT=1 ;;
      --version) [ $# -ge 2 ] || { echo "--version needs a version, like 0.2.0" >&2; exit 2; }; WANT=${2#v}; shift ;;
      --version=*) WANT=${1#--version=}; WANT=${WANT#v} ;;
      --help|-h) usage; exit 0 ;;
      *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done

  # The test hooks: a release from a file:// folder or this repository's GitHub pages only.
  if [ -n "${AUTOMAGIK_HERDR_RELEASE_URL:-}" ]; then
    # curl collapses dot segments (.../automagik-herdr/../../x is x), so `..` and `%`
    # (an escaped dot) are refused before the prefix is checked.
    case $AUTOMAGIK_HERDR_RELEASE_URL in
      *..*|*%*) fail "AUTOMAGIK_HERDR_RELEASE_URL must not contain '..' or '%'; not $AUTOMAGIK_HERDR_RELEASE_URL." ;;
    esac
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

  install.sh [--yes] [--version <v>] [--adopt]   install or update the pack and the automagik-herdr command
  install.sh --uninstall [--yes]       move the pack out of mods/, put back what was there before
  install.sh --help

--yes answers yes to every question (installing Node or Herdr with Homebrew, switching
Herdr to the automagik layout). --version installs that release; it needs v0.3.0 or later.
--adopt replaces a pack-named mod this installer did not install, after moving it to
<app home>/automagik-herdr/backup/; without it such a folder is reported and left alone.
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

# A line of the marker (the ownership record, release.js parseMarker): v2 has `version=`,
# `mods=<comma list>`, `layout=added|kept`, `before=kept|none` and `adopted=<mod>:<path>,…`;
# v0.2's v1 has no `mods=` (it installed spaces-agents only, its first pack copied to $BEFORE).
mark_get() { sed -n "s/^$1=//p" "$MARK" 2>/dev/null | head -n 1; }

# Whether $LINK is a link to the pack's own command in this app home (the sidebar folder's
# bin/automagik-herdr.mjs, under its old or its am-* name), the only kind this script replaces
# or removes: a link the person pointed anywhere else stays theirs.
link_ours() {
  [ -L "$LINK" ] || return 1
  to=$(readlink "$LINK" 2>/dev/null) || return 1
  case $to in "$MODS/spaces-agents/bin/automagik-herdr.mjs"|"$MODS/am-sidebar/bin/automagik-herdr.mjs") return 0 ;; esac
  return 1
}

# The CLI of the sidebar folder the ownership record lists (am-sidebar, else spaces-agents), which
# the link points at; empty when the record lists neither.
cli_target() {
  case ",$(mark_get mods)," in
    *,am-sidebar,*) echo "$MODS/am-sidebar/bin/automagik-herdr.mjs" ;;
    *,spaces-agents,*) echo "$PACK/bin/automagik-herdr.mjs" ;;
  esac
}

# The layout Herdr shows ("layout" in `herdr-app status`); empty when herdr-app or its status
# is unavailable.
shown_layout() {
  command -v herdr-app >/dev/null 2>&1 || return 0
  st=$(herdr-app status </dev/null 2>/dev/null) || return 0
  printf '%s\n' "$st" | sed -n 's/.*"layout"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

# The sidebar mod has place "none": it shows only in a layout that names it. While Herdr shows
# another layout, this offers the switch (--yes switches), but only to the pack's own copy;
# an edited layout, no herdr-app or no status get the printed command (HINT) and nothing else.
offer_switch() {
  [ -f "$LAYOUT" ] || return 0
  shown=$(shown_layout)
  [ "$shown" != automagik ] || return 0
  # A layout that already shows the pack (the person's own, like main-agents): nothing to do.
  if [ -n "$shown" ] && [ -f "$APP_HOME/layouts/$shown.json" ] \
    && grep -q '"mod"[[:space:]]*:[[:space:]]*"spaces-agents"' "$APP_HOME/layouts/$shown.json"; then
    return 0
  fi
  if [ -z "$shown" ] || [ ! -f "$REF" ] || ! cmp -s "$LAYOUT" "$REF"; then
    HINT=yes
    return 0
  fi
  if ask "Switch Herdr to the automagik layout now? The Automagik sidebar appears after this."; then
    if herdr-app 'do' layout.switch '{"name":"automagik"}' </dev/null >/dev/null 2>&1; then
      say "Switched Herdr to the automagik layout."
      return 0
    fi
    say "Herdr didn't switch."
  fi
  HINT=yes
}

switch_hint() {
  [ "$HINT" = yes ] || return 0
  say "To show the Automagik sidebar, switch Herdr to the automagik layout; the sidebar appears after this:"
  say "  herdr-app do layout.switch '{\"name\":\"automagik\"}'"
}

uninstall() {
  [ -f "$MARK" ] || { say "Nothing to uninstall: this installer did not install the pack in $MODS."; exit 0; }
  mods=$(mark_get mods)
  adopted=$(mark_get adopted)
  ref=$REF
  if ! grep -q '^mods=' "$MARK"; then
    # v1 (v0.2.x): spaces-agents only, the layout's reference inside it, its first pack in $BEFORE.
    mods=spaces-agents
    ref=$PACK/layouts/automagik.json
    if [ "$(mark_get before)" = kept ] && [ -d "$BEFORE" ]; then adopted=spaces-agents:v1; fi
  fi
  # The automagik layout goes only when this script added it and it is still the pack's own
  # (cmp): an edited one, or one copied by hand, stays.
  if [ "$(mark_get layout)" = added ] && [ -f "$LAYOUT" ] && [ -f "$ref" ] && cmp -s "$LAYOUT" "$ref"; then
    rm -f "$LAYOUT"
    say "Removed the automagik layout ($LAYOUT). If Herdr shows it, switch back: herdr-app do layout.switch '{\"name\":\"main\"}'"
  fi
  # The record's folders leave mods/ together as the kept set (never deleted); only names the
  # pack can own, never Pocket Link, never a link.
  # Fresh names (mktemp): an earlier run's leftover is never taken for this run's and deleted.
  next=$(mktemp -d "$STATE/.prev-next.XXXXXX")
  moved=
  # The record's values are split on commas only, never glob-expanded (set -f).
  set -f
  IFS=,
  for m in $mods; do
    case $m in ''|pocket-link|*[!a-z0-9-]*) continue ;; esac
    if [ -L "$MODS/$m" ]; then say "Left $MODS/$m: it is a link, not a folder this script installed."; continue; fi
    [ -d "$MODS/$m" ] || continue
    mv "$MODS/$m" "$next/$m"
    moved=${moved:+$moved,}$m
  done
  # A folder already kept (one a rollback moved out, with its state) stays kept beside them.
  if [ -n "$moved" ] && [ -f "$STATE/.prev/.pack" ]; then
    for m in $(sed -n 's/^mods=//p' "$STATE/.prev/.pack" | head -n 1); do
      case $m in ''|pocket-link|*[!a-z0-9-]*) continue ;; esac
      if [ -d "$STATE/.prev/$m" ] && [ ! -L "$STATE/.prev/$m" ] && [ ! -e "$next/$m" ]; then
        mv "$STATE/.prev/$m" "$next/$m"
        moved=$moved,$m
      fi
    done
  fi
  unset IFS
  set +f
  if [ -n "$moved" ]; then
    printf 'version=%s\nmods=%s\nbefore=none\n' "$(mark_get version)" "$moved" >"$next/.pack"
    # The old set is set aside first and removed last: a failure never loses the folders just moved.
    old=$(mktemp -d "$STATE/.prev-old.XXXXXX")
    if [ -e "$STATE/.prev" ]; then mv "$STATE/.prev" "$old/set"; fi
    mv "$next" "$STATE/.prev"
    rm -rf "$old" 2>/dev/null || say "Could not remove the older kept set; it is in $old."
    say "Moved the pack out of $MODS ($moved); it is kept in $STATE/.prev."
  else
    rm -rf "$next"
  fi
  # What the person had before: each adopted folder comes back, unless something is in its place.
  # Only backup/<name> (release.js parseMarker's rule), or v0.2's before-install copy.
  set -f
  IFS=,
  for e in $adopted; do
    m=${e%%:*}
    p=${e#*:}
    case $m in ''|pocket-link|*[!a-z0-9-]*) continue ;; esac
    case $e in
      spaces-agents:v1) p=${BEFORE#"$STATE"/} ;;
      *:backup/*) n=${p#backup/}
        case $n in ''|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) continue ;; esac ;;
      *) continue ;;
    esac
    if [ -d "$STATE/$p" ] && [ ! -L "$STATE/$p" ] && [ ! -e "$MODS/$m" ]; then
      mv "$STATE/$p" "$MODS/$m"
      say "Put back $MODS/$m, the one that was there before the install."
    fi
  done
  unset IFS
  set +f
  if link_ours; then rm -f "$LINK"; say "Removed $LINK."
  elif [ -L "$LINK" ]; then say "Left $LINK: it points at $(readlink "$LINK"), not this install."; fi
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
  # Nothing is written into the app home before the tarball matches SHA256SUMS.
  TMP=$(mktemp -d "${TMPDIR:-/tmp}/automagik-herdr.XXXXXX")
  if [ -n "$WANT" ]; then base=$RELEASES/download/v$WANT; else base=$RELEASES/latest/download; fi
  curl -fsSL --path-as-is "$base/SHA256SUMS" -o "$TMP/SHA256SUMS" </dev/null || fail "could not download $base/SHA256SUMS."
  # The release names its tarball automagik-herdr-pack-<version>.tgz; SHA256SUMS lists it.
  TGZ=$(sed -n 's/^[0-9a-fA-F]\{64\} [ *]\(automagik-herdr-pack-[0-9][0-9A-Za-z.+-]*\.tgz\)$/\1/p' "$TMP/SHA256SUMS" | head -n 1)
  [ -n "$TGZ" ] || fail "$base/SHA256SUMS names no automagik-herdr-pack-<version>.tgz (a release before v0.3.0?)."
  VERSION=${TGZ#automagik-herdr-pack-}
  VERSION=${VERSION%.tgz}
  [ -z "$WANT" ] || [ "$WANT" = "$VERSION" ] || fail "release v$WANT lists $TGZ, not automagik-herdr-pack-$WANT.tgz."

  installed=$(mark_get version)
  [ -n "$installed" ] || installed=none
  # This release already installed: its tarball is downloaded all the same, and every installed
  # file is checked against it (update.mjs repair) before anything is called up to date.
  same=no
  if [ "$ADOPT" = 0 ] && [ "$installed" = "$VERSION" ] && grep -q '^mods=' "$MARK" 2>/dev/null; then same=yes; fi

  if [ "$same" = yes ]; then say "Checking the installed Automagik Herdr $VERSION against the release..."
  else say "Downloading Automagik Herdr $VERSION..."; fi
  curl -fsSL --path-as-is "$base/$TGZ" -o "$TMP/$TGZ" </dev/null || fail "could not download $base/$TGZ."
  if command -v shasum >/dev/null 2>&1; then sum=$(shasum -a 256 "$TMP/$TGZ"); else sum=$(sha256sum "$TMP/$TGZ"); fi
  sum=${sum%% *}
  want=$(sed -n "s/^\([0-9a-fA-F]\{64\}\) [ *]$TGZ\$/\1/p" "$TMP/SHA256SUMS" | tr 'A-F' 'a-f')
  [ "$sum" = "$want" ] || fail "$TGZ does not match SHA256SUMS (sha256 $sum, expected $want): nothing was installed."
  say "Checksum: ok."
  # Only the installer's files come out here, to run them; update.mjs then lists every entry,
  # stages every folder beside mods/, checks again, keeps the replaced set and swaps, and the
  # migration (migrate.js, migrateHome.mjs) moves layouts and keys onto renamed folders, and
  # migrateHooks.mjs (with briefingText.mjs and model.js) the briefing hooks onto a fixed path.
  mkdir "$TMP/x"
  tar -xzf "$TMP/$TGZ" -C "$TMP/x" spaces-agents/update.mjs spaces-agents/release.js spaces-agents/migrate.js \
    spaces-agents/migrateHome.mjs spaces-agents/migrateHooks.mjs spaces-agents/briefingText.mjs spaces-agents/model.js \
    </dev/null 2>/dev/null || fail "$TGZ lacks spaces-agents' updater files: nothing was installed."
  for f in update.mjs release.js migrate.js migrateHome.mjs migrateHooks.mjs briefingText.mjs model.js; do
    { [ -f "$TMP/x/spaces-agents/$f" ] && [ ! -L "$TMP/x/spaces-agents/$f" ]; } || fail "$TGZ: spaces-agents/$f is not a plain file: nothing was installed."
  done
  rc=0
  changed=yes
  if [ "$same" = yes ]; then
    out=$(node "$TMP/x/spaces-agents/update.mjs" repair --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" </dev/null 2>"$TMP/log") || rc=$?
    if [ "$rc" = 2 ]; then
      # A release whose updater has no `repair` command (cut before #44): it is installed again.
      say "This release's updater cannot check the installed files; installing $VERSION again."
      same=no
      rc=0
    elif [ "$rc" != 0 ] && [ "$rc" != 3 ] && [ "$rc" != 4 ]; then
      why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
      fail "could not check the installed pack: ${why:-$out $(cat "$TMP/log")}"
    else
      sed 's/^/  /' "$TMP/log"
      case $out in *'"changed":false'*) changed=no ;; esac
      if [ "$changed" = yes ]; then say "Repaired the pack $VERSION in $MODS: what differed from the release is listed above."; fi
    fi
  fi
  if [ "$same" = no ]; then
    set -- install --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" --setup
    if [ "$ADOPT" = 1 ]; then set -- "$@" --adopt; fi
    out=$(node "$TMP/x/spaces-agents/update.mjs" "$@" </dev/null 2>"$TMP/log") || rc=$?
    if [ "$rc" != 0 ] && [ "$rc" != 3 ] && [ "$rc" != 4 ]; then
      why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
      fail "nothing was installed: ${why:-$out $(cat "$TMP/log")}"
    fi
    sed 's/^/  /' "$TMP/log"
    say "Installed the pack $VERSION in $MODS: $(mark_get mods | sed 's/,/, /g')."
    if [ -f "$STATE/.prev/.pack" ] && [ "$installed" != none ]; then
      say "The folders it replaced ($installed) are kept in $STATE/.prev: 'automagik-herdr update --rollback' swaps them back."
    fi
  fi
  offer_switch

  # ---- e. the command ----
  mkdir -p "$BIN_DIR"
  target=$(cli_target)
  if [ -n "$target" ]; then chmod +x "$target"; fi
  if [ -n "$target" ] && [ "$(readlink "$LINK" 2>/dev/null || true)" = "$target" ]; then
    :
  elif [ -z "$target" ]; then
    say "Left $LINK as it is: $PACK is not this installer's (--adopt replaces it)."
  elif [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
    say "Left $LINK alone: it is a file, not a link. Remove it and run this again to link automagik-herdr."
  elif [ -L "$LINK" ] && ! link_ours; then
    say "Left $LINK alone: it points at $(readlink "$LINK"), not this install. Remove it and run this again to link automagik-herdr."
  else
    ln -sfn "$target" "$LINK"
    say "Linked $LINK."
    changed=yes
  fi
  case ":${PATH}:" in
    *":$BIN_DIR:"*) ;;
    *) say "Add ~/.local/bin to your PATH: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc" ;;
  esac

  # ---- f. next ----
  # A failed check or an unfinished step is never "Done" nor "up to date".
  if [ "$rc" = 4 ]; then switch_hint; fail "the pack is installed, but a step after it did not finish (the warning above says what, and where the folders are)."; fi
  if [ "$rc" = 3 ] && [ "$same" = yes ]; then
    switch_hint
    fail "herdr-app check failed for a mod (above): its output says what to fix. The files match release $VERSION."
  fi
  if [ "$rc" = 3 ]; then switch_hint; fail "herdr-app check failed for a mod (above); the pack is installed, and 'automagik-herdr update --rollback' swaps the kept set back."; fi
  if [ "$same" = yes ] && [ "$changed" = no ]; then
    say "Automagik Herdr $VERSION is already up to date ($MODS, $LINK): every file matches the release."
    switch_hint
    return 0
  fi
  say "Done: Automagik Herdr $VERSION. Open Herdr (or reload its mods), or in a project folder run:"
  say "  automagik-herdr create --kind=main --name=<name> --agent=claude && automagik-herdr start <name>"
  switch_hint
}

main "$@"
