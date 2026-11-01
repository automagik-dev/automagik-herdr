# am-pack: owner rulings (2026-11-01)

Input for the am-pack wish, planned after automagik-herdr v0.1.0 is released.
The source is branch `pack/vendor-on-dev` at 0722de1: nine mods vendored on dev 695eced, plus the catalog.

## Decided

1. **The bot mod is `am-sidebar`.** It draws the whole sidebar, and Bots is one section of it.
2. **No split.** The bot tree stays under its project's space (herdr-bots WISH A8, C2 and C7).
3. **v0.1.0 ships first.** After it, this wish:
   - rebases the pack,
   - ships every mod,
   - renames them.
   People on v0.1.0 move to the new names by rerunning the curl installer. It moves:
   - the folder,
   - the `.prev` state,
   - the shared keys, to `am.*`.
4. **One download.** A release is one tgz holding every mod. Install, update and rollback treat the pack as one unit.
5. **Consolidation.** Nine vendored mods plus cliproxy become eight:

   | New mod | Made from | Notes |
   |---|---|---|
   | `am-sidebar` | spaces-agents + space-icon | The icon dialog is absorbed into the sidebar. |
   | `am-footer` | sidebar-chrome | The rail gains a **Bots** entry and a **Proxy** icon. |
   | `am-markdown` | md-menu + markdown-browser | One mod. |
   | `am-tabs` | auto-tabs | |
   | `am-new-menu` | new-menu-tui | |
   | `am-pocket` | pocket-link | |
   | `am-mods` | mod-manager | |
   | `am-proxy` | cliproxy | The owner wants it changed. Today it does nothing useful; the owner uses the CLIProxyAPI in other ways. |

6. **New bot leaves the sidebar body.** The whole "New bot" line moves into `am-footer`. The bot management suite (create, edit, start, attach, the list) is reached from the footer.
7. **Every mod is Apache-2.0.**

## Constraints the plan must honour

- **MIT forks** (markdown-browser from ohneda, mod-manager from jacksonpires): they may be shipped under Apache-2.0 as derived works. The upstream MIT copyright and permission notice stays verbatim, in the mod's NOTICE plus a `LICENSE-upstream` file. The upstream author keeps their copyright.
- **cliproxy** (0xRowdy/herdr-cliproxy) has no licence. Its code may not be copied, even to change it.
  - `am-proxy` is written fresh, by us, against the CLIProxyAPI, with no lines taken from that repo.
  - NOTICE credits the idea.
  - If the author adds a licence later, vendoring that code becomes possible.
- **Herdr mods cannot import across folders.** The footer opens other surfaces with `run("mod.open", …)` and `run("tab.new", {mod})`, as in `sidebar-chrome/main.js:28-57`.
  - The bot management suite reached from the footer either reads and writes through the `automagik-herdr` CLI (A11 already manages bots), or is a view `am-sidebar` exposes.
  - That choice is the plan's first design question. The default proposal is a Bots tab that drives the CLI, so no bot code is copied.
- **Stale on the pack branch:**
  - `catalog/index.json` points at b405364 and branch `pack/vendor-on-dev`, and names the pack `herdr-bots`.
  - `RECIPE.md` names `bin/herdr-bots.mjs`, which the herdr-bots G9 group renames to `automagik-herdr.mjs`.
- **Hardcoded `spaces-agents` paths** that must move together:
  - `release.yml` (archive path and prefix)
  - `install.sh` (`PACK`, `.prev`, tgz entry check)
  - `update.mjs`
  - `scripts/version.mjs` (the VERSION path)
  - tests
  - README
- **Keep** the pane-label marker `automagik-herdr.squad=<squad>`. Brain routing reads it.
