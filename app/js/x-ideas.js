// The idea inbox: one list per person, shared by every project. Catch an idea
// from anywhere (the Ideas button or the I key, or #/ideas on a phone), then
// turn it into a Story notes bullet, a beat, a scene, an entry or a flag.
import { h, icon, clear, append, toast } from './dom.js';
import { uid } from './model.js';
import { S, store, P, isSeries, change, render, go, href, pbase, newEntity, readingSeq, cardInfo, blankCard, openCard, editCard } from './app.js';
import { seg, sel } from './x-common.js';

const I = { list: [], rev: null, loaded: false, timer: null, saving: false };
const fresh = () => I.list.filter((x) => x.status === 'new');

function paintButtons() {
  for (const b of document.querySelectorAll('.ideas-btn')) {
    const n = fresh().length;
    const c = b.querySelector('.ideas-btn__n');
    if (c) { c.textContent = String(n); c.hidden = !n; }
    b.setAttribute('aria-label', `Ideas${n ? `, ${n} new` : ''}`);
  }
}

export async function loadIdeas() {
  try { const r = await store.ideas(); I.list = Array.isArray(r.ideas) ? r.ideas : []; I.rev = r.rev || null; I.loaded = true; paintButtons(); }
  catch { /* offline: try again when the inbox opens */ }
}

function merge(theirs) {
  const m = new Map(theirs.map((x) => [x.id, x]));
  for (const x of I.list) { const o = m.get(x.id); if (!o || (x.upd || '') > (o.upd || '')) m.set(x.id, x); }
  return [...m.values()].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
function save() {
  clearTimeout(I.timer);
  I.timer = setTimeout(async () => {
    if (I.saving) { save(); return; }
    I.saving = true;
    try { I.rev = await store.saveIdeas(I.list, I.rev); }
    catch (e) {
      if (e.status === 409) {
        try { const r = await store.ideas(); I.list = merge(r.ideas || []); I.rev = r.rev; I.rev = await store.saveIdeas(I.list, I.rev); }
        catch (e2) { toast('Couldn’t save the idea inbox: ' + e2.message); }
      } else toast('Couldn’t save the idea inbox: ' + e.message);
    }
    I.saving = false;
  }, 500);
}
const touch = (x) => { x.upd = new Date().toISOString(); save(); paintButtons(); };

export function ideasButton() {
  const n = fresh().length;
  return h('button', { class: 'btn btn--sm ideas-btn', type: 'button', title: 'Idea inbox (I)', 'aria-label': `Ideas${n ? `, ${n} new` : ''}`, onclick: () => openIdeas() },
    icon('bulb'), h('span', { class: 'ideas-btn__t' }, 'Ideas'), h('span', { class: 'ideas-btn__n', hidden: !n || null }, String(n)));
}

// Where an idea could go: the open project, or each book of the open series.
function targets() {
  if (!S.project) return [];
  if (!isSeries()) return [{ id: 'p', label: S.project.title, book: S.project }];
  return [{ id: 'series', label: `${S.project.title} (the series)`, book: S.project, series: true }, ...S.project.books.map((b) => ({ id: b.id, label: b.title, book: b }))];
}
const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const split = (t) => { const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean); let name = lines[0] || ''; let rest = lines.slice(1).join('\n'); if (name.length > 70) { rest = t.trim(); name = name.split(/\s+/).slice(0, 7).join(' ') + '…'; } return { name, rest }; };

function inbox(redraw, { page = false } = {}) {
  const box = h('div', { class: 'inbox' });
  const T = targets();
  const tab = S.ideaTab || 'new';
  const text = h('textarea', { class: 'input inbox__text', rows: page ? 5 : 2, placeholder: 'What if…', 'aria-label': 'New idea' });
  let forId = S.bookId && T.some((t) => t.id === S.bookId) ? S.bookId : '';
  const add = () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return; }
    const tg = T.find((x) => x.id === forId);
    const now = new Date().toISOString();
    I.list.unshift({ id: uid(), text: t, at: now, upd: now, status: 'new', forLabel: tg ? tg.label : '', forSlug: tg ? S.slug : '', forId: forId || '', device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'phone' : 'computer' });
    save(); paintButtons();
    text.value = '';
    redraw();
    toast('Idea saved');
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } });
  const list = I.list.filter((x) => x.status === tab);
  const counts = { new: fresh().length, sorted: I.list.filter((x) => x.status === 'sorted').length, archived: I.list.filter((x) => x.status === 'archived').length };
  const when = (iso) => { const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? 'Today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  append(box, [
    h('div', { class: 'inbox__new' }, text,
      h('div', { class: 'inbox__row' },
        T.length ? h('label', { class: 'xinline' }, 'For', sel([['', 'Not sure yet'], ...T.map((t) => [t.id, t.label])], forId, (v) => { forId = v; }, 'For')) : null,
        h('span', { class: 'spacer' }), page ? null : h('span', { class: 'muted small' }, 'Enter saves · Shift+Enter for a new line'),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Save idea'))),
    seg([['new', `New ${counts.new}`], ['sorted', `Sorted ${counts.sorted}`], ['archived', `Archived ${counts.archived}`]], tab, (v) => { S.ideaTab = v; redraw(); }, 'Ideas'),
    !I.loaded ? h('p', { class: 'muted' }, 'Loading…') : list.length ? h('ul', { class: 'inbox__list' }, list.map((x) => h('li', { class: 'idea' + (S.ideaOpen === x.id ? ' is-open' : '') },
      h('span', { class: 'idea__text' }, x.text),
      h('div', { class: 'idea__meta' }, h('span', { class: 'muted small' }, when(x.at), x.device ? ` · ${x.device}` : ''),
        x.forLabel ? h('span', { class: 'idea__for' }, x.forLabel) : null,
        x.sorted ? h('span', { class: 'idea__sorted' }, `→ ${x.sorted.how}${x.sorted.where ? ' in ' + x.sorted.where : ''}`) : null,
        h('span', { class: 'spacer' }),
        x.status === 'new' && T.length ? [h('span', { class: 'xlabel' }, 'Turn into'), ['Story notes', 'Beat', 'Scene', 'World entry', 'Fix-later flag'].map((how) =>
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-pressed': String(S.ideaOpen === x.id && S.ideaHow === how), onclick: () => { S.ideaOpen = x.id; S.ideaHow = how; redraw(); } }, how))] : null,
        x.status === 'new' && !T.length ? h('span', { class: 'muted small' }, 'Open a project to sort it.') : null,
        x.status !== 'archived' ? h('button', { class: 'iconbtn iconbtn--sm', type: 'button', title: 'Archive', 'aria-label': 'Archive', onclick: () => { x.status = 'archived'; touch(x); redraw(); } }, icon('download'))
          : h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { x.status = 'new'; touch(x); redraw(); } }, 'Back to new'),
        x.status === 'archived' ? h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Delete for good', title: 'Delete for good', onclick: () => { I.list = I.list.filter((y) => y !== x); save(); redraw(); } }, icon('trash')) : null),
      S.ideaOpen === x.id && x.status === 'new' && T.length ? sorter(x, T, redraw) : null))) : h('p', { class: 'muted' }, tab === 'new' ? 'Nothing waiting. Catch the next one above.' : 'Nothing here.'),
  ]);
  if (!I.loaded) loadIdeas().then(redraw);
  requestAnimationFrame(() => { if (!S.ideaOpen) text.focus(); });
  return box;
}

function sorter(x, T, redraw) {
  const how = S.ideaHow;
  const pre = T.find((t) => t.id === x.forId) || T.find((t) => t.id === S.bookId) || T[T.length > 1 ? 1 : 0];
  let tg = pre;
  const books = T.filter((t) => !t.series);
  const done = (whereLabel) => { x.status = 'sorted'; x.sorted = { how, where: whereLabel, at: new Date().toISOString() }; S.ideaOpen = null; touch(x); redraw(); toast(`Added as ${how.toLowerCase()}`); };
  const { name, rest } = split(x.text);
  const pick = (list) => sel(list.map((t) => [t.id, t.label]), tg.id, (v) => { tg = list.find((t) => t.id === v); }, 'Where');
  let body, act;
  if (how === 'Story notes') {
    body = ['in', pick(T)];
    act = () => change(() => { const f = tg.book.flow; f.notes = (f.notes || '') + `<ul><li>${escHtml(x.text).replace(/\n/g, '<br>')}</li></ul>`; }) || done(tg.label);
  } else if (how === 'Beat') {
    body = ['in', pick(T)];
    act = () => change(() => { const f = tg.book.flow; const last = f.beats[f.beats.length - 1]; f.beats.push({ id: uid(), name, text: rest, hint: '', pct: last ? Math.min(100, last.pct + 5) : 5, tension: 50, colId: null, parent: null }); }) || done(tg.label);
  } else if (how === 'Scene') {
    if (tg.series) tg = books[0];
    body = ['in', pick(books)];
    act = () => {
      const b = tg.book;
      if (!b.columns.length || !b.rows.length) { toast('That book needs a part and a thread first.'); return; }
      change(() => { b.cards.push({ ...blankCard(uid(), b.columns[0].id, b.rows[0].id), title: name, summary: rest }); });
      done(tg.label);
    };
  } else if (how === 'World entry') {
    const types = P().types;
    let typeId = (types[0] || {}).id;
    body = ['a new', sel(types.map((t) => [t.id, t.singular || t.name]), typeId, (v) => { typeId = v; }, 'Type')];
    act = () => { if (!typeId) { toast('Add an entry type first.'); return; } const e = newEntity(typeId, name); change(() => { e.summary = rest; }); done('World'); };
  } else {
    const cards = readingSeq().map(({ k }) => k);
    let kid = (cards[cards.length - 1] || {}).id;
    body = ['on', sel(cards.map((k) => [k.id, `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).num} · ${k.title || 'Untitled scene'}`]), kid, (v) => { kid = v; }, 'Scene')];
    act = () => { const k = cards.find((c) => c.id === kid); if (!k) return; change(() => { k.flags.push({ id: uid(), text: x.text, kind: 'continuity', done: false, must: false, created: new Date().toISOString() }); }); done(k.title || 'a scene'); };
  }
  return h('div', { class: 'idea__sort' }, h('strong', {}, how), ' ', body, h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { S.ideaOpen = null; redraw(); } }, 'Cancel'),
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: act }, 'Add'));
}

export function openIdeas() {
  const dl = h('dialog', { class: 'dlg dlg--wide dlg--ideas' });
  const body = h('div', { class: 'dlg__body' });
  const redraw = () => { clear(body); body.append(inbox(redraw)); };
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, 'Idea inbox'), h('a', { class: 'small', href: href('ideas'), onclick: () => dl.close() }, 'Full page'),
    h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))), body]);
  dl.addEventListener('close', () => { dl.remove(); S.ideaOpen = null; if (S.project && S.route.view === 'project') render(); else paintButtons(); });
  document.body.append(dl);
  dl.showModal();
  redraw();
}

export function viewIdeasPage() {
  const root = document.getElementById('app');
  const draw = () => {
    clear(root).append(h('div', { class: 'page page--ideas' },
      h('header', { class: 'top top--home' },
        h('a', { class: 'brand', href: href('') }, h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'OA'), h('span', { class: 'brand__name' }, 'Ideas')),
        h('span', { class: 'spacer' }), S.project ? h('a', { class: 'btn btn--ghost btn--sm', href: href(pbase()) }, 'Back to ', S.project.title) : h('a', { class: 'btn btn--ghost btn--sm', href: href('') }, 'Open planner')),
      h('main', { class: 'wrap ideas-page' }, inbox(draw, { page: true }),
        h('p', { class: 'muted small ideas-page__tip' }, 'On a phone, add this page to your home screen to open straight to Ideas. Sort them on the computer later.'))));
  };
  document.title = 'Ideas · Planner';
  draw();
}
