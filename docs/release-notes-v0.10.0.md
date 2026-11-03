# Automagik Herdr 0.10.0: the version and its update in the status bar

The window's bottom bar now shows the installed Automagik Herdr version, right of "⌘⇧P commands".
When a release is out it reads `0.10.0 → 0.10.1 · update`: click **update**, confirm, and it
installs the same way `automagik-herdr update` does (checksum checked, the replaced pack kept for
`automagik-herdr update --rollback`). Click the version to check now, at most once a minute.

## Updating from 0.9.x or earlier: run the installer once to see the new bar

After updating from 0.9.x or earlier, run the installer once more to switch to the new status bar: curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash (a layout you edited is kept).

`automagik-herdr update` (or the sidebar's update notice) from 0.9.x or earlier installs 0.10.0,
including the new `am-status` mod, but runs the older updater, which doesn't update the automagik layout. The
bottom bar stays Herdr's own until you run:

```sh
curl -fsSL https://raw.githubusercontent.com/automagik-dev/automagik-herdr/main/install.sh | bash
```

It checks the installed pack against the release and puts the 0.10.0 layout in place, unless you
edited that layout yourself. In that case it keeps yours: point its `status` block at
`am-status` (README, "Wiring", step 7). Updates from 0.10.0 on place the layout themselves, and a
rollback puts the earlier layout back.
