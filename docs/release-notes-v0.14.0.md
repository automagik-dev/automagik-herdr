# The pack's version and its update in the status bar

The window's bottom bar now shows the installed Automagik Herdr version, right of "⌘⇧P commands".
When a newer release is out it reads `<installed> → <latest> · update`: click **update**, confirm,
and it installs the same way `automagik-herdr update` does (checksum checked, the replaced pack
kept for `automagik-herdr update --rollback`). Click the version to check now, at most once a
minute.

## Updating from an earlier release: run the installer once to see the new bar

After updating from an earlier release, run the installer once more to switch to the new status bar: curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash (a layout you edited is kept).

`automagik-herdr update` (or the sidebar's update notice) installs this release, including the new
`am-status` mod, but runs the updater you already had, which doesn't update the automagik layout.
The bottom bar stays Herdr's own until you run the installer above. It checks the installed pack
against the release and puts this release's layout in place, unless you edited that layout
yourself; then it keeps yours, and you point its `status` block at `am-status` (README, "Wiring",
step 7). Updates from this release on place the layout themselves, and a rollback puts the earlier
layout back.
