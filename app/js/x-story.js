// Story structure: promises, what-if branches, the braid, revision flags and
// passes, the scene checklist, and the extra sections on scene cards.
import { h, icon, clear, append, choose, confirmDanger, ask, toast, autosize } from './dom.js';
import { uid, numeral, partLabel, FLAG_KINDS } from './model.js';
import { S, P, isSeries, inSeriesTop, change, render, go, phref, pbase, openCard, cardInfo, bookSeq, plural, editCard, gameOn } from './app.js';
import { units, positions, cardBtn, seg, sel, pageHead, panel, empty, dismissed, dismissBtn, chars } from './x-common.js';
import { revealsBox, relsBox, arcsBox } from './x-people.js';
import { questsBox } from './x-game.js';
import { clipsPanel } from './x-world.js';
import { promiseRuns, idleUnits, promiseIssues, toneBox, magicBox, connsOn, foreshadowView } from './x-sanderson.js';
import { PROMISE_TYPES, PROMISE_SIZES } from './model.js';

// ======================================================================
// Promises: questions raised for the reader, and where they’re answered
// ======================================================================

const SCOPES = [['series', 'Series'], ['book', 'Book'], ['part', 'Part']];
const SCOPE_C = { series: '#7A5C9E', book: '#8A3410', part: '#2F6F7E' };

// Where each question is raised and answered, in reading order.
export function questionSpans() {
  const pos = positions();
  const out = new Map();
  for (const q of P().questions) out.set(q.id, { r: null, a: null, rk: null, ak: null });
  for (const [k, i] of pos) {
    for (const id of k.raises || []) { const x = out.get(id); if (x && (x.r == null || i < x.r)) { x.r = i; x.rk = k; } }
    for (const id of k.answers || []) { const x = out.get(id); if (x && (x.a == null || i < x.a)) { x.a = i; x.ak = k; } }
  }
  return { pos, spans: out };
}

// Parts that end with nothing left open for the reader.
export function endingProblems(p = P()) {
  const Q = p.questions;
  if (!Q.length) return [];
  const { pos, spans } = questionSpans();
  return units(p).filter((u) => u.cards.length).map((u) => {
    const end = pos.get(u.cards[u.cards.length - 1]);
    const open = Q.filter((q) => { const s = spans.get(q.id); return s.r != null && s.r <= end && (s.a == null || s.a > end); });
    return { u, open, last: u.cards[u.cards.length - 1] };
  });
}

export function viewPromises(p) {
  const Q = p.questions;
  const U = units(p);
  const { pos, spans } = questionSpans();
  const scopePos = U.flatMap((u) => u.cards.map((k) => pos.get(k)));
  const firstPos = scopePos.length ? Math.min(...scopePos) : 0, lastPos = scopePos.length ? Math.max(...scopePos) : 0;
  const unitOf = new Map();
  U.forEach((u, i) => u.cards.forEach((k) => unitOf.set(k, i)));
  const inScope = Q.filter((q) => { const s = spans.get(q.id); return unitOf.has(s.rk) || unitOf.has(s.ak) || (s.r == null && s.a == null); });
  const elsewhere = Q.filter((q) => !inScope.includes(q));
  const where = (k) => (k ? `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).part}` : null);
  const { runs } = promiseRuns(p);
  const issues = promiseIssues(p).filter((x) => !x.key.startsWith('ptone'));

  const text = h('input', { class: 'input', placeholder: 'A promise: a question the reader will want answered', 'aria-label': 'New promise' });
  let scope = 'book', ptype = '', psize = 'medium';
  const add = () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return; }
    change(() => { p.questions.push({ id: uid(), text: t, scope, type: ptype, size: psize }); });
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const ends = endingProblems(p);

  const row = (q) => {
    const s = spans.get(q.id);
    const ri = unitOf.has(s.rk) ? unitOf.get(s.rk) : null;
    const ai = unitOf.has(s.ak) ? unitOf.get(s.ak) : null;
    const startI = ri ?? (s.r != null && s.r < firstPos ? 0 : null);
    const endI = ai ?? (s.r != null && (s.a == null || s.a > lastPos) ? U.length - 1 : null);
    const stillOpen = s.a == null || s.a > lastPos;
    return [
      h('div', { class: 'pq__q' },
        h('input', { class: 'pq__text', value: q.text, 'aria-label': 'Question', oninput: (e) => change(() => { q.text = e.target.value; }, { render: false }) }),
        h('div', { class: 'pq__meta' },
          sel([['', 'Type…'], ...PROMISE_TYPES.map(([v, l]) => [v, l])], q.type || '', (v) => change(() => { q.type = v; }), 'Type', 'pq__scope pq__type' + (q.type ? ' pt-' + q.type : '')),
          sel(PROMISE_SIZES.map(([v, l, d]) => [v, `${d} ${l}`]), q.size || 'medium', (v) => change(() => { q.size = v; }), 'Size', 'pq__scope'),
          sel(SCOPES, q.scope, (v) => change(() => { q.scope = v; }), 'Scope', 'pq__scope'),
          h('span', { class: 'muted small' }, s.r == null ? 'Not made yet' : `Made in ${where(s.rk)}`, s.a == null ? (s.r == null ? '' : ' · still open') : ` · paid off in ${where(s.ak)}`),
          h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Delete question', onclick: async () => {
            if (!(await confirmDanger('Delete this question?', 'Scenes that raise or answer it lose the tag.'))) return;
            change(() => { p.questions = p.questions.filter((x) => x !== q); for (const { k } of allCards()) { k.raises = k.raises.filter((x) => x !== q.id); k.answers = k.answers.filter((x) => x !== q.id); k.moves = k.moves.filter((x) => x !== q.id); } });
          } }, icon('x')))),
      (() => { const run = runs.get(q.id); const idle = run ? idleUnits(run, U.length) : new Set(); return U.map((u, i) => {
        const on = startI != null && endI != null && i >= startI && i <= endI && !(ri != null && ri === ai);
        const moved = run && run.moved.includes(i);
        return h('div', { class: 'pq__cell' + (idle.has(i) ? ' is-idle' : ''), title: i === ri ? 'Made here' : i === ai ? 'Paid off here' : moved ? 'Progress here' : idle.has(i) ? 'Sitting idle' : '' },
          on ? h('span', { class: 'pq__bar' + (stillOpen ? ' is-open' : ''), style: { left: i === ri ? '50%' : '0', right: i === ai ? '50%' : '0' } }) : null,
          moved && i !== ri && i !== ai ? h('span', { class: 'pq__dot pq__dot--move' }) : null,
          i === ri ? h('span', { class: 'pq__dot pq__dot--raise' }) : null,
          i === ai ? h('span', { class: 'pq__dot pq__dot--answer' }) : null);
      }); })(),
    ];
  };

  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Promises, progress, payoff', 'Each promise has a type and a size. Scenes make it, move it forward, or pay it off; the planner watches for promises that stall, and for an ending that pays off different promises than the opening made. Tag scenes from the card’s “Promises” section.'),
    panel('pq-add', text, sel([['', 'Type…'], ...PROMISE_TYPES.map(([v, l]) => [v, l])], ptype, (v) => { ptype = v; }, 'Type'), sel(PROMISE_SIZES.map(([v, l, d]) => [v, `${d} ${l}`]), psize, (v) => { psize = v; }, 'Size'), sel(SCOPES, scope, (v) => { scope = v; }, 'Scope'), h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Promise')),
    h('div', { class: 'xcols' },
      h('div', { class: 'xcols__main' },
        inScope.length ? panel('pq', h('div', { class: 'pq__grid', style: { gridTemplateColumns: `minmax(260px, 2.2fr) repeat(${U.length}, minmax(40px, 1fr))` } },
          h('span', { class: 'pq__h' }, 'Question'), U.map((u) => h('span', { class: 'pq__colh', title: u.long }, u.label)),
          inScope.map(row)),
        h('div', { class: 'xlegend' },
          h('span', {}, h('i', { class: 'pq__dot pq__dot--raise' }), 'Made'), h('span', {}, h('i', { class: 'pq__dot pq__dot--move' }), 'Progress'), h('span', {}, h('i', { class: 'pq__dot pq__dot--answer' }), 'Paid off'), h('span', {}, h('i', { class: 'pq__swatch is-idle' }), 'Sitting idle'),
          h('span', {}, h('i', { class: 'pq__swatch is-open' }), 'Open: the reader is waiting')))
          : empty('No questions yet', 'Add the questions your story makes readers ask: who sent the letter, will she get home, what is the orchard taking. Then tag the scenes that raise and answer them.'),
        elsewhere.length ? panel('', h('h2', { class: 'xpanel__t' }, 'Raised and answered in other books'),
          h('ul', { class: 'xlist' }, elsewhere.map((q) => { const s = spans.get(q.id); return h('li', {}, h('span', {}, q.text), h('span', { class: 'muted small' }, `${where(s.rk) || 'not raised'} → ${where(s.ak) || 'open'}`)); }))) : null),
      h('aside', { class: 'xcols__side' }, toneBox(p),
        issues.map((x) => panel('xwarn xwarn--meh', h('span', { class: 'xwarn__k' }, x.key.startsWith('pidle') ? 'Sitting idle' : 'Too small?'), h('span', {}, x.text + '. ' + x.sub),
          h('span', { class: 'xwarn__act' }, x.k ? cardBtn(x.k, 'Open the last scene that touched it') : null, dismissBtn(x.key)))),
        panel('',
        h('h2', { class: 'xpanel__t' }, 'Installment endings'),
        h('p', { class: 'muted small' }, 'For a serial: does each part end with a question still open?'),
        !Q.length ? h('p', { class: 'muted small' }, 'Add questions to check this.') : ends.map(({ u, open, last }) => h('div', { class: 'pend' + (open.length ? '' : ' is-bad') },
          h('span', { class: 'pend__mark' }, open.length ? '✓' : '!'),
          h('div', {}, h('strong', {}, u.long), h('br'),
            h('span', { class: 'small' }, 'ends on ', cardBtn(last, `“${last.title || 'Untitled scene'}”`)), h('br'),
            h('span', { class: 'small ' + (open.length ? 'muted' : 'warn-text') }, open.length ? `Leaves open: ${open.slice(0, 2).map((q) => q.text).join(' · ')}${open.length > 2 ? ` +${open.length - 2}` : ''}` : 'Nothing is left hanging here. Readers may not click Next.'))))))));
}

const allCards = () => (isSeries() ? S.project.books.flatMap((b) => b.cards.map((k) => ({ k, b }))) : P().cards.map((k) => ({ k, b: P() })));

function promisesBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    const Q = p.questions;
    const line = (key, label) => h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, label),
      c[key].map((id) => { const q = Q.find((x) => x.id === id); return q ? h('span', { class: 'xchip' }, q.text, h('button', { class: 'xchip__x', type: 'button', 'aria-label': 'Remove', onclick: () => { upd((cc) => { cc[key] = cc[key].filter((x) => x !== id); }); draw(); } }, '×')) : null; }),
      h('select', { class: 'input input--sm', 'aria-label': label, onchange: async (e) => {
        let v = e.target.value;
        if (v === '__new') { const t = await ask('New question', 'The question the reader will ask', '', 'Add'); if (!t) { draw(); return; } v = uid(); change(() => { Q.push({ id: v, text: t, scope: 'book' }); }, { render: false }); }
        if (v) upd((cc) => { if (!cc[key].includes(v)) cc[key].push(v); });
        draw();
      } }, h('option', { value: '' }, '+ Promise…'), Q.filter((q) => !c[key].includes(q.id)).map((q) => h('option', { value: q.id }, q.text.slice(0, 70))), h('option', { value: '__new' }, 'New promise…')));
    append(box, [line('raises', 'Makes'), line('moves', 'Moves'), line('answers', 'Pays off'),
      h('p', { class: 'muted small' }, '“Moves” is progress: a clue, a step closer, a setback. Promises that go a long time without any get flagged.'),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!c.payoff, onchange: (e) => { upd((cc) => { cc.payoff = e.target.checked; }); } }), ' This scene is a payoff for its thread (for the Avalanche)')]);
  };
  draw();
  return box;
}

// ======================================================================
// What-if branches
// ======================================================================

const BRANCH_OWN = ['columns', 'rows', 'cards', 'acts', 'labels', 'cardFields'];
const copyGrid = (b) => JSON.parse(JSON.stringify(Object.fromEntries(BRANCH_OWN.map((k) => [k, b[k]]))));
const realBook = (p) => p.__book || p;

function diff(real, data) {
  const R = new Map(real.cards.map((k) => [k.id, k]));
  const D = new Map(data.cards.map((k) => [k.id, k]));
  const tag = {};
  for (const [id, k] of D) {
    const o = R.get(id);
    if (!o) tag[id] = 'new';
    else if (o.colId !== k.colId || o.rowId !== k.rowId || o.seq !== k.seq) tag[id] = 'moved';
    else if (o.title !== k.title || o.summary !== k.summary || o.status !== k.status) tag[id] = 'rewritten';
  }
  const cut = real.cards.filter((k) => !D.has(k.id));
  const counts = { new: 0, moved: 0, rewritten: 0, cut: cut.length };
  for (const v of Object.values(tag)) counts[v]++;
  return { tag, cut, counts, n: counts.new + counts.moved + counts.rewritten + counts.cut };
}
const diffText = (c) => [c.new && `${c.new} new`, c.moved && `${c.moved} moved`, c.rewritten && `${c.rewritten} rewritten`, c.cut && `${c.cut} cut`].filter(Boolean).join(' · ') || 'No changes yet';

export function viewWhatifs(p) {
  if (inSeriesTop()) return h('div', { class: 'wrap x' }, empty('What-ifs live in each book', 'Open a book to try a different order or ending for it.'));
  const book = realBook(p);
  const name = h('input', { class: 'input', placeholder: 'What if… (e.g. Corvin dies in Part IV)', 'aria-label': 'Name the what-if' });
  const create = () => {
    const n = name.value.trim() || 'Untitled what-if';
    const id = uid();
    change(() => { book.branches.push({ id, name: n, created: new Date().toISOString(), data: copyGrid(book) }); }, { render: false });
    go(pbase('whatif/' + id));
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  return h('div', { class: 'wrap x' },
    pageHead('What-ifs', 'Copy the grid into a sandbox and try a different order or ending. The real book isn’t touched until you keep a what-if.'),
    panel('pq-add', name, h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, icon('plus'), ' Start a what-if')),
    book.branches.length ? h('div', { class: 'wif-list' }, book.branches.map((br) => {
      const d = diff(book, br.data);
      return panel('wif', h('div', { class: 'wif__text' },
        h('a', { class: 'wif__name', href: phref('whatif/' + br.id) }, br.name),
        h('span', { class: 'muted small' }, `Started ${new Date(br.created).toLocaleDateString()} · ${diffText(d.counts)}`)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => compareDialog(book, br) }, 'Compare'),
      h('a', { class: 'btn btn--sm', href: phref('whatif/' + br.id) }, 'Open'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Throw away', title: 'Throw away', onclick: () => throwAway(book, br) }, icon('trash')));
    })) : h('p', { class: 'muted' }, 'No what-ifs yet.'));
}

async function throwAway(book, br, back = false) {
  if (!(await confirmDanger(`Throw away “${br.name}”?`, 'The real book stays as it is. The backups keep the what-if for a while.', 'Throw away'))) return;
  change(() => { book.branches = book.branches.filter((x) => x !== br); }, { render: !back });
  if (back) go(pbase('whatif'));
}

async function keep(book, br) {
  const d = diff(book, br.data);
  if (!(await choose({ title: `Keep “${br.name}”?`, message: `The book’s grid is replaced with this version (${diffText(d.counts)}). The current version is saved as a what-if called “Before ${br.name}”, so you can go back.`,
    choices: [{ label: 'Cancel', value: false }, { label: 'Keep this version', value: true, kind: 'primary' }] }))) return;
  change(() => {
    book.branches.push({ id: uid(), name: `Before ${br.name}`, created: new Date().toISOString(), data: copyGrid(book) });
    const data = JSON.parse(JSON.stringify(br.data));
    for (const k of BRANCH_OWN) book[k] = data[k];
    book.branches = book.branches.filter((x) => x !== br);
  }, { render: false });
  S.branchId = null;
  go(pbase());
  toast(`Kept “${br.name}”`);
}

export function branchBanner(p) {
  const book = realBook(p);
  const br = book.branches.find((x) => x.id === S.branchId);
  if (!br) return h('div', { class: 'wrap' }, empty('That what-if is gone', 'It was kept or thrown away.', h('a', { class: 'btn', href: phref('whatif') }, 'All what-ifs')));
  const d = diff(book, br.data);
  return h('div', { class: 'wif-banner' },
    h('span', { class: 'wif-banner__tag' }, 'What-if'),
    h('input', { class: 'wif-banner__name', value: br.name, 'aria-label': 'What-if name', oninput: (e) => change(() => { br.name = e.target.value; }, { render: false }) }),
    h('span', { class: 'wif-banner__meta' }, `${diffText(d.counts)}. The real book isn’t touched until you keep it.`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn--sm wif-banner__btn', type: 'button', onclick: () => compareDialog(book, br) }, 'Compare'),
    h('button', { class: 'btn btn--sm wif-banner__btn', type: 'button', onclick: () => throwAway(book, br, true) }, 'Throw away'),
    h('a', { class: 'btn btn--sm wif-banner__btn', href: phref() }, 'Back to the real book'),
    h('button', { class: 'btn btn--sm wif-banner__keep', type: 'button', onclick: () => keep(book, br) }, 'Keep this version…'));
}

function compareDialog(book, br) {
  const d = diff(book, br.data);
  const side = (title, src, isBranch) => h('section', { class: 'cmp__side' + (isBranch ? ' is-branch' : '') }, h('h3', { class: 'cmp__t' }, title),
    src.columns.map((c, i) => {
      const seq = bookSeq(src).filter((k) => k.colId === c.id);
      const cutHere = isBranch ? d.cut.filter((k) => k.colId === c.id) : [];
      return h('div', { class: 'cmp__part' }, h('div', { class: 'cmp__ph' }, `${partLabel(src, i)}${c.title ? ': ' + c.title : ''}`),
        seq.map((k) => { const t = isBranch ? d.tag[k.id] : null; return h('div', { class: 'cmp__card' + (t ? ' is-' + t : '') }, h('span', {}, k.title || 'Untitled scene'), t ? h('span', { class: 'cmp__tag' }, t) : null); }),
        cutHere.map((k) => h('div', { class: 'cmp__card is-cut' }, h('span', {}, k.title || 'Untitled scene'), h('span', { class: 'cmp__tag' }, 'cut'))));
    }));
  const beatsLost = (book.flow?.beats || []).filter((b) => book.cards.some((k) => k.beatId === b.id) && !br.data.cards.some((k) => k.beatId === b.id));
  const dl = h('dialog', { class: 'dlg dlg--wide' });
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, `Compare: ${br.name}`), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))),
    h('div', { class: 'dlg__body' },
      h('p', { class: 'muted' }, diffText(d.counts)),
      beatsLost.length ? h('p', { class: 'banner' }, icon('alert'), `Beats that would lose their scenes: ${beatsLost.map((b) => b.name).join(', ')}`) : null,
      h('div', { class: 'cmp' }, side('The real book', book, false), side('What-if', br.data, true)))]);
  dl.addEventListener('close', () => dl.remove());
  document.body.append(dl);
  dl.showModal();
}

// ======================================================================
// Braid: how the threads hand off, scene by scene
// ======================================================================

export function braidIssues(p) {
  const seq = bookSeq(p);
  const out = [];
  let i = 0;
  while (i < seq.length) {
    let j = i;
    while (j + 1 < seq.length && seq[j + 1].rowId === seq[i].rowId) j++;
    const len = j - i + 1;
    if (len > p.braid.run && p.rows.length > 1) {
      const key = `braid:run:${seq[i].id}`;
      if (!dismissed(key)) out.push({ kind: 'run', key, i, j, rowId: seq[i].rowId, len, text: `${len} ${(p.rows.find((r) => r.id === seq[i].rowId) || {}).title || 'thread'} scenes in a row`, k: seq[i] });
    }
    i = j + 1;
  }
  for (const r of p.rows) {
    const at = seq.map((k, n) => (k.rowId === r.id ? n : -1)).filter((n) => n >= 0);
    for (let n = 1; n < at.length; n++) {
      const gap = at[n] - at[n - 1] - 1;
      const key = `braid:gap:${r.id}:${seq[at[n]].id}`;
      if (gap > p.braid.gap && !dismissed(key)) out.push({ kind: 'gap', key, i: at[n - 1] + 1, j: at[n] - 1, rowId: r.id, len: gap, text: `${r.title} is away for ${gap} scenes`, k: seq[at[n]] });
    }
  }
  return out;
}

export function viewBraid(p) {
  if (inSeriesTop()) return h('div', { class: 'wrap x' }, empty('The braid is per book', 'Open a book to see how its threads hand off.'));
  const seq = bookSeq(p);
  if (!seq.length) return h('div', { class: 'wrap x' }, empty('No scenes yet', 'Add scene cards on the grid; they appear here in reading order.'));
  const W = 54, RH = 64, TOP = 34;
  const rowI = new Map(p.rows.map((r, i) => [r.id, i]));
  const cy = (rid) => TOP + (rowI.get(rid) ?? 0) * RH + RH / 2;
  const width = seq.length * W;
  const issues = braidIssues(p);
  const parts = [];
  seq.forEach((k, i) => { if (!i || k.colId !== seq[i - 1].colId) parts.push({ i, c: p.columns.find((c) => c.id === k.colId) }); });
  const lay = h('div', { class: 'braid', style: { width: width + 'px', height: TOP + p.rows.length * RH + 'px' } });
  parts.forEach((x, n) => {
    const end = n + 1 < parts.length ? parts[n + 1].i : seq.length;
    const ci = p.columns.indexOf(x.c);
    lay.append(h('span', { class: 'braid__part', style: { left: x.i * W + 'px', width: (end - x.i) * W + 'px' } }, `${partLabel(p, ci)}`));
  });
  for (const is of issues) {
    lay.append(h('span', { class: 'braid__flag braid__flag--' + is.kind, title: is.text, style: { left: is.i * W + 2 + 'px', width: (is.j - is.i + 1) * W - 4 + 'px', top: cy(is.rowId) - 26 + 'px' } }));
  }
  seq.forEach((k, i) => {
    const r = p.rows.find((x) => x.id === k.rowId) || {};
    lay.append(h('span', { class: 'braid__seg', style: { left: i * W + 4 + 'px', top: cy(k.rowId) - 3 + 'px', width: W - 8 + 'px', background: r.color } }));
    if (i && seq[i - 1].rowId !== k.rowId) {
      const a = cy(seq[i - 1].rowId), b = cy(k.rowId);
      lay.append(h('span', { class: 'braid__hop', style: { left: i * W - 2 + 'px', top: Math.min(a, b) - 2 + 'px', height: Math.abs(a - b) + 4 + 'px' } }));
    }
  });
  seq.forEach((k, i) => {
    const r = p.rows.find((x) => x.id === k.rowId) || {};
    const dot = h('button', { class: 'braid__dot st-' + k.status, type: 'button', draggable: 'true', title: `${i + 1}. ${k.title || 'Untitled scene'} · ${r.title || ''} (drag within its ${p.labels.column.toLowerCase()} to reorder)`,
      style: { left: i * W + W / 2 + 'px', top: cy(k.rowId) + 'px', '--c': r.color }, onclick: () => openCard(k.id),
      ondragstart: (e) => { S.braidDrag = k.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k.id); },
      ondragend: () => { S.braidDrag = null; },
      ondragover: (e) => { const d = p.cards.find((x) => x.id === S.braidDrag); if (d && d.colId === k.colId && d !== k) { e.preventDefault(); dot.classList.add('is-over'); } },
      ondragleave: () => dot.classList.remove('is-over'),
      ondrop: (e) => {
        e.preventDefault();
        const d = p.cards.find((x) => x.id === S.braidDrag);
        S.braidDrag = null;
        if (!d || d.colId !== k.colId || d === k) return;
        const col = seq.filter((x) => x.colId === k.colId).filter((x) => x !== d);
        col.splice(col.indexOf(k), 0, d);
        change(() => { col.forEach((x, n) => { x.seq = n; }); });
      } }, String(i + 1));
    lay.append(dot);
  });
  const hasSeq = p.cards.some((k) => Number.isFinite(k.seq));
  return h('div', { class: 'x x--wide' },
    pageHead('Braid', 'Every scene in reading order. The line follows the story from thread to thread. Drag a scene within its part to change the order.',
      h('label', { class: 'xinline' }, 'Flag a thread that runs more than', sel([2, 3, 4, 5, 6].map((n) => [n, n]), p.braid.run, (v) => change(() => { p.braid.run = +v; }), 'Longest run'), 'scenes in a row'),
      h('label', { class: 'xinline' }, 'or is away more than', sel([4, 5, 6, 8, 10, 15].map((n) => [n, n]), p.braid.gap, (v) => change(() => { p.braid.gap = +v; }), 'Longest gap'), 'scenes'),
      hasSeq ? h('button', { class: 'btn btn--sm', type: 'button', title: 'Go back to thread order inside each part', onclick: () => change(() => { for (const k of p.cards) delete k.seq; }) }, 'Reset order') : null),
    panel('braid-wrap', h('div', { class: 'braid-rows' }, h('div', { class: 'braid__labels', style: { paddingTop: TOP + 'px' } },
      p.rows.map((r) => { const n = seq.filter((k) => k.rowId === r.id).length; return h('div', { class: 'braid__lab', style: { height: RH + 'px', '--c': r.color } }, h('strong', {}, r.title), h('span', { class: 'muted small' }, `${Math.round((n / seq.length) * 100)}% of scenes`)); })),
    h('div', { class: 'braid__scroll' }, lay))),
    issues.length ? h('div', { class: 'xcards' }, issues.map((is) => panel('xwarn xwarn--' + (is.kind === 'run' ? 'bad' : 'meh'),
      h('span', { class: 'xwarn__k' }, is.kind === 'run' ? 'Long run' : 'Away too long'),
      h('span', {}, is.text, ' (scenes ', String(is.i + 1), '–', String(is.j + 1), ')'),
      h('span', { class: 'xwarn__act' }, cardBtn(is.k, 'Open a scene'), dismissBtn(is.key))))) : h('p', { class: 'ok' }, icon('check'), ' The threads hand off well.'));
}

// ======================================================================
// Revisions: fix-later flags and passes
// ======================================================================

const FK = Object.fromEntries(FLAG_KINDS.map(([v, l, c]) => [v, { l, c }]));

export function openFlags(p = P()) {
  const books = inSeriesTop() ? S.project.books : [p];
  return books.flatMap((b) => bookSeq(b).flatMap((k) => k.flags.filter((f) => !f.done).map((f) => ({ f, k, b }))));
}

export function viewRevisions(p) {
  const view = S.revView || 'flags';
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead(view === 'foreshadow' ? 'Foreshadowing pass' : 'Revisions', view === 'flags' ? 'Everything you meant to fix later, in reading order. Add flags from a scene card’s “Fix later” section.' : view === 'foreshadow' ? 'After drafting: each payoff, the setups it has so far, and earlier scenes that share its characters or places where one could go. “Plant here” adds a foreshadowing flag to that scene.' : 'Your own list of read-throughs, ticked per part. Separate from scene status.',
      seg([['flags', 'Flags'], ['passes', 'Passes'], ['foreshadow', 'Foreshadowing']], view, (v) => { S.revView = v; render(); }, 'Revisions view')),
    view === 'flags' ? flagsView(p) : view === 'foreshadow' ? foreshadowView(p) : passesView(p));
}

function flagsView(p) {
  const show = S.flagShow || 'open', kind = S.flagKind || '';
  const books = inSeriesTop() ? S.project.books : [p];
  const all = books.flatMap((b) => bookSeq(b).flatMap((k) => k.flags.map((f) => ({ f, k, b }))));
  const open = all.filter((x) => !x.f.done).length;
  const keep = (x) => (show === 'all' || (show === 'open' ? !x.f.done : x.f.done)) && (!kind || x.f.kind === kind);
  const groups = [];
  for (const b of books) {
    b.columns.forEach((c, i) => {
      const items = all.filter((x) => x.b === b && x.k.colId === c.id && keep(x));
      if (items.length) groups.push({ title: `${inSeriesTop() ? b.title + ' · ' : ''}${partLabel(b, i)}${c.title ? ' · ' + c.title : ''}`, canon: c.canon, items });
    });
  }
  return [
    h('div', { class: 'xbar' },
      seg([['open', `Open ${open}`], ['done', `Done ${all.length - open}`], ['all', 'All']], show, (v) => { S.flagShow = v; render(); }, 'Show'),
      h('div', { class: 'xchips' }, FLAG_KINDS.map(([v, l, c]) => h('button', { class: 'xfilter' + (kind === v ? ' is-on' : ''), type: 'button', 'aria-pressed': String(kind === v), onclick: () => { S.flagKind = kind === v ? '' : v; render(); } },
        h('i', { style: { background: c } }), l, ' ', h('span', { class: 'muted' }, String(all.filter((x) => x.f.kind === v && !x.f.done).length))))),
      h('span', { class: 'spacer' }),
      all.length ? h('span', { class: 'xprog' }, h('span', { class: 'xprog__bar' }, h('span', { style: { width: Math.round(((all.length - open) / all.length) * 100) + '%' } })), `${all.length - open} of ${all.length} done`) : null),
    groups.length ? groups.map((g) => h('section', { class: 'fgroup' }, h('h2', { class: 'fgroup__t' }, g.title, g.canon ? h('span', { class: 'pill pill--canon' }, icon('lock'), 'Published') : null),
      h('ul', { class: 'flist' }, g.items.map(({ f, k }) => h('li', { class: 'flist__row' + (f.done ? ' is-done' : '') },
        h('input', { type: 'checkbox', checked: !!f.done, 'aria-label': 'Done', onchange: (e) => change(() => { f.done = e.target.checked; f.doneAt = f.done ? new Date().toISOString() : null; }) }),
        h('div', { class: 'flist__body' }, h('span', { class: 'flist__text' }, f.text || '(empty)'),
          h('span', { class: 'flist__meta' }, h('span', { class: 'ftag', style: { '--c': (FK[f.kind] || FK.prose).c } }, (FK[f.kind] || FK.prose).l), cardBtn(k), h('span', { class: 'muted' }, f.done && f.doneAt ? `done ${new Date(f.doneAt).toLocaleDateString()}` : f.created ? `flagged ${new Date(f.created).toLocaleDateString()}` : ''))),
        f.must && !f.done ? h('span', { class: 'pill pill--warn' }, 'Before publishing') : null,
        h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Delete flag', onclick: () => change(() => { k.flags = k.flags.filter((x) => x !== f); }) }, icon('x')))))))
      : h('p', { class: all.length ? 'muted' : 'ok' }, all.length ? 'Nothing here with these filters.' : 'No flags yet. Add one from any scene card: “Fix later”.'),
  ];
}

function passesView(p) {
  const books = inSeriesTop() ? S.project.books : [p];
  return books.map((b) => panel('passes', h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, inSeriesTop() ? b.title : 'Passes'), h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn--sm', type: 'button', onclick: () => editPasses(b) }, 'Edit passes')),
  b.passes.length ? h('div', { class: 'passes__scroll' }, h('table', { class: 'passes__t' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Pass'), b.columns.map((c, i) => {
      const n = b.passes.filter((x) => c.passes[x.id]).length;
      return h('th', { scope: 'col' }, h('span', { class: 'passes__ph' }, `${numeral(b, i)}`), h('span', { class: 'small ' + (n === b.passes.length ? 'ok-text' : 'muted') }, `${n}/${b.passes.length}`));
    }))),
    h('tbody', {}, b.passes.map((x) => h('tr', {}, h('th', { scope: 'row' }, h('strong', {}, x.name), x.required ? h('span', { class: 'pill pill--warn pill--sm' }, 'required') : null, h('br'), h('span', { class: 'muted small' }, x.what || '')),
      b.columns.map((c, i) => h('td', {}, h('label', { class: 'passes__cell' }, h('input', { type: 'checkbox', checked: !!c.passes[x.id], 'aria-label': `${x.name}, ${partLabel(b, i)}`,
        onchange: (e) => change(() => { if (e.target.checked) c.passes[x.id] = new Date().toISOString(); else delete c.passes[x.id]; }) }),
      c.passes[x.id] ? h('span', { class: 'small muted' }, new Date(c.passes[x.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : null)))))))) : h('p', { class: 'muted' }, 'No passes yet.')));
}

function editPasses(b) {
  const list = JSON.parse(JSON.stringify(b.passes));
  const box = h('div', { class: 'xedit' });
  const draw = () => {
    clear(box);
    list.forEach((x, i) => box.append(h('div', { class: 'xedit__row' },
      h('input', { class: 'input input--sm', value: x.name, placeholder: 'Pass name', 'aria-label': 'Pass name', oninput: (e) => { x.name = e.target.value; } }),
      h('input', { class: 'input input--sm', value: x.what || '', placeholder: 'What it’s for', 'aria-label': 'What it’s for', oninput: (e) => { x.what = e.target.value; } }),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!x.required, onchange: (e) => { x.required = e.target.checked; } }), ' Required before publishing'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Up', disabled: !i, onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); draw(); } }, icon('up')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); draw(); } }, icon('x')))));
    box.append(h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { list.push({ id: uid(), name: '', what: '', required: false }); draw(); box.querySelector('.xedit__row:last-of-type input')?.focus(); } }, icon('plus'), ' Pass'));
  };
  draw();
  const dl = h('dialog', { class: 'dlg' });
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, 'Revision passes'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))),
    h('div', { class: 'dlg__body' }, h('p', { class: 'muted small' }, 'The read-throughs you do on each part. Ticks on removed passes are kept in the backups only.'), box),
    h('footer', { class: 'dlg__foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dl.close() }, 'Cancel'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { change(() => { b.passes = list.filter((x) => x.name.trim()); }); dl.close(); } }, 'Save'))]);
  dl.addEventListener('close', () => dl.remove());
  document.body.append(dl);
  dl.showModal();
}

// Asked before a part is marked Published.
export async function publishCheck(p, c) {
  const missing = (p.passes || []).filter((x) => x.required && !(c.passes || {})[x.id]);
  const flags = p.cards.filter((k) => k.colId === c.id).flatMap((k) => k.flags.filter((f) => f.must && !f.done));
  if (!missing.length && !flags.length) return true;
  const bits = [missing.length ? `${missing.map((x) => x.name).join(', ')} ${missing.length === 1 ? 'isn’t' : 'aren’t'} done` : '', flags.length ? `${plural(flags.length, 'flag')} marked “before publishing” ${flags.length === 1 ? 'is' : 'are'} still open` : ''].filter(Boolean);
  return choose({ title: 'Publish anyway?', message: `For this ${p.labels.column.toLowerCase()}: ${bits.join(', and ')}.`, choices: [{ label: 'Not yet', value: false }, { label: 'Publish anyway', value: true, kind: 'primary' }] });
}

function flagsBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    c.flags.forEach((f, i) => box.append(h('div', { class: 'xbox__flag' + (f.done ? ' is-done' : '') },
      h('input', { type: 'checkbox', checked: !!f.done, 'aria-label': 'Done', onchange: (e) => { upd((cc) => { cc.flags[i].done = e.target.checked; cc.flags[i].doneAt = e.target.checked ? new Date().toISOString() : null; }); draw(); } }),
      h('input', { class: 'input input--sm xbox__grow', value: f.text, 'aria-label': 'Flag', oninput: (e) => upd((cc) => { cc.flags[i].text = e.target.value; }) }),
      sel(FLAG_KINDS.map(([v, l]) => [v, l]), f.kind, (v) => upd((cc) => { cc.flags[i].kind = v; }), 'Kind'),
      h('label', { class: 'check small', title: 'Must be fixed before this part is published' }, h('input', { type: 'checkbox', checked: !!f.must, onchange: (e) => upd((cc) => { cc.flags[i].must = e.target.checked; }) }), ' Before publishing'),
      h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove flag', onclick: () => { upd((cc) => { cc.flags.splice(i, 1); }); draw(); } }, icon('x')))));
    const text = h('input', { class: 'input input--sm xbox__grow', placeholder: 'Something to fix in this scene…', 'aria-label': 'New flag' });
    let kind = S.lastFlagKind || 'continuity';
    const add = () => { const t = text.value.trim(); if (!t) return; upd((cc) => { cc.flags.push({ id: uid(), text: t, kind, done: false, must: false, created: new Date().toISOString() }); }); draw(); box.querySelector('input[aria-label="New flag"]')?.focus(); };
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    box.append(h('div', { class: 'xbox__flag' }, text, sel(FLAG_KINDS.map(([v, l]) => [v, l]), kind, (v) => { kind = v; S.lastFlagKind = v; }, 'Kind'), h('button', { class: 'btn btn--sm', type: 'button', onclick: add }, 'Add')));
  };
  draw();
  return box;
}

// ======================================================================
// Scene checklist
// ======================================================================

export const nothingChanges = (k) => !!(k.chk && (k.chk.nothing || (k.chk.from && k.chk.to && k.chk.from.trim().toLowerCase() === k.chk.to.trim().toLowerCase())));
const OUTCOMES = [['yes', 'Yes'], ['yesbut', 'Yes, but'], ['no', 'No'], ['noand', 'No, and']];

function checklistBox(p, k, upd) {
  const L = p.checklist.labels;
  const c = k();
  const box = h('div', { class: 'xbox xbox--chk' });
  const line = (label, input) => h('label', { class: 'chk__row' }, h('span', { class: 'chk__l' }, label), input);
  const inp = (key, ph) => h('input', { class: 'input input--sm', value: c.chk[key] || '', placeholder: ph, oninput: (e) => upd((cc) => { cc.chk[key] = e.target.value; }) });
  const outs = h('div', { class: 'chk__outs', role: 'radiogroup', 'aria-label': L.outcome }, OUTCOMES.map(([v, l]) => h('label', { class: 'chk__out' },
    h('input', { type: 'radio', name: 'chk-out', value: v, checked: c.chk.outcome === v, onchange: () => upd((cc) => { cc.chk.outcome = v; }) }), l)));
  const nothing = h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!c.chk.nothing, onchange: (e) => upd((cc) => { cc.chk.nothing = e.target.checked; }) }), ' Nothing changes (on purpose?)');
  append(box, [line(L.goal, inp('goal', 'What the point-of-view character wants here')), line(L.conflict, inp('conflict', 'What stands in the way')), h('div', { class: 'chk__row' }, h('span', { class: 'chk__l' }, L.outcome), outs),
    h('div', { class: 'chk__row' }, h('span', { class: 'chk__l' }, L.change), h('span', { class: 'chk__chg' }, inp('from', 'Before'), h('span', {}, '→'), inp('to', 'After'), nothing))]);
  return box;
}

// ======================================================================
// On scene cards
// ======================================================================

export function sceneExtras(p, k, upd, dlg) {
  const c = k();
  const sec = (title, n, open, body) => h('details', { class: 'xsec', open: open || null }, h('summary', {}, title, n ? h('span', { class: 'xsec__n' }, String(n)) : null), body);
  return h('div', { class: 'xsecs' },
    p.checklist.on ? sec('Scene checklist', 0, true, checklistBox(p, k, upd)) : null,
    sec('Fix later', c.flags.filter((f) => !f.done).length, c.flags.length > 0, flagsBox(p, k, upd)),
    cardInfo(c).row && cardInfo(c).row.flash ? sec('In the past', 0, true, h('div', { class: 'xbox' }, h('label', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'When'),
      h('input', { class: 'input input--sm xbox__grow', value: c.past || '', placeholder: '30 years before', oninput: (e) => upd((cc) => { cc.past = e.target.value; }) })))) : null,
    sec('Promises', c.raises.length + c.moves.length + c.answers.length + (c.payoff ? 1 : 0), false, promisesBox(p, k, upd)),
    sec('Magic', c.magic.length + c.explains.length, false, magicBox(p, k, upd)),
    connsOn(c).length ? sec('Connections', connsOn(c).length, false, h('div', { class: 'xbox' }, connsOn(c).map((x) => h('div', { class: 'xbox__row' }, h('strong', {}, x.name || 'Unnamed'), h('span', { class: 'muted small' }, x.notes || ''))),
      h('a', { class: 'small', href: phref('conns') }, 'Edit in World › Connections'))) : null,
    sec('Secrets revealed', c.reveals.length, false, revealsBox(p, k, upd)),
    sec('Relationships change here', c.rels.length, false, relsBox(p, k, upd)),
    chars().some((e) => c.entityIds.includes(e.id)) ? sec('Character arcs', c.arcs.length, false, arcsBox(p, k, upd)) : null,
    gameOn() ? sec('Quests', c.quests.length, false, questsBox(p, k, upd)) : null,
    sec('Clippings', c.clips.length, false, clipsPanel(() => k().clips, (fn) => upd((cc) => fn(cc.clips)))));
}

export function cardExtras(p, k) {
  const open = k.flags.filter((f) => !f.done).length;
  const chk = p.checklist && p.checklist.on && k.chk;
  return [
    k.past ? h('span', { class: 'card__past' }, k.past) : null,
    k.magic.length ? h('span', { class: 'card__magic', title: 'Magic used here' }, '✦ ', k.magic.some((u) => u.solves) ? 'Magic solves' : 'Magic') : null,
    open ? h('span', { class: 'card__fix', title: k.flags.filter((f) => !f.done).map((f) => f.text).join('\n') }, icon('flag'), `${open} to fix`) : null,
    chk && nothingChanges(k) ? h('span', { class: 'card__chk is-flat' }, 'Nothing changes?') : chk && k.chk.from && k.chk.to ? h('span', { class: 'card__chk' }, `${k.chk.from} → ${k.chk.to}`) : null,
  ];
}
