# Automagik Herdr 0.9.0: usagemeter on every linked machine

The phone reads each machine's own usage summary, the `herdr-meter` document in that machine's
herdr-core. So usagemeter now runs on every connected machine in `hc machine ls`, not only on this
computer. The pack is the one usagemeter installer.

## After updating to 0.9.0: run `automagik-herdr meter install` once

`automagik-herdr update` from 0.8.x is run by the 0.8.x command, which has no usagemeter step. Once
the update is done, run:

```sh
automagik-herdr meter install
```

It installs usagemeter 0.3.0 on this computer and on every connected linked machine, and records
that you asked for it. Updates after that keep them on the pack's pin. Add `--local` for this
computer only. Add `--machine <name>` for one machine, for example one linked later.

An install record that never said yes is not read as a yes. `install.sh --no-usagemeter` before
0.9.0 recorded nothing, so in that case `update` installs nowhere and prints the command above, and
the sidebar syncs only this computer.

## What changed

- **Pinned by version and by hash.** usagemeter 0.3.0 is pinned. Each of its four builds is checked
  against the release's `SHA256SUMS` and against the sha256 the pack carries. A mismatch installs
  nothing and prints a warning. CI checks the carried hashes against the release.
- **Linked machines.** Each machine downloads the build itself and checks both hashes there. A
  binary already at 0.3.0 is left alone, and a newer one is never downgraded. A machine that fails
  is a warning that names it.
- **Sync.** The sidebar's 10-minute `usagemeter sync` also runs on each connected linked machine,
  one at a time. A machine that is missing usagemeter is skipped quietly, and one that hangs is
  given up on after 30 s.
- **install.sh.** It covers the linked machines too. `--usagemeter-local-only` keeps usagemeter to
  this computer. `--no-usagemeter` now covers the linked machines as well. Both choices are
  remembered.
- **Uninstall.** `--uninstall` removes usagemeter from a linked machine only where the install
  record says the pack put it there and that machine still has the same version.
