// Checks: everything the planner noticed, in one list, plus the presence grid.
import { h, icon } from './dom.js';
import { numeral, partLabel } from './model.js';
import { S, P, isSeries, inSeriesTop, change, render, phref, openCard, cardInfo, plural, bookSeq, readingSeq, appearances } from './app.js';
import { chars, units, positions, cardBtn, sel, pageHead, panel, dismissed, dismissBtn } from './x-common.js';
import { endingProblems, braidIssues, nothingChanges } from './x-story.js';
import { secretProblems, nameIssues } from './x-people.js';
import { travelIssues } from './x-world.js';
import { sandersonChecks } from './x-sanderson.js';

const where = (k) => `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).part}`;

// ---------- Presence ----------

function majors() {
  const cs = chars();
  const flagged = cs.filter((e) => e.major);
  if (flagged.length) return { list: flagged, auto: false };
  const n = new Map(cs.map((e) => [e, appearances(P(), e.id).length]));
  const top = Math.max(0, ...n.values());
  return { list: cs.filter((e) => n.get(e) >= 3 && n.get(e) >= top * 0.25), auto: true };
}
export function presenceGaps(p = P()) {
  const U = units(p);
  const gap = S.presGap || 2;
  const out = [];
  for (const e of majors().list) {
    const at = U.map((u) => u.cards.filter((k) => k.entityIds.includes(e.id)).length);
    const idx = at.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < idx.length; i++) {
      const len = idx[i] - idx[i - 1] - 1;
      const key = `presence:${e.id}:${U[idx[i - 1] + 1].c.id}`;
      if (len > gap && !dismissed(key)) out.push({ e, from: idx[i - 1] + 1, to: idx[i] - 1, len, key, U });
    }
  }
  return out;
}

export function viewPresence(p) {
  const U = units(p);
  const { list, auto } = majors();
  const gaps = presenceGaps(p);
  const shade = (n) => ['transparent', '#F4D3C1', '#E79A73', '#C9531A'][Math.min(3, n)];
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Presence', `Scenes per ${P().labels.column.toLowerCase()} for ${auto ? 'your most-seen characters' : 'major characters'}. Tick “Major character” on a profile to choose who’s checked.`,
      h('label', { class: 'xinline' }, 'Flag when gone more than', sel([1, 2, 3, 4, 6].map((n) => [n, plural(n, P().labels.column.toLowerCase())]), S.presGap || 2, (v) => { S.presGap = +v; render(); }, 'Gap'))),
    !list.length ? panel('', h('p', { class: 'muted' }, 'No major characters yet. Characters with at least 3 scenes are checked automatically.')) :
      panel('pres', h('div', { class: 'pres__scroll' }, h('div', { class: 'pres__grid', style: { gridTemplateColumns: `170px repeat(${U.length}, minmax(34px, 1fr))` } },
        h('span', {}), U.map((u) => h('span', { class: 'pres__h', title: u.long }, u.label)),
        list.map((e) => [h('a', { class: 'pres__who', href: phref('e/' + e.id) }, e.name || 'Unnamed'),
          U.map((u, i) => { const n = u.cards.filter((k) => k.entityIds.includes(e.id)).length; const g = gaps.find((x) => x.e === e && i >= x.from && i <= x.to);
            return h('span', { class: 'pres__cell' + (g ? ' is-gap' : ''), style: { background: shade(n), color: n >= 3 ? '#fff' : null }, title: `${e.name}: ${plural(n, 'scene')} in ${u.long}` }, n ? String(n) : ''); })])))),
    gaps.length ? h('div', { class: 'xcards' }, gaps.map((g) => panel('xwarn xwarn--bad', h('span', { class: 'xwarn__k' }, 'Gone too long'),
      h('span', {}, `${g.e.name} is absent for ${plural(g.len, P().labels.column.toLowerCase())} (${g.U[g.from].long} to ${g.U[g.to].long}).`), h('span', { class: 'xwarn__act' }, dismissBtn(g.key))))) : list.length ? h('p', { class: 'ok' }, icon('check'), ' Nobody vanishes for too long.') : null);
}

// ---------- Everything ----------

function collect(p) {
  const out = [];
  const safe = (fn) => { try { fn(); } catch (err) { console.error(err); } };
  safe(() => presenceGaps(p).forEach((g) => out.push({ group: 'Presence', sev: 'bad', key: g.key, text: `${g.e.name} is gone for ${plural(g.len, P().labels.column.toLowerCase())}`, sub: `${g.U[g.from].long} to ${g.U[g.to].long}`, href: phref('presence') })));
  safe(() => secretProblems().forEach((x) => out.push({ group: 'Secrets', sev: 'bad', key: `secret:${x.s.id}:${x.who}:${x.k.id}`, text: `Acts on “${x.s.name}” before knowing it`, sub: where(x.k), k: x.k })));
  safe(() => travelIssues().forEach((x) => out.push({ group: 'Travel', sev: 'bad', key: x.key, text: `${x.c.name} travels too fast`, sub: `${where(x.a.k)} → ${where(x.b.k)}`, k: x.b.k })));
  safe(() => endingProblems(p).filter((x) => !x.open.length).forEach((x) => { const key = `promise:end:${x.u.c.id}`; if (!dismissed(key)) out.push({ group: 'Promises', sev: 'meh', key, text: `${x.u.long} ends with nothing left open`, sub: x.last.title || 'Untitled scene', k: x.last }); }));
  safe(() => (inSeriesTop() ? S.project.books : [p]).forEach((b) => braidIssues(b).forEach((x) => out.push({ group: 'Braid', sev: 'meh', key: x.key, text: x.text, sub: inSeriesTop() ? b.title : '', href: inSeriesTop() ? null : phref('braid'), k: inSeriesTop() ? x.k : null }))));
  safe(() => (inSeriesTop() ? S.project.books : [p]).forEach((b) => { if (!b.checklist || !b.checklist.on) return; bookSeq(b).filter(nothingChanges).forEach((k) => { const key = `chk:${k.id}`; if (!dismissed(key)) out.push({ group: 'Scene checklist', sev: 'meh', key, text: 'Nothing changes in this scene', sub: `${where(k)} · ${k.title || 'Untitled'}`, k }); }); }));
  safe(() => { const { found, guesses } = nameIssues(); found.forEach((x) => out.push({ group: 'Names', sev: 'meh', key: `namefound:${x.w}`, text: `“${x.w}” should be ${x.e.name}`, sub: plural(x.hits.length, 'scene'), href: phref('names') })); guesses.forEach((x) => out.push({ group: 'Names', sev: 'meh', key: 'name:' + x.w.toLowerCase(), text: `“${x.w}”: did you mean ${x.e.name}?`, sub: plural(x.hits.length, 'scene'), href: phref('names') })); });
  safe(() => {
    const pos = positions();
    for (const { k } of readingSeq()) {
      if (!k.setup || !k.payoffId) continue;
      const o = [...pos.keys()].find((x) => x.id === k.payoffId);
      if (o && pos.get(o) < pos.get(k)) { const key = `cont:${k.id}`; if (!dismissed(key)) out.push({ group: 'Continuity', sev: 'bad', key, text: 'Pays off before it’s set up', sub: `${where(k)} · ${k.title || 'Untitled'}`, k }); }
    }
  });
  safe(() => (inSeriesTop() ? S.project.books : [p]).forEach((b) => b.columns.forEach((c, i) => {
    if (!c.canon) return;
    const label = `${inSeriesTop() ? b.title + ' · ' : ''}${partLabel(b, i)}`;
    const must = b.cards.filter((k) => k.colId === c.id).flatMap((k) => k.flags.filter((f) => f.must && !f.done).map((f) => ({ f, k })));
    for (const { f, k } of must) { const key = `mustflag:${f.id}`; if (!dismissed(key)) out.push({ group: 'Revisions', sev: 'bad', key, text: `Published, but “${f.text}” is still open`, sub: where(k), k }); }
    const missing = (b.passes || []).filter((x) => x.required && !c.passes[x.id]);
    if (missing.length) { const key = `pass:${c.id}`; if (!dismissed(key)) out.push({ group: 'Revisions', sev: 'meh', key, text: `Published without: ${missing.map((x) => x.name).join(', ')}`, sub: label, href: phref('revisions') }); }
  })));
  sandersonChecks(p, (x) => { if (!dismissed(x.key)) out.push(x); });
  return out;
}

export function checksCount(p) { return collect(p).length; }

export function viewChecks(p) {
  const all = collect(p);
  const groups = [...new Set(all.map((x) => x.group))];
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Checks', 'Everything the planner noticed, in one place. Each one links to where it is; ignore any you meant on purpose.',
      p.dismissed.length ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { P().dismissed = []; }) }, `Show ${plural(p.dismissed.length, 'ignored check')} again`) : null),
    all.length ? groups.map((g) => panel('chk', h('h2', { class: 'xpanel__t' }, g, h('span', { class: 'xsec__n' }, String(all.filter((x) => x.group === g).length))),
      all.filter((x) => x.group === g).map((x) => h('div', { class: 'chk__item chk__item--' + x.sev },
        h('span', { class: 'chk__dot' }, x.sev === 'bad' ? '!' : '?'),
        h('div', { class: 'chk__body' }, h('strong', {}, x.text), x.sub ? h('span', { class: 'muted small' }, x.sub) : null),
        h('span', { class: 'spacer' }),
        x.k ? cardBtn(x.k, 'Open scene') : x.href ? h('a', { class: 'small', href: x.href }, 'Look') : null,
        dismissBtn(x.key))))) : panel('', h('p', { class: 'ok' }, icon('check'), ' Nothing to look at. The planner checks presence, secrets, travel, installment endings, the braid, the scene checklist, spellings, setups and payoffs, and published parts.')));
}
