// Characters and what they know: the filtered list, relationship web, arcs,
// family trees, voice sheets, ages, names & spellings, and secrets.
import { h, icon, clear, append, ask, confirmDanger, toast, autosize } from './dom.js';
import { uid, numeral, partLabel, dayOf, REL_KINDS, SECRET_KINDS, REVEAL_HOW, FAMILY_KINDS } from './model.js';
import { S, P, isSeries, inSeriesTop, change, render, go, phref, pbase, openCard, cardInfo, readingSeq, entity, typeOf, plural, gameOn, viewSheet, appearances, newEntity, scopeCards } from './app.js';
import { charType, factionType, isChar, chars, factions, factionsOf, nameOf, units, positions, cardBtn, seg, sel, pageHead, panel, empty, chipsEditor, dismissed, dismissBtn } from './x-common.js';
import { clipsPanel, moodBoard } from './x-world.js';
import { icebergEditor } from './x-sanderson.js';
export { isChar };

const RK = Object.fromEntries(REL_KINDS.map(([v, l, c, d]) => [v, { l, c, d }]));
const where = (k) => `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).part}`;
const ini = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const FAC_COLORS = ['#4E3A72', '#2F6F7E', '#9A5B12', '#A8344E', '#2F7A4A', '#4B6584', '#8A3410'];
const charColor = (e) => { if (!e) return '#5A6870'; const f = factionsOf(e)[0]; if (!f) return '#5A6870'; const i = factions().findIndex((x) => x.id === f); return FAC_COLORS[(i < 0 ? 0 : i) % FAC_COLORS.length]; };

const mostSeen = (p) => chars().map((e) => [e, appearances(p, e.id).length]).sort((a, b) => b[1] - a[1]).map(([e]) => e)[0];

// ======================================================================
// Ages from the story calendar
// ======================================================================

export function ageAt(e, w) {
  if (!e || !e.born || !w) return null;
  const cal = P().calendar;
  const a = dayOf(cal, e.born), b = dayOf(cal, w);
  if (a == null || b == null) return null;
  return Math.floor((b - a) / (cal.parts.length * cal.days));
}
export function ageLine(c) {
  if (!c.when) return null;
  const here = chars().filter((e) => c.entityIds.includes(e.id) && e.born);
  if (!here.length) return null;
  const bday = here.filter((e) => e.born.p === c.when.p);
  return h('p', { class: 'xages' }, icon('user'), ' Ages here: ', here.map((e, i) => [i ? ', ' : '', h('strong', {}, `${e.name} ${ageAt(e, c.when)}`)]),
    bday.length ? h('span', { class: 'muted' }, ` · birthday this ${(P().calendar.parts[c.when.p] || 'season').toLowerCase()}: ${bday.map((e) => e.name).join(', ')}`) : null);
}
export function agesText(k) {
  if (!k.when) return '';
  const here = chars().filter((e) => k.entityIds.includes(e.id) && e.born);
  return here.length ? ' · ' + here.map((e) => `${e.name} ${ageAt(e, k.when)}`).join(', ') : '';
}
const yearLabel = (y) => { const Y = P().calendar.years; return y >= 0 && y < Y.length ? Y[y] : y < 0 ? `${-y} ${-y === 1 ? 'year' : 'years'} before ${Y[0]}` : `${y - Y.length + 1} after ${Y[Y.length - 1]}`; };

// ======================================================================
// Entry pages: tabs, profile extras, and the side column
// ======================================================================

export function entityTabs(e) {
  const tabs = [['profile', 'Profile'], isChar(e) ? ['bg', 'Background'] : null, isChar(e) ? ['voice', 'Voice'] : null, isChar(e) ? ['arc', 'Arc'] : null, isChar(e) ? ['family', 'Family'] : null,
    gameOn() ? ['sheet', 'Game sheet'] : null, ['iceberg', `Iceberg${e.facts.length ? ' ' + e.facts.length : ''}`], ['clips', `Clippings${e.clips.length ? ' ' + e.clips.length : ''}`], ['mood', `Mood board${e.mood.length ? ' ' + e.mood.length : ''}`]].filter(Boolean);
  const cur = tabs.some(([v]) => v === S.entityView) ? S.entityView : 'profile';
  return seg(tabs, cur, (v) => { S.entityView = v; render(); }, 'Entry view');
}

export function entityExtra(p, e, profile) {
  const v = S.entityView;
  const upd = (fn) => change(() => fn(e), { render: false });
  if (v === 'bg' && isChar(e)) return backgroundView(p, e, upd);
  if (v === 'voice' && isChar(e)) return voiceView(e, upd);
  if (v === 'arc' && isChar(e)) return arcView(e, upd);
  if (v === 'family' && isChar(e)) return familyEditor(e);
  if (v === 'sheet' && gameOn()) return viewSheet(p, e);
  if (v === 'iceberg') return h('div', { class: 'xone xone--wide' }, icebergEditor(p, e));
  if (v === 'clips') return h('div', { class: 'xone' }, panel('', h('h2', { class: 'xpanel__t' }, 'Clippings'), h('p', { class: 'muted small' }, 'Links, notes and images for this entry.'), clipsPanel(() => e.clips, (fn) => upd((x) => fn(x.clips)))));
  if (v === 'mood') return h('div', { class: 'xone' }, moodBoard(() => e.mood, (fn) => change(() => fn(e.mood))));
  return profile();
}

export function profileExtras(p, e, upd) {
  const cal = P().calendar;
  const names = h('details', { class: 'xsec', open: e.aliases.length || e.wrong.length ? true : null },
    h('summary', {}, 'Names & spellings'),
    h('div', { class: 'xbox' },
      h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Also called'), chipsEditor(e.aliases, () => upd(() => {}), { placeholder: 'Nickname, title…', label: 'Add another name' })),
      h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Watch for'), chipsEditor(e.wrong, () => upd(() => {}), { placeholder: 'A misspelling to catch', label: 'Add a misspelling', cls: 'xchips--bad' })),
      h('label', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Say it'), h('input', { class: 'input input--sm', value: e.say, placeholder: 'ILL-sa-bet', oninput: (ev) => upd((x) => { x.say = ev.target.value; }) }))));
  if (!isChar(e)) return names;
  const b = e.born;
  const yrs = [];
  for (let y = -90; y < cal.years.length + 5; y++) yrs.push([String(y), yearLabel(y)]);
  const born = h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Born'),
    sel([['', 'Not set'], ...yrs], b ? b.y : '', (v) => { change(() => { e.born = v === '' ? null : { y: +v, p: b ? b.p : 0, day: b ? b.day : '' }; }); }, 'Born in year'),
    b ? sel(cal.parts.map((x, i) => [i, x]), b.p, (v) => upd((x) => { x.born.p = +v; }), 'Born in') : null,
    b ? h('input', { class: 'input input--sm xnum', value: b.day || '', placeholder: 'Day', 'aria-label': 'Day', oninput: (ev) => upd((x) => { x.born.day = ev.target.value; }) }) : null);
  const ft = factionType();
  const members = ft ? P().entities.filter((x) => isChar(x) && x !== e && factionsOf(x).some((f) => factionsOf(e).includes(f))) : [];
  const org = ft ? h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Role'),
    h('input', { class: 'input input--sm', value: e.role, placeholder: 'Captain, apprentice…', oninput: (ev) => upd((x) => { x.role = ev.target.value; }) }),
    h('span', { class: 'muted small' }, 'reports to'),
    sel([['', '— Nobody —'], ...members.map((x) => [x.id, x.name || 'Unnamed'])], e.reportsTo || '', (v) => upd((x) => { x.reportsTo = v || null; }), 'Reports to')) : null;
  return [names, h('details', { class: 'xsec', open: true }, h('summary', {}, 'Age & place in the world'), h('div', { class: 'xbox' }, born, org,
    h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!e.major, onchange: (ev) => upd((x) => { x.major = ev.target.checked; }) }), ' Major character (checked for long absences)')))];
}

export function asideExtras(p, e) {
  if (!isChar(e)) return null;
  const out = [];
  if (e.born) {
    const apps = appearances(p, e.id).filter((k) => k.when);
    const books = isSeries() ? S.project.books : [P()];
    const rows = books.map((b) => { const ages = apps.filter((k) => cardInfo(k).b === b).map((k) => ageAt(e, k.when)); return ages.length ? [b.title, Math.min(...ages), Math.max(...ages)] : null; }).filter(Boolean);
    const last = apps[apps.length - 1];
    out.push(h('h2', { class: 'aside__title' }, 'Age'),
      last ? h('p', { class: 'xage' }, h('span', { class: 'xage__n' }, String(ageAt(e, last.when))), h('span', { class: 'small' }, 'in their latest dated scene, ', cardBtn(last))) : h('p', { class: 'muted small' }, 'Set “When in the story” on their scenes to see ages.'),
      rows.length > 1 || (rows[0] && rows[0][1] !== rows[0][2]) ? h('ul', { class: 'xage__list' }, rows.map(([t, a, z]) => h('li', {}, h('span', {}, t), h('strong', {}, a === z ? String(a) : `${a} → ${z}`)))) : null);
  }
  const g = e.bg;
  const bgText = g.story || g.origin || g.upbringing;
  out.push(h('h2', { class: 'aside__title' }, 'Background'),
    bgText ? h('p', { class: 'small bg__peek' }, bgText.length > 220 ? bgText.slice(0, 220).replace(/\s+\S*$/, '') + '…' : bgText) : h('p', { class: 'muted small' }, 'No backstory yet.'),
    h('button', { class: 'linkbtn small', type: 'button', onclick: () => { S.entityView = 'bg'; render(); window.scrollTo(0, 0); } }, bgText ? `Read more${g.events.length ? ` · ${g.events.length} key moment${g.events.length === 1 ? '' : 's'}` : ''}` : 'Write their background'));
  const know = knowsAtEnd(e.id);
  if (know.length) {
    out.push(h('h2', { class: 'aside__title' }, 'What they know'), h('ul', { class: 'xknow' }, know.map(({ s, st }) =>
      h('li', { class: 'xknow--' + st }, h('a', { href: phref('secrets'), onclick: () => { S.secretSel = s.id; } }, s.name || 'Untitled secret'), h('span', { class: 'muted small' }, { 2: ' · knows', 1: ' · suspects', 3: ' · believes a lie' }[st])))));
  }
  return out;
}

// ======================================================================
// Voice sheet
// ======================================================================

// ======================================================================
// Background: where a character comes from, before page one
// ======================================================================

function backgroundView(p, e, upd) {
  const g = e.bg;
  const ta = (key, label, ph, rows = 2, cls = '') => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label),
    autosize(h('textarea', { class: 'input ' + cls, rows, value: g[key], placeholder: ph, oninput: (ev) => upd((x) => { x.bg[key] = ev.target.value; }) })));
  const cardOpts = (sel) => (isSeries() ? S.project.books : [P()]).flatMap((b) => b.columns.map((c, i) => {
    const cs = b.cards.filter((k) => k.colId === c.id);
    return cs.length ? h('optgroup', { label: `${isSeries() ? b.title + ' · ' : ''}${partLabel(b, i)}${c.title ? ': ' + c.title : ''}` },
      cs.map((k) => h('option', { value: k.id, selected: k.id === sel }, k.title || 'Untitled scene'))) : null;
  }));
  const findK = (id) => readingSeq().map((x) => x.k).find((k) => k.id === id);
  const born = e.born ? `Born ${P().calendar.years[e.born.y] || (e.born.y < 0 ? `${-e.born.y} years before ${P().calendar.years[0]}` : `year ${e.born.y + 1}`)}` : null;
  return h('div', { class: 'xone bg' },
    panel('', h('h2', { class: 'xpanel__t' }, 'Backstory'),
      h('p', { class: 'muted small' }, `Everything that happened to ${e.name || 'them'} before the story starts. Write as much as you like; readers may never see most of it.`),
      autosize(h('textarea', { class: 'input bg__story', rows: 8, value: g.story, placeholder: 'Born in the drowned quarter of Saltmarsh, the youngest of five…', 'aria-label': 'Backstory', oninput: (ev) => upd((x) => { x.bg.story = ev.target.value; }) }))),
    panel('bg__grid',
      ta('origin', 'Where they come from', 'Place, people, class, faith'),
      ta('upbringing', 'Upbringing and family life', 'Who raised them, what home was like'),
      ta('work', 'Training, work and skills', 'Apprenticed to a grafter at twelve…'),
      ta('before', 'When the story begins', 'Where they are and what they’re doing on page one'),
      h('div', { class: 'bg__wide' }, ta('hidden', 'What they’d never tell anyone', 'The thing in their past they hide, even from the reader (for now)', 2),
        h('span', { class: 'muted small' }, 'Want to track which of these readers learn, and when? Use the ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { S.entityView = 'iceberg'; render(); } }, 'Iceberg tab'), '.'))),
    panel('', h('h2', { class: 'xpanel__t' }, 'Key moments in their past'),
      h('p', { class: 'muted small' }, [born, 'Oldest first. Link a moment to the scene where it’s told, such as a flashback.'].filter(Boolean).join(' · ')),
      g.events.length ? h('ol', { class: 'bg__events' }, g.events.map((ev, i) => {
        const k = ev.cardId && findK(ev.cardId);
        return h('li', { class: 'bg__ev' },
          h('input', { class: 'input input--sm bg__when', value: ev.when, placeholder: 'Age 9', 'aria-label': 'When', oninput: (x) => upd(() => { ev.when = x.target.value; }) }),
          h('div', { class: 'bg__what' },
            h('input', { class: 'input input--sm', value: ev.what, placeholder: 'What happened', 'aria-label': 'What happened', oninput: (x) => upd(() => { ev.what = x.target.value; }) }),
            h('span', { class: 'xrow small' }, k ? ['Told in ', cardBtn(k, `${k.title || 'Untitled scene'}`)] : h('span', { class: 'muted' }, 'Not told on the page yet'),
              h('select', { class: 'input input--sm', 'aria-label': 'Scene where it’s told', onchange: (x) => change(() => { ev.cardId = x.target.value || null; }) },
                h('option', { value: '' }, k ? 'Not told on the page' : 'Told in a scene…'), cardOpts(ev.cardId)))),
          h('span', { class: 'bg__btns' },
            h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Earlier', disabled: i === 0, onclick: () => change(() => { g.events.splice(i - 1, 0, g.events.splice(i, 1)[0]); }) }, icon('up')),
            h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove moment', onclick: () => change(() => { g.events.splice(i, 1); }) }, icon('x'))));
      })) : null,
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { g.events.push({ id: uid(), when: '', what: '', cardId: null }); }) }, icon('plus'), ' Moment')));
}

function voiceView(e, upd) {
  const v = e.voice;
  const out = h('div', { class: 'vcheck__out' });
  const check = (txt) => {
    clear(out);
    if (!txt.trim()) return;
    const bad = v.never.map((w) => w.toLowerCase());
    const hits = [];
    for (const part of txt.split(/(\b[\w’']+\b)/)) {
      const isBad = part && bad.some((w) => w.includes(' ') ? false : part.toLowerCase() === w);
      if (isBad) hits.push(part);
      out.append(isBad ? h('mark', { class: 'vcheck__bad' }, part) : document.createTextNode(part));
    }
    for (const w of v.never.filter((x) => x.includes(' ') && txt.toLowerCase().includes(x.toLowerCase()))) hits.push(w);
    out.append(h('p', { class: 'small ' + (hits.length ? 'warn-text' : 'ok-text') }, hits.length ? `${plural(hits.length, 'word')} ${e.name || 'they'} would never say: ${[...new Set(hits)].join(', ')}` : 'Sounds like them, as far as the word lists go.'));
  };
  const ta = (key, label, ph) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), autosize(h('textarea', { class: 'input', rows: 3, value: v[key], placeholder: ph, oninput: (ev) => upd((x) => { x.voice[key] = ev.target.value; }) })));
  return h('div', { class: 'xone voice' },
    panel('voice__grid', ta('talk', 'How they talk', 'Short sentences. Answers a question with a question…'), ta('dialect', 'Dialect, rhythm, tics', 'Drops the g, “aye” not “yes”…'),
      h('div', { class: 'field' }, h('span', { class: 'field__label ok-text' }, 'Words they love'), chipsEditor(v.loves, () => upd(() => {}), { placeholder: 'Add a word or phrase', cls: 'xchips--good' })),
      h('div', { class: 'field' }, h('span', { class: 'field__label warn-text' }, 'Would never say'), chipsEditor(v.never, () => upd(() => {}), { placeholder: 'Add a word or phrase', cls: 'xchips--bad' })),
      h('div', { class: 'field voice__lines' }, h('span', { class: 'field__label' }, 'Lines that sound like them'),
        v.lines.map((l, i) => h('div', { class: 'voice__line' }, h('input', { class: 'input', value: l, 'aria-label': 'Line', oninput: (ev) => upd((x) => { x.voice.lines[i] = ev.target.value; }) }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove line', onclick: () => change(() => { e.voice.lines.splice(i, 1); }) }, icon('x')))),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { e.voice.lines.push(''); }) }, icon('plus'), ' Line'))),
    panel('', h('h2', { class: 'xpanel__t' }, 'Check a line of dialogue'),
      h('textarea', { class: 'input', rows: 2, placeholder: 'Paste a line from your draft. Nothing is saved.', 'aria-label': 'Line to check', oninput: (ev) => check(ev.target.value) }), out));
}

// ======================================================================
// Arcs
// ======================================================================

const ARC_D = [['', '—'], ['2', '↑↑ Big step toward the truth'], ['1', '↑ Toward the truth'], ['-1', '↓ Back to the lie'], ['-2', '↓↓ Big step back']];
const ARC_FIELDS = [['want', 'Want', 'What they think they need'], ['need', 'Need', 'What they actually need'], ['wound', 'Wound', 'What happened to them'], ['lie', 'Lie', 'What they believe because of it'], ['truth', 'Truth', 'What they have to learn']];

function arcFields(e, upd) {
  return h('div', { class: 'arc__core' },
    h('label', { class: 'arc__f arc__f--type' }, h('span', { class: 'field__label' }, 'Kind of arc'),
      sel([['', '—'], ['positive', 'Positive (learns the truth)'], ['negative', 'Negative (falls further)'], ['flat', 'Flat (changes others)']], e.arc.type, (v) => upd((x) => { x.arc.type = v; }), 'Kind of arc', 'input')),
    ARC_FIELDS.map(([k, l, ph]) => h('label', { class: 'arc__f arc__f--' + k }, h('span', { class: 'field__label' }, l),
      autosize(h('textarea', { class: 'input', rows: 3, value: e.arc[k], placeholder: ph, oninput: (ev) => upd((x) => { x.arc[k] = ev.target.value; }) })))));
}
function arcMoves(e) {
  return readingSeq().flatMap(({ k, b }, i) => (k.arcs || []).filter((m) => m.id === e.id && +m.d).map((m) => ({ k, b, i, d: +m.d, note: m.note || '' })));
}
function arcChart(e, U) {
  const seq = U.flatMap((u) => u.cards);
  const at = new Map(seq.map((k, i) => [k, i]));
  const moves = arcMoves(e).filter((m) => at.has(m.k));
  if (!seq.length) return null;
  const n = Math.max(1, seq.length - 1);
  let pos = 0;
  const pts = moves.map((m) => { const from = pos; pos += m.d; return { ...m, x: (at.get(m.k) / n) * 100, from, to: pos }; });
  const lo = Math.min(0, ...pts.map((p) => p.to)), hi = Math.max(0, ...pts.map((p) => p.to));
  const span = Math.max(3, hi - lo);
  const Y = (v) => 10 + ((hi - v) / span) * 180;
  let start = 0;
  const marks = U.map((u) => { const x = (start / n) * 100; start += u.cards.length; return { x, label: u.label }; });
  return h('div', { class: 'arc__chart' },
    h('span', { class: 'arc__axis', style: { top: Y(0) + 'px' } }),
    h('span', { class: 'arc__end arc__end--top' }, 'Toward the truth'), h('span', { class: 'arc__end arc__end--bot' }, 'Back to the lie'),
    marks.map((m) => h('span', { class: 'arc__part', style: { left: m.x + '%' } }, m.label)),
    pts.map((p) => h('button', { class: 'arc__bar' + (p.d > 0 ? ' is-up' : ' is-down'), type: 'button', title: `${p.k.title || 'Untitled scene'}${p.note ? ': ' + p.note : ''}`, onclick: () => openCard(p.k.id),
      style: { left: p.x + '%', top: Math.min(Y(p.from), Y(p.to)) + 'px', height: Math.max(6, Math.abs(Y(p.from) - Y(p.to))) + 'px' }, 'aria-label': p.k.title || 'Scene' })),
    pts.map((p) => h('span', { class: 'arc__dot', style: { left: `calc(${p.x}% + 9px)`, top: Y(p.to) + 'px' } })));
}

function arcView(e, upd) {
  const moves = arcMoves(e);
  return h('div', { class: 'xone' }, panel('', arcFields(e, upd)), panel('',
    h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, 'Through the story'), h('span', { class: 'spacer' }), h('a', { class: 'small', href: phref('arcs'), onclick: () => { S.arcWho = e.id; } }, 'Open in Arcs')),
    arcChart(e, units()) || h('p', { class: 'muted small' }, 'No scenes yet.'),
    moves.length ? h('ul', { class: 'arc__list' }, moves.map((m) => h('li', {}, h('span', { class: m.d > 0 ? 'ok-text' : 'warn-text' }, m.d > 1 ? '↑↑' : m.d > 0 ? '↑' : m.d < -1 ? '↓↓' : '↓'), cardBtn(m.k), m.note ? h('span', { class: 'muted small' }, ' · ' + m.note) : null)))
      : h('p', { class: 'muted small' }, 'Tag scenes on their cards (“Character arcs”) when this character moves toward the truth or back to the lie.')));
}

export function viewArcs(p) {
  const all = chars();
  if (!all.length) return h('div', { class: 'wrap x' }, empty('No characters yet', 'Add characters in the World tab first.'));
  const has = (e) => Object.values(e.arc).some((v) => String(v).trim()) || arcMoves(e).length;
  const listed = all.filter(has);
  const who = entity(S.arcWho) && isChar(entity(S.arcWho)) ? entity(S.arcWho) : listed[0] || mostSeen(p) || all[0];
  const upd = (fn) => change(() => fn(who), { render: false });
  const pct = (e) => { const m = arcMoves(e); return m.length ? Math.min(100, m.length * 10) : 0; };
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside' }, panel('',
      [...new Set([...listed, who])].map((e) => h('button', { class: 'xside__item' + (e === who ? ' is-on' : ''), type: 'button', 'aria-pressed': String(e === who), onclick: () => { S.arcWho = e.id; render(); } },
        h('strong', {}, e.name || 'Unnamed'), h('span', { class: 'muted small' }, `${e.arc.type ? e.arc.type[0].toUpperCase() + e.arc.type.slice(1) + ' arc · ' : ''}${plural(arcMoves(e).length, 'move')}`),
        h('span', { class: 'xmini' }, h('span', { style: { width: pct(e) + '%' } })))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Another character'), sel([['', 'Choose…'], ...all.filter((e) => !listed.includes(e)).map((e) => [e.id, e.name || 'Unnamed'])], '', (v) => { if (v) { S.arcWho = v; render(); } }, 'Another character', 'input')))),
    h('div', { class: 'xmain' },
      pageHead(who.name || 'Unnamed', `${who.arc.type ? who.arc.type[0].toUpperCase() + who.arc.type.slice(1) + ' arc' : 'Arc'}${inSeriesTop() ? ' across the series' : ''}`, h('a', { class: 'btn btn--sm', href: phref('e/' + who.id) }, 'Open profile')),
      panel('', arcFields(who, upd)),
      panel('', h('h2', { class: 'xpanel__t' }, 'Through the story'), arcChart(who, units(p)) || h('p', { class: 'muted' }, 'No scenes yet.'),
        h('ul', { class: 'arc__list arc__list--grid' }, arcMoves(who).map((m) => h('li', {}, h('span', { class: m.d > 0 ? 'ok-text' : 'warn-text' }, m.d > 1 ? '↑↑' : m.d > 0 ? '↑' : m.d < -1 ? '↓↓' : '↓'), ' ', cardBtn(m.k), m.note ? h('span', { class: 'muted small' }, ' · ' + m.note) : null))),
        h('p', { class: 'muted small' }, 'On a scene card, “Character arcs” has a line for each character in the scene: toward the truth, back to the lie, or nothing.')))));
}

export function arcsBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const c = k();
  for (const e of chars().filter((x) => c.entityIds.includes(x.id))) {
    const m = c.arcs.find((x) => x.id === e.id) || { id: e.id, d: '', note: '' };
    box.append(h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, e.name || 'Unnamed'),
      sel(ARC_D, String(m.d || ''), (v) => upd((cc) => { const x = cc.arcs.find((y) => y.id === e.id); if (x) x.d = v ? +v : 0; else cc.arcs.push({ id: e.id, d: v ? +v : 0, note: '' }); cc.arcs = cc.arcs.filter((y) => y.d || y.note); }), `${e.name} arc`),
      h('input', { class: 'input input--sm xbox__grow', value: m.note, placeholder: 'What shifts (optional)', 'aria-label': 'Note', oninput: (ev) => upd((cc) => { const x = cc.arcs.find((y) => y.id === e.id); if (x) x.note = ev.target.value; else cc.arcs.push({ id: e.id, d: 0, note: ev.target.value }); }) })));
  }
  return box;
}

// ======================================================================
// Relationships, changing through the story
// ======================================================================

const pk = (a, b) => [a, b].sort().join('|');
// Relationships as of reading position `upto` (Infinity = the end).
export function relsAt(upto = Infinity) {
  const W = P();
  const m = new Map();
  for (const r of W.rels) if (r.a && r.b && r.a !== r.b) m.set(pk(r.a, r.b), { a: r.a, b: r.b, kind: r.kind, base: r, hist: [{ kind: r.kind, k: null }] });
  readingSeq().forEach(({ k }, i) => {
    if (i > upto) return;
    for (const x of k.rels || []) {
      if (!x.a || !x.b || x.a === x.b) continue;
      const key = pk(x.a, x.b);
      const cur = m.get(key) || { a: x.a, b: x.b, kind: 'none', hist: [] };
      cur.kind = x.kind; cur.hist.push({ kind: x.kind, k });
      m.set(key, cur);
    }
  });
  return m;
}

export function viewWeb(p) {
  const W = P();
  const seq = readingSeq();
  const steps = [{ label: 'The start', pos: -1 }, ...seq.map(({ k }, i) => ({ k, i })).filter(({ k }) => (k.rels || []).length).map(({ k, i }) => ({ label: `${where(k)} · ${k.title || 'Untitled scene'}`, pos: i, k }))];
  const si = Math.min(steps.length - 1, S.webStep ?? steps.length - 1);
  const step = steps[si];
  const state = relsAt(step.pos);
  const hide = S.webHide || (S.webHide = {});
  const live = [...state.values()].filter((r) => r.kind !== 'none' && !hide[r.kind]);
  const ids = [...new Set([...state.values()].flatMap((r) => [r.a, r.b]))].filter((id) => entity(id));
  if (!ids.length) {
    return h('div', { class: 'wrap x' }, pageHead('Relationships', 'Who is what to whom, changing as the story goes.'),
      empty('No relationships yet', 'Add how characters stand at the start of the story. Scene cards can change them later (“Relationships change here”).', h('button', { class: 'btn btn--primary', type: 'button', onclick: () => relDialog() }, icon('plus'), ' Relationship')));
  }
  const deg = (id) => live.filter((r) => r.a === id || r.b === id).length;
  const selId = ids.includes(S.webSel) ? S.webSel : [...ids].sort((a, b) => deg(b) - deg(a))[0];
  const focus = !!S.webFocus;
  const pos = (id, i) => W.webPos[id] || { x: 0.5 + 0.38 * Math.cos((2 * Math.PI * i) / ids.length - Math.PI / 2), y: 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / ids.length - Math.PI / 2) };
  const P0 = Object.fromEntries(ids.map((id, i) => [id, pos(id, i)]));
  const linked = new Set(live.filter((r) => r.a === selId || r.b === selId).flatMap((r) => [r.a, r.b]));
  const box = h('div', { class: 'web' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'web__svg'); svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  for (const r of live) {
    const a = P0[r.a], b = P0[r.b];
    if (!a || !b) continue;
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', a.x * 1000); l.setAttribute('y1', a.y * 1000); l.setAttribute('x2', b.x * 1000); l.setAttribute('y2', b.y * 1000);
    l.setAttribute('stroke', (RK[r.kind] || RK.other).c); l.setAttribute('stroke-width', '3'); l.setAttribute('vector-effect', 'non-scaling-stroke');
    if ((RK[r.kind] || RK.other).d) l.setAttribute('stroke-dasharray', (RK[r.kind] || RK.other).d);
    l.setAttribute('opacity', focus && r.a !== selId && r.b !== selId ? '0.12' : r.a === selId || r.b === selId ? '1' : '0.55');
    svg.append(l);
  }
  box.append(svg);
  for (const r of live) {
    const a = P0[r.a], b = P0[r.b];
    if (!a || !b) continue;
    const dim = focus && r.a !== selId && r.b !== selId;
    box.append(h('span', { class: 'web__lab', style: { left: ((a.x + b.x) / 2) * 100 + '%', top: ((a.y + b.y) / 2) * 100 + '%', '--c': (RK[r.kind] || RK.other).c, opacity: dim ? 0.15 : 1 } }, (RK[r.kind] || RK.other).l));
  }
  ids.forEach((id) => {
    const e = entity(id);
    const at = P0[id];
    const node = h('button', { class: 'web__node' + (id === selId ? ' is-sel' : ''), type: 'button', 'aria-pressed': String(id === selId),
      style: { left: at.x * 100 + '%', top: at.y * 100 + '%', '--c': charColor(e), opacity: focus && id !== selId && !linked.has(id) ? 0.25 : 1 } },
    h('span', { class: 'web__av' }, ini(e.name)), h('span', { class: 'web__name' }, e.name || 'Unnamed'));
    let moved = false;
    node.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      node.setPointerCapture(ev.pointerId);
      const rect = box.getBoundingClientRect();
      moved = false;
      const mv = (m) => {
        const x = Math.max(0.04, Math.min(0.96, (m.clientX - rect.left) / rect.width)), y = Math.max(0.05, Math.min(0.95, (m.clientY - rect.top) / rect.height));
        if (Math.abs(x - at.x) + Math.abs(y - at.y) > 0.01) moved = true;
        at.x = x; at.y = y; node.style.left = x * 100 + '%'; node.style.top = y * 100 + '%';
      };
      const up = () => {
        node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up);
        if (moved) change(() => { for (const [k, v] of Object.entries(P0)) W.webPos[k] = { x: v.x, y: v.y }; });
        else { S.webSel = id; render(); }
      };
      node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up);
    });
    node.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); S.webSel = id; render(); } });
    box.append(node);
  });
  const selE = entity(selId);
  const mine = [...state.values()].filter((r) => (r.a === selId || r.b === selId));
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Relationships', 'Who is what to whom. Step through the story to watch it change. Drag people to arrange them.',
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => relDialog(selId) }, icon('plus'), ' Relationship')),
    panel('web-steps', h('span', { class: 'xlabel' }, 'As of'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Earlier', disabled: si === 0, onclick: () => { S.webStep = si - 1; render(); } }, icon('left')),
      sel(steps.map((s, i) => [i, s.label]), si, (v) => { S.webStep = +v; render(); }, 'Point in the story', 'input input--sm web-steps__sel'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Later', disabled: si === steps.length - 1, onclick: () => { S.webStep = si + 1; render(); } }, icon('right')),
      step.k ? h('span', { class: 'muted small' }, step.k.rels.map((x) => `${nameOf(x.a)} & ${nameOf(x.b)}: ${x.kind === 'none' ? 'no longer linked' : (RK[x.kind] || RK.other).l}`).join(' · ')) : h('span', { class: 'muted small' }, 'How everyone stands before the first scene.')),
    h('div', { class: 'web-layout' },
      h('aside', { class: 'xside' }, panel('',
        h('span', { class: 'xlabel' }, 'Kinds'),
        REL_KINDS.map(([v, l, c, d]) => h('label', { class: 'check web__kind' }, h('input', { type: 'checkbox', checked: !hide[v], onchange: (ev) => { hide[v] = !ev.target.checked; render(); } }),
          h('span', { class: 'web__sw', style: { borderTopColor: c, borderTopStyle: d ? 'dashed' : 'solid' } }), l)),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: focus, onchange: (ev) => { S.webFocus = ev.target.checked; render(); } }), ` Only ${selE?.name || 'their'} links`))),
      box,
      h('aside', { class: 'xside' }, panel('web-who',
        h('div', { class: 'web-who__head' }, h('span', { class: 'web__av web__av--lg', style: { '--c': charColor(selE) } }, ini(selE?.name)),
          h('div', {}, h('a', { class: 'web-who__name', href: phref('e/' + selId) }, selE?.name || 'Unnamed'), h('span', { class: 'muted small' }, factionsOf(selE).map(nameOf).join(', ')))),
        h('span', { class: 'xlabel' }, `As of ${step.label}`),
        mine.filter((r) => r.kind !== 'none').length ? mine.filter((r) => r.kind !== 'none').map((r) => h('div', { class: 'web-rel' },
          h('span', { class: 'web-rel__k', style: { '--c': (RK[r.kind] || RK.other).c } }, (RK[r.kind] || RK.other).l), ' · ', h('strong', {}, nameOf(r.a === selId ? r.b : r.a)),
          r.hist.length > 1 ? h('span', { class: 'web-rel__h' }, r.hist.map((x) => (x.kind === 'none' ? 'ended' : (RK[x.kind] || RK.other).l)).join(' → '), r.hist[r.hist.length - 1].k ? [' in ', cardBtn(r.hist[r.hist.length - 1].k)] : null) : null))
          : h('p', { class: 'muted small' }, 'No relationships at this point.'),
        h('span', { class: 'xlabel' }, 'At the start of the story'),
        W.rels.filter((r) => r.a === selId || r.b === selId).map((r) => h('div', { class: 'web-base' },
          sel(REL_KINDS.map(([v, l]) => [v, l]), r.kind, (v) => change(() => { r.kind = v; }), 'Kind'),
          h('span', { class: 'small' }, nameOf(r.a === selId ? r.b : r.a)),
          h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { W.rels = W.rels.filter((x) => x !== r); }) }, icon('x')))),
        h('p', { class: 'muted small' }, 'Changes come from scene cards: “Relationships change here”.')))));
}

function relDialog(a = '') {
  const cs = chars();
  let A = a || (cs[0] || {}).id, B = (cs.find((x) => x.id !== A) || {}).id, K = 'ally';
  const dl = h('dialog', { class: 'dlg' });
  const save = () => {
    if (!A || !B || A === B) { toast('Choose two different characters.'); return; }
    change(() => { const W = P(); W.rels = W.rels.filter((r) => pk(r.a, r.b) !== pk(A, B)); W.rels.push({ id: uid(), a: A, b: B, kind: K }); });
    dl.close();
  };
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, 'Relationship at the start'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))),
    h('div', { class: 'dlg__body' }, h('div', { class: 'xrow' },
      sel(cs.map((e) => [e.id, e.name || 'Unnamed']), A, (v) => { A = v; }, 'Character', 'input'),
      sel(REL_KINDS.map(([v, l]) => [v, l]), K, (v) => { K = v; }, 'Kind', 'input'),
      sel(cs.map((e) => [e.id, e.name || 'Unnamed']), B, (v) => { B = v; }, 'Other character', 'input')),
    h('p', { class: 'muted small' }, 'For changes later in the story, use “Relationships change here” on the scene card.')),
    h('footer', { class: 'dlg__foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dl.close() }, 'Cancel'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, 'Add'))]);
  dl.addEventListener('close', () => dl.remove());
  document.body.append(dl);
  dl.showModal();
}

export function relsBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    const cs = chars();
    const inScene = cs.filter((e) => c.entityIds.includes(e.id));
    const opts = [...inScene, ...cs.filter((e) => !inScene.includes(e))].map((e) => [e.id, e.name || 'Unnamed']);
    c.rels.forEach((r, i) => box.append(h('div', { class: 'xbox__row' },
      sel(opts, r.a, (v) => upd((cc) => { cc.rels[i].a = v; }), 'Character'), h('span', { class: 'muted small' }, 'and'),
      sel(opts, r.b, (v) => upd((cc) => { cc.rels[i].b = v; }), 'Other character'), h('span', { class: 'muted small' }, 'become'),
      sel([...REL_KINDS.map(([v, l]) => [v, l]), ['none', 'No longer linked']], r.kind, (v) => upd((cc) => { cc.rels[i].kind = v; }), 'Becomes'),
      h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => { upd((cc) => { cc.rels.splice(i, 1); }); draw(); } }, icon('x')))));
    if (cs.length < 2) { box.append(h('p', { class: 'muted small' }, 'Add at least two characters to track relationships.')); return; }
    box.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { upd((cc) => { cc.rels.push({ id: uid(), a: opts[0][0], b: opts[1][0], kind: 'ally' }); }); draw(); } }, icon('plus'), ' A relationship changes'));
  };
  draw();
  return box;
}

// ======================================================================
// Family trees
// ======================================================================

function familyEdges() {
  const out = [];
  for (const e of P().entities) for (const f of e.family || []) if (entity(f.id)) out.push({ from: e.id, to: f.id, kind: f.kind, hidden: f.hidden || null });
  return out;
}
function components(edges) {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const e of edges) { add(e.from, e.to); add(e.to, e.from); }
  const seen = new Set(), comps = [];
  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    const c = [], st = [id];
    seen.add(id);
    while (st.length) { const x = st.pop(); c.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    comps.push(c);
  }
  return comps.sort((a, b) => b.length - a.length);
}
const famName = (ids) => {
  const sur = {};
  for (const id of ids) { const n = (entity(id)?.name || '').trim().split(/\s+/); if (n.length > 1) sur[n[n.length - 1]] = (sur[n[n.length - 1]] || 0) + 1; }
  const top = Object.entries(sur).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
  return top.length ? top.join(' / ') : (entity(ids[0])?.name || 'Family');
};

function familyChart(ids, edges) {
  const E = edges.filter((e) => ids.includes(e.from) && ids.includes(e.to));
  const gen = new Map([[ids[0], 0]]);
  const q = [ids[0]];
  while (q.length) {
    const x = q.shift();
    for (const e of E) {
      let y = null, g = null;
      if (e.from === x) { y = e.to; g = gen.get(x) + (e.kind === 'parent' || e.kind === 'raised' ? 1 : 0); }
      else if (e.to === x) { y = e.from; g = gen.get(x) - (e.kind === 'parent' || e.kind === 'raised' ? 1 : 0); }
      if (y != null && !gen.has(y)) { gen.set(y, g); q.push(y); }
    }
  }
  for (const id of ids) if (!gen.has(id)) gen.set(id, 0);
  const min = Math.min(...gen.values());
  const rows = [];
  for (const [id, g] of gen) (rows[g - min] || (rows[g - min] = [])).push(id);
  const parentsOf = (id) => E.filter((e) => e.to === id && (e.kind === 'parent' || e.kind === 'raised')).map((e) => e.from);
  const spouseOf = (id) => E.filter((e) => e.kind === 'spouse' && (e.from === id || e.to === id)).map((e) => (e.from === id ? e.to : e.from));
  const BW = 176, BH = 56, GX = 36, GY = 104;
  const X = new Map();
  rows.forEach((r, gi) => {
    if (gi > 0) r.sort((a, b) => { const pa = parentsOf(a).map((x) => X.get(x) ?? 0), pb = parentsOf(b).map((x) => X.get(x) ?? 0); return (pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 1e4) - (pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 1e4); });
    const ordered = [];
    for (const id of r) { if (ordered.includes(id)) continue; ordered.push(id); for (const s of spouseOf(id)) if (r.includes(s) && !ordered.includes(s)) ordered.push(s); }
    rows[gi] = ordered;
    ordered.forEach((id, i) => X.set(id, i * (BW + GX)));
  });
  const width = Math.max(...rows.map((r) => r.length)) * (BW + GX);
  rows.forEach((r) => { const off = (width - r.length * (BW + GX)) / 2; r.forEach((id) => X.set(id, X.get(id) + off)); });
  const Y = (id) => (gen.get(id) - min) * (BH + GY) + 20;
  const H = rows.length * (BH + GY) + 10;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'fam__svg'); svg.setAttribute('width', width + 40); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true');
  const path = (d, kind, hidden) => {
    const el = document.createElementNS(svgNS, 'path');
    el.setAttribute('d', d); el.setAttribute('fill', 'none');
    el.setAttribute('class', 'fam__line fam__line--' + (hidden ? 'hidden' : kind));
    svg.append(el);
  };
  const cx = (id) => X.get(id) + 20 + BW / 2;
  const done = new Set();
  for (const id of ids) {
    const ps = E.filter((e) => e.to === id && (e.kind === 'parent' || e.kind === 'raised'));
    const ty = Y(id), mid = ty - GY / 2;
    const pair = ps.length === 2 && spouseOf(ps[0].from).includes(ps[1].from);
    if (pair && ps.every((e) => e.kind === 'parent' && !e.hidden)) {
      const mx = (cx(ps[0].from) + cx(ps[1].from)) / 2, py = Y(ps[0].from) + BH / 2;
      path(`M${mx},${py} V${mid} H${cx(id)} V${ty}`, 'parent');
    } else for (const e of ps) path(`M${cx(e.from)},${Y(e.from) + BH} V${mid} H${cx(id)} V${ty}`, e.kind, e.hidden);
  }
  for (const e of E) {
    if (e.kind === 'spouse') {
      const key = pk(e.from, e.to); if (done.has(key)) continue; done.add(key);
      const [a, b] = X.get(e.from) < X.get(e.to) ? [e.from, e.to] : [e.to, e.from];
      path(Y(a) === Y(b) ? `M${X.get(a) + 20 + BW},${Y(a) + BH / 2} H${X.get(b) + 20}` : `M${cx(a)},${Y(a) + BH / 2} L${cx(b)},${Y(b) + BH / 2}`, 'spouse', e.hidden);
    } else if (e.kind === 'sibling') {
      const key = 's' + pk(e.from, e.to); if (done.has(key)) continue; done.add(key);
      path(`M${cx(e.from)},${Y(e.from)} V${Y(e.from) - 14} H${cx(e.to)} V${Y(e.to)}`, 'sibling', e.hidden);
    }
  }
  const wrap = h('div', { class: 'fam', style: { width: width + 40 + 'px', height: H + 'px' } }, svg,
    ids.map((id) => { const e = entity(id); return h('a', { class: 'fam__box', href: phref('e/' + id), style: { left: X.get(id) + 20 + 'px', top: Y(id) + 'px', width: BW + 'px', '--c': charColor(e) } },
      h('span', { class: 'web__av' }, ini(e.name)), h('span', { class: 'fam__t' }, h('strong', {}, e.name || 'Unnamed'), h('span', { class: 'muted small' }, e.summary || (e.born ? `born ${yearLabel(e.born.y)}` : '')))); }),
    E.filter((e) => e.hidden).map((e) => { const k = scopeCards().find((x) => x.id === e.hidden); return k ? h('span', { class: 'fam__secret', style: { left: (cx(e.from) + cx(e.to)) / 2 - 40 + 'px', top: (Y(e.from) + Y(e.to)) / 2 + BH / 2 + 'px' } }, `secret until ${cardInfo(k).num}`) : null; }));
  return wrap;
}

export function viewFamily(p) {
  const edges = familyEdges();
  const comps = components(edges);
  if (!comps.length) {
    return h('div', { class: 'wrap x' }, pageHead('Family trees', 'Drawn from the Family tab on each character.'),
      empty('No family links yet', 'Open a character, choose the Family tab, and add parents, children, marriages and who raised whom.', h('a', { class: 'btn', href: phref('chars') }, 'Characters')));
  }
  const ci = Math.min(comps.length - 1, S.famSel || 0);
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Family trees', 'Drawn from the Family tab on each character. Hidden links (dashed) stay secret until the scene you pick.',
      comps.length > 1 ? h('label', { class: 'xinline' }, 'Family', sel(comps.map((c, i) => [i, `${famName(c)} (${c.length})`]), ci, (v) => { S.famSel = +v; render(); }, 'Family')) : null),
    panel('fam-wrap', h('div', { class: 'fam-scroll' }, familyChart(comps[ci], edges)),
      h('div', { class: 'xlegend' }, h('span', {}, h('i', { class: 'fam__key' }), 'Parent / married'), h('span', {}, h('i', { class: 'fam__key fam__key--raised' }), 'Raised by'),
        h('span', {}, h('i', { class: 'fam__key fam__key--hidden' }), 'Secret (revealed later)'), h('span', {}, h('i', { class: 'fam__key fam__key--sibling' }), 'Sibling'))));
}

function familyEditor(e) {
  const cs = chars().filter((x) => x !== e);
  const cards = scopeCards();
  const rows = e.family;
  const incoming = P().entities.filter((x) => x !== e && (x.family || []).some((f) => f.id === e.id)).flatMap((x) => x.family.filter((f) => f.id === e.id).map((f) => ({ x, f })));
  const inLabel = { parent: 'Child of', spouse: 'Married to', raised: 'Raised by', sibling: 'Sibling of' };
  const comps = components(familyEdges());
  const mine = comps.find((c) => c.includes(e.id));
  return h('div', { class: 'xone' }, panel('',
    h('h2', { class: 'xpanel__t' }, 'Family'),
    rows.map((f, i) => h('div', { class: 'xbox__row' },
      sel(FAMILY_KINDS, f.kind, (v) => change(() => { f.kind = v; }), 'Relation'),
      sel(cs.map((x) => [x.id, x.name || 'Unnamed']), f.id, (v) => change(() => { f.id = v; }), 'Person'),
      h('span', { class: 'muted small' }, 'secret until'),
      sel([['', '— not secret —'], ...cards.map((k) => [k.id, `${where(k)} · ${k.title || 'Untitled'}`])], f.hidden || '', (v) => change(() => { f.hidden = v || null; }), 'Secret until'),
      h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { e.family.splice(i, 1); }) }, icon('x')))),
    cs.length ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { e.family.push({ kind: 'parent', id: cs[0].id, hidden: null }); }) }, icon('plus'), ' Relation') : h('p', { class: 'muted small' }, 'Add more characters first.'),
    incoming.length ? [h('span', { class: 'xlabel' }, 'Set on other characters'), h('ul', { class: 'xlist' }, incoming.map(({ x, f }) => h('li', {}, `${inLabel[f.kind] || 'Linked to'} `, h('a', { href: phref('e/' + x.id) }, x.name || 'Unnamed'))))] : null),
  mine ? panel('fam-wrap', h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, 'Tree'), h('span', { class: 'spacer' }), h('a', { class: 'small', href: phref('family'), onclick: () => { S.famSel = comps.indexOf(mine); } }, 'Open in Family trees')),
    h('div', { class: 'fam-scroll' }, familyChart(mine, familyEdges()))) : null);
}

// ======================================================================
// Characters list with filters
// ======================================================================

export function viewChars(p) {
  const ct = charType();
  if (!ct) return h('div', { class: 'wrap x' }, empty('No characters type', 'Add an entry type for characters in Settings.'));
  const F = S.cf || (S.cf = { books: {}, all: false, fac: {}, rel: {}, relTo: '', sheet: false, none: false, major: false, sel: {}, q: '', sort: 'scenes', group: '' });
  const all = chars();
  const books = isSeries() ? S.project.books : [P()];
  const inBook = (e, b) => b.cards.some((k) => k.entityIds.includes(e.id));
  const scenes = (e) => appearances(p, e.id).length;
  const facs = factions();
  const ends = relsAt();
  const relTo = entity(F.relTo) ? F.relTo : (mostSeen(p) || {}).id;
  const relOf = (e) => { const r = ends.get(pk(e.id, relTo)); return r && r.kind !== 'none' ? r.kind : ''; };
  const selFields = ct.fields.filter((f) => f.type === 'select');
  const onB = Object.keys(F.books).filter((k) => F.books[k] && books.some((b) => b.id === k || (!isSeries() && k === 'p')));
  const onF = Object.keys(F.fac).filter((k) => F.fac[k]);
  const onR = Object.keys(F.rel).filter((k) => F.rel[k]);
  const q = F.q.trim().toLowerCase();
  const bid = (b) => b.id || 'p';
  let list = all.filter((e) => {
    if (onB.length && isSeries()) { const ins = onB.map((id) => inBook(e, books.find((b) => bid(b) === id))); if (F.all ? !ins.every(Boolean) : !ins.some(Boolean)) return false; }
    if (onF.length && !factionsOf(e).some((f) => onF.includes(f))) return false;
    if (onR.length && !onR.includes(relOf(e))) return false;
    if (F.sheet && !e.sheet) return false;
    if (F.none && scenes(e)) return false;
    if (F.major && !e.major) return false;
    for (const f of selFields) if (F.sel[f.id] && e.fields[f.id] !== F.sel[f.id]) return false;
    if (q && ![e.name, ...e.aliases, e.summary].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const first = (e) => { const a = appearances(p, e.id)[0]; return a ? readingSeq().findIndex((x) => x.k === a) : 1e9; };
  list = list.sort(F.sort === 'az' ? (a, b) => (a.name || '').localeCompare(b.name || '') : F.sort === 'first' ? (a, b) => first(a) - first(b) : (a, b) => scenes(b) - scenes(a));
  const active = [
    ...onB.map((id) => ({ label: `In ${(books.find((b) => bid(b) === id) || {}).title}`, clear: () => { delete F.books[id]; } })),
    ...onF.map((id) => ({ label: nameOf(id), clear: () => { delete F.fac[id]; } })),
    ...onR.map((r) => ({ label: `${(RK[r] || RK.other).l} of ${nameOf(relTo)}`, clear: () => { delete F.rel[r]; } })),
    F.sheet ? { label: 'Has a game sheet', clear: () => { F.sheet = false; } } : null, F.none ? { label: 'In no scene yet', clear: () => { F.none = false; } } : null,
    F.major ? { label: 'Major characters', clear: () => { F.major = false; } } : null,
    ...selFields.filter((f) => F.sel[f.id]).map((f) => ({ label: `${f.name}: ${F.sel[f.id]}`, clear: () => { delete F.sel[f.id]; } })),
  ].filter(Boolean);
  const card = (e) => {
    const n = scenes(e), r = relOf(e);
    return h('a', { class: 'ccard', href: phref('e/' + e.id) },
      h('span', { class: 'ccard__top' }, h('span', { class: 'web__av', style: { '--c': charColor(e) } }, ini(e.name)),
        h('span', { class: 'ccard__t' }, h('strong', {}, e.name || 'Unnamed'), h('span', { class: 'muted small' }, e.summary || ''))),
      h('span', { class: 'ccard__tags' }, factionsOf(e).map((f) => h('span', { class: 'ccard__fac' }, nameOf(f))), r && e.id !== relTo ? h('span', { class: 'ccard__rel' }, `${(RK[r] || RK.other).l} of ${nameOf(relTo).split(' ')[0]}`) : null),
      h('span', { class: 'ccard__books' }, isSeries() ? books.filter((b) => inBook(e, b)).map((b) => h('span', { class: 'ccard__bk', title: b.title, style: { background: (S.project.groups.find((g) => g.id === b.groupId) || S.project.groups[0]).color } })) : null,
        h('span', { class: 'muted small' }, n ? plural(n, 'scene') : 'No scenes yet')));
  };
  let body;
  if (F.group === 'faction' && facs.length) {
    const gs = [...facs.map((f) => [f.name || 'Unnamed', list.filter((e) => factionsOf(e).includes(f.id))]), ['No faction', list.filter((e) => !factionsOf(e).length)]].filter(([, l]) => l.length);
    body = gs.map(([t, l]) => h('section', { class: 'cgroup' }, h('h2', { class: 'cgroup__t' }, t, h('span', { class: 'muted small' }, ` ${l.length}`)), h('div', { class: 'ccards' }, l.map(card))));
  } else if (F.group === 'book' && isSeries()) {
    body = books.map((b) => [b.title, list.filter((e) => inBook(e, b))]).filter(([, l]) => l.length).map(([t, l]) => h('section', { class: 'cgroup' }, h('h2', { class: 'cgroup__t' }, t, h('span', { class: 'muted small' }, ` ${l.length}`)), h('div', { class: 'ccards' }, l.map(card))));
  } else body = h('div', { class: 'ccards' }, list.map(card));
  const ck = (label, key) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!F[key], onchange: (ev) => { F[key] = ev.target.checked; render(); } }), ' ' + label);
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside cfilters' }, panel('',
      isSeries() ? h('fieldset', { class: 'xfs' }, h('legend', {}, 'In these stories'),
        books.map((b) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!F.books[bid(b)], onchange: (ev) => { F.books[bid(b)] = ev.target.checked; render(); } }), ' ', b.title, h('span', { class: 'muted small' }, ` ${all.filter((e) => inBook(e, b)).length}`))),
        seg([['any', 'In any'], ['all', 'In all checked']], F.all ? 'all' : 'any', (v) => { F.all = v === 'all'; render(); }, 'Match')) : null,
      facs.length ? h('fieldset', { class: 'xfs' }, h('legend', {}, 'Factions'), h('div', { class: 'xchips' }, facs.map((f) => h('button', { class: 'xfilter' + (F.fac[f.id] ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!F.fac[f.id]), onclick: () => { F.fac[f.id] = !F.fac[f.id]; render(); } }, f.name || 'Unnamed')))) : null,
      all.length > 1 ? h('fieldset', { class: 'xfs' }, h('legend', {}, 'Related to'), sel(all.map((e) => [e.id, e.name || 'Unnamed']), relTo, (v) => { F.relTo = v; render(); }, 'Related to', 'input input--sm'),
        h('div', { class: 'xchips' }, REL_KINDS.map(([v, l]) => h('button', { class: 'xfilter' + (F.rel[v] ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!F.rel[v]), onclick: () => { F.rel[v] = !F.rel[v]; render(); } }, l))),
        h('span', { class: 'muted small' }, 'As of the end of the story so far.')) : null,
      h('fieldset', { class: 'xfs' }, h('legend', {}, 'More'), ck('Major characters', 'major'), gameOn() ? ck('Has a game sheet', 'sheet') : null, ck('In no scene yet', 'none'),
        selFields.map((f) => h('label', { class: 'xinline' }, f.name, sel([['', 'Any'], ...(f.options || []).map((o) => [o, o])], F.sel[f.id] || '', (v) => { F.sel[f.id] = v; render(); }, f.name)))))),
    h('div', { class: 'xmain' },
      pageHead('Characters', `${list.length} of ${all.length}`,
        h('input', { class: 'input input--sm cfind', type: 'search', placeholder: 'Search characters', value: F.q, 'aria-label': 'Search characters', oninput: (ev) => { F.q = ev.target.value; const at = ev.target.selectionStart; render(); const f = document.querySelector('.cfind'); if (f) { f.focus(); f.setSelectionRange(at, at); } } }),
        h('label', { class: 'xinline' }, 'Sort', sel([['scenes', 'Most scenes'], ['az', 'A–Z'], ['first', 'First appearance']], F.sort, (v) => { F.sort = v; render(); }, 'Sort')),
        h('label', { class: 'xinline' }, 'Group', sel([['', 'None'], facs.length ? ['faction', 'By faction'] : null, isSeries() ? ['book', 'By book'] : null].filter(Boolean), F.group, (v) => { F.group = v; render(); }, 'Group')),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => { const e = newEntity(ct.id); go(pbase('e/' + e.id)); } }, icon('plus'), ` New ${(ct.singular || 'character').toLowerCase()}`)),
      active.length ? h('div', { class: 'xactive' }, active.map((a) => h('span', { class: 'xactive__chip' }, a.label, h('button', { type: 'button', 'aria-label': `Remove filter ${a.label}`, onclick: () => { a.clear(); render(); } }, '×'))),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { Object.assign(F, { books: {}, fac: {}, rel: {}, sheet: false, none: false, major: false, sel: {}, q: '' }); render(); } }, 'Clear all')) : null,
      list.length ? body : h('p', { class: 'muted' }, all.length ? 'No characters match. Try removing a filter.' : 'No characters yet.'))));
}

// ======================================================================
// Names & spellings
// ======================================================================

const cardTexts = () => (isSeries() ? S.project.books.flatMap((b) => b.cards) : P().cards);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^\\p{L}\\p{N}])(${reEsc(w)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
function lev1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}
// Misspellings found in scene titles, summaries and notes.
export function nameIssues() {
  const cards = cardTexts();
  const ents = P().entities;
  const found = [];
  for (const e of ents) for (const w of e.wrong) {
    if (!w.trim()) continue;
    const hits = cards.filter((k) => wordRe(w).test([k.title, k.summary, k.notes].join(' ')));
    if (hits.length) found.push({ e, w, hits });
  }
  const known = new Set(ents.flatMap((e) => [e.name, ...e.aliases]).flatMap((n) => (n || '').split(/\s+/)).filter((x) => x.length >= 4).map((x) => x.toLowerCase()));
  const wrongs = new Set(ents.flatMap((e) => e.wrong.map((w) => w.toLowerCase())));
  const guess = new Map();
  for (const k of cards) for (const m of [k.title, k.summary, k.notes].join(' ').matchAll(/\b\p{Lu}[\p{L}’']{4,}\b/gu)) {
    const w = m[0], lw = w.toLowerCase();
    if (known.has(lw) || wrongs.has(lw) || dismissed('name:' + lw)) continue;
    const t = [...known].find((x) => x.length >= 5 && lev1(lw, x));
    if (!t) continue;
    const e = ents.find((x) => [x.name, ...x.aliases].join(' ').toLowerCase().split(/\s+/).includes(t));
    if (!e) continue;
    const g = guess.get(lw) || { w, e, hits: [] };
    if (!g.hits.includes(k)) g.hits.push(k);
    guess.set(lw, g);
  }
  return { found, guesses: [...guess.values()].slice(0, 30) };
}

function fixAll(e, w, hits) {
  change(() => { for (const k of hits) for (const f of ['title', 'summary', 'notes']) k[f] = (k[f] || '').replace(wordRe(w), (m, pre) => pre + (e.name || w)); });
  toast(`Fixed “${w}” in ${plural(hits.length, 'scene')}`);
}

export function viewNames(p) {
  const ents = [...P().entities].sort((a, b) => ((typeOf(a) || {}).name || '').localeCompare((typeOf(b) || {}).name || '') || (a.name || '').localeCompare(b.name || ''));
  const { found, guesses } = nameIssues();
  const upd = (e) => () => change(() => {}, { render: false });
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Names & spellings', 'One correct spelling per entry, plus every other way it may appear. Search counts them as the same entry; checks look for the misspellings.'),
    found.length || guesses.length ? panel('', h('h2', { class: 'xpanel__t' }, 'Found in your scenes'),
      found.map(({ e, w, hits }) => h('div', { class: 'xwarnrow' }, h('span', {}, `“${w}” in ${plural(hits.length, 'scene')}: should be `, h('strong', {}, e.name)),
        h('span', { class: 'spacer' }), hits.slice(0, 3).map((k) => cardBtn(k)), h('button', { class: 'btn btn--sm', type: 'button', onclick: () => fixAll(e, w, hits) }, 'Fix all'))),
      guesses.map(({ w, e, hits }) => h('div', { class: 'xwarnrow' }, h('span', {}, `“${w}” in ${plural(hits.length, 'scene')}. Did you mean `, h('strong', {}, e.name), '?'),
        h('span', { class: 'spacer' }), cardBtn(hits[0]),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { e.wrong.push(w); fixAll(e, w, hits); } }, 'Fix'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { P().dismissed.push('name:' + w.toLowerCase()); }) }, 'It’s a different word')))) : null,
    panel('names', h('table', { class: 'names__t' },
      h('thead', {}, h('tr', {}, ['Correct spelling', 'Also counts as', 'Watch for (wrong)', 'Say it'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, ents.map((e) => h('tr', {},
        h('td', {}, h('a', { href: phref('e/' + e.id) }, h('strong', {}, e.name || 'Unnamed')), h('br'), h('span', { class: 'muted small' }, (typeOf(e) || {}).singular || '')),
        h('td', {}, chipsEditor(e.aliases, upd(e), { placeholder: 'Add', label: `Other names for ${e.name}` })),
        h('td', {}, chipsEditor(e.wrong, upd(e), { placeholder: 'Add', label: `Misspellings of ${e.name}`, cls: 'xchips--bad' })),
        h('td', {}, h('input', { class: 'input input--sm', value: e.say, placeholder: '—', 'aria-label': `How to say ${e.name}`, oninput: (ev) => change(() => { e.say = ev.target.value; }, { render: false }) }))))))));
}

// ======================================================================
// Secrets: who knows what, and when
// ======================================================================

// Walks the story for one secret. States: 0 doesn’t know, 1 suspects, 2 knows, 3 believes a lie.
export function secretRun(s) {
  const st = new Map([['reader', 0]]);
  for (const id of s.known) st.set(id, 2);
  const events = [], problems = [];
  readingSeq().forEach(({ k }, i) => {
    for (const r of k.reveals || []) {
      if (r.secret !== s.id || !r.who) continue;
      const cur = st.get(r.who) || 0;
      if (r.how === 'acts') { if (cur !== 2) problems.push({ who: r.who, k, i }); }
      else if (r.how === 'learns') st.set(r.who, 2);
      else if (r.how === 'suspects') { if (cur !== 2) st.set(r.who, 1); }
      else if (r.how === 'lie') { if (cur !== 2) st.set(r.who, 3); }
      events.push({ ...r, k, i, before: cur, after: st.get(r.who) || 0 });
    }
  });
  return { events, problems, end: st };
}
export function secretProblems() {
  return P().secrets.flatMap((s) => secretRun(s).problems.map((x) => ({ s, ...x }))).filter((x) => !dismissed(`secret:${x.s.id}:${x.who}:${x.k.id}`));
}
function knowsAtEnd(id) {
  return P().secrets.map((s) => ({ s, st: secretRun(s).end.get(id) || 0 })).filter((x) => x.st);
}

export function viewSecrets(p) {
  const W = P();
  const list = W.secrets;
  const K = Object.fromEntries(SECRET_KINDS);
  const addBtn = h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
    const name = await ask('New secret', 'What is it? (a short name)', '', 'Add');
    if (!name) return;
    const id = uid();
    change(() => { W.secrets.push({ id, kind: 'secret', name, truth: '', known: [] }); S.secretSel = id; });
  } }, icon('plus'), ' Secret');
  if (!list.length) {
    return h('div', { class: 'wrap x' }, pageHead('Secrets', 'Who knows what, and when the reader finds out.', addBtn),
      empty('No secrets yet', 'Add the secrets, twists, clues and lies in your story. Then, on scene cards, note who learns them (“Secrets revealed”).'));
  }
  const cur = list.find((s) => s.id === S.secretSel) || list[0];
  const run = secretRun(cur);
  const U = units(p);
  const pos = positions();
  const unitEnd = U.map((u) => (u.cards.length ? pos.get(u.cards[u.cards.length - 1]) : null));
  const who = ['reader', ...new Set([...cur.known, ...run.events.map((e) => e.who)].filter((id) => id !== 'reader' && entity(id)))];
  const filt = S.secretFilt || 'all';
  const shown = list.filter((s) => filt === 'all' || (filt === 'problems' ? secretRun(s).problems.length : !(secretRun(s).end.get('reader') === 2)));
  const stateAt = (id, end) => {
    let st = cur.known.includes(id) ? 2 : 0;
    for (const e of run.events) if (e.who === id && e.i <= end) st = e.after;
    return st;
  };
  const upd = (fn) => change(() => fn(cur), { render: false });
  const irony = who.filter((id) => id !== 'reader').map((id) => {
    let n = 0;
    U.forEach((u, ui) => { if (unitEnd[ui] != null && stateAt('reader', unitEnd[ui]) === 2 && stateAt(id, unitEnd[ui]) !== 2) n++; });
    return { id, n };
  }).filter((x) => x.n);
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside' }, panel('',
      h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, 'Secrets & reveals'), h('span', { class: 'spacer' }), addBtn),
      seg([['all', `All ${list.length}`], ['problems', 'Problems'], ['reader', 'Reader in the dark']], filt, (v) => { S.secretFilt = v; render(); }, 'Show'),
      shown.map((s) => { const r = secretRun(s); return h('button', { class: 'xside__item' + (s === cur ? ' is-on' : ''), type: 'button', 'aria-pressed': String(s === cur), onclick: () => { S.secretSel = s.id; render(); } },
        h('span', { class: 'sec-kind sec-kind--' + s.kind }, K[s.kind] || 'Secret'), h('strong', {}, s.name || 'Untitled'),
        h('span', { class: 'muted small' }, `${r.end.get('reader') === 2 ? 'Reader knows' : 'Reader doesn’t know yet'} · ${[...r.end.entries()].filter(([id, v]) => id !== 'reader' && v === 2).length} know`),
        r.problems.length ? h('span', { class: 'warn-text small' }, plural(r.problems.length, 'problem')) : null); }))),
    h('div', { class: 'xmain' },
      panel('',
        h('div', { class: 'xrow' }, sel(SECRET_KINDS, cur.kind, (v) => change(() => { cur.kind = v; }), 'Kind'),
          h('input', { class: 'title-input sec-name', value: cur.name, 'aria-label': 'Secret', oninput: (ev) => upd((s) => { s.name = ev.target.value; }) }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete secret', onclick: async () => {
            if (!(await confirmDanger(`Delete “${cur.name}”?`, 'Scene cards lose their reveals for it.'))) return;
            change(() => { W.secrets = W.secrets.filter((x) => x !== cur); for (const k of cardTexts()) k.reveals = (k.reveals || []).filter((r) => r.secret !== cur.id); });
          } }, icon('trash'))),
        autosize(h('textarea', { class: 'input', rows: 2, value: cur.truth, placeholder: 'The truth, in full', 'aria-label': 'The truth', oninput: (ev) => upd((s) => { s.truth = ev.target.value; }) })),
        h('div', { class: 'xbox__row' }, h('span', { class: 'xbox__label' }, 'Knows from the start'),
          cur.known.map((id) => h('span', { class: 'xchip' }, nameOf(id), h('button', { class: 'xchip__x', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { cur.known = cur.known.filter((x) => x !== id); }) }, '×'))),
          sel([['', '+ Someone…'], ...chars().filter((e) => !cur.known.includes(e.id)).map((e) => [e.id, e.name || 'Unnamed'])], '', (v) => { if (v) change(() => { cur.known.push(v); }); }, 'Knows from the start'))),
      panel('sec', h('div', { class: 'xlegend' }, h('span', {}, h('i', { class: 'sec-sw sec-sw--2' }), 'Knows'), h('span', {}, h('i', { class: 'sec-sw sec-sw--1' }), 'Suspects'), h('span', {}, h('i', { class: 'sec-sw sec-sw--3' }), 'Believes a lie'),
        h('span', {}, h('i', { class: 'sec-dia' }), 'Event in this part'), h('span', {}, h('i', { class: 'sec-sw sec-sw--bad' }), 'Acts on it before knowing')),
      h('div', { class: 'sec__scroll' }, h('div', { class: 'sec__grid', style: { gridTemplateColumns: `170px repeat(${U.length}, minmax(52px, 1fr))` } },
        h('span', {}), U.map((u) => h('span', { class: 'sec__colh', title: u.long }, u.label)),
        who.map((id) => [h('span', { class: 'sec__who' + (id === 'reader' ? ' is-reader' : '') }, nameOf(id)),
          U.map((u, ui) => {
            const end = unitEnd[ui];
            const st = end == null ? (ui ? stateAt(id, unitEnd.slice(0, ui).filter((x) => x != null).pop() ?? -1) : (cur.known.includes(id) ? 2 : 0)) : stateAt(id, end);
            const ev = run.events.filter((e) => e.who === id && u.cards.includes(e.k));
            const bad = run.problems.some((x) => x.who === id && u.cards.includes(x.k));
            return h('span', { class: `sec__cell sec__cell--${st}` + (bad ? ' is-bad' : ''), title: ev.map((e) => `${(REVEAL_HOW.find(([v]) => v === e.how) || [])[1] || ''}: ${e.k.title || 'Untitled scene'}`).join('\n') || '' },
              ev.length ? h('button', { class: 'sec-dia', type: 'button', 'aria-label': ev[0].k.title || 'Scene', onclick: () => openCard(ev[0].k.id) }) : null);
          })]))),
      h('p', { class: 'muted small' }, 'On a scene card, “Secrets revealed”: who learns it, starts to suspect, is told a lie, or acts on it (to catch someone acting before they know).')),
      run.problems.length || irony.length ? h('div', { class: 'xcards' },
        run.problems.map((x) => panel('xwarn xwarn--bad', h('span', { class: 'xwarn__k' }, 'Problem'), h('span', {}, `${nameOf(x.who)} acts on this in ${where(x.k)} but doesn’t know it yet.`),
          h('span', { class: 'xwarn__act' }, cardBtn(x.k, 'Open the scene'), dismissBtn(`secret:${cur.id}:${x.who}:${x.k.id}`)))),
        irony.map((x) => panel('xwarn', h('span', { class: 'xwarn__k' }, 'Dramatic irony'), h('span', {}, `The reader knows and ${nameOf(x.id)} doesn’t, for ${plural(x.n, 'part')}.`)))) : null)));
}

export function revealsBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    const W = P();
    const cs = chars();
    const inScene = cs.filter((e) => c.entityIds.includes(e.id));
    const whoOpts = [['reader', 'The reader'], ...[...inScene, ...cs.filter((e) => !inScene.includes(e))].map((e) => [e.id, e.name || 'Unnamed'])];
    c.reveals.forEach((r, i) => box.append(h('div', { class: 'xbox__row' },
      sel(W.secrets.map((s) => [s.id, s.name || 'Untitled']), r.secret, (v) => upd((cc) => { cc.reveals[i].secret = v; }), 'Secret'),
      h('span', { class: 'muted small' }, 'to'),
      sel(whoOpts, r.who, (v) => upd((cc) => { cc.reveals[i].who = v; }), 'Who'),
      sel(REVEAL_HOW, r.how, (v) => upd((cc) => { cc.reveals[i].how = v; }), 'How'),
      h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => { upd((cc) => { cc.reveals.splice(i, 1); }); draw(); } }, icon('x')))));
    box.append(h('div', { class: 'xbox__row' },
      W.secrets.length ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { upd((cc) => { cc.reveals.push({ id: uid(), secret: W.secrets[W.secrets.length - 1].id, who: (inScene[0] || {}).id || 'reader', how: 'learns' }); }); draw(); } }, icon('plus'), ' Someone learns something') : null,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => {
        const name = await ask('New secret', 'What is it? (a short name)', '', 'Add');
        if (!name) return;
        const id = uid();
        change(() => { W.secrets.push({ id, kind: 'secret', name, truth: '', known: [] }); }, { render: false });
        upd((cc) => { cc.reveals.push({ id: uid(), secret: id, who: (inScene[0] || {}).id || 'reader', how: 'learns' }); });
        draw();
      } }, icon('plus'), ' New secret')));
  };
  draw();
  return box;
}
