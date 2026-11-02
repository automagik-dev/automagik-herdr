// One switch at a time, apart from the panel so `node --test` can prove a second click starts
// nothing: two interleaved switches would write the Keychain and the credential file from two
// snapshots, and whichever finished last would leave the panel's record wrong.
//
// The state is the view's own object (`{ busy }`), mutated in place — the panel already keeps it.

/** Starts a switch unless one is running. Answers null when it started, else the line to show. */
export function claim(state, provider, account) {
  if (state.busy) return `${state.busy} — one switch at a time`;
  state.busy = `switching ${provider} to ${account?.name ?? provider}…`;
  return null;
}

/** Marks the switch finished, success or failure. */
export function release(state) {
  state.busy = null;
}
