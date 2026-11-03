// Which space the menu acts on: props.space when given (a sidebar row's +), else the shown one.
export function targetSpace(list, id) {
  return (id && list.find((s) => s.id === id)) || list.find((s) => s.active) || null;
}

// Where a worktree action starts for `space`: the shown space keeps the focused pane's
// folder; another space uses its active tab's pane (the focused one there first).
export function folderOf(space, ps, explicit) {
  if (!explicit) return ps.find((p) => p.focused)?.cwd;
  const tabs = (space?.tabs ?? []).map((t) => t.id);
  const active = space?.tabs?.find((t) => t.active)?.id;
  const mine = ps.filter((p) => tabs.includes(p.tab) && p.cwd);
  return (mine.find((p) => p.tab === active && p.focused) ?? mine.find((p) => p.tab === active) ?? mine[0])?.cwd;
}
