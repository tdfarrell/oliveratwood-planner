// Tools from Brandon Sanderson's craft advice: promise types and progress,
// plot archetypes, his laws of magic, character sliders, ending-first
// outlining, the Avalanche, epigraphs, connections between books, the
// iceberg of worldbuilding, and a foreshadowing pass.
import { h, icon, clear, append, confirmDanger, ask, toast } from './dom.js';
import { uid, numeral, ARCHETYPES, PROMISE_TYPES, PROMISE_SIZES, CONN_KINDS, VISIBILITY, BOOK_KINDS } from './model.js';
import { S, store, P, isSeries, inSeriesTop, change, render, go, href, phref, shref, openCard, cardInfo, bookSeq, readingSeq, cardOptions } from './app.js';
import { chars, units, positions, cardBtn, sel, pageHead, panel, empty, dismissed, dismissBtn, nameOf } from './x-common.js';
import { secretRun } from './x-people.js';

// ---------- Small shared pieces ----------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

const PT = Object.fromEntries(PROMISE_TYPES.map(([v, l, fg, bg]) => [v, { l, fg, bg }]));
const PS = Object.fromEntries(PROMISE_SIZES.map(([v, l, d]) => [v, { l, d }]));
const VIS = Object.fromEntries(VISIBILITY.map(([v, l, d, fg, bg]) => [v, { l, d, fg, bg }]));
const SIZE_N = { small: 1, medium: 2, big: 3 };

export const tag = (text, fg, bg, title) => h('span', { class: 'stag', style: { color: fg, background: bg }, title: title || null }, text);
export const typeTag = (q) => (q.type && PT[q.type] ? tag(PT[q.type].l, PT[q.type].fg, PT[q.type].bg) : null);
const warn = (sev, k, text, ...act) => panel('xwarn xwarn--' + sev, h('span', { class: 'xwarn__k' }, k), h('span', {}, text), act.length ? h('span', { class: 'xwarn__act' }, act) : null);
const okLine = (text) => h('p', { class: 'ok small' }, icon('check'), ' ', text);
const colWord = (b, c) => (c && c.interlude ? 'Interlude' : b.labels.column);
const where = (k) => { const { b } = cardInfo(k); return `${isSeries() ? b.title + ' · ' : ''}${colWord(b, b.columns.find((c) => c.id === k.colId))} ${cardInfo(k).num}`; };
const findCard = (id) => (id ? readingSeq().map(({ k }) => k).find((k) => k.id === id) || null : null);
const sceneSel = (p, value, on, placeholder = 'Pick a scene…', label = 'Scene') => h('select', { class: 'input input--sm', 'aria-label': label, onchange: (e) => on(e.target.value || null) },
  h('option', { value: '' }, placeholder), cardOptions(p, value));
const bar = (pct, color) => h('span', { class: 'xprog__bar' }, h('span', { style: { width: Math.max(0, Math.min(100, pct)) + '%', background: color || null } }));
const bookOnly = (title, what) => h('div', { class: 'wrap wrap--wide x' }, pageHead(title, what),
  empty('Open a book', `${title} works one book at a time.`, h('div', { class: 'xchips' }, S.project.books.map((b) => h('a', { class: 'btn btn--sm', href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}/${S.route.tab}`) }, b.title || 'Untitled book')))));
const stepBtn = (label, on, cls = 'btn btn--sm') => h('button', { class: cls, type: 'button', onclick: on }, label);
const delBtn = (label, on) => h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': label, title: label, onclick: on }, icon('x'));
const ifield = (value, on, attrs = {}) => h('input', { class: 'input input--sm', value: value || '', oninput: (e) => on(e.target.value), ...attrs });

// ======================================================================
// Promises: types, sizes, progress, and the tone check
// ======================================================================

// Which units each promise is made, moved and paid off in.
export function promiseRuns(p = P()) {
  const U = units(p);
  const unitOf = new Map();
  U.forEach((u, i) => u.cards.forEach((k) => unitOf.set(k, i)));
  const out = new Map();
  for (const q of p.questions) {
    const r = { made: null, moved: [], paid: null, madeK: null, paidK: null, lastK: null };
    U.forEach((u, i) => u.cards.forEach((k) => {
      if (k.raises.includes(q.id) && r.made == null) { r.made = i; r.madeK = k; r.lastK = r.lastK || k; }
      if (k.moves.includes(q.id)) { r.moved.push(i); r.lastK = k; }
      if (k.answers.includes(q.id) && r.paid == null) { r.paid = i; r.paidK = k; }
    }));
    out.set(q.id, r);
  }
  return { U, runs: out };
}
const IDLE = 3;
// Units where a promise is open but nothing has touched it for IDLE units.
export function idleUnits(r, n) {
  if (r.made == null) return new Set();
  const end = r.paid == null ? n - 1 : r.paid;
  const touched = new Set([r.made, ...r.moved]);
  const out = new Set();
  let last = r.made;
  for (let i = r.made + 1; i <= end; i++) {
    if (touched.has(i) || i === r.paid) { last = i; continue; }
    if (i - last >= IDLE) out.add(i);
  }
  return out;
}
export function promiseIssues(p = P()) {
  const { U, runs } = promiseRuns(p);
  const out = [];
  for (const q of p.questions) {
    const r = runs.get(q.id);
    if (r.made == null) continue;
    const idle = idleUnits(r, U.length);
    if (idle.size && q.size !== 'small') {
      const key = `pidle:${q.id}`;
      if (!dismissed(key)) out.push({ sev: 'meh', key, k: r.lastK, text: `“${q.text}” sits idle for ${plural(idle.size, U[0] ? U[0].b.labels.column.toLowerCase() : 'part')}`, sub: 'No progress tagged. Give it a step forward, a clue or a setback.' });
    }
    if (q.size === 'big' && r.moved.length < 2 && (r.paid == null ? U.length - r.made : r.paid - r.made) >= 4) {
      const key = `pbig:${q.id}`;
      if (!dismissed(key)) out.push({ sev: 'meh', key, k: r.madeK, text: `“${q.text}” is a big promise but only moves ${plural(r.moved.length, 'time')}`, sub: 'Big promises need visible progress along the way.' });
    }
  }
  const tone = toneCheck(p);
  if (tone && tone.bad) { const key = `ptone:${tone.lateType}`; if (!dismissed(key)) out.push({ sev: 'bad', key, text: `The ending pays off ${PT[tone.lateType].l.toLowerCase()} promises the opening never made`, sub: `Opening: ${tone.openText || 'nothing typed'}`, href: phref('promises') }); }
  return out;
}
// What the opening promises vs. what the ending pays off, by type.
export function toneCheck(p = P()) {
  const { U, runs } = promiseRuns(p);
  if (U.length < 3) return null;
  const third = Math.max(1, Math.round(U.length / 3));
  const open = new Map(), close = new Map();
  for (const q of p.questions) {
    const r = runs.get(q.id);
    if (!q.type) continue;
    const w = SIZE_N[q.size] || 2;
    if (r.made != null && r.made < third) open.set(q.type, (open.get(q.type) || 0) + w);
    if (r.paid != null && r.paid >= U.length - third) close.set(q.type, (close.get(q.type) || 0) + w);
  }
  if (!open.size && !close.size) return null;
  const late = [...close.entries()].sort((a, b) => b[1] - a[1])[0];
  const bad = !!late && !open.has(late[0]);
  const txt = (m) => [...m.entries()].map(([t, n]) => `${PT[t].l} ${n}`).join(' · ');
  return { open, close, third, bad, lateType: late && late[0], openText: txt(open), closeText: txt(close) };
}
export function toneBox(p) {
  const t = toneCheck(p);
  const mix = (m) => h('span', { class: 'mixbar' }, [...m.entries()].map(([ty, n]) => h('span', { title: `${PT[ty].l} ${n}`, style: { flexGrow: String(n), background: PT[ty].fg } })));
  return panel('', h('h2', { class: 'xpanel__t' }, 'Tone check'),
    h('p', { class: 'muted small' }, 'What the opening promises vs. what the ending pays off, by type. Bigger promises count more.'),
    !t ? h('p', { class: 'muted small' }, 'Give your promises a type to check this.') : [
      h('span', { class: 'xlabel' }, `Made in the first ${plural(t.third, units(p)[0].b.labels.column.toLowerCase())}`), t.open.size ? mix(t.open) : h('span', { class: 'muted small' }, 'Nothing typed'), h('span', { class: 'muted small' }, t.openText),
      h('span', { class: 'xlabel' }, `Paid off in the last ${plural(t.third, units(p)[0].b.labels.column.toLowerCase())}`), t.close.size ? mix(t.close) : h('span', { class: 'muted small' }, 'Nothing paid off yet'), h('span', { class: 'muted small' }, t.closeText),
      t.bad ? warn('bad', 'Tone', `The biggest late payoff is ${PT[t.lateType].l.toLowerCase()}, but the opening never promised one. Set it up earlier, or pay off what the opening promised.`) : t.close.size ? okLine('The ending pays off the kinds of promises the opening made.') : null,
    ]);
}

// ======================================================================
// Plot archetypes per thread
// ======================================================================

export function archIssues(b) {
  const out = [];
  const pos = new Map(bookSeq(b).map((k, i) => [k.id, i]));
  for (const r of b.rows) {
    const a = b.arch[r.id];
    if (!a || !a.steps) continue;
    const placed = a.steps.filter((s) => s.cardId && pos.has(s.cardId));
    for (let i = 1; i < placed.length; i++) {
      if (pos.get(placed[i].cardId) < pos.get(placed[i - 1].cardId)) {
        const key = `arch:${r.id}:${placed[i].id}`;
        if (!dismissed(key)) out.push({ key, r, text: `In “${r.title}”, “${placed[i].text}” happens before “${placed[i - 1].text}”.` });
      }
    }
  }
  return out;
}

export function viewArchetypes(p) {
  const blurb = 'Give each thread a shape and tick off its standard steps as scenes deliver them. Edit any list, or build your own.';
  if (inSeriesTop()) return bookOnly('Plot archetypes', blurb);
  const issues = archIssues(p);
  const opts = [['', 'No archetype'], ...Object.entries(ARCHETYPES).map(([v, [l]]) => [v, l])];
  const col = (r) => {
    const a = p.arch[r.id];
    const steps = a ? a.steps : [];
    const done = steps.filter((s) => s.done || s.cardId).length;
    const setType = async (v) => {
      if (a && a.steps.some((s) => s.cardId || s.done) && !(await confirmDanger('Replace the steps?', 'Steps you’ve linked to scenes will be cleared.', 'Replace'))) { render(); return; }
      change(() => { if (!v) delete p.arch[r.id]; else p.arch[r.id] = { type: v, steps: ARCHETYPES[v][1].map((t) => ({ id: uid(), text: t, cardId: null, done: false })) }; });
    };
    return panel('arch', h('div', { class: 'arch__head', style: { '--c': r.color } },
      h('span', { class: 'arch__name' }, h('strong', {}, r.title || 'Untitled'), h('span', { class: 'muted small' }, a ? `${done} of ${steps.length} steps` : 'No shape yet')),
      sel(opts, a ? a.type : '', setType, `Archetype for ${r.title}`)),
    a ? [bar(steps.length ? (done / steps.length) * 100 : 0, r.color),
      h('ol', { class: 'arch__steps' }, steps.map((s, i) => h('li', { class: 'arch__step' + (s.done || s.cardId ? ' is-done' : '') },
        h('input', { type: 'checkbox', checked: !!(s.done || s.cardId), 'aria-label': 'Done', onchange: (e) => change(() => { s.done = e.target.checked; if (!s.done) s.cardId = null; }) }),
        h('div', { class: 'arch__body' },
          ifield(s.text, (v) => change(() => { s.text = v; }, { render: false }), { 'aria-label': 'Step' }),
          h('span', { class: 'arch__where' }, s.cardId && findCard(s.cardId) ? cardBtn(findCard(s.cardId), `${where(findCard(s.cardId))} · ${findCard(s.cardId).title || 'Untitled'}`) : null,
            sceneSel(p, s.cardId, (v) => change(() => { s.cardId = v; if (v) s.done = true; }), s.cardId ? 'Change scene…' : 'Not in a scene yet · pick one', 'Scene for this step'))),
        delBtn('Remove step', () => change(() => { a.steps.splice(i, 1); }))))),
      stepBtn('+ Step', () => change(() => { a.steps.push({ id: uid(), text: '', cardId: null, done: false }); }), 'btn btn--ghost btn--sm')] : h('p', { class: 'muted small' }, 'Pick a shape: mystery, heist, relationship… Each comes with the steps readers expect.'));
  };
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Plot archetypes', blurb),
    p.rows.length ? h('div', { class: 'archgrid' }, p.rows.filter((r) => !r.flash).map(col)) : empty('No threads yet', 'Add threads on the grid first.'),
    issues.map((x) => warn('meh', 'Out of order', x.text + ' Readers expect these steps in order; is the swap on purpose?', dismissBtn(x.key))));
}

// ======================================================================
// Laws of magic
// ======================================================================

const PART_LABEL = { powers: 'Powers', costs: 'Costs', limits: 'Limits', weak: 'Weaknesses', rules: 'Rules' };
const PART_BG = { powers: '#E6EEF8', costs: '#F4E1D6', limits: '#F6EBD9', weak: '#FBEFF2' };
const sysOf = (id) => P().magic.find((m) => m.id === id);
// Every scene that uses or explains magic, in reading order.
function magicRun(m) {
  const explained = new Map(); // rule id → first card that explains it
  const uses = [];
  readingSeq().forEach(({ k }, i) => {
    for (const r of k.explains) if (m.rules.some((x) => x.id === r) && !explained.has(r)) explained.set(r, { k, i });
    for (const u of k.magic) if (u.sys === m.id) uses.push({ u, k, i, missing: (u.relies || []).filter((r) => { const e = explained.get(r); return !e || e.i > i; }) });
  });
  // A rule explained in the same scene it's used counts as explained.
  return { explained, uses };
}
export function magicIssues() {
  const out = [];
  for (const m of P().magic) {
    const { uses } = magicRun(m);
    for (const x of uses) {
      if (!x.u.solves || !x.missing.length) continue;
      const key = `magic:${x.k.id}:${x.u.id}`;
      if (dismissed(key)) continue;
      out.push({ sev: x.u.size === 'small' ? 'meh' : 'bad', key, k: x.k, m, text: `${m.name || 'Magic'} solves a ${x.u.size || 'medium'} problem with a rule the reader hasn’t learned`, sub: `${where(x.k)} · ${x.missing.map((r) => (m.rules.find((y) => y.id === r) || {}).text).join(', ')}` });
    }
    const lim = m.costs.length + m.limits.length + m.weak.length;
    if (m.powers.length > lim && m.powers.length >= 2) { const key = `magiclim:${m.id}`; if (!dismissed(key)) out.push({ sev: 'meh', key, m, text: `${m.name || 'A magic system'} has ${plural(m.powers.length, 'power')} and only ${plural(lim, 'cost or limit', 'costs and limits')}`, sub: 'What can’t it do? Limits are more interesting than powers.', href: phref('magic/' + m.id) }); }
  }
  return out;
}
function usesByPower(m) {
  const { uses } = magicRun(m);
  return m.powers.map((pw) => ({ pw, list: uses.filter((x) => x.u.power === pw.id) }));
}
function thirdLawIssues(m) {
  const n = readingSeq().length || 1;
  const by = usesByPower(m);
  const out = [];
  for (const x of by) {
    if (!x.list.length) continue;
    const first = x.list[0].i / n;
    const thin = by.filter((y) => y !== x && y.list.length && y.list.length < 3 && y.list[0].i < x.list[0].i);
    if (first > 0.6 && thin.length) out.push({ pw: x.pw, k: x.list[0].k, thin });
  }
  return out;
}

export function viewMagic(p, id) {
  const M = p.magic;
  const cur = M.find((m) => m.id === id) || M[0];
  const add = async () => {
    const name = await ask('New magic system', 'Name', '', 'Add');
    if (!name) return;
    const m = { id: uid(), name, notes: '', powers: [], costs: [], limits: [], weak: [], rules: [] };
    change(() => { p.magic.push(m); }, { render: false });
    go(phref('magic/' + m.id).slice(2));
  };
  const blurb = 'Problems solved with magic satisfy when the reader understands the rules; limits are more interesting than powers; explore what you have before adding more.';
  if (!cur) return h('div', { class: 'wrap wrap--wide x' }, pageHead('Magic', blurb),
    empty('No magic systems yet', 'Add a system, then its powers, costs and rules. Tag scenes that use it from the scene card’s “Magic” section.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Magic system')));
  const run = magicRun(cur);
  const upd = (fn, r = false) => change(() => fn(cur), { render: r });
  const list = (part) => h('div', { class: 'mlist', style: { background: PART_BG[part] } },
    h('span', { class: 'xlabel' }, `${PART_LABEL[part]} · ${cur[part].length}`),
    h('ul', {}, cur[part].map((x, i) => h('li', {}, ifield(x.text, (v) => upd((m) => { m[part][i].text = v; }), { 'aria-label': PART_LABEL[part] }),
      delBtn('Remove', async () => { if (part === 'powers' && run.uses.some((u) => u.u.power === x.id) && !(await confirmDanger('Remove this power?', 'Scenes that use it will lose the tag.', 'Remove'))) return; upd((m) => { m[part].splice(i, 1); }, true); })))),
    newRow((t) => upd((m) => { m[part].push({ id: uid(), text: t }); }, true), `Add ${PART_LABEL[part].toLowerCase().replace(/s$/, '')}…`));
  const lim = cur.costs.length + cur.limits.length + cur.weak.length;
  const by = usesByPower(cur);
  const most = Math.max(1, ...by.map((x) => x.list.length));
  const third = thirdLawIssues(cur);
  const big = run.uses.filter((x) => x.u.solves);
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside' }, panel('',
      h('h2', { class: 'xpanel__t' }, 'Systems'),
      M.map((m) => h('a', { class: 'xside__item' + (m === cur ? ' is-on' : ''), href: phref('magic/' + m.id), 'aria-current': m === cur ? 'page' : null },
        h('strong', {}, m.name || 'Unnamed'), h('span', { class: 'muted small' }, `${plural(m.powers.length, 'power')} · ${plural(m.costs.length + m.limits.length + m.weak.length, 'limit')} · ${plural(magicRun(m).uses.length, 'use')}`))),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: add }, icon('plus'), ' Magic system'))),
    h('div', { class: 'xmain' },
      h('div', { class: 'xhead' }, h('div', { class: 'xhead__text' },
        h('input', { class: 'input input--title display', value: cur.name, 'aria-label': 'System name', oninput: (e) => upd((m) => { m.name = e.target.value; }) }),
        h('p', { class: 'muted' }, blurb)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--danger btn--sm', type: 'button', onclick: async () => {
        if (!(await confirmDanger(`Delete ${cur.name || 'this system'}?`, 'Scenes that use it lose their magic tags.'))) return;
        change(() => { p.magic = p.magic.filter((m) => m !== cur); for (const { k } of readingSeq()) { k.magic = k.magic.filter((u) => u.sys !== cur.id); k.explains = k.explains.filter((r) => !cur.rules.some((x) => x.id === r)); } });
        go(phref('magic').slice(2));
      } }, icon('trash'), ' Delete')),
      h('div', { class: 'laws' },
        panel('', h('h2', { class: 'xpanel__t' }, 'Understood before used', tag('First law', '#4E3A72', '#EEE8F6')),
          h('p', { class: 'muted small' }, 'Rules the reader can learn, and the scene where they learn each one. Tag scenes from the card’s “Magic” section.'),
          cur.rules.map((r, i) => { const e = run.explained.get(r.id); return h('div', { class: 'law' + (e ? '' : ' is-bad') },
            h('span', { class: 'law__mark' }, e ? '✓' : '!'),
            h('div', { class: 'law__body' }, ifield(r.text, (v) => upd((m) => { m.rules[i].text = v; }), { 'aria-label': 'Rule' }),
              h('span', { class: 'small' + (e ? ' muted' : ' warn-text') }, e ? ['Explained in ', cardBtn(e.k, `${where(e.k)} · ${e.k.title || 'Untitled'}`)] : 'Not explained in any scene yet'),
              sceneSel(p, '', (v) => { if (v) change(() => { const k = findCard(v); if (k && !k.explains.includes(r.id)) k.explains.push(r.id); }); }, e ? 'Also explained in…' : 'Explain it in…', 'Scene that explains this rule')),
            delBtn('Remove rule', () => upd((m) => { m.rules.splice(i, 1); }, true))); }),
          newRow((t) => upd((m) => { m.rules.push({ id: uid(), text: t }); }, true), 'A rule the reader can learn…'),
          h('span', { class: 'xlabel' }, 'Problems solved with this magic'),
          big.length ? big.map((x) => h('div', { class: 'law' + (x.missing.length ? ' is-bad' : '') },
            h('span', { class: 'law__mark' }, x.missing.length ? '!' : '✓'),
            h('div', { class: 'law__body' }, cardBtn(x.k, `${where(x.k)} · ${x.k.title || 'Untitled'}`),
              h('span', { class: 'small' }, tag(`${PS[x.u.size || 'medium'].l} problem`, 'var(--ink)', 'var(--sheet-2)'), ' ',
                x.missing.length ? h('span', { class: 'warn-text' }, `Relies on: ${x.missing.map((r) => (cur.rules.find((y) => y.id === r) || {}).text || '?').join(', ')}, not yet explained`) : (x.u.relies || []).length ? h('span', { class: 'muted' }, 'Every rule it relies on is known') : h('span', { class: 'muted' }, 'Tag which rules it relies on to check'))))) : h('p', { class: 'muted small' }, 'No scene uses this magic to solve a problem yet.'),
          big.some((x) => x.missing.length && x.u.size === 'big') ? warn('bad', 'Unearned', 'A big problem is solved with a rule the reader hasn’t learned. Explain or hint it earlier, or make the solution cost more.') : null),
        panel('', h('h2', { class: 'xpanel__t' }, 'Limits over powers', tag('Second law', '#4E3A72', '#EEE8F6')),
          h('div', { class: 'mgrid' }, ['powers', 'costs', 'limits', 'weak'].map(list)),
          h('span', {}, `${plural(cur.powers.length, 'power')} · `, h('strong', {}, plural(lim, 'cost, limit or weakness', 'costs, limits and weaknesses')), lim >= cur.powers.length && lim ? ' ✓' : ''),
          cur.powers.length > lim ? warn('meh', 'More powers than limits', 'What can’t it do, and what does it cost? Limits make the clever solutions.') : null,
          M.filter((m) => m !== cur && m.powers.length > m.costs.length + m.limits.length + m.weak.length).map((m) => warn('meh', 'Other systems', [h('strong', {}, m.name || 'Unnamed'), ` has ${plural(m.powers.length, 'power')} and ${plural(m.costs.length + m.limits.length + m.weak.length, 'limit')}.`]))),
        panel('', h('h2', { class: 'xpanel__t' }, 'Expand before adding', tag('Third law', '#4E3A72', '#EEE8F6')),
          h('p', { class: 'muted small' }, 'How much each power is used on the page.'),
          by.length ? by.map((x) => h('div', { class: 'muse' }, h('span', {}, x.pw.text || 'Unnamed power'), bar((x.list.length / most) * 100, x.list.length > 1 ? '#2F6F7E' : 'var(--meh)'), h('span', { class: 'muted small' }, `${x.list.length}×`))) : h('p', { class: 'muted small' }, 'Add powers to see this.'),
          third.map((x) => warn('meh', 'New before explored', [`“${x.pw.text}” first appears late, while `, x.thin.map((y) => `“${y.pw.text}” (${y.list.length}×)`).join(', '), ' is barely used. Could an existing power do this instead?'], cardBtn(x.k, 'Open the scene'))),
          h('span', { class: 'muted small' }, `${plural(M.length, 'system')} · ${plural(M.reduce((a, m) => a + m.powers.length, 0), 'power')} · ${plural(M.reduce((a, m) => a + magicRun(m).uses.length, 0), 'use')}`))),
      panel('', h('h2', { class: 'xpanel__t' }, 'Notes'),
        h('textarea', { class: 'input', rows: 4, value: cur.notes || '', placeholder: 'How it feels, where it comes from, what nobody knows yet…', 'aria-label': 'Notes', oninput: (e) => upd((m) => { m.notes = e.target.value; }) })))));
}
// A one-line "type and press Enter" input.
function newRow(onAdd, placeholder) {
  const inp = h('input', { class: 'input input--sm', placeholder, 'aria-label': placeholder.replace(/…$/, '') });
  const go2 = () => { const t = inp.value.trim(); if (t) onAdd(t); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  return h('div', { class: 'xrow' }, inp, h('button', { class: 'btn btn--sm', type: 'button', onclick: go2 }, 'Add'));
}

// The "Magic" section on a scene card.
export function magicBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    const M = p.magic;
    if (!M.length) { append(box, [h('p', { class: 'muted small' }, 'No magic systems yet. ', h('a', { href: phref('magic') }, 'Add one in World › Magic'), '.')]); return; }
    c.magic.forEach((u, i) => {
      const m = sysOf(u.sys) || M[0];
      const set = (fn) => { upd((cc) => fn(cc.magic[i])); draw(); };
      box.append(h('div', { class: 'muse-card' },
        h('div', { class: 'xbox__row' },
          sel(M.map((x) => [x.id, x.name || 'Unnamed']), m.id, (v) => set((x) => { x.sys = v; x.power = ''; x.relies = []; }), 'System'),
          sel([['', 'Which power?'], ...m.powers.map((x) => [x.id, x.text || 'Unnamed'])], u.power || '', (v) => set((x) => { x.power = v; }), 'Power'),
          h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!u.solves, onchange: (e) => set((x) => { x.solves = e.target.checked; }) }), ' solves a problem'),
          u.solves ? sel(PROMISE_SIZES.map(([v, l]) => [v, `${l} problem`]), u.size || 'medium', (v) => set((x) => { x.size = v; }), 'Problem size') : null,
          delBtn('Remove', () => { upd((cc) => { cc.magic.splice(i, 1); }); draw(); })),
        h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Relies on'),
          (u.relies || []).map((r) => { const rule = m.rules.find((y) => y.id === r); const known = rule && magicRun(m).explained.get(r);
            const kn = !!known && (known.k.id === c.id || (positions().get(known.k) ?? 1e9) <= (positions().get(readingSeq().map((x) => x.k).find((x) => x.id === c.id)) ?? -1));
            return rule ? h('span', { class: 'xchip' + (kn ? '' : ' xchip--bad') }, `${kn ? '✓' : '!'} ${rule.text}`, h('button', { class: 'xchip__x', type: 'button', 'aria-label': 'Remove', onclick: () => set((x) => { x.relies = x.relies.filter((y) => y !== r); }) }, '×')) : null; }),
          m.rules.length ? sel([['', '+ Rule…'], ...m.rules.filter((r) => !(u.relies || []).includes(r.id)).map((r) => [r.id, r.text.slice(0, 60)])], '', (v) => { if (v) set((x) => { x.relies = [...(x.relies || []), v]; }); }, 'Add a rule it relies on')
            : h('span', { class: 'muted small' }, 'Add rules to this system to check them.'))));
    });
    box.append(h('div', { class: 'xbox__row' }, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { upd((cc) => { cc.magic.push({ id: uid(), sys: M[0].id, power: '', solves: false, size: 'medium', relies: [] }); }); draw(); } }, icon('plus'), ' Magic used here')));
    const rules = M.flatMap((m) => m.rules.map((r) => ({ m, r })));
    box.append(h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Explains'),
      c.explains.map((id) => { const x = rules.find((y) => y.r.id === id); return x ? h('span', { class: 'xchip xchip--good' }, x.r.text, h('button', { class: 'xchip__x', type: 'button', 'aria-label': 'Remove', onclick: () => { upd((cc) => { cc.explains = cc.explains.filter((y) => y !== id); }); draw(); } }, '×')) : null; }),
      rules.length ? h('select', { class: 'input input--sm', 'aria-label': 'A rule the reader learns here', onchange: (e) => { const v = e.target.value; if (v) upd((cc) => { if (!cc.explains.includes(v)) cc.explains.push(v); }); draw(); } },
        h('option', { value: '' }, '+ A rule the reader learns here…'),
        M.map((m) => m.rules.length ? h('optgroup', { label: m.name || 'Unnamed' }, m.rules.filter((r) => !c.explains.includes(r.id)).map((r) => h('option', { value: r.id }, r.text.slice(0, 70)))) : null))
        : h('span', { class: 'muted small' }, 'No rules written yet.')));
  };
  draw();
  return box;
}

// ======================================================================
// Character sliders: proactivity, likability, competence, part by part
// ======================================================================

const SLIDERS = [['pro', 'Proactivity', '#C9531A'], ['like', 'Likability', '#2F6F7E'], ['comp', 'Competence', '#7A5C9E']];
// Every part of every book, in reading order (sliders carry across books).
const allCols = () => (isSeries() ? S.project.books : [P()]).flatMap((b) => b.columns.map((c, i) => ({ b, c, i })));
export function sliderAt(e, colId) {
  const order = new Map(allCols().map((x, i) => [x.c.id, i]));
  const at = order.get(colId) ?? Infinity;
  let v = { pro: 50, like: 50, comp: 50 }, set = false;
  for (const s of [...e.sliders].sort((a, b) => (order.get(a.colId) ?? 1e9) - (order.get(b.colId) ?? 1e9))) {
    if ((order.get(s.colId) ?? 1e9) > at) break;
    v = { pro: s.pro, like: s.like, comp: s.comp }; set = true;
  }
  return { ...v, set };
}
export function sliderIssues() {
  const out = [];
  for (const e of chars()) {
    if (e.sliders.length < 3) continue;
    for (const [key, label] of SLIDERS) {
      const vals = e.sliders.map((s) => s[key]);
      if (Math.max(...vals) === Math.min(...vals)) { const dk = `slider:${e.id}:${key}`; if (!dismissed(dk)) out.push({ key: dk, e, label }); }
    }
  }
  return out;
}

export function viewSliders(p) {
  const cs = chars();
  if (!cs.length) return h('div', { class: 'wrap wrap--wide x' }, pageHead('Sliders', ''), empty('No characters yet', 'Add characters first.'));
  const who = cs.find((e) => e.id === S.sliderWho) || cs.find((e) => e.sliders.length) || cs[0];
  const U = units(p);
  const vals = U.map((u) => ({ u, v: sliderAt(who, u.c.id), own: who.sliders.find((s) => s.colId === u.c.id) }));
  const W = 900, H = 200;
  const x = (i) => (U.length > 1 ? (i / (U.length - 1)) * W : W / 2);
  const chart = h('div', { class: 'sl-chart' });
  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Sliders through the story">
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#D5DDE0" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
    ${SLIDERS.map(([k, , c]) => `<polyline points="${vals.map((r, i) => `${x(i).toFixed(1)},${((1 - r.v[k] / 100) * H).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="3" vector-effect="non-scaling-stroke"/>`).join('')}
  </svg>`;
  const first = vals[0]?.v, last = vals[vals.length - 1]?.v;
  const setVal = (u, key, value) => change(() => {
    let s = who.sliders.find((x) => x.colId === u.c.id);
    if (!s) { const cur = sliderAt(who, u.c.id); s = { colId: u.c.id, pro: cur.pro, like: cur.like, comp: cur.comp, note: '' }; who.sliders.push(s); }
    s[key] = value;
  }, { render: false });
  const flat = sliderIssues().filter((x) => x.e === who);
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead(who.name || 'Unnamed', 'Proactivity, likability and competence, part by part. Readers forgive low competence when likability or proactivity is high; a visible climb is the payoff.',
      sel(cs.map((e) => [e.id, e.name || 'Unnamed']), who.id, (v) => { S.sliderWho = v; render(); }, 'Character', 'input input--auto')),
    h('div', { class: 'slgrid' },
      panel('', h('h2', { class: 'xpanel__t' }, 'Start and end'),
        first ? SLIDERS.map(([k, l, c]) => h('div', { class: 'sl-se' },
          h('span', { class: 'sl-se__h' }, h('i', { style: { background: c } }), h('strong', {}, l), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${first[k]} → ${last[k]}`)),
          h('span', { class: 'sl-se__track' }, h('span', { class: 'sl-se__start', title: 'Start', style: { left: first[k] + '%', '--c': c } }), h('span', { class: 'sl-se__end', title: 'End', style: { left: last[k] + '%', '--c': c } })),
          h('span', { class: 'muted small' }, 'Low · start ○ · end ● · High'))) : null,
        flat.map((x) => warn('meh', 'Flat', `${x.label} never moves for ${who.name}. On purpose?`, dismissBtn(x.key)))),
      panel('', h('h2', { class: 'xpanel__t' }, 'The shape'), chart,
        h('div', { class: 'xlegend' }, SLIDERS.map(([, l, c]) => h('span', {}, h('i', { class: 'sl-key', style: { background: c } }), l))),
        h('div', { class: 'sltable' },
          h('span', { class: 'xlabel' }, U[0] ? U[0].b.labels.column : 'Part'), SLIDERS.map(([, l]) => h('span', { class: 'xlabel' }, l)), h('span', {}),
          vals.map(({ u, v, own }) => [
            h('span', { class: 'sltable__u' + (own ? ' is-set' : '') }, u.long, own ? null : h('span', { class: 'muted small' }, ' (same as before)')),
            SLIDERS.map(([k, l, c]) => h('label', { class: 'slr', style: { '--c': c } },
              h('input', { type: 'range', min: 0, max: 100, step: 5, value: v[k], 'aria-label': `${l} in ${u.long}`, oninput: (e) => { setVal(u, k, +e.target.value); e.target.nextSibling.textContent = e.target.value; }, onchange: () => render() }),
              h('span', { class: 'slr__n' }, String(v[k])))),
            own ? delBtn(`Clear ${u.long} (carry over from before)`, () => change(() => { who.sliders = who.sliders.filter((s) => s !== own); })) : h('span', {}),
          ])))));
}

// ======================================================================
// Ending first
// ======================================================================

export function endingIssues(b) {
  const out = [];
  const pos = new Map(bookSeq(b).map((k, i) => [k.id, i]));
  const colI = new Map(b.columns.map((c, i) => [c.id, i]));
  for (const beat of b.ending) {
    const bi = colI.get(beat.colId);
    if (bi == null) continue;
    for (const n of beat.needs) {
      const k = n.cardId && findCard(n.cardId);
      if (!k || cardInfo(k).b !== b) continue;
      if (colI.get(k.colId) >= bi) { const key = `end:${n.id}`; if (!dismissed(key)) out.push({ key, k, beat, n, text: `“${n.text}” is only planted in the climax’s own ${b.labels.column.toLowerCase()} or later` }); }
    }
  }
  void pos;
  return out;
}

export function viewEnding(p) {
  const blurb = 'Write the climax beats first, then list what must be true before each one can happen. Those are the setups to plant earlier.';
  if (inSeriesTop()) return bookOnly('Ending first', blurb);
  const E = p.ending;
  const needs = E.flatMap((b) => b.needs);
  const planted = needs.filter((n) => n.cardId && findCard(n.cardId));
  const issues = endingIssues(p);
  const lastCol = [...p.columns].reverse().find((c) => !c.interlude) || p.columns[p.columns.length - 1];
  const addBeat = () => change(() => { p.ending.push({ id: uid(), text: '', colId: lastCol ? lastCol.id : null, needs: [] }); });
  const colOpts = [['', 'No part yet'], ...p.columns.map((c, i) => [c.id, `${colWord(p, c)} ${numeral(p, i)}${c.title ? ': ' + c.title : ''}`])];
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Ending first', blurb, h('button', { class: 'btn btn--primary', type: 'button', onclick: addBeat }, icon('plus'), ' Climax beat')),
    h('div', { class: 'xcols' },
      h('div', { class: 'xcols__main' },
        E.length ? E.map((beat, bi) => panel('efb',
          h('div', { class: 'efb__head' },
            h('span', { class: 'efb__num' }, h('span', {}, String(bi + 1))),
            h('div', { class: 'efb__t' },
              h('input', { class: 'input efb__text', value: beat.text, placeholder: 'What happens at the climax', 'aria-label': 'Climax beat', oninput: (e) => change(() => { beat.text = e.target.value; }, { render: false }) }),
              h('span', { class: 'xrow' }, h('span', { class: 'muted small' }, 'Happens in'), sel(colOpts, beat.colId || '', (v) => change(() => { beat.colId = v || null; }), 'Part'))),
            h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Move up', disabled: bi === 0, onclick: () => change(() => { E.splice(bi - 1, 0, E.splice(bi, 1)[0]); }) }, icon('up')),
            delBtn('Delete beat', async () => { if (beat.needs.length && !(await confirmDanger('Delete this beat?', 'Its list of setups goes too.'))) return; change(() => { E.splice(bi, 1); }); })),
          h('span', { class: 'xlabel' }, 'Must be true before this happens'),
          beat.needs.map((n, ni) => { const k = n.cardId && findCard(n.cardId); return h('div', { class: 'law' + (k ? ' is-ok' : ' is-todo') },
            h('span', { class: 'law__mark' }, k ? '✓' : ''),
            h('div', { class: 'law__body' }, ifield(n.text, (v) => change(() => { n.text = v; }, { render: false }), { 'aria-label': 'Must be true', placeholder: 'The reader knows…' }),
              k ? h('span', { class: 'small muted' }, 'Planted in ', cardBtn(k, `${where(k)} · ${k.title || 'Untitled'}`)) : h('span', { class: 'small accent-text' }, `Not planted yet · best before ${beat.colId ? colOpts.find(([v]) => v === beat.colId)?.[1] : 'the climax'}`),
              sceneSel(p, n.cardId, (v) => change(() => { n.cardId = v; }), k ? 'Move to…' : 'Plant it in…', 'Scene that plants this')),
            delBtn('Remove', () => change(() => { beat.needs.splice(ni, 1); }))); }),
          newRow((t) => change(() => { beat.needs.push({ id: uid(), text: t, cardId: null }); }), 'Something that must be true…'))) :
          empty('Start at the end', 'Write the moments your climax is built on: the choice, the reveal, the sacrifice. Then list what the reader must already know for each to land.', h('button', { class: 'btn btn--primary', type: 'button', onclick: addBeat }, icon('plus'), ' Climax beat'))),
      h('aside', { class: 'xcols__side' }, panel('',
        h('h2', { class: 'xpanel__t' }, 'Setups to plant'),
        h('span', { class: 'big-n' }, `${planted.length} of ${needs.length} planted`), bar(needs.length ? (planted.length / needs.length) * 100 : 0),
        h('p', { class: 'muted small' }, 'Each “must be true” is a setup. Plant it in an earlier scene; the Foreshadowing pass in Revisions lists them too.'),
        needs.length > planted.length ? [h('span', { class: 'xlabel' }, 'Still to plant'), h('ul', { class: 'xlist' }, needs.filter((n) => !planted.includes(n)).map((n) => h('li', {}, n.text || 'Untitled')))] : needs.length ? okLine('Everything the ending needs is planted.') : null,
        issues.map((x) => warn('meh', 'Too late', `${x.text}. Plant it earlier so the reader has it in time.`, cardBtn(x.k, 'Open the scene'), dismissBtn(x.key)))))));
}

// ======================================================================
// The Avalanche
// ======================================================================

const WINDOWS = [['last', 'Last part'], ['two', 'Last two parts'], ['ten', 'Last 10 scenes']];
const isPayoff = (k) => k.payoff || k.answers.length > 0;
function avalanche(b) {
  const U = b.columns.map((c, i) => ({ c, i, cards: bookSeq(b).filter((k) => k.colId === c.id) }));
  const seq = bookSeq(b);
  const n = U.length;
  const w = b.aval.window;
  // The window starts at the last (or second-to-last) real part; interludes don't count.
  const real = b.columns.map((c, i) => (c.interlude ? -1 : i)).filter((i) => i >= 0);
  const startCol = real.length ? real[Math.max(0, real.length - (w === 'two' ? 2 : 1))] : Math.max(0, n - 1);
  const inWin = (k) => {
    if (w === 'ten') return seq.indexOf(k) >= seq.length - 10;
    return b.columns.findIndex((c) => c.id === k.colId) >= startCol;
  };
  const frac = (k) => { const ci = b.columns.findIndex((c) => c.id === k.colId); const u = U[ci]; const j = u.cards.indexOf(k); return (ci + (j + 1) / (u.cards.length + 1)) / Math.max(1, n); };
  const threads = b.rows.filter((r) => !r.flash).map((r) => {
    const pays = seq.filter((k) => k.rowId === r.id && isPayoff(k));
    return { r, pays, last: pays[pays.length - 1] || null, inside: pays.some(inWin) };
  });
  const firstIn = seq.find(inWin);
  const winStart = w === 'ten' ? (firstIn ? frac(firstIn) - 0.01 : 1) : startCol / Math.max(1, n);
  return { U, threads, frac, inWin, startCol, winStart: Math.max(0, winStart) };
}
export function avalancheIssues(b) {
  if (!b.columns.length || !b.cards.some(isPayoff)) return [];
  const { threads } = avalanche(b);
  return threads.filter((t) => t.pays.length && !t.inside).map((t) => ({ key: `aval:${t.r.id}`, t, text: `“${t.r.title}” resolves outside the climax`, k: t.last })).filter((x) => !dismissed(x.key));
}
export function viewAvalanche(p) {
  const blurb = 'Where each thread pays off. A strong ending piles the payoffs up close together, so each one lands on top of the last.';
  if (inSeriesTop()) return bookOnly('Avalanche', blurb);
  const A = avalanche(p);
  const counts = A.U.map((u) => u.cards.filter(isPayoff).length);
  const most = Math.max(1, ...counts);
  const issues = avalancheIssues(p);
  const withPay = A.threads.filter((t) => t.pays.length);
  const tight = withPay.filter((t) => t.inside).length;
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Avalanche', blurb, h('label', { class: 'xinline' }, 'Climax window', sel(WINDOWS, p.aval.window, (v) => change(() => { p.aval.window = v; }), 'Climax window'))),
    !p.cards.some(isPayoff) ? empty('No payoffs tagged yet', 'A scene is a payoff when it pays off a promise (the card’s “Promises” section), or when you tick “This scene is a payoff for its thread”.') :
    [panel('aval',
      h('div', { class: 'aval__row aval__row--head' }, h('span', {}), h('div', { class: 'aval__lane' }, A.U.map((u) => h('span', { class: 'aval__part', style: { left: (u.i / A.U.length) * 100 + '%' } }, `${u.c.interlude ? 'Int.' : p.labels.column} ${numeral(p, u.i)}`)))),
      h('div', { class: 'aval__body', style: { '--winf': String(A.winStart) } },
        A.threads.map((t) => h('div', { class: 'aval__row' + (t.pays.length && !t.inside ? ' is-out' : '') },
          h('span', { class: 'aval__name', style: { '--c': t.r.color } }, t.r.title || 'Untitled'),
          h('div', { class: 'aval__lane' }, t.pays.map((k) => h('button', { class: 'aval__dot', type: 'button', title: `${where(k)} · ${k.title || 'Untitled'}`, 'aria-label': `${k.title || 'Untitled'}, ${where(k)}`, style: { left: (A.frac(k) * 100) + '%', background: t.r.color }, onclick: () => openCard(k.id) })),
            t.pays.length ? h('span', { class: 'aval__lab', style: { left: `calc(${A.frac(t.last) * 100}% + 12px)` } }, t.last.title || 'Untitled') : h('span', { class: 'muted small aval__none' }, 'No payoff yet')))),
        h('span', { class: 'aval__win', 'aria-hidden': 'true' })),
      h('div', { class: 'aval__row' }, h('span', { class: 'muted small' }, 'Payoffs per part'),
        h('div', { class: 'aval__hist' }, counts.map((n, i) => h('div', {}, h('span', { style: { height: (n / most) * 70 + 'px', background: i >= A.startCol && p.aval.window !== 'ten' ? 'var(--accent)' : '#E79A73' } }), h('span', { class: 'muted small' }, String(n))))))),
    h('div', { class: 'xcards xcards--3' },
      issues.map((x) => warn('bad', 'Out of the avalanche', `${x.text}. Move its payoff later, or give it a beat in the climax.`, cardBtn(x.k, 'Open the last payoff'), dismissBtn(x.key))),
      withPay.length ? (tight === withPay.length ? warn('ok', 'Tight', `All ${plural(withPay.length, 'thread')} pay off inside the climax window. That’s the avalanche working.`) : warn('meh', 'So far', `${tight} of ${withPay.length} ${withPay.length === 1 ? 'thread pays' : 'threads pay'} off inside the climax window.`)) : null,
      A.threads.filter((t) => !t.pays.length).length ? warn('meh', 'No payoff', `${A.threads.filter((t) => !t.pays.length).map((t) => t.r.title).join(', ')}: nothing pays off yet.`) : null)]);
}

// ======================================================================
// Epigraphs
// ======================================================================

// Where the reader first learns a secret: the first scene that reveals it to the reader.
function readerLearns(s) {
  const ev = secretRun(s).events.find((x) => x.who === 'reader' && (x.how === 'learns' || x.how === 'suspects'));
  return ev ? ev.k : null;
}
const colRank = (b, c) => { const books = isSeries() ? S.project.books : [P()]; return books.indexOf(b) * 10000 + b.columns.indexOf(c); };
export function epigraphIssues(b) {
  const out = [];
  for (const c of b.columns) {
    if (!c.epi || !c.epi.reveals.length || c.epi.clue) continue;
    for (const sid of c.epi.reveals) {
      const s = P().secrets.find((x) => x.id === sid);
      if (!s) continue;
      const k = readerLearns(s);
      const kr = k ? colRank(cardInfo(k).b, cardInfo(k).b.columns.find((x) => x.id === k.colId)) : Infinity;
      if (kr > colRank(b, c)) { const key = `epi:${c.id}:${sid}`; if (!dismissed(key)) out.push({ key, c, s, k, text: k ? `The epigraph of ${b.labels.column} ${numeral(b, b.columns.indexOf(c))} gives away “${s.name}” before ${where(k)}` : `The epigraph of ${b.labels.column} ${numeral(b, b.columns.indexOf(c))} reveals “${s.name}”, which the story never reveals` }); }
    }
  }
  return out;
}
export function viewEpigraphs(p) {
  const blurb = 'In-world documents at the head of each part: a ledger, a letter, a primer. Each is checked for what it reveals before the story does.';
  if (inSeriesTop()) return bookOnly('Epigraphs', blurb);
  const issues = epigraphIssues(p);
  const srcNames = [...new Set([...p.entities.map((e) => e.name).filter(Boolean), ...p.columns.map((c) => c.epi.src).filter(Boolean)])];
  const dl = h('datalist', { id: 'epi-src' }, srcNames.map((n) => h('option', { value: n })));
  return h('div', { class: 'wrap wrap--wide x' }, pageHead('Epigraphs', blurb), dl,
    panel('epis', p.columns.map((c, i) => {
      if (!c.epi) c.epi = { text: '', src: '', where: '', reveals: [], clue: false };
      const e = c.epi;
      const bad = issues.filter((x) => x.c === c);
      return h('div', { class: 'epi' + (c.interlude ? ' is-interlude' : '') },
        h('span', { class: 'epi__part' }, `${colWord(p, c)} ${numeral(p, i)}`, c.title ? h('span', { class: 'muted small' }, c.title) : null),
        h('div', { class: 'epi__main' },
          h('textarea', { class: 'input epi__text', rows: 2, value: e.text, placeholder: '“A line from an in-world document…”', 'aria-label': `Epigraph for ${p.labels.column} ${numeral(p, i)}`, oninput: (ev) => change(() => { e.text = ev.target.value; }, { render: false }) }),
          h('span', { class: 'xrow small' }, 'From',
            h('input', { class: 'input input--sm', list: 'epi-src', value: e.src, placeholder: 'The Warden’s Ledger', 'aria-label': 'Source document', oninput: (ev) => change(() => { e.src = ev.target.value; }, { render: false }) }),
            h('input', { class: 'input input--sm', value: e.where, placeholder: 'entry 14', 'aria-label': 'Where in the source', oninput: (ev) => change(() => { e.where = ev.target.value; }, { render: false }) })),
          bad.map((x) => h('span', { class: 'small warn-text' }, '! ', x.text, '. ', h('button', { class: 'linkbtn', type: 'button', onclick: () => change(() => { e.clue = true; }) }, 'It’s a clue on purpose')))),
        h('div', { class: 'epi__rev' }, h('span', { class: 'xlabel' }, 'Reveals'),
          e.reveals.map((sid) => { const s = p.secrets.find((x) => x.id === sid); return s ? h('span', { class: 'xchip' + (bad.some((x) => x.s === s) ? ' xchip--bad' : '') }, s.name, h('button', { class: 'xchip__x', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { e.reveals = e.reveals.filter((x) => x !== sid); }) }, '×')) : null; }),
          p.secrets.length ? sel([['', e.reveals.length ? '+ Secret…' : 'Nothing (mood only) · + Secret…'], ...p.secrets.filter((s) => !e.reveals.includes(s.id)).map((s) => [s.id, s.name])], '', (v) => { if (v) change(() => { e.reveals.push(v); }); }, 'Add a secret it reveals')
            : h('span', { class: 'muted small' }, 'Add secrets in Checks › Secrets to check reveals.'),
          e.clue && e.reveals.length ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: true, onchange: (ev) => change(() => { e.clue = ev.target.checked; }) }), ' A clue on purpose') : null));
    })));
}

// ======================================================================
// Connections: between books of a series, and between your series
// ======================================================================

const BK = Object.fromEntries(BOOK_KINDS);
function connEnd(series, end, onSet, label) {
  const b = series.books.find((x) => x.id === end.bookId);
  return h('div', { class: 'conn__end' },
    h('select', { class: 'input input--sm', 'aria-label': `${label}: book`, onchange: (e) => onSet({ bookId: e.target.value || null, cardId: null }) },
      h('option', { value: '' }, 'Which book?'), series.books.map((x) => h('option', { value: x.id, selected: x.id === end.bookId }, `${x.title || 'Untitled'} · ${BK[x.bookKind] || 'Main series'}`))),
    b ? h('select', { class: 'input input--sm', 'aria-label': `${label}: scene`, onchange: (e) => onSet({ cardId: e.target.value || null }) },
      h('option', { value: '' }, 'Anywhere in the book'),
      b.columns.map((c, i) => { const cs = b.cards.filter((k) => k.colId === c.id); return cs.length ? h('optgroup', { label: `${b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}` }, cs.map((k) => h('option', { value: k.id, selected: k.id === end.cardId }, k.title || 'Untitled scene'))) : null; })) : null,
    h('input', { class: 'input input--sm', value: end.detail || '', placeholder: 'Detail (optional)', 'aria-label': `${label}: detail`, oninput: (e) => onSet({ detail: e.target.value }, false) }));
}
const visPill = (v) => tag(VIS[v].l, VIS[v].fg, VIS[v].bg, VIS[v].d);
const legend = () => h('div', { class: 'xlegend' }, VISIBILITY.map(([v, , d]) => h('span', {}, visPill(v), d)));

export function connIssues(series) {
  const out = [];
  for (const c of series.conns || []) {
    if (c.a.bookId && c.a.bookId === c.b.bookId) { const key = `conn:${c.id}:same`; if (!dismissed(key)) out.push({ key, c, text: `“${c.name || 'A connection'}” links a book to itself` }); }
    const ba = series.books.find((x) => x.id === c.a.bookId), bb = series.books.find((x) => x.id === c.b.bookId);
    if (ba && bb && ba.groupId === bb.groupId && ba.bookKind === 'main' && bb.bookKind === 'main' && c.vis === 'explicit') { const key = `conn:${c.id}:line`; if (!dismissed(key)) out.push({ key, c, text: `“${c.name || 'A connection'}” is explicit between two main books of the same line; that’s the story itself, not a crossover` }); }
  }
  return out;
}

export function viewConns(p) {
  const series = S.project;
  const C = series.conns;
  const upd = (c, fn, r = true) => change(() => fn(c), { render: r });
  const add = () => change(() => { C.push({ id: uid(), name: '', kind: 'cameo', a: { bookId: S.bookId || series.books[0]?.id || null, cardId: null, detail: '' }, b: { bookId: null, cardId: null, detail: '' }, vis: 'fans', notes: '' }); });
  const book = S.bookId ? p : null;
  const shown = book ? C.filter((c) => c.a.bookId === book.id || c.b.bookId === book.id) : C;
  const issues = connIssues(series);
  const inv = C.filter((c) => c.vis === 'invisible').length;
  const kinds = series.books.reduce((m, b) => m.set(b.bookKind, (m.get(b.bookKind) || 0) + 1), new Map());
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Connections', 'Links between the books of this series that aren’t the same storyline: a standalone, a novella or a short story touching the main books. Cameos, shared items, phrases, the same event seen twice.',
      h('a', { class: 'btn btn--ghost btn--sm', href: href('connections') }, 'Between your series'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Connection')),
    h('div', { class: 'xbar' }, legend(), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, [...kinds.entries()].map(([k, n]) => plural(n, (BK[k] || 'Main series').toLowerCase().replace(/^main series$/, 'main book'))).join(' · '), ' · ', h('a', { href: shref('books') }, 'Set book kinds'))),
    book ? h('p', { class: 'muted small' }, `Showing connections that touch ${book.title}. `, h('a', { href: shref('conns') }, 'Show all')) : null,
    shown.length ? panel('conns', shown.map((c) => h('div', { class: 'conn' },
      h('div', { class: 'conn__top' },
        h('input', { class: 'input conn__name', value: c.name, placeholder: 'The ferryman’s coin', 'aria-label': 'What', oninput: (e) => upd(c, (x) => { x.name = e.target.value; }, false) }),
        sel(CONN_KINDS, c.kind, (v) => upd(c, (x) => { x.kind = v; }), 'Kind'),
        sel(VISIBILITY.map(([v, l]) => [v, l]), c.vis, (v) => upd(c, (x) => { x.vis = v; }), 'How visible'),
        visPill(c.vis),
        delBtn('Delete connection', async () => { if (await confirmDanger('Delete this connection?', '')) change(() => { series.conns = series.conns.filter((x) => x !== c); }); })),
      h('div', { class: 'conn__ends' },
        h('span', { class: 'xlabel' }, 'Appears in'), connEnd(series, c.a, (v, r) => upd(c, (x) => Object.assign(x.a, v), r !== false), 'Appears in'),
        h('span', { class: 'xlabel' }, 'Connects to'), connEnd(series, c.b, (v, r) => upd(c, (x) => Object.assign(x.b, v), r !== false), 'Connects to')),
      h('input', { class: 'input input--sm', value: c.notes, placeholder: 'Notes: what fans might notice, when it pays off…', 'aria-label': 'Notes', oninput: (e) => upd(c, (x) => { x.notes = e.target.value; }, false) })))) :
      empty('No connections yet', 'Link a side story to the main books: a character who wanders through, an item that changes hands, a line only rereaders catch.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Connection')),
    h('div', { class: 'xcards xcards--3' },
      issues.map((x) => warn('meh', 'Check', x.text + '.', dismissBtn(x.key))),
      inv ? warn('ok', 'Only you know', `${plural(inv, 'connection is', 'connections are')} invisible to readers. Listed here so you don’t forget them.`) : null));
}

// Connections on a scene card (read-only list).
export function connsOn(k) {
  if (!isSeries()) return [];
  return (S.project.conns || []).filter((c) => c.a.cardId === k.id || c.b.cardId === k.id);
}

// ---------- Between series: one list per person, like the idea inbox ----------

const L = { list: [], rev: null, loaded: false, timer: null, projects: [] };
function saveLinks() {
  clearTimeout(L.timer);
  L.timer = setTimeout(async () => {
    try { L.rev = await store.saveLinks(L.list, L.rev); }
    catch (e) {
      if (e.status === 409) {
        try { const r = await store.links(); const mine = new Map(L.list.map((x) => [x.id, x])); for (const x of r.links || []) if (!mine.has(x.id)) L.list.push(x); L.rev = r.rev; L.rev = await store.saveLinks(L.list, L.rev); }
        catch (e2) { toast('Couldn’t save connections: ' + e2.message); }
      } else toast('Couldn’t save connections: ' + e.message);
    }
  }, 500);
}
export async function viewCrossovers(root) {
  document.title = 'Connections · Planner';
  try {
    const [r, list] = await Promise.all([store.links(), store.list()]);
    L.list = Array.isArray(r.links) ? r.links : []; L.rev = r.rev || null; L.projects = list;
  } catch (e) { if (e.kind === 'auth') { go(''); return; } toast(e.message); }
  const draw = () => {
    const ed = (c, fn, redraw = false) => { fn(c); saveLinks(); if (redraw) draw(); };
    const end = (c, which, label) => h('div', { class: 'conn__end' },
      h('select', { class: 'input input--sm', 'aria-label': `${label}: series or project`, onchange: (e) => ed(c, (x) => { x[which].slug = e.target.value; }) },
        h('option', { value: '' }, 'Which series or project?'),
        h('option', { value: '*', selected: c[which].slug === '*' }, 'Every series'),
        L.projects.map((pr) => h('option', { value: pr.slug, selected: pr.slug === c[which].slug }, `${pr.title}${pr.kind === 'series' ? ' (series)' : ''}`))),
      h('input', { class: 'input input--sm', value: c[which].detail || '', placeholder: 'Book, part, scene…', 'aria-label': `${label}: where`, oninput: (e) => ed(c, (x) => { x[which].detail = e.target.value; }) }));
    const inv = L.list.filter((c) => c.vis === 'invisible').length;
    const page = h('div', { class: 'page' },
      h('header', { class: 'top top--home' }, h('a', { class: 'brand', href: href('') }, h('span', { class: 'brand__mark' }, 'OA'), h('span', { class: 'brand__name' }, 'Planner')), h('span', { class: 'spacer' }),
        h('a', { class: 'btn btn--ghost btn--sm', href: href('') }, icon('left'), ' All projects')),
      h('main', { class: 'wrap wrap--wide x' },
        pageHead('Connections between your series', 'Easter eggs and crossovers across everything you write: a world-hopper, an artifact that turns up elsewhere, a phrase only rereaders catch. For links between books of one series, use World › Connections inside it.',
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { L.list.unshift({ id: uid(), name: '', kind: 'cameo', a: { slug: '', detail: '' }, b: { slug: '', detail: '' }, vis: 'fans', notes: '' }); saveLinks(); draw(); } }, icon('plus'), ' Connection')),
        legend(),
        L.list.length ? panel('conns', L.list.map((c, i) => h('div', { class: 'conn' },
          h('div', { class: 'conn__top' },
            h('input', { class: 'input conn__name', value: c.name, placeholder: 'The gardener', 'aria-label': 'What', oninput: (e) => ed(c, (x) => { x.name = e.target.value; }) }),
            sel(CONN_KINDS, c.kind, (v) => ed(c, (x) => { x.kind = v; }, true), 'Kind'),
            sel(VISIBILITY.map(([v, l]) => [v, l]), c.vis, (v) => ed(c, (x) => { x.vis = v; }, true), 'How visible'),
            visPill(c.vis),
            delBtn('Delete connection', async () => { if (await confirmDanger('Delete this connection?', '')) { L.list.splice(i, 1); saveLinks(); draw(); } })),
          h('div', { class: 'conn__ends' }, h('span', { class: 'xlabel' }, 'Appears in'), end(c, 'a', 'Appears in'), h('span', { class: 'xlabel' }, 'Connects to'), end(c, 'b', 'Connects to')),
          h('input', { class: 'input input--sm', value: c.notes || '', placeholder: 'Notes', 'aria-label': 'Notes', oninput: (e) => ed(c, (x) => { x.notes = e.target.value; }) })))) :
          empty('No connections yet', 'Add the threads that tie your series together, even the ones only you will ever see.'),
        inv ? warn('ok', 'Only you know', `${plural(inv, 'connection is', 'connections are')} invisible to readers.`) : null));
    clear(root).append(page);
  };
  draw();
}

// ======================================================================
// Iceberg: what's on the page vs. what lives in your notes
// ======================================================================

const PLANS = [['keep', 'Keep hidden'], ['later', 'Reveal later']];
const escRe = (w) => w.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const textOf = (k) => [k.title, k.summary, k.notes].filter(Boolean).join(' \n ');
export function icebergLeaks(e) {
  const out = [];
  for (const f of e.facts) {
    if (f.cardId) continue;
    const words = String(f.words || '').split(',').map((w) => w.trim()).filter((w) => w.length > 1);
    if (!words.length) continue;
    for (const { k } of readingSeq()) {
      const t = textOf(k).toLowerCase();
      const hit = words.find((w) => new RegExp(`(^|[^\\p{L}])${escRe(w.toLowerCase())}($|[^\\p{L}])`, 'u').test(t));
      if (hit) { const key = `leak:${f.id}:${k.id}`; if (!dismissed(key)) out.push({ key, e, f, k, w: hit }); }
    }
  }
  return out;
}
export const allLeaks = () => P().entities.flatMap(icebergLeaks);

export function icebergEditor(p, e) {
  const shown = e.facts.filter((f) => f.cardId && findCard(f.cardId));
  const hidden = e.facts.filter((f) => !shown.includes(f));
  const leaks = icebergLeaks(e);
  const upd = (fn, r = true) => change(() => fn(), { render: r });
  const fact = (f, under) => h('div', { class: 'fact' + (under ? ' fact--under' : '') },
    h('input', { class: 'input input--sm fact__text', value: f.text, 'aria-label': 'Fact', oninput: (ev) => upd(() => { f.text = ev.target.value; }, false) }),
    h('div', { class: 'fact__meta' },
      under ? [h('label', { class: 'fact__f' }, h('span', {}, 'Plan'), sel(PLANS, f.plan || 'keep', (v) => upd(() => { f.plan = v; }), 'Plan')),
        f.plan === 'later' ? h('label', { class: 'fact__f' }, h('span', {}, 'When'), h('input', { class: 'input input--sm', value: f.when || '', placeholder: 'Book 2', 'aria-label': 'When to reveal', oninput: (ev) => upd(() => { f.when = ev.target.value; }, false) })) : null,
        h('label', { class: 'fact__f fact__f--grow' }, h('span', {}, 'Give-away words'), h('input', { class: 'input input--sm', value: f.words || '', placeholder: 'Aurel, first grafter', title: 'Comma-separated; the planner flags scenes that use them', 'aria-label': 'Words that would give it away', oninput: (ev) => upd(() => { f.words = ev.target.value; }, false), onchange: () => render() }))]
        : h('span', { class: 'small' }, 'Shown in ', cardBtn(findCard(f.cardId), `${where(findCard(f.cardId))} · ${findCard(f.cardId).title || 'Untitled'}`)),
      h('label', { class: 'fact__f' }, h('span', {}, under ? 'Shown in' : 'Move'), sceneSel(p, f.cardId, (v) => upd(() => { f.cardId = v; }), under ? 'Not yet' : 'Move…', 'Scene that shows this')),
      delBtn('Remove fact', () => upd(() => { e.facts = e.facts.filter((x) => x !== f); }))));
  const tot = e.facts.length || 1;
  const berg = h('div', { class: 'berg', role: 'img', 'aria-label': `${shown.length} facts on the page, ${hidden.length} in your notes only` });
  berg.innerHTML = `<svg viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="400" height="80" fill="#EAF2F4"/><rect x="0" y="80" width="400" height="180" fill="#5C8F98"/>
    <path d="M${200 - 20 - 50 * shown.length / tot} 80 L200 ${80 - 20 - 45 * shown.length / tot} L${200 + 20 + 50 * shown.length / tot} 80 Z" fill="#FBFBF8" stroke="#A9B6BB"/>
    <path d="M${150 - 40 * hidden.length / tot} 80 L${250 + 40 * hidden.length / tot} 80 L${300 + 60 * hidden.length / tot} ${140 + 40 * hidden.length / tot} L250 ${170 + 80 * hidden.length / tot} L140 ${165 + 80 * hidden.length / tot} L${90 - 50 * hidden.length / tot} ${140 + 30 * hidden.length / tot} Z" fill="#3E6E78" opacity="0.9"/></svg>`;
  append(berg, [h('span', { class: 'berg__top' }, `On the page · ${shown.length}`), h('span', { class: 'berg__low' }, `In your notes only · ${hidden.length}`)]);
  return h('div', { class: 'berggrid' },
    panel('', h('h2', { class: 'xpanel__t' }, e.name || 'Unnamed'), berg,
      h('p', { class: 'muted small' }, 'Shown facts are tied to the scene that shows them. Everything else is below the waterline, on purpose.')),
    h('div', { class: 'xmain' },
      panel('', h('h2', { class: 'xpanel__t' }, 'On the page'), shown.length ? shown.map((f) => fact(f, false)) : h('p', { class: 'muted small' }, 'Nothing tied to a scene yet.')),
      h('section', { class: 'xpanel under' }, h('h2', { class: 'xpanel__t' }, 'Below the surface'),
        hidden.map((f) => fact(f, true)),
        newRow((t) => upd(() => { e.facts.push({ id: uid(), text: t, cardId: null, plan: 'keep', when: '', words: '' }); }), 'Something true that readers don’t see…')),
      leaks.map((x) => warn('bad', 'Leak', [`“${x.f.text}” may show up in ${where(x.k)}: it uses “${x.w}”.`], cardBtn(x.k, 'Open the scene'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { x.f.cardId = x.k.id; }) }, 'It’s shown there now'), dismissBtn(x.key)))));
}

export function viewIceberg(p, id) {
  const typ = S.icebergType || '';
  const list = p.entities.filter((e) => !typ || e.typeId === typ).sort((a, b) => b.facts.length - a.facts.length || (a.name || '').localeCompare(b.name || ''));
  const cur = p.entities.find((e) => e.id === id) || list.find((e) => e.facts.length) || list[0];
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Iceberg', 'For each entry, what readers have seen on the page and what only lives in your notes. The depth stays hidden on purpose, and you’ll hear about it if it leaks.'),
    !p.entities.length ? empty('No entries yet', 'Add characters, places or factions first.') :
    h('div', { class: 'xsplit' },
      h('aside', { class: 'xside' }, panel('',
        sel([['', 'All entries'], ...p.types.map((t) => [t.id, t.name])], typ, (v) => { S.icebergType = v; render(); }, 'Show entries of type'),
        h('div', { class: 'berglist' }, list.slice(0, 80).map((e) => { const sh = e.facts.filter((f) => f.cardId).length, hi = e.facts.length - sh;
          return h('a', { class: 'xside__item xside__item--row' + (e === cur ? ' is-on' : ''), href: phref('iceberg/' + e.id), 'aria-current': e === cur ? 'page' : null },
            h('span', { class: 'berglist__t' }, h('strong', {}, e.name || 'Unnamed'), h('span', { class: 'muted small' }, e.facts.length ? `${sh} shown · ${hi} hidden` : 'No facts yet')),
            e.facts.length ? h('span', { class: 'bergmini' }, h('span', { style: { flexGrow: String(sh || 0.0001) } }), h('span', { style: { flexGrow: String(hi || 0.0001) } })) : null); })))),
      cur ? icebergEditor(p, cur) : null));
}

// ======================================================================
// Foreshadowing pass
// ======================================================================

export function foreshadowRows(p) {
  const seq = readingSeq().map(({ k }) => k);
  const pos = new Map(seq.map((k, i) => [k, i]));
  const mine = inSeriesTop() ? seq : bookSeq(p);
  const out = [];
  for (const k of mine.filter(isPayoff)) {
    const i = pos.get(k);
    const qs = k.answers;
    const setups = seq.slice(0, i).filter((x) => x.raises.some((q) => qs.includes(q)) || x.moves.some((q) => qs.includes(q)) || (x.setup && x.payoffId === k.id));
    const flagged = seq.slice(0, i).filter((x) => x.flags.some((f) => f.for === k.id));
    const ids = new Set(k.entityIds);
    const cands = ids.size ? seq.slice(Math.max(0, i - 400), i).filter((x) => !setups.includes(x)).map((x) => ({ x, shared: x.entityIds.filter((e) => ids.has(e)) })).filter((c) => c.shared.length)
      .sort((a, b) => b.shared.length - a.shared.length || pos.get(a.x) - pos.get(b.x)).slice(0, 4).sort((a, b) => pos.get(a.x) - pos.get(b.x)) : [];
    const qText = qs.map((id) => (P().questions.find((q) => q.id === id) || {}).text).filter(Boolean);
    out.push({ k, setups, flagged, cands, label: k.title || 'Untitled scene', sub: qText.length ? `Pays off: ${qText.join(' · ')}` : 'Thread payoff' });
  }
  for (const beat of (inSeriesTop() ? S.project.books : [p]).flatMap((b) => b.ending)) {
    const planted = beat.needs.filter((n) => n.cardId && findCard(n.cardId));
    out.push({ beat, setups: planted.map((n) => findCard(n.cardId)), flagged: [], cands: [], todo: beat.needs.filter((n) => !planted.includes(n)), label: beat.text || 'Climax beat', sub: 'From Ending first' });
  }
  return out;
}
export function foreshadowView(p) {
  const rows = foreshadowRows(p);
  const good = rows.filter((r) => r.setups.length >= 2).length;
  const none = rows.filter((r) => !r.setups.length);
  const plant = (r, x) => change(() => { x.flags.push({ id: uid(), text: `Set up: ${r.label}`, kind: 'foreshadow', done: false, must: false, for: r.k.id, created: new Date().toISOString() }); });
  return h('div', { class: 'xcols' },
    h('div', { class: 'xcols__main' }, rows.length ? rows.map((r) => {
      const n = r.setups.length;
      return panel('fsh', h('div', { class: 'fsh__head' },
        h('div', {}, r.k ? cardBtn(r.k, `${r.label} (${where(r.k)})`) : h('strong', {}, r.label), h('br'), h('span', { class: 'muted small' }, r.sub)),
        h('span', { class: 'spacer' }),
        tag(plural(n, 'setup'), n === 0 ? 'var(--bad)' : n === 1 ? 'var(--meh)' : 'var(--ok)', n === 0 ? 'var(--bad-soft)' : n === 1 ? '#F6EBD9' : 'var(--good-soft)')),
      r.setups.length ? h('div', { class: 'xchips' }, r.setups.map((x) => h('span', { class: 'xchip xchip--good' }, '✓ ', cardBtn(x, `${where(x)} · ${x.title || 'Untitled'}`)))) : null,
      r.todo && r.todo.length ? [h('span', { class: 'xlabel' }, 'Still to plant'), h('ul', { class: 'xlist' }, r.todo.map((nn) => h('li', {}, nn.text || 'Untitled'))), h('a', { class: 'small', href: phref('ending') }, 'Plant them in Ending first')] : null,
      r.cands.length ? [h('span', { class: 'xlabel' }, 'Earlier scenes where a setup could go'),
        r.cands.map(({ x, shared }) => { const done = r.flagged.includes(x); return h('div', { class: 'fsh__cand' },
          h('span', {}, cardBtn(x, `${where(x)} · ${x.title || 'Untitled'}`), h('br'), h('span', { class: 'muted small' }, `Shares ${shared.map(nameOf).join(', ')}`)),
          done ? tag('Flagged ✓', 'var(--ok)', 'var(--good-soft)') : h('button', { class: 'btn btn--sm', type: 'button', onclick: () => plant(r, x), title: 'Adds a foreshadowing flag to that scene' }, 'Plant here')); })]
        : r.k && !r.setups.length ? h('p', { class: 'muted small' }, 'Tag characters and places on this scene to get suggestions.') : null);
    }) : empty('No payoffs yet', 'Payoffs come from scenes that pay off a promise, scenes ticked as a thread payoff, and climax beats in Ending first.')),
    h('aside', { class: 'xcols__side' }, panel('',
      h('h2', { class: 'xpanel__t' }, 'Payoffs'),
      h('p', { class: 'small' }, 'From promises paid off, thread payoffs and climax beats.'),
      bar(rows.length ? (good / rows.length) * 100 : 0, 'var(--meh)'), h('span', { class: 'muted small' }, `${good} of ${plural(rows.length, 'payoff')} has two or more setups.`.replace('payoffs has', 'payoffs have')),
      none.length ? warn('bad', 'Unforeshadowed', `${none.slice(0, 3).map((r) => `“${r.label}”`).join(', ')}${none.length > 3 ? ` and ${none.length - 3} more` : ''} ${none.length === 1 ? 'has' : 'have'} no setup at all.`) : rows.length ? okLine('Every payoff has at least one setup.') : null)));
}

// ======================================================================
// Everything above, for the Checks tab
// ======================================================================

export function sandersonChecks(p, push) {
  const books = inSeriesTop() ? S.project.books : isSeries() ? [p] : [p];
  const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
  safe(() => magicIssues().forEach((x) => push({ group: 'Magic', sev: x.sev, key: x.key, text: x.text, sub: x.sub, k: x.k, href: x.href })));
  safe(() => promiseIssues(p).forEach((x) => push({ group: 'Promises', sev: x.sev, key: x.key, text: x.text, sub: x.sub, k: x.k, href: x.href })));
  safe(() => books.forEach((b) => avalancheIssues(b).forEach((x) => push({ group: 'Avalanche', sev: 'meh', key: x.key, text: x.text, sub: inSeriesTop() ? b.title : 'Its last payoff is before the climax window', k: x.k }))));
  safe(() => books.forEach((b) => archIssues(b).forEach((x) => push({ group: 'Archetypes', sev: 'meh', key: x.key, text: x.text, sub: inSeriesTop() ? b.title : '', href: inSeriesTop() ? null : phref('arch') }))));
  safe(() => books.forEach((b) => endingIssues(b).forEach((x) => push({ group: 'Ending first', sev: 'meh', key: x.key, text: x.text, sub: where(x.k), k: x.k }))));
  safe(() => books.forEach((b) => epigraphIssues(b).forEach((x) => push({ group: 'Epigraphs', sev: 'bad', key: x.key, text: x.text, sub: 'Mark it as a clue if it’s on purpose', href: inSeriesTop() ? null : phref('epigraphs') }))));
  safe(() => allLeaks().forEach((x) => push({ group: 'Iceberg', sev: 'bad', key: x.key, text: `“${x.f.text}” may leak in a scene`, sub: `${x.e.name} · ${where(x.k)} uses “${x.w}”`, k: x.k })));
  if (isSeries()) safe(() => connIssues(S.project).forEach((x) => push({ group: 'Connections', sev: 'meh', key: x.key, text: x.text, href: phref('conns') })));
}

export { SLIDERS, isPayoff };
