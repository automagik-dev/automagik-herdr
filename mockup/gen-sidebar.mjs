// Writes bots-canvas/project/Main.dc.html: the live brain-v3 hc tree as a Herdr Bots sidebar.
// AUTOMAGIK_DIR is a checkout of the Automagik repo, which holds the characters and inks.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const AUTOMAGIK = process.env.AUTOMAGIK_DIR
if (!AUTOMAGIK) {
  console.error('gen-sidebar: set AUTOMAGIK_DIR to a checkout of the Automagik repo')
  process.exit(2)
}
const client = (name) => pathToFileURL(`${AUTOMAGIK}/apps/bots-dsh/src/client/${name}`).href
const { CHARACTERS } = await import(client('characters.js'))
const { INKS } = await import(client('inks.js'))

const OUT = new URL('../bots-canvas/project/Main.dc.html', import.meta.url).pathname
const mix = (a, b, t) => '#' + [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*t + parseInt(b.slice(i,i+2),16)*(1-t)).toString(16).padStart(2,'0')).join('')
const P = '#0a0f1f'

function pet(id, shape, color, pose, size) {
  const c = CHARACTERS[shape], ink = INKS[color][1]
  const g = `g_${id.replace(/\W/g, '_')}`
  const eye = ([cx,cy,w,h,t]) => {
    if (pose === 'happy') return `<path transform="translate(${cx} ${cy}) rotate(${t})" d="M${-w*0.62} ${h*0.14}Q0 ${-h*0.42} ${w*0.62} ${h*0.14}" fill="none" stroke="${P}" stroke-width="${(w*0.36).toFixed(1)}" stroke-linecap="round"/>`
    if (pose === 'sleep') return `<path transform="translate(${cx} ${cy}) rotate(${t})" d="M${-w*0.6} 0Q0 ${h*0.22} ${w*0.6} 0" fill="none" stroke="${P}" stroke-width="${(w*0.32).toFixed(1)}" stroke-linecap="round"/>`
    const s = pose === 'alert' ? 1.15 : 1
    return `<g transform="translate(${cx} ${cy}) rotate(${t})"><rect x="${-w*s/2}" y="${-h*s/2}" width="${w*s}" height="${h*s}" rx="${w*s/2}" fill="${P}"/><circle cx="${w*0.12}" cy="${-h*0.24}" r="${(w*0.22).toFixed(1)}" fill="#fff"/></g>`
  }
  const paints = (c.paints ?? []).map(([d,f,o]) => `<path d="${d}" fill="${f}" fill-opacity="${o}"/>`).join('')
  const blush = pose === 'happy' ? c.eyes.map(([cx,cy,w,h,t]) => `<ellipse cx="${cx}" cy="${cy+h*0.56}" rx="${w*0.78}" ry="${w*0.4}" transform="rotate(${t} ${cx} ${cy})" fill="#ff5fb8" fill-opacity=".42"/>`).join('') : ''
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" style="flex: none"><defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="18" y1="8" x2="80" y2="95"><stop offset="0" stop-color="${mix(ink,'#ffffff',0.58)}"/><stop offset=".5" stop-color="${ink}"/><stop offset="1" stop-color="${mix(ink,'#000000',0.72)}"/></linearGradient></defs><g fill-rule="evenodd"><path d="${c.body}" fill="url(#${g})"/>${paints}<path d="${c.shade}" fill="#000" fill-opacity=".14"/><path d="${c.light}" fill="#fff" fill-opacity=".16"/></g>${blush}${c.eyes.map(eye).join('')}</svg>`
}

// Herdr's own program icons (~/.config/herdr-app/icons, my-icons/codex.svg), tinted like the sidebar.
const T = '#D7DCE4'
const ICON = {
  claude: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-label="Claude Code" style="flex: none"><path fill-rule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757"/></svg>`,
  codex: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-label="Codex" style="flex: none"><path fill="${T}" fill-rule="evenodd" d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"/></svg>`,
  omp: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 800 800" aria-label="Oh My Pi" style="flex: none"><path fill="${T}" fill-rule="evenodd" d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"/><path fill="${T}" d="M517.36 400H634.72V634.72H517.36Z"/></svg>`,
  sh: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Shell" style="flex: none"><path d="M12 19h8"/><path d="m4 17 6-6-6-6"/></svg>`,
  env: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Program" style="flex: none"><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>`,
}

const RING = `<span style="flex: none; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #7A8294; margin: 0 3px" aria-label="Done"></span>`
const SPIN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Working" style="flex: none"><circle cx="12" cy="12" r="9" stroke="#3A4252" stroke-width="3"/><path d="M12 3a9 9 0 0 1 9 9" stroke="#F2C14E" stroke-width="3" stroke-linecap="round"/></svg>`
const CHEV = (n) => `<span style="flex: none; font-size: 11px; color: #8B93A3; display: flex; align-items: center; gap: 3px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>${n}</span>`
const MONO = `font-family: 'JetBrains Mono', ui-monospace, monospace`

// Bots are the named team members; everything else live under them is a plain Herdr helper.
const BOTS = {
  pm: { role: 'Issues and MRs', model: 'GLM 5.3 flash', pet: ['bunny', 'violet'] },
  dogfood: { role: 'Dogfood lead', model: 'DeepSeek flash', pet: ['kitty', 'magenta'] },
  integrator: { role: 'Integration', model: 'GPT-6.1 Sol', pet: ['beacon', 'orange'] },
  'runtime-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['whale', 'blue'] },
  'runtime-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['hex', 'sky'] },
  'runtime-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['gem', 'cobalt'] },
  'ship-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['saucer', 'green'] },
  'ship-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['magnet', 'cyan'] },
  'ship-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['pebbles', 'tangerine'] },
  'memory-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['star', 'yellow'] },
  'memory-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['moon', 'rose'] },
  'memory-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['peanut', 'red'] },
  'recall-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['star', 'yellow'] },
  'recall-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['moon', 'rose'] },
  'recall-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['peanut', 'red'] },
  'retrieval-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['wave', 'deepseek'] },
  'retrieval-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['squircle', 'sky'] },
  'retrieval-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['plus', 'cyan'] },
  'tooling-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['zed', 'graphite'] },
  'tooling-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['cushion', 'gray'] },
  'tooling-test': { role: 'Tests and break-it', model: 'DeepSeek flash', pet: ['gumdrop', 'charcoal'] },
  'rust-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['ring', 'rose'] },
  'rust-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['hex', 'orange'] },
  'rust-test': { role: 'Parity tests', model: 'DeepSeek flash', pet: ['acorn', 'tangerine'] },
  'bench-cap': { role: 'Captain', model: 'GPT-6.1 Terra', pet: ['star', 'brown'] },
  'bench-dev': { role: 'Builder', model: 'GPT-6.1 Sol', pet: ['saucer', 'violet'] },
  'bench-test': { role: 'Reproducibility', model: 'DeepSeek flash', pet: ['beacon', 'green'] },
}
const GROUPS = [
  { title: 'Shared', sub: 'one of each, serves every squad', bots: ['pm', 'dogfood', 'integrator'] },
  { title: 'Knowledge', sub: 'Retrieval · Memory', bots: ['retrieval-cap', 'memory-cap'] },
  { title: 'Platform', sub: 'Ship · Integrations', bots: ['ship-cap', 'runtime-cap'] },
  { title: 'Engineering', sub: 'Dev tooling · Rust core', bots: ['tooling-cap', 'rust-cap'] },
  { title: 'Quality', sub: 'Bench & Research · regression gate · leaderboards', bots: ['bench-cap'] },
  { title: 'Access', sub: 'auth v2 · privacy · Studio', bots: [], planned: [['Access & Studio', 'waits for the auth v2 decision', ['moon', 'charcoal']]] },
]
// Reviewers started before review.sh passed --parent hang off t1m; show them under the squad that asked.
const ASKED_BY = { 'review-120': 'runtime-cap', 'recall-dev': 'memory-cap', 'recall-test': 'memory-cap' }

// Live state from hc (status, agent, parent) at generation time.
const LIVE = JSON.parse(Bun.spawnSync(['hc', 'ls', '--json']).stdout.toString()).terminals.filter(t => t.state === 'live')
const byName = Object.fromEntries(LIVE.filter(t => t.name).map(t => [t.name, t]))
const AGENT = { 'claude-code': 'claude', codex: 'codex', omp: 'omp', env: 'env' }
const agentOf = (t) => AGENT[t.agent] ?? 'sh'
const working = (t) => t?.status === 'working'
const childrenOf = (name) => {
  const me = byName[name]
  if (!me) return []
  return LIVE.filter(t => t.parent === me.address || ASKED_BY[t.name] === name)
}
const NOTE = { 'review-': (t) => t.labels?.e9 ? `E9 ${t.labels.e9}` : '' }
const noteOf = (t) => t.address.includes('/') ? t.address.split('/')[0] : (t.name?.startsWith('review-') ? NOTE['review-'](t) : '')

const STATUS = (t) => working(t) ? SPIN : (['omp', 'codex', 'claude'].includes(agentOf(t)) ? RING : '<span style="flex: none; width: 14px"></span>')
const helperRow = (t) => `<div style="display: flex; align-items: center; gap: 8px; padding: 3px 6px; height: 20px">
${ICON[agentOf(t)](14)}
<span style="flex-grow: 1; min-width: 0; color: #C3CAD5; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${t.name ?? t.agent}</span>
${noteOf(t) ? `<span style="flex: none; ${MONO}; font-size: 10px; color: #6B7385">${noteOf(t)}</span>` : ''}
${STATUS(t)}
</div>`

const ARROW = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`
const SLOT = '<span style="flex: none; width: 10px"></span>'
// Minimal by default: categories open, a bot's team and helpers folded until you open them.
const fold = (summary, body, open) => `<details${open ? ' open' : ''}><summary>${summary}</summary>${body}</details>`

const botRow = (name) => {
  const b = BOTS[name], t = byName[name], kids = childrenOf(name)
  if (!t) return ''
  const subBots = kids.filter(k => BOTS[k.name]), helpers = kids.filter(k => !BOTS[k.name])
  const row = `<div style="display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 2px; border-radius: 8px">
${kids.length ? ARROW : SLOT}
${pet(name, b.pet[0], b.pet[1], working(t) ? 'focus' : 'happy', 26)}
<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px">
<span style="font-weight: 600; font-size: 13px; color: ${INKS[b.pet[1]][0]}">${name}</span>
<span style="font-size: 11px; color: #8B93A3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${b.role} · ${b.model}</span>
</div>
${ICON[agentOf(t)](15)}
${STATUS(t)}
</div>`
  if (!kids.length) return row
  return fold(row, `<div style="margin: 0 0 4px 31px; border-left: 1px solid #2A3242; padding-left: 7px; display: flex; flex-direction: column; gap: 1px">
${subBots.map(k => botRow(k.name)).join('\n')}
${helpers.length ? `<div style="border-left: 1px dashed #2E3646; padding-left: 9px; margin-left: 2px">${helpers.map(helperRow).join('\n')}</div>` : ''}
</div>`, false)
}

const groupBlock = (g) => fold(`<div style="margin: 8px 0 2px 0; padding: 3px 8px 3px 2px; display: flex; align-items: center; gap: 8px">
${ARROW}
<span style="font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #C3CAD5">${g.title}</span>
<span style="font-size: 11px; color: #6B7385; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${g.sub}</span>
</div>`, `<div style="display: flex; flex-direction: column; gap: 1px">
${g.bots.map(botRow).join('\n')}
${(g.planned ?? []).map(([n, why, look]) => `<div style="display: flex; align-items: center; gap: 9px; padding: 5px 8px; border-radius: 8px; border: 1px dashed #2A3242; margin: 2px 0 2px 18px">
<span style="opacity: 0.45; display: flex">${pet(n, look[0], look[1], 'sleep', 26)}</span>
<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px">
<span style="font-weight: 600; font-size: 13px; color: #8B93A3">${n}</span>
<span style="font-size: 11px; color: #6B7385; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${why}</span>
</div>
<span style="flex: none; font-size: 10px; font-weight: 600; color: #8B93A3; border: 1px solid #2E3646; border-radius: 999px; padding: 2px 7px">${g.title === 'Access' ? 'Wave 3' : 'Wave 2'}</span>
</div>`).join('\n')}
</div>`, true)
const grouped = new Set(GROUPS.flatMap(g => g.bots.flatMap(n => [n, ...childrenOf(n).map(k => k.name)])))
const MAIN_HELPERS = childrenOf('brain-orchestrator').filter(t => !grouped.has(t.name) && !BOTS[t.name] && !ASKED_BY[t.name])
const TEAM_SIZE = LIVE.filter(t => BOTS[t.name]).length

const worktree = (label, branch) => `<div style="display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px; border-radius: 8px">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B93A3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: none"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-11 8"/></svg>
<span style="flex-grow: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${label}</span>
<span style="flex: none; ${MONO}; font-size: 10px; color: #8B93A3">${branch}</span>
</div>`

const H = 900
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Herdr Bots sidebar</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
details>summary{list-style:none;cursor:pointer;display:block;border-radius:8px}
details>summary::-webkit-details-marker{display:none}
details>summary:hover{background:#151A23}
.chev{flex:none;width:10px;height:10px;opacity:0;transition:opacity .12s,transform .12s;color:#8B93A3}
summary:hover .chev,summary:focus-visible .chev{opacity:1}
details:not([open])>summary .chev{transform:rotate(-90deg)}
</style>
</helmet>
<div style="width: 360px; height: ${H}px; box-sizing: border-box; background: #0E1117; color: #E6EAF0; font-family: Inter, system-ui, sans-serif; font-size: 13px; display: flex; flex-direction: column; border-right: 1px solid #1E2430">

<div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px 16px">
<span style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9AA3B2">Spaces</span>
<button aria-label="New space" style="width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: #9AA3B2; display: flex; align-items: center; justify-content: center; padding: 0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
</div>

<div style="flex-grow: 1; overflow-y: auto; padding: 0 8px; display: flex; flex-direction: column; gap: 1px">

<div style="display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; background: #161B24">
<span style="width: 24px; height: 24px; border-radius: 6px; background: #0891B2; color: #fff; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center">B</span>
<span style="flex-grow: 1; font-weight: 600; font-size: 14px">Brain HQ</span>
<span style="${MONO}; font-size: 11px; color: #8B93A3">dev <span style="color: #FF7A8F">↓506</span></span>
</div>

<details open><summary style="margin-top: 3px; border-radius: 10px"><div style="display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 2px; border-radius: 10px; background: #172030; border: 1px solid #22D3EE40">
${ARROW}
${pet('brain-orchestrator', 'octopus', 'deepseek', 'focus', 30)}
<div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px">
<span style="font-weight: 700; font-size: 14px; color: #22D3EE">brain-orchestrator</span>
<span style="font-size: 11px; color: #8B93A3">Main bot · Claude Opus 5.5 · Brain HQ</span>
</div>
${ICON.claude(16)}
${SPIN}
</div></summary>

<div style="margin: 3px 0 0 22px; border-left: 1px solid #2A3242; padding-left: 7px; display: flex; flex-direction: column; gap: 1px">
${GROUPS.map(groupBlock).join('\n')}
${MAIN_HELPERS.length ? `<div style="margin-top: 6px; border-left: 1px dashed #2E3646; padding-left: 9px">${MAIN_HELPERS.map(helperRow).join('\n')}</div>` : ''}
</div></details>

<div style="margin-top: 10px; display: flex; flex-direction: column; gap: 1px">
${worktree('T1 · components-runtime', 'fix/159-truthful…')}
${worktree('T4 · schema-migrations + proposals', 'fix/209-default…')}
</div>

</div>

<div style="border-top: 1px solid #1E2430; padding: 10px 8px 14px 8px; display: flex; flex-direction: column; gap: 2px">
<button style="font-family: inherit; display: flex; align-items: center; gap: 10px; padding: 10px; border: 0; border-radius: 8px; background: #22D3EE1F; color: #22D3EE; font-size: 13px; font-weight: 600; text-align: left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New bot</button>
</div>

</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":360,"height":${H}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`
writeFileSync(OUT, html)
console.log(OUT, html.length)
