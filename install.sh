#!/bin/sh
# Automagik Herdr installer (A17): turns a plain Herdr into Automagik Herdr on a Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
#   ... | bash -s -- --yes            answer yes to every question (for agents)
#   ... | bash -s -- --version 1.2.3  a given release (v0.5.0 or later) instead of the latest
#   ... | bash -s -- --adopt          also replace pack-named mods this installer did not install
#   ... | bash -s -- --uninstall      put back what was there before
#   ... | bash -s -- --no-usagemeter  leave usagemeter alone everywhere (install and --uninstall)
#   ... | bash -s -- --usagemeter-local-only  usagemeter on this computer only, no linked machine
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
# the `automagik-herdr` command into ~/.local/bin. It installs the pinned usagemeter release (the
# token meter the sidebar runs every 10 minutes) to ~/.local/bin/usagemeter, hash-checked and never
# over a newer one, and the same release on every connected linked machine (`hc machine ls`, through
# the pack's `automagik-herdr meter install --linked`: each machine downloads and checks it
# itself); a failure there is only a warning. Safe to run again: a rerun of the installed
# release downloads it all the same, checks every installed pack file against it, reinstalls a
# missing or damaged folder the record lists (the damaged copy kept in backup/), puts back a
# missing automagik layout and runs `herdr-app check` again. It says "up to date" only when every
# file matches, and says whether the mods were checked too (not without herdr-app). It never
# touches a project's .herdr/bots.json or Herdr's settings. Apache-2.0.
#
# The whole script is one function, called on its last line: a download cut short by the
# network defines part of it and runs nothing.
#
# For tests: AUTOMAGIK_HERDR_RELEASE_URL, a file:// folder (files at <url>/latest/download/<file>
# and <url>/download/v<version>/<file>) or a page of this repository on github.com; with a
# file:// one also AUTOMAGIK_HERDR_TTY (default /dev/tty) and AUTOMAGIK_HERDR_APPS (default
# /Applications). HERDR_APP_HOME as Herdr reads it. A file:// release folder also serves usagemeter's
# releases from <url>/usagemeter/download/v<version>/, so a test never reaches the network.

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
  PACK=$MODS/am-sidebar
  # The sidebar's folder before the rename (release.js OLD_PACK_NAME): what a v0.2-v0.4.x install has.
  OLD=spaces-agents
  STATE=$APP_HOME/automagik-herdr
  MARK=$STATE/installed-by-install.sh
  BEFORE=$STATE/$OLD.before-install
  LAYOUT=$APP_HOME/layouts/automagik.json
  REF=$STATE/automagik.json
  HINT=no
  BIN_DIR=$HOME/.local/bin
  LINK=$BIN_DIR/automagik-herdr
  NODE_MIN=22.7
  CASK=penso/tap/herdr-gpui
  # usagemeter (Group 6c): release.js USAGEMETER.version, kept equal by a test. One shared path.
  METER_VERSION=0.3.0
  METER_RELEASES=https://github.com/automagik-dev/usagemeter/releases
  METER=$BIN_DIR/usagemeter
  METER_OK=1
  # Linked machines too (meterFleet.js): 0 with --usagemeter-local-only (or --no-usagemeter).
  FLEET_OK=1

  YES=0
  ADOPT=0
  UNINSTALL=0
  WANT=
  while [ $# -gt 0 ]; do
    case $1 in
      --yes|-y) YES=1 ;;
      --uninstall) UNINSTALL=1 ;;
      --adopt) ADOPT=1 ;;
      --no-usagemeter) METER_OK=0; FLEET_OK=0 ;;
      --usagemeter-local-only) FLEET_OK=0 ;;
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
      file://*) TTY=${AUTOMAGIK_HERDR_TTY:-$TTY}; APPS=${AUTOMAGIK_HERDR_APPS:-$APPS}; METER_RELEASES=$RELEASES/usagemeter ;;
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

  install.sh [--yes] [--version <v>] [--adopt] [--no-usagemeter | --usagemeter-local-only]
                                       install or update the pack and the automagik-herdr command
  install.sh --uninstall [--yes]       move the pack out of mods/, put back what was there before
  install.sh --help

--yes answers yes to every question (installing Node or Herdr with Homebrew, switching
Herdr to the automagik layout). --version installs that release; it needs v0.5.0 or later.
--adopt replaces a pack-named mod this installer did not install, after moving it to
<app home>/automagik-herdr/backup/; without it such a folder is reported and left alone.
--no-usagemeter leaves ~/.local/bin/usagemeter (the token meter) alone, here and on every linked
machine: install skips it, and --uninstall keeps it even where this installer put it.
--usagemeter-local-only installs and removes it on this computer only, never on a linked machine
(hc machine ls). Both are remembered for 'automagik-herdr update' and the sidebar's sync.
EOF
}

say() { printf '%s\n' "$*"; }
# The briefing hooks' notice update.mjs gave (its `notice: ` lines), held in $TMP/notice for the
# end of the run: printed once, there or before any failure after it, so it is never lost.
held_notice() {
  { [ -n "${TMP:-}" ] && [ -s "$TMP/notice" ]; } || return 0
  say ""
  cat "$TMP/notice"
  say ""
  : >"$TMP/notice"
}
fail() { held_notice; printf 'automagik-herdr install: %s\n' "$*" >&2; exit 1; }

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
# v0.2's v1 has no `mods=` (it installed $OLD only, its first pack copied to $BEFORE).
mark_get() { sed -n "s/^$1=//p" "$MARK" 2>/dev/null | head -n 1; }

# Whether $LINK is a link to the pack's own command in this app home (the sidebar folder's
# bin/automagik-herdr wrapper, which v0.3.5-v0.4.x link, or bin/automagik-herdr.mjs, under its old
# or its am-* name), the only kind this script replaces or removes: a link the person pointed
# anywhere else stays theirs.
link_ours() {
  [ -L "$LINK" ] || return 1
  to=$(readlink "$LINK" 2>/dev/null) || return 1
  case $to in
    "$MODS/$OLD/bin/automagik-herdr"|"$MODS/$OLD/bin/automagik-herdr.mjs") return 0 ;;
    "$PACK/bin/automagik-herdr"|"$PACK/bin/automagik-herdr.mjs") return 0 ;;
  esac
  return 1
}

# The command the link points at, in the sidebar folder the ownership record lists (am-sidebar,
# else $OLD, a rollback's): its bin/automagik-herdr wrapper when the pack ships one (it finds a node
# where PATH has none), else bin/automagik-herdr.mjs; empty when the record lists neither folder.
cli_target() {
  case ",$(mark_get mods)," in
    *,"${PACK##*/}",*) dir=$PACK/bin ;;
    *,"$OLD",*) dir=$MODS/$OLD/bin ;;
    *) return 0 ;;
  esac
  if [ -f "$dir/automagik-herdr" ]; then echo "$dir/automagik-herdr"; else echo "$dir/automagik-herdr.mjs"; fi
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
    && grep -q '"mod"[[:space:]]*:[[:space:]]*"am-sidebar"' "$APP_HOME/layouts/$shown.json"; then
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

# A layout of the person's own that shows the sidebar (one adapted for a sidebar-only release)
# doesn't gain the rest of the pack by itself, and this script never edits it: for each such
# layout, say which pack surfaces it lacks and where to copy them from.
layout_notes() {
  [ -f "$REF" ] || return 0
  for f in "$APP_HOME"/layouts/*.json; do
    if [ ! -f "$f" ] || [ "$f" = "$LAYOUT" ]; then continue; fi
    grep -q '"mod"[[:space:]]*:[[:space:]]*"am-sidebar"' "$f" || continue
    lacks=
    for s in 'am-footer:the footer rail (am-footer)' 'am-tabs:the tab bar (am-tabs)' \
      'am-markdown:the Markdown menu (am-markdown)' 'am-automations:the automations panel (am-automations)' 'am-quota:the quota panel (am-quota)'; do
      # A block naming the mod ("mod": …), or for am-markdown the root's "terminal_menu": an id like
      # "am-quota-panel" or a mention elsewhere doesn't count.
      grep -Eq "\"(mod|terminal_menu)\"[[:space:]]*:[[:space:]]*\"${s%%:*}\"" "$f" || lacks=${lacks:+$lacks, }${s#*:}
    done
    [ -n "$lacks" ] || continue
    name=${f##*/}
    say "Your layout ${name%.json} ($f) shows the Automagik sidebar, but not the rest of the pack: $lacks."
    say "  It is left as it is. To add them, copy their blocks (and \"terminal_menu\": \"am-markdown\") from the pack's layout, $REF, into it; or use the automagik layout instead."
  done
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
    # v1 (v0.2.x): $OLD only, the layout's reference inside it, its first pack in $BEFORE.
    mods=$OLD
    ref=$MODS/$OLD/layouts/automagik.json
    if [ "$(mark_get before)" = kept ] && [ -d "$BEFORE" ]; then adopted=$OLD:v1; fi
  fi
  # The automagik layout goes only when this script added it and it is still the pack's own
  # (cmp): an edited one, or one copied by hand, stays.
  if [ "$(mark_get layout)" = added ] && [ -f "$LAYOUT" ] && [ -f "$ref" ] && cmp -s "$LAYOUT" "$ref"; then
    rm -f "$LAYOUT"
    say "Removed the automagik layout ($LAYOUT). If Herdr shows it, switch back: herdr-app do layout.switch '{\"name\":\"main\"}'"
  fi
  # usagemeter on the linked machines first, while the pack's CLI is still in mods/.
  if grep -q '^usagemeter-machines=.' "$MARK"; then
    if [ "$FLEET_OK" = 0 ]; then say "Left usagemeter on the linked machines ($(mark_get usagemeter-machines | sed 's/:[^,]*//g; s/,/, /g'))."
    else fleet uninstall; fi
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
      "$OLD:v1") p=${BEFORE#"$STATE"/} ;;
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
  uninstall_meter
  rm -f "$MARK"
  say "Done. Your bots (.herdr/bots.json in each project) and Herdr's settings are untouched. Reload Herdr's mods."
}

# ---- usagemeter (Group 6c) ----
# The version a usagemeter binary reports (`usagemeter --version` prints `usagemeter X.Y.Z`, a dev
# build maybe `usagemeter X.Y.Z-dev` or `X.Y.Z+build`), or nothing. Compare its X.Y.Z (${v%%[-+]*}).
meter_version() {
  "$1" --version </dev/null 2>/dev/null \
    | sed -n 's/^usagemeter \([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\([-+][0-9A-Za-z.+-]*\)\{0,1\}\)$/\1/p' | head -n 1
}
# The sha256 this installer pins for usagemeter asset $1 (release.js USAGEMETER.sha256, kept equal by
# a test, and checked against the release by scripts/usagemeter-pin.mjs in CI). A file:// test
# release may pin its own with AUTOMAGIK_HERDR_METER_PIN (SHA256SUMS lines); never a real one.
meter_pin() {
  case $METER_RELEASES in
    file://*) if [ -n "${AUTOMAGIK_HERDR_METER_PIN:-}" ]; then
      sed -n "s/^\([0-9a-f]\{64\}\) [ *]$1\$/\1/p" "$AUTOMAGIK_HERDR_METER_PIN" | head -n 1; return 0; fi ;;
  esac
  case $1 in
    usagemeter-darwin-arm64) echo 80542d40e71369359cc1048c2d3a00b5703a10657651ca36e4207dfcf7d9824f ;;
    usagemeter-darwin-x86_64) echo f44107b3b5482b58e8592d482a01299c559ab71ded4d68a5c76b597c96ae6670 ;;
    usagemeter-linux-aarch64) echo fa08460ebba5f4670bfa5777340c9ac20c89788f560bfadd24aeb30babdcfff4 ;;
    usagemeter-linux-x86_64) echo 25094c783abf14081d03547596e109b8601b7b47b8efccf76fa4473141cc26c6 ;;
  esac
}
# Whether version $1 >= $2, field by field as numbers (0.10.0 >= 0.9.0).
version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN { split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 }
    exit 0 }' </dev/null
}
# The marker's usagemeter lines, last and in release.js formatMarker's order (usagemeter=,
# usagemeter-machines=, usagemeter-scope=), so a later rewrite by update.mjs changes nothing:
# $1 the usagemeter= value and $2 the usagemeter-scope= one (empty: dropped); the machines line kept.
# Unchanged values leave the record byte for byte (a rerun changes nothing). A v2 marker only.
mark_usagemeter() {
  grep -q '^mods=' "$MARK" 2>/dev/null || return 0
  machines=$(mark_get usagemeter-machines)
  m=$(mktemp "$STATE/.marker.XXXXXX") || return 1
  if { sed -e '/^usagemeter=/d' -e '/^usagemeter-machines=/d' -e '/^usagemeter-scope=/d' "$MARK"
    if [ -n "$1" ]; then printf 'usagemeter=%s\n' "$1"; fi
    if [ -n "$machines" ]; then printf 'usagemeter-machines=%s\n' "$machines"; fi
    if [ -n "$2" ]; then printf 'usagemeter-scope=%s\n' "$2"; fi; } >"$m"; then
    if cmp -s "$m" "$MARK"; then rm -f "$m"; return 0; fi
    if mv "$m" "$MARK"; then return 0; fi
  fi
  rm -f "$m"
  return 1
}
mark_meter() { mark_usagemeter "$1" "$(mark_get usagemeter-scope)"; }
mark_scope() { mark_usagemeter "$(mark_get usagemeter)" "$1"; }
# Puts the pinned release at $METER: the binary for this OS and CPU, checked against the release's
# SHA256SUMS, written to a temp file beside it, chmod 755, renamed into place. Never over a newer
# usagemeter (Pocket Link installs the same one; a pre-release counts by its X.Y.Z, so 0.3.0-dev
# stays), one that reports no version, a link or a folder. Returns 1 with $why on a failure; the
# caller only warns. Runs in a || list, where set -e is off: every step checks itself.
install_meter() {
  why=
  have=
  if [ -L "$METER" ] || { [ -e "$METER" ] && [ ! -f "$METER" ]; }; then
    say "usagemeter: left $METER, a link or a folder, as it is."
    mark_meter ""
    return 0
  fi
  if [ -f "$METER" ]; then
    have=$(meter_version "$METER")
    if [ -z "$have" ]; then
      say "Warning: $METER reports no usagemeter version; left it as it is (remove it to get usagemeter $METER_VERSION)."
      mark_meter ""
      return 0
    fi
    if [ "$have" = "$METER_VERSION" ]; then say "usagemeter $have: already installed ($METER)."; return 0; fi
    # Not older by its X.Y.Z: a newer release, or a dev build of this one or a newer one.
    if version_ge "${have%%[-+]*}" "$METER_VERSION"; then
      say "usagemeter $have is installed ($METER), not older than $METER_VERSION: not replacing it."
      mark_meter ""
      return 0
    fi
  fi
  case $(uname -s 2>/dev/null)-$(uname -m 2>/dev/null) in
    Darwin-arm64) asset=usagemeter-darwin-arm64 ;;
    Darwin-x86_64) asset=usagemeter-darwin-x86_64 ;;
    Linux-x86_64|Linux-amd64) asset=usagemeter-linux-x86_64 ;;
    Linux-aarch64|Linux-arm64) asset=usagemeter-linux-aarch64 ;;
    *) why="no usagemeter build for $(uname -s 2>/dev/null) $(uname -m 2>/dev/null)"; return 1 ;;
  esac
  ubase=$METER_RELEASES/download/v$METER_VERSION
  udir=$TMP/usagemeter
  mkdir -p "$udir" || { why="could not make $udir"; return 1; }
  say "Downloading usagemeter $METER_VERSION..."
  curl -fsSL --path-as-is "$ubase/SHA256SUMS" -o "$udir/SHA256SUMS" </dev/null 2>/dev/null \
    || { why="could not download $ubase/SHA256SUMS"; return 1; }
  curl -fsSL --path-as-is "$ubase/$asset" -o "$udir/$asset" </dev/null 2>/dev/null \
    || { why="could not download $ubase/$asset"; return 1; }
  usum=$(sed -n "s/^\([0-9a-fA-F]\{64\}\) [ *]$asset\$/\1/p" "$udir/SHA256SUMS" | head -n 1 | tr 'A-F' 'a-f')
  [ -n "$usum" ] || { why="$ubase/SHA256SUMS does not list $asset"; return 1; }
  if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$udir/$asset" </dev/null); else got=$(sha256sum "$udir/$asset" </dev/null); fi
  got=${got%% *}
  [ "$got" = "$usum" ] || { why="$asset does not match SHA256SUMS (sha256 $got, expected $usum): nothing was installed"; return 1; }
  pin=$(meter_pin "$asset")
  if [ -z "$pin" ] || [ "$got" != "$pin" ]; then
    why="$asset is not the build this installer pins (sha256 $got, pinned ${pin:-none}): nothing was installed"
    return 1
  fi
  mkdir -p "$BIN_DIR" || { why="could not make $BIN_DIR"; return 1; }
  part=$(mktemp "$BIN_DIR/.usagemeter.XXXXXX") || { why="could not write in $BIN_DIR"; return 1; }
  if cp "$udir/$asset" "$part" && chmod 755 "$part" && mv -f "$part" "$METER"; then
    say "Installed usagemeter $METER_VERSION ($METER, checksum ok)."
    mark_meter "$METER_VERSION" || say "usagemeter: the ownership record could not note it; --uninstall will leave it."
    return 0
  fi
  rm -f "$part"
  why="could not write $METER"
  return 1
}
# The pack's own CLI, run with node (install() checked it): meter install|uninstall on the linked
# machines. Its lines are printed as they are; it failing to run at all is only a warning.
fleet() {
  cli=$PACK/bin/automagik-herdr.mjs
  [ -f "$cli" ] || { say "Warning: usagemeter on linked machines: $cli is missing; skipped."; return 0; }
  # A release from before this command (--version <older>) has no meter: nothing to run.
  HERDR_APP_HOME=$APP_HOME node "$cli" help </dev/null 2>/dev/null | grep -q '^  meter install' \
    || { say "usagemeter on linked machines: skipped (this release's automagik-herdr has no meter install)."; return 0; }
  HERDR_APP_HOME=$APP_HOME node "$cli" meter "$@" </dev/null 2>&1 \
    || say "Warning: usagemeter on linked machines did not finish; 'automagik-herdr meter install' retries it."
}
meter_step() {
  if [ "$METER_OK" = 0 ]; then scope=none; elif [ "$FLEET_OK" = 0 ]; then scope=local; else scope=all; fi
  mark_scope "$scope" || say "usagemeter: the ownership record could not note --no-usagemeter or --usagemeter-local-only."
  if [ "$METER_OK" = 0 ]; then say "usagemeter: skipped (--no-usagemeter)."; return 0; fi
  install_meter || say "Warning: usagemeter was not installed: $why. The pack is installed; run this again later to retry."
}
# The linked machines, after the command is linked (the pack's CLI repoints an old link to its
# wrapper when it starts, which step e reports itself).
fleet_step() {
  [ "$METER_OK" = 1 ] || return 0
  if [ "$FLEET_OK" = 0 ]; then say "usagemeter on linked machines: skipped (--usagemeter-local-only)."; return 0; fi
  [ -n "$target" ] || { say "usagemeter on linked machines: skipped ($PACK is not this installer's)."; return 0; }
  fleet install --linked
}
# --uninstall: the binary goes only when the marker says this installer put it there, it still
# reports that version (a newer one is Pocket Link's or the person's), Pocket Link is not here, and
# --no-usagemeter was not given.
uninstall_meter() {
  um=$(mark_get usagemeter)
  [ -n "$um" ] || return 0
  if [ "$METER_OK" = 0 ]; then
    say "Left $METER (--no-usagemeter)."
  elif [ ! -f "$METER" ] || [ -L "$METER" ] || [ "$(meter_version "$METER")" != "$um" ]; then
    say "Left $METER: it is not the usagemeter $um this installer put there."
  elif [ -e "$MODS/pocket-link" ]; then
    say "Left $METER: Pocket Link ($MODS/pocket-link) runs it too."
  else
    rm -f "$METER" && say "Removed $METER (usagemeter $um). Its store is kept."
  fi
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
  [ -n "$TGZ" ] || fail "$base/SHA256SUMS names no automagik-herdr-pack-<version>.tgz (a sidebar-only release before v0.5.0?)."
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
  # migrateHooks.mjs (with briefingText.mjs, model.js and its models.js) the briefing hooks onto a
  # fixed path.
  mkdir "$TMP/x"
  side=${PACK##*/}
  tar -xzf "$TMP/$TGZ" -C "$TMP/x" "$side/update.mjs" "$side/release.js" "$side/migrate.js" \
    "$side/migrateHome.mjs" "$side/migrateHooks.mjs" "$side/briefingText.mjs" "$side/model.js" "$side/models.js" \
    </dev/null 2>/dev/null || fail "$TGZ lacks $side's updater files: nothing was installed."
  for f in update.mjs release.js migrate.js migrateHome.mjs migrateHooks.mjs briefingText.mjs model.js models.js; do
    { [ -f "$TMP/x/$side/$f" ] && [ ! -L "$TMP/x/$side/$f" ]; } || fail "$TGZ: $side/$f is not a plain file: nothing was installed."
  done
  rc=0
  changed=yes
  if [ "$same" = yes ]; then
    out=$(node "$TMP/x/$side/update.mjs" repair --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" </dev/null 2>"$TMP/log") || rc=$?
    if [ "$rc" = 2 ]; then
      # A release whose updater has no `repair` command (cut before #44): it is installed again.
      say "This release's updater cannot check the installed files; installing $VERSION again."
      same=no
      rc=0
    elif [ "$rc" != 0 ] && [ "$rc" != 3 ] && [ "$rc" != 4 ]; then
      why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
      fail "could not check the installed pack: ${why:-$out $(cat "$TMP/log")}"
    else
      sed -e '/^notice: /d' -e 's/^/  /' "$TMP/log"
      sed -n 's/^notice: //p' "$TMP/log" >"$TMP/notice"
      case $out in *'"changed":false'*) changed=no ;; esac
      if [ "$changed" = yes ]; then say "Repaired the pack $VERSION in $MODS: what differed from the release is listed above."; fi
    fi
  fi
  if [ "$same" = no ]; then
    set -- install --from "$TMP/$TGZ" --version "$VERSION" --mods "$MODS" --setup
    if [ "$ADOPT" = 1 ]; then set -- "$@" --adopt; fi
    out=$(node "$TMP/x/$side/update.mjs" "$@" </dev/null 2>"$TMP/log") || rc=$?
    if [ "$rc" != 0 ] && [ "$rc" != 3 ] && [ "$rc" != 4 ]; then
      why=$(printf '%s' "$out" | sed -n 's/.*"error":"\(.*\)"}.*/\1/p' | head -n 1)
      fail "nothing was installed: ${why:-$out $(cat "$TMP/log")}"
    fi
    sed -e '/^notice: /d' -e 's/^/  /' "$TMP/log"
    # The briefing hooks' notice (update.mjs): kept for the end of the run, where it is read.
    sed -n 's/^notice: //p' "$TMP/log" >"$TMP/notice"
    say "Installed the pack $VERSION in $MODS: $(mark_get mods | sed 's/,/, /g')."
    if [ -f "$STATE/.prev/.pack" ] && [ "$installed" != none ]; then
      say "The folders it replaced ($installed) are kept in $STATE/.prev: 'automagik-herdr update --rollback' swaps them back."
    fi
  fi
  meter_step
  offer_switch
  layout_notes

  # ---- e. the command ----
  mkdir -p "$BIN_DIR"
  target=$(cli_target)
  # Never a link to nothing: a pack whose sidebar ships no command stops here, and our link, if
  # it now points at nothing (into the replaced folder), goes rather than dangle.
  if [ -n "$target" ] && { [ ! -f "$target" ] || [ -L "$target" ]; }; then
    gone=
    if link_ours && [ ! -e "$LINK" ]; then rm -f "$LINK" && gone=" Removed $LINK, which pointed at nothing now."; fi
    fail "the pack is installed, but ${target%/*} has neither automagik-herdr nor automagik-herdr.mjs, so automagik-herdr is not linked.$gone"
  fi
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
  fleet_step
  case ":${PATH}:" in
    *":$BIN_DIR:"*) ;;
    *) say "Add ~/.local/bin to your PATH: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc" ;;
  esac

  # ---- f. next ----
  # The hooks notice after everything else the run printed and before its last lines, so it is read.
  held_notice
  # A failed check or an unfinished step is never "Done" nor "up to date".
  if [ "$rc" = 4 ]; then switch_hint; fail "the pack is installed, but a step after it did not finish (the warning above says what, and where the folders are)."; fi
  if [ "$rc" = 3 ] && [ "$same" = yes ]; then
    switch_hint
    fail "herdr-app check failed for a mod (above): its output says what to fix. The files match release $VERSION."
  fi
  if [ "$rc" = 3 ]; then switch_hint; fail "herdr-app check failed for a mod (above); the pack is installed, and 'automagik-herdr update --rollback' swaps the kept set back."; fi
  if [ "$same" = yes ] && [ "$changed" = no ]; then
    case $out in
      *'"checked":true'*) verified="every file matches the release and every mod passed herdr-app check" ;;
      *) verified="every file matches the release; herdr-app not found, so no mod was checked" ;;
    esac
    say "Automagik Herdr $VERSION is already up to date ($MODS, $LINK): $verified."
    switch_hint
    return 0
  fi
  say "Done: Automagik Herdr $VERSION. Open Herdr (or reload its mods), or in a project folder run:"
  say "  automagik-herdr create --kind=main --name=<name> --agent=claude && automagik-herdr start <name>"
  switch_hint
}

main "$@"
