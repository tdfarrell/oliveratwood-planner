import { h, append, clear, icon, openDialog, choose, confirmDanger, ask, toast, autosize } from './dom.js';
import { TEMPLATES, PALETTE, FIELD_TYPES, STATUSES, STATUS_SHORT, uid, slugify, numeral, roman, normalize, valueText, actsOn, syncActs,
  prepare, newSeries, newBook, importProject, findDuplicates, mergeEntities, LINE_COLORS, LINK_KINDS, BOOK_KINDS,
  GAME_EVENTS, normalizeEntity, blankSheet, applyEvent, describeEvent, cloneSheet, STRUCTURES, makeBeats, WORLD_KEYS } from './model.js';
import { viewPromises, viewWhatifs, viewBraid, viewRevisions, sceneExtras, cardExtras, publishCheck, branchBanner } from './x-story.js';
import { viewChars, viewWeb, viewArcs, viewFamily, viewNames, viewSecrets, entityTabs, entityExtra, ageLine, isChar, profileExtras, asideExtras, agesText } from './x-people.js';
import { viewMaps, viewCalendar, viewTravel, viewFactions, viewMood, calendarRow, whenInfo, clipsPanel } from './x-world.js';
import { viewItems, viewLoot, viewQuests, viewSysMsg } from './x-game.js';
import { viewChecks, viewPresence, checksCount } from './x-checks.js';
import { ideasButton, viewIdeasPage, openIdeas, loadIdeas } from './x-ideas.js';
import { viewArchetypes, viewMagic, viewSliders, viewEnding, viewAvalanche, viewEpigraphs, viewConns, viewCrossovers, viewIceberg } from './x-sanderson.js';
import { charType } from './x-common.js';
import { ServerStore, LocalStore, unsaved } from './store.js';
import { KINDS, FLAVORS, kindForType, generate } from './names.js';

const DEMO = new URLSearchParams(location.search).has('demo');
const store = DEMO ? new LocalStore() : new ServerStore();
const scope = () => (DEMO ? 'demo' : 'server:' + (S.user || '').toLowerCase());
const root = document.getElementById('app');

const S = {
  slug: null, project: null, rev: null,
  dirty: false, saving: false, again: false, timer: null,
  status: 'saved', statusMsg: '',
  highlight: '', statusFilter: '', compact: false, worldFilter: '',
  drag: null, dragItem: null, route: { view: 'home' }, bookId: null,
  tl: { order: 'world', trace: null, hide: {} },
  names: { kind: 'person', style: {}, gender: 'any', flavor: 'soft', start: '' },
};

// ======================================================================
// Small lookups
// ======================================================================

const isSeries = () => !!(S.project && S.project.kind === 'series');
// The thing the current screen edits: a project, a book of a series, or the
// series itself (series-wide screens see every book's cards through read-only views).
const P = () => {
  const d = S.project;
  let p = d;
  if (d && d.kind === 'series' && S.bookId) p = d.books.find((b) => b.id === S.bookId) || d;
  if (S.branchId && p && Array.isArray(p.branches)) {
    const br = p.branches.find((x) => x.id === S.branchId);
    if (br) return branchView(p, br);
  }
  return p;
};
// A what-if branch is a copy of a book's grid. Everything else (title, world,
// flow…) is read from the book it came from, so the grid screens work on it as is.
const BRANCH_OWN = ['columns', 'rows', 'cards', 'acts', 'labels', 'cardFields'];
function branchView(book, br) {
  const v = br.data;
  if (v.__book !== book) {
    for (const k of [...WORLD_KEYS, 'title', 'synopsis', 'storySlug', 'flow', 'notes', 'wordGoal', 'branches', 'passes', 'checklist', 'braid', 'mood', 'clips', 'id', 'groupId']) {
      if (BRANCH_OWN.includes(k)) continue;
      Object.defineProperty(v, k, { get: () => book[k], set: (x) => { book[k] = x; }, enumerable: false, configurable: true });
    }
    Object.defineProperty(v, '__book', { value: book, enumerable: false, configurable: true });
  }
  return v;
}
const inSeriesTop = () => isSeries() && !S.bookId;
// Every card the current screen can link to: the whole series, or one project.
const scopeCards = () => (isSeries() ? S.project.books.flatMap((b) => b.cards) : (S.project ? S.project.cards : []));
const findCard = (id) => (id ? scopeCards().find((k) => k.id === id) : null);
const bookOf = (k) => (isSeries() ? S.project.books.find((b) => b.cards.includes(k)) : S.project);
function cardInfo(k) {
  const b = bookOf(k) || P();
  const i = b.columns.findIndex((c) => c.id === k.colId);
  return { b, i, num: i >= 0 ? numeral(b, i) : '?', row: b.rows.find((r) => r.id === k.rowId) };
}
const otherBook = (b) => isSeries() && b !== P();

// ---------- Word counts ----------
const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
const wordsOf = (cards) => cards.reduce((a, k) => a + (Number(k.words) || 0), 0);
const parseNum = (v) => { const d = String(v).replace(/[^\d]/g, ''); return d ? Math.min(parseInt(d, 10), 99999999) : null; };
// "1,240 words", or "1,240 / 2,000" when there's a goal.
const wordText = (n, goal) => (goal ? `${fmtN(n)} / ${fmtN(goal)}` : n ? `${fmtN(n)} words` : '');
const wordClass = (n, goal) => 'words' + (goal && n >= goal ? ' is-met' : '');
function numberInput(get, set, attrs = {}) {
  const el = h('input', { class: 'input input--num', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: get() ? fmtN(get()) : '', ...attrs,
    oninput: (e) => set(parseNum(e.target.value)),
    onblur: (e) => { e.target.value = get() ? fmtN(get()) : ''; } });
  return el;
}
const goalField = (label, get, set, hint) => h('label', { class: 'field field--goal' },
  h('span', { class: 'field__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null,
  numberInput(get, set, { placeholder: 'No goal' }));
const entity = (id) => P().entities.find((e) => e.id === id);
const typeOf = (e) => e && P().types.find((t) => t.id === e.typeId);
const colIndex = (id) => P().columns.findIndex((c) => c.id === id);
const lower = (s) => (s.length > 1 && s === s.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const colName = (p, c) => `${c.interlude ? 'Interlude' : p.labels.column} ${numeral(p, colIndex(c.id))}`;

function cardLabel(p, k) {
  const { b, num } = cardInfo(k);
  return `${otherBook(b) ? b.title + ' · ' : ''}${num} · ${k.title || 'Untitled scene'}`;
}
// Scenes an entry is in: across the whole series when there is one.
function appearances(p, id) {
  const order = (k) => { const { b, i } = cardInfo(k); return (isSeries() ? S.project.books.indexOf(b) : 0) * 10000 + i; };
  return scopeCards().filter((k) => k.entityIds.includes(id)).sort((a, b) => order(a) - order(b));
}

// Opens a card's editor from anywhere, switching to its book for the dialog.
let cardCtx = 0;
function openCard(id) {
  if (S.branchId) { editCard(id); return; }
  if (isSeries()) {
    const b = S.project.books.find((x) => x.cards.some((k) => k.id === id));
    if (!b) return;
    if (S.bookId !== b.id) {
      const my = ++cardCtx;
      S.bookId = b.id;
      editCard(id, false, () => { if (my === cardCtx) { S.bookId = S.route.book || null; render(); } });
      return;
    }
  }
  editCard(id);
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

// ======================================================================
// Saving
// ======================================================================

function change(fn, opts = {}) {
  if (!S.project) return;
  fn(P());
  S.project.updated = new Date().toISOString();
  S.dirty = true;
  unsaved.set(scope(), S.slug, { data: S.project, baseRev: S.rev, dirty: true, at: Date.now() });
  setStatus('unsaved');
  clearTimeout(S.timer);
  S.timer = setTimeout(save, 1500);
  if (opts.render !== false) render();
}

async function save() {
  clearTimeout(S.timer);
  if (S.saving) { S.again = true; return; }
  if (!S.dirty || !S.project) return;
  S.saving = true;
  S.dirty = false;
  setStatus('saving');
  const slug = S.slug;
  const snapshot = JSON.parse(JSON.stringify(S.project));
  try {
    const rev = await store.write(slug, snapshot, S.rev);
    if (slug === S.slug) {
      S.rev = rev;
      if (S.dirty) unsaved.set(scope(), slug, { data: S.project, baseRev: rev, dirty: true, at: Date.now() });
      else { unsaved.clear(scope(), slug); setStatus('saved'); }
    }
  } catch (e) {
    S.dirty = true;
    if (e.kind === 'conflict') { S.saving = false; return conflict(); }
    if (e.kind === 'auth') { setStatus('error', 'Signed out'); S.saving = false; return renderLogin(true); }
    setStatus(e.kind === 'offline' ? 'offline' : 'error', e.message);
    S.timer = setTimeout(save, 15000);
  } finally {
    S.saving = false;
    if (S.again) { S.again = false; if (S.dirty) S.timer = setTimeout(save, 300); }
  }
}

async function saveNow() {
  if (S.dirty || S.saving) {
    while (S.saving) await new Promise((r) => setTimeout(r, 100));
    if (S.dirty) await save();
  }
}

async function conflict() {
  setStatus('error', 'Changed elsewhere');
  const keep = await choose({
    title: 'Changed somewhere else',
    message: 'This project was saved from another device or tab since you opened it here. Which version do you want to keep?',
    choices: [
      { label: 'Load the other version', value: false },
      { label: 'Keep this one', value: true, kind: 'primary' },
    ],
  });
  try {
    const r = await store.read(S.slug);
    S.rev = r.sha;
    if (keep) { S.dirty = true; save(); }
    else {
      S.project = prepare(r.data);
      S.dirty = false;
      unsaved.clear(scope(), S.slug);
      setStatus('saved');
      render();
    }
  } catch (e) {
    if (e.kind === 'missing' && keep) { S.rev = null; S.dirty = true; save(); }
    else toast(e.message);
  }
}

function setStatus(kind, msg = '') {
  S.status = kind;
  S.statusMsg = msg;
  const el = document.getElementById('save-status');
  if (!el) return;
  const text = {
    saved: DEMO ? 'Saved in this browser' : 'Saved',
    saving: 'Saving…',
    unsaved: 'Unsaved',
    offline: 'Offline · kept on this device',
    error: msg || 'Couldn’t save',
  }[kind];
  el.className = 'status status--' + kind;
  el.textContent = text;
  el.title = kind === 'error' ? (msg || '') + ' (your changes are kept on this device and will retry)' : text;
}

window.addEventListener('beforeunload', (e) => { if (S.dirty || S.saving) { save(); e.preventDefault(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// ======================================================================
// Routing
// ======================================================================

function parseRoute() {
  const parts = location.hash.slice(1).split('#')[0].replace(/^\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'p' && parts[1]) return { view: 'project', kind: 'p', slug: parts[1], book: null, tab: parts[2] || 'grid', id: parts[3] || null };
  if (parts[0] === 's' && parts[1]) {
    if (parts[2] === 'b' && parts[3]) return { view: 'project', kind: 's', slug: parts[1], book: parts[3], tab: parts[4] || 'grid', id: parts[5] || null };
    return { view: 'project', kind: 's', slug: parts[1], book: null, tab: parts[2] || 'timeline', id: parts[3] || null };
  }
  if (parts[0] === 'ideas') return { view: 'ideas' };
  if (parts[0] === 'connections') return { view: 'connections' };
  return { view: 'home' };
}
const go = (path) => { location.hash = '#/' + path; };
const href = (path) => '#/' + path;
// Path of the current project, book or series, plus an optional tail.
function pbase(tail = '') {
  const slug = encodeURIComponent(S.slug);
  const base = isSeries() ? `s/${slug}${S.bookId ? '/b/' + encodeURIComponent(S.bookId) : ''}` : `p/${slug}`;
  return base + (tail ? '/' + tail : '');
}
const phref = (tail = '') => href(pbase(tail));
const shref = (tail = '') => href(`s/${encodeURIComponent(S.slug)}${tail ? '/' + tail : ''}`);

window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => { if (S.flushNotes) S.flushNotes(); });

async function route() {
  if (S.flushNotes) { const fl = S.flushNotes; S.flushNotes = null; fl(); }
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  S.route = parseRoute();
  if (S.route.view === 'ideas') return viewIdeasPage();
  if (S.route.view === 'connections') { await saveNow(); S.slug = null; S.project = null; return viewCrossovers(root); }
  if (S.route.view === 'home') {
    await saveNow();
    S.slug = null; S.project = null;
    return renderHome();
  }
  if (S.route.slug !== S.slug) {
    await saveNow();
    const ok = await openProject(S.route.slug);
    if (!ok) return;
  }
  // Fix up links that point at the wrong kind of thing.
  if (isSeries() && S.route.kind === 'p') return go(`s/${S.slug}`);
  if (!isSeries() && S.route.kind === 's') return go(`p/${S.slug}`);
  S.bookId = S.route.book || null;
  S.branchId = S.route.tab === 'whatif' && S.route.id ? S.route.id : null;
  if (S.bookId && !S.project.books.some((b) => b.id === S.bookId)) { toast('That book isn’t in this series any more.'); return go(`s/${S.slug}/books`); }
  const prevKey = S.renderKey;
  render();
  if (S.renderKey !== prevKey) window.scrollTo(0, 0);
}

async function openProject(slug) {
  renderLoading();
  let r;
  try { r = await store.read(slug); }
  catch (e) {
    if (e.kind === 'auth') { renderLogin(); return false; }
    toast(e.kind === 'missing' ? 'That project doesn’t exist.' : e.message);
    go('');
    return false;
  }
  let data = prepare(r.data);
  let dirty = false;
  const local = unsaved.get(scope(), slug);
  if (local && local.dirty && local.data) {
    if (local.baseRev === r.sha) {
      data = prepare(local.data); dirty = true;
      toast('Restored changes that hadn’t reached the server yet.');
    } else {
      const keep = await choose({
        title: 'Unsaved changes on this device',
        message: `This device has changes from ${fmtTime(new Date(local.at).toISOString())} that never reached the server, and the project has been saved from somewhere else since. Which version do you want?`,
        choices: [
          { label: 'Use the server’s version', value: false },
          { label: 'Use this device’s version', value: true, kind: 'primary' },
        ],
      });
      if (keep) { data = prepare(local.data); dirty = true; }
      else unsaved.clear(scope(), slug);
    }
  }
  S.slug = slug; S.project = data; S.rev = r.sha; S.dirty = dirty;
  S.highlight = ''; S.statusFilter = ''; S.worldFilter = '';
  S.tl = { order: 'world', trace: null, hide: {} };
  setStatus(dirty ? 'unsaved' : 'saved');
  if (dirty) S.timer = setTimeout(save, 500);
  return true;
}

// ======================================================================
// Boot, sign-in, home
// ======================================================================

async function boot() {
  renderLoading();
  try {
    const st = await store.status();
    if (!st.configured) {
      return renderMessage('Almost there',
        'The planner’s password hasn’t been set yet. In GitHub, open the oliveratwood-planner repository → Settings → Secrets and variables → Actions, add a secret called PLANNER_PASSWORD, then run the “Publish planner” workflow again.');
    }
    S.user = st.user || '';
    if (!st.authed) return renderLogin();
    loadIdeas();
    route();
  } catch (e) {
    renderMessage('Can’t reach the planner', e.message);
  }
}

function brand() {
  return h('a', { class: 'brand', href: href('') },
    h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'OA'),
    h('span', { class: 'brand__name' }, 'Planner'));
}

function renderLoading() {
  saveScroll();
  S.renderKey = null;
  clear(root).append(h('div', { class: 'center' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' })));
}

function renderMessage(title, msg) {
  clear(root).append(h('main', { class: 'center' }, h('div', { class: 'panel panel--narrow' },
    brand(), h('h1', { class: 'display' }, title), h('p', { class: 'muted' }, msg))));
}

function renderLogin(expired = false) {
  let remembered = '';
  try { remembered = localStorage.getItem('planner:user') || ''; } catch { /* blocked */ }
  const user = h('input', { class: 'input', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', id: 'user', required: true, value: S.user || remembered });
  const input = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', id: 'pw', required: true });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Open the planner');
  const form = h('form', {
    class: 'panel panel--narrow login',
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; err.textContent = '';
      try {
        const r = await store.login(user.value.trim(), input.value);
        S.user = (r && r.user) || user.value.trim();
        try { localStorage.setItem('planner:user', user.value.trim()); } catch { /* blocked */ }
        loadIdeas();
        if (S.project) { render(); save(); } else route();
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false; input.select();
      }
    },
  },
  brand(),
  h('h1', { class: 'display' }, expired ? 'Signed out' : 'Story planner'),
  h('p', { class: 'muted' }, expired
    ? 'Your sign-in ran out. Sign in again and your changes will save. Nothing was lost.'
    : 'Outlines, worlds, characters and magic for Oliver Atwood’s stories.'),
  h('label', { class: 'field', for: 'user' }, h('span', { class: 'field__label' }, 'Name'), user),
  h('label', { class: 'field', for: 'pw' }, h('span', { class: 'field__label' }, 'Password'), input),
  err, btn);
  clear(root).append(h('main', { class: 'center' }, form));
  (user.value ? input : user).focus();
}

async function renderHome() {
  document.title = 'Planner · Oliver Atwood';
  renderLoading();
  let projects;
  try { projects = await store.list(); }
  catch (e) { if (e.kind === 'auth') return renderLogin(); return renderMessage('Can’t load projects', e.message); }

  const seriesList = projects.filter((x) => x.kind === 'series');
  projects = projects.filter((x) => x.kind !== 'series');
  const seriesBox = h('section', { class: 'home__series' },
    h('div', { class: 'home__sechead' },
      h('h2', { class: 'display' }, 'Your series'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: newSeriesDialog }, icon('plus'), ' New series')),
    seriesList.length
      ? h('div', { class: 'scards' }, seriesList.map((x) => h('a', { class: 'scard', href: href('s/' + encodeURIComponent(x.slug)) },
        h('span', { class: 'scard__icon' }, icon('layers')),
        h('span', { class: 'scard__text' },
          h('span', { class: 'scard__title' }, x.title),
          x.synopsis ? h('span', { class: 'scard__syn' }, x.synopsis) : null,
          h('span', { class: 'scard__meta' }, `${plural(x.counts.books || 0, 'book')} · ${plural(x.counts.cards, 'scene')} · ${plural(x.counts.entities, 'entry')}`.replace('entrys', 'entries'))),
        h('span', { class: 'scard__go' }, 'Open timeline', icon('right')))))
      : h('p', { class: 'muted' }, 'A series holds several books that share one world, with a timeline across all of them. Your projects below can be moved into one.'));

  const shelf = h('div', { class: 'shelf' },
    projects.map((pr, i) => h('a', { class: 'book', href: href('p/' + encodeURIComponent(pr.slug)), style: { '--c': PALETTE[i % PALETTE.length] } },
      h('span', { class: 'book__band' }),
      h('span', { class: 'book__title' }, pr.title),
      pr.synopsis ? h('span', { class: 'book__syn' }, pr.synopsis) : null,
      h('span', { class: 'book__meta' },
        `${plural(pr.counts.columns, 'part')} · ${plural(pr.counts.cards, 'card')} · ${plural(pr.counts.entities, 'entry')}`.replace('entrys', 'entries')),
      pr.updated ? h('span', { class: 'book__meta muted' }, 'Updated ' + fmtTime(pr.updated)) : null)),
    h('button', { class: 'book book--new', type: 'button', onclick: newProjectDialog },
      icon('plus', 'ico--lg'), h('span', { class: 'book__title' }, 'New project')));

  const restore = h('div', { class: 'home__foot' });
  const page = h('div', { class: 'page' },
    h('header', { class: 'top top--home' }, brand(), h('span', { class: 'spacer' }),
      h('a', { class: 'btn btn--sm', href: href('connections'), title: 'Easter eggs and crossovers between your series' }, icon('link'), h('span', { class: 'ideas-btn__t' }, 'Connections')), ideasButton(),
      DEMO ? h('span', { class: 'pill' }, 'Demo: saves in this browser only') : null,
      S.user && !DEMO ? h('span', { class: 'muted small' }, S.user) : null,
      DEMO ? null : h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { await store.logout(); S.project = null; S.slug = null; renderLogin(); } }, icon('out'), ' Sign out')),
    h('main', { class: 'wrap home' },
      seriesBox,
      h('h1', { class: 'display display--xl home__projects' }, seriesList.length ? 'Standalone projects' : 'Your projects'),
      projects.length ? null : h('p', { class: 'muted lede' }, 'Start a project for each story. Every one gets its own grid, world and continuity notes.'),
      shelf, restore));
  clear(root).append(page);

  store.deleted().then((list) => {
    if (!list.length) return;
    append(restore, [h('button', { class: 'linkbtn', type: 'button', onclick: () => restoreDeletedDialog(list) }, `Restore a deleted project (${list.length})`)]);
  }).catch(() => {});
}

function newProjectDialog() {
  let tpl = 'serial';
  const title = h('input', { class: 'input', placeholder: 'e.g. The Glass Orchard', autocomplete: 'off' });
  const opts = h('div', { class: 'tpls' }, Object.entries(TEMPLATES).map(([key, t]) =>
    h('label', { class: 'tpl' },
      h('input', { type: 'radio', name: 'tpl', value: key, checked: key === tpl, onchange: () => { tpl = key; } }),
      h('span', { class: 'tpl__name' }, t.label), h('span', { class: 'tpl__blurb' }, t.blurb))));
  const err = h('p', { class: 'form-error', role: 'alert' });
  const create = async () => {
    const name = title.value.trim();
    if (!name) { err.textContent = 'Give it a working title (you can change it later).'; title.focus(); return; }
    btn.disabled = true;
    try {
      const existing = new Set((await store.list()).map((x) => x.slug));
      let slug = slugify(name), n = 2;
      while (existing.has(slug)) slug = `${slugify(name)}-${n++}`;
      await store.write(slug, TEMPLATES[tpl].make(name), null);
      d.close();
      go('p/' + slug);
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  const btn = h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create project');
  const d = openDialog({
    title: 'New project',
    body: [h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Working title'), title),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Start from'), opts), err],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel'), btn],
  });
}

function restoreDeletedDialog(list) {
  const d = openDialog({
    title: 'Deleted projects',
    body: h('ul', { class: 'list' }, list.map((x) => h('li', { class: 'list__row' },
      h('span', {}, x.title),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
        try {
          const data = await store.backup(x.slug, x.backup);
          await store.write(x.slug, data, null);
          d.close(); go((data.kind === 'series' ? 's/' : 'p/') + x.slug);
        } catch (e) { toast(e.message); }
      } }, 'Restore')))),
  });
}

// ======================================================================
// Project shell
// ======================================================================

// The tabs, grouped. Each group is [id, label, icon, [[tab, label], …]].
function navGroups(top, series) {
  const story = top ? [['notes', 'Notes'], ['flow', 'Series arc'], ['promises', 'Promises']]
    : [['notes', 'Notes'], ['flow', 'Beats & shape'], ['ending', 'Ending first'], ['promises', 'Promises'], ['arch', 'Archetypes'], ['avalanche', 'Avalanche'], ['epigraphs', 'Epigraphs'], ['whatif', 'What-ifs']];
  return [
    top ? ['timeline', 'Timeline', 'timeline', [['timeline', 'Timeline']]] : null,
    ['story', 'Story', 'flow', story],
    top ? ['books', 'Books', 'book', [['books', 'Books']]] : ['grid', 'Grid', 'grid', [['grid', 'Grid'], ['braid', 'Braid']]],
    ['chars', 'Characters', 'user', [['chars', 'All'], ['web', 'Relationships'], ['arcs', 'Arcs'], ['sliders', 'Sliders'], ['family', 'Family trees']]],
    ['world', 'World', 'globe', [['world', 'Entries'], ['magic', 'Magic'], ['factions', 'Factions'], ['maps', 'Maps'], ['calendar', 'Calendar'], ['travel', 'Travel'], ['names', 'Names'], ['iceberg', 'Iceberg'], series ? ['conns', 'Connections'] : null].filter(Boolean)],
    gameOn() ? ['game', 'Game', 'spark', [['progress', 'Sheets & progression'], ['items', 'Items'], ['loot', 'Loot'], ['quests', 'Quests'], ['sysmsg', 'System messages']]] : null,
    ['checks', 'Checks', 'alert', [['checks', 'Overview'], ['continuity', 'Continuity'], ['secrets', 'Secrets'], ['presence', 'Presence'], ['revisions', 'Revisions']]],
    ['book', top ? 'Series' : series ? 'Book' : 'Project', 'gear', [[top ? 'settings' : 'project', 'Settings'], ['mood', 'Mood board']]],
  ].filter(Boolean);
}

function render() {
  if (S.flushNotes) { const fl = S.flushNotes; S.flushNotes = null; fl(); }
  const p = P();
  if (!p) return renderHome();
  const series = isSeries() ? S.project : null;
  const top = !!(series && !S.bookId);
  const groups = navGroups(top, series);
  let tab = S.route.tab || (top ? 'timeline' : 'grid');
  if (tab === 'progress' && !gameOn()) tab = top ? 'timeline' : 'grid';
  let groupId;
  if (tab === 'e') { const e = entity(S.route.id); groupId = e && isChar(e) ? 'chars' : 'world'; }
  else groupId = (groups.find((g) => g[3].some(([t]) => t === tab)) || [])[0];
  if (!groupId) { tab = top ? 'timeline' : 'grid'; groupId = top ? 'timeline' : 'grid'; }
  const group = groups.find((g) => g[0] === groupId);
  const url = (t) => (top ? shref(t === 'timeline' ? '' : t) : phref(t === 'grid' ? '' : t));
  const id = S.route.id;
  const VIEWS = {
    timeline: () => viewTimeline(series), books: () => viewBooks(series), settings: () => viewSeriesSettings(series),
    notes: () => (top ? viewSeriesArc(series) : viewFlow(p)), flow: () => (top ? viewSeriesArc(series) : viewFlow(p)),
    promises: () => viewPromises(p), whatif: () => (id ? [branchBanner(p), viewGrid(p)] : viewWhatifs(p)),
    grid: () => viewGrid(p), braid: () => viewBraid(p),
    chars: () => viewChars(p), web: () => viewWeb(p), arcs: () => viewArcs(p), family: () => viewFamily(p), sliders: () => viewSliders(p),
    arch: () => viewArchetypes(p), ending: () => viewEnding(p), avalanche: () => viewAvalanche(p), epigraphs: () => viewEpigraphs(p),
    magic: () => viewMagic(p, id), iceberg: () => viewIceberg(p, id), conns: () => (series ? viewConns(p) : viewWorld(p)),
    e: () => viewEntity(p, id), world: () => viewWorld(p, id), factions: () => viewFactions(p), maps: () => viewMaps(p, id),
    calendar: () => viewCalendar(p), travel: () => viewTravel(p), names: () => viewNames(p),
    progress: () => viewProgression(p), items: () => viewItems(p), loot: () => viewLoot(p), quests: () => viewQuests(p), sysmsg: () => viewSysMsg(p),
    checks: () => viewChecks(p), continuity: () => viewContinuity(p), secrets: () => viewSecrets(p), presence: () => viewPresence(p), revisions: () => viewRevisions(p),
    project: () => viewProject(p), mood: () => viewMood(p),
  };
  const main = (VIEWS[tab] || VIEWS[top ? 'timeline' : 'grid'])();
  const activeTab = tab;
  document.title = `${p.title} · Planner`;
  const crumbs = top
    ? [h('a', { class: 'top__project', href: shref() }, series.title), h('span', { class: 'pill pill--series' }, 'Series')]
    : series
      ? [h('a', { class: 'top__project', href: shref() }, series.title), h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'), h('a', { class: 'top__book', href: phref() }, p.title)]
      : [h('a', { class: 'top__project', href: phref() }, p.title)];
  let nChecks = 0;
  try { nChecks = checksCount(p); } catch (err) { console.error(err); }
  const tabs = [
    series && !top ? ['series', 'Timeline', 'timeline', shref()] : null,
    ...groups.map((g) => [g[0], g[1], g[2], url(g[3][0][0])]),
  ].filter(Boolean);
  const subs = group && group[3].length > 1 ? h('nav', { class: 'subtabs', 'aria-label': group[1] }, group[3].map(([t, label]) =>
    h('a', { class: 'subtab' + (t === tab || (tab === 'e' && t === (groupId === 'chars' ? 'chars' : 'world')) ? ' is-on' : ''), href: url(t), 'aria-current': t === tab ? 'page' : null }, label))) : null;

  const wide = ['grid', 'timeline', 'progress', 'braid'].includes(activeTab) || (activeTab === 'whatif' && !!id);
  if (activeTab !== 'grid') S.flowSel = null;
  const shell = h('div', { class: 'page' + (wide ? ' page--grid' : '') },
    h('header', { class: 'top' },
      brand(),
      h('span', { class: 'top__crumbs' }, crumbs),
      h('nav', { class: 'tabs', 'aria-label': 'Views' }, tabs.map(([gid, label, ic, u]) =>
        h('a', { class: 'tab' + (groupId === gid ? ' is-on' : ''), href: u, 'aria-current': groupId === gid ? 'page' : null },
          icon(ic), h('span', {}, label), gid === 'checks' && nChecks ? h('span', { class: 'tab__badge', 'aria-label': `${nChecks} to look at` }, String(nChecks)) : null))),
      h('div', { class: 'top__right' }, wordPill(), ideasButton(), searchBox(p),
        h('button', { class: 'iconbtn', type: 'button', title: 'Name generator', 'aria-label': 'Name generator', onclick: () => nameDialog({ kind: S.route.tab === 'world' || S.route.tab === 'e' ? kindForType((p.types.find((t) => t.id === S.route.id) || typeOf(entity(S.route.id)) || {}).name) : undefined, createType: S.route.tab === 'world' ? S.route.id : null }) }, icon('dice')),
        h('span', { id: 'save-status', class: 'status', 'aria-live': 'polite' }))),
    subs,
    h('main', { class: 'main main--' + activeTab }, main));
  const key = `${S.slug}|${S.bookId || ''}|${S.route.tab || ''}|${S.route.id || ''}`;
  saveScroll();
  clear(root).append(shell);
  restoreScroll(key);
  setStatus(S.status, S.statusMsg);
}

// Redrawing replaces the page, so remember where each scrolling area was
// (per screen) and put it back: adding a scene no longer jumps to the start.
const SCROLLERS = ['.grid-scroll', '.tl-box', '.pg-box'];
function saveScroll() {
  if (!S.renderKey) return;
  const m = { win: window.scrollY };
  for (const sel of SCROLLERS) {
    const el = root.querySelector(sel);
    if (el) m[sel] = [el.scrollLeft, el.scrollTop];
  }
  (S.scrollMem || (S.scrollMem = {}))[S.renderKey] = m;
}
function restoreScroll(key) {
  const same = key === S.renderKey;
  S.renderKey = key;
  const m = S.scrollMem && S.scrollMem[key];
  if (!m) return;
  for (const sel of SCROLLERS) {
    const el = root.querySelector(sel);
    if (el && m[sel]) { el.scrollLeft = m[sel][0]; el.scrollTop = m[sel][1]; }
  }
  if (same) window.scrollTo(window.scrollX, m.win);
}

// ---------- Running word total (top bar) ----------

function wordPill() {
  const series = isSeries() ? S.project : null;
  const top = series && !S.bookId;
  const scope = top ? series : P();
  const cards = top ? scopeCards() : scope.cards;
  const total = wordsOf(cards);
  const goal = scope.wordGoal;
  const pct = goal ? Math.min(100, Math.round((total / goal) * 100)) : 0;
  const wrap = h('div', { class: 'wc' });
  const btn = h('button', { class: 'wc__pill' + (S.wcOpen ? ' is-open' : ''), type: 'button', 'aria-expanded': String(!!S.wcOpen), 'aria-haspopup': 'dialog',
    title: 'Word count', onclick: (e) => { e.stopPropagation(); S.wcOpen = !S.wcOpen; render(); } },
  icon('words'),
  h('strong', { class: 'wc__n' }, fmtN(total)), h('span', { class: 'wc__unit' }, 'words'),
  goal ? h('span', { class: 'wc__bar', 'aria-hidden': 'true' }, h('span', { style: { width: pct + '%' } })) : null,
  goal ? h('span', { class: 'wc__pct' }, pct + '%') : null);
  wrap.append(btn);
  if (S.wcOpen) wrap.append(wordPanel(top, scope, cards, total, goal, pct));
  return wrap;
}

function wordPanel(top, scope, cards, total, goal, pct) {
  const series = isSeries() ? S.project : null;
  const byStatus = STATUSES.map(([v, l]) => [v, l, wordsOf(cards.filter((k) => k.status === v))]).filter(([, , n]) => n);
  const settingsHref = top ? shref('settings') : phref('project');
  const row = (label, n, g, extra) => h('li', { class: 'wcp__row' }, h('span', { class: 'wcp__label' }, label, extra || null), h('span', { class: wordClass(n, g) + ' wcp__num' }, g ? wordText(n, g) : n ? fmtN(n) : '—'));
  let parts;
  if (top) {
    parts = [h('h3', { class: 'wcp__h' }, 'By book'), h('ul', { class: 'wcp__list' }, series.books.map((b, i) => row(`${i + 1}. ${b.title || 'Untitled book'}`, wordsOf(b.cards), b.wordGoal)))];
  } else {
    const p = scope;
    const colRow = (c) => { const i = p.columns.indexOf(c); return row(`${numeral(p, i)}${c.title ? ' · ' + c.title : ''}`, wordsOf(p.cards.filter((k) => k.colId === c.id)), c.wordGoal, c.canon ? h('span', { class: 'wcp__pub' }, ' published') : null); };
    if (actsOn(p)) {
      parts = [h('h3', { class: 'wcp__h' }, `By ${lower(p.labels.act)} and ${lower(p.labels.column)}`), h('ul', { class: 'wcp__list' }, p.acts.map((a, ai) => {
        const cs = p.columns.filter((c) => c.actId === a.id);
        const ids = new Set(cs.map((c) => c.id));
        return [h('li', { class: 'wcp__row wcp__row--act' }, h('span', { class: 'wcp__label' }, `${p.labels.act} ${roman(ai + 1)}${a.title ? ': ' + a.title : ''}`),
          h('span', { class: wordClass(wordsOf(p.cards.filter((k) => ids.has(k.colId))), a.wordGoal) + ' wcp__num' }, wordText(wordsOf(p.cards.filter((k) => ids.has(k.colId))), a.wordGoal) || '—')), cs.map(colRow)];
      }))];
    } else {
      parts = [h('h3', { class: 'wcp__h' }, `By ${lower(p.labels.column)}`), h('ul', { class: 'wcp__list' }, p.columns.map(colRow))];
    }
  }
  const pubCards = top ? series.books.flatMap((b) => b.cards.filter((k) => b.columns.find((c) => c.id === k.colId)?.canon)) : scope.cards.filter((k) => scope.columns.find((c) => c.id === k.colId)?.canon);
  const pubWords = wordsOf(pubCards);
  const panel = h('div', { class: 'wcp', role: 'dialog', 'aria-label': 'Word count', onclick: (e) => e.stopPropagation() },
    h('div', { class: 'wcp__head' },
      h('span', { class: 'wcp__total' }, fmtN(total)), h('span', { class: 'muted' }, 'words'),
      h('span', { class: 'spacer' }),
      h('a', { class: 'small', href: settingsHref, onclick: () => { S.wcOpen = false; } }, goal ? 'Edit goal' : 'Set a goal')),
    goal ? h('div', { class: 'wcp__goal' },
      h('span', { class: 'wcp__bar' }, byStatus.map(([v, , n]) => h('span', { class: 'st-' + v, style: { width: Math.min(100, (n / goal) * 100) + '%' } }))),
      h('span', { class: 'muted small' }, total >= goal ? `Goal of ${fmtN(goal)} reached` : `${pct}% of your ${fmtN(goal)}-word goal · ${fmtN(goal - total)} to go`)) : null,
    byStatus.length ? h('ul', { class: 'wcp__list' }, byStatus.map(([v, l, n]) => h('li', { class: 'wcp__row' }, h('span', { class: 'wcp__label' }, h('i', { class: 'legend__dot st-' + v }), ' ', l), h('span', { class: 'wcp__num' }, fmtN(n)))))
      : h('p', { class: 'muted small wcp__empty' }, 'No words counted yet. Add a word count to any scene card.'),
    parts,
    series && !top ? h('p', { class: 'wcp__foot' }, 'Whole series: ', h('strong', {}, wordText(wordsOf(scopeCards()), series.wordGoal) || '0 words')) : null,
    pubWords ? h('p', { class: 'wcp__foot' }, 'Published so far: ', h('strong', {}, `${fmtN(pubWords)} words`)) : null);
  return panel;
}

document.addEventListener('click', () => { if (S.wcOpen) { S.wcOpen = false; if (S.project) render(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.wcOpen && !document.querySelector('dialog[open]')) { S.wcOpen = false; render(); } });

// ---------- Search ----------

function searchBox(p) {
  const input = h('input', { class: 'input search__input', type: 'search', placeholder: 'Search', 'aria-label': 'Search this project', autocomplete: 'off' });
  const list = h('div', { class: 'search__list', hidden: true, role: 'listbox' });
  let results = [];
  const run = () => {
    const q = input.value.trim().toLowerCase();
    clear(list);
    if (!q) { list.hidden = true; return; }
    results = [];
    for (const e of p.entities) {
      const t = typeOf(e);
      const text = [e.name, ...(e.aliases || []), e.summary, e.notes, ...(t ? t.fields.map((f) => valueText(p, f, e.fields[f.id])) : [])].join(' ').toLowerCase();
      const alias = (e.aliases || []).find((a) => a.toLowerCase().includes(q));
      if (text.includes(q)) results.push({ label: e.name || 'Unnamed', sub: (t ? t.singular : 'Entry') + (alias && !(e.name || '').toLowerCase().includes(q) ? ` · “${alias}”` : ''), color: t?.color, go: () => go(pbase('e/' + e.id)), rank: (e.name || '').toLowerCase().includes(q) || alias ? 0 : 2 });
    }
    for (const k of p.cards) {
      const text = [k.title, k.summary, k.notes, ...p.cardFields.map((f) => valueText(p, f, k.fields[f.id]))].join(' ').toLowerCase();
      const ci = cardInfo(k);
      if (text.includes(q)) results.push({ label: k.title || 'Untitled scene', sub: (otherBook(ci.b) ? ci.b.title + ' · ' : '') + ci.num + ' · ' + (ci.row?.title || ''), color: ci.row?.color, go: () => openCard(k.id), rank: (k.title || '').toLowerCase().includes(q) ? 1 : 3 });
    }
    if (!inSeriesTop()) p.columns.forEach((c) => {
      if ([c.title, c.teaser, c.recap, c.notes].join(' ').toLowerCase().includes(q)) results.push({ label: c.title || colName(p, c), sub: colName(p, c), go: () => editColumn(c.id), rank: 1 });
    });
    results.sort((a, b) => a.rank - b.rank);
    results = results.slice(0, 12);
    if (!results.length) list.append(h('div', { class: 'search__empty' }, 'Nothing matches'));
    for (const r of results) {
      list.append(h('button', { class: 'search__item', type: 'button', style: { '--c': r.color || 'var(--rule)' },
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { input.value = ''; list.hidden = true; input.blur(); r.go(); } },
      h('span', { class: 'dot' }), h('span', { class: 'search__label' }, r.label), h('span', { class: 'search__sub' }, r.sub)));
    }
    list.hidden = false;
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && results[0]) { e.preventDefault(); const r = results[0]; input.value = ''; list.hidden = true; input.blur(); r.go(); }
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
  return h('div', { class: 'search' }, icon('search', 'search__ico'), input, list);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable && !document.querySelector('dialog[open]') && S.user !== undefined) {
    e.preventDefault(); openIdeas(); return;
  }
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))) {
    const s = document.querySelector('.search__input');
    if (s && !document.querySelector('dialog[open]')) { e.preventDefault(); s.focus(); }
  }
});

// ======================================================================
// Grid
// ======================================================================

function viewGrid(p) {
  const hl = h('select', { class: 'input input--sm', 'aria-label': 'Highlight cards with', onchange: (e) => { S.highlight = e.target.value; render(); } },
    h('option', { value: '' }, 'Highlight: nothing'),
    p.types.map((t) => {
      const es = p.entities.filter((e) => e.typeId === t.id).sort((a, b) => a.name.localeCompare(b.name));
      return es.length ? h('optgroup', { label: t.name }, es.map((e) => h('option', { value: e.id, selected: S.highlight === e.id }, e.name || 'Unnamed'))) : null;
    }));

  const toolbar = h('div', { class: 'toolbar' },
    p.entities.length ? hl : null,
    h('div', { class: 'legend', role: 'group', 'aria-label': 'Show only cards with status' },
      STATUSES.map(([v, l]) => {
        const n = p.cards.filter((k) => k.status === v).length;
        return h('button', { class: 'legend__item st-' + v + (S.statusFilter === v ? ' is-on' : ''), type: 'button', 'aria-pressed': String(S.statusFilter === v),
          title: S.statusFilter === v ? 'Show all cards' : `Highlight ${l} cards`,
          onclick: () => { S.statusFilter = S.statusFilter === v ? '' : v; render(); } },
        h('span', { class: 'legend__dot' }), STATUS_SHORT[v], h('span', { class: 'legend__n' }, String(n)));
      })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.compact, onchange: (e) => { S.compact = e.target.checked; render(); } }), ' Titles only'),
    h('span', { class: 'spacer' }),
    p.flow.beats.length ? [
      h('button', { class: 'tl-toggle' + (flowPref('ribbon') ? ' is-on' : ''), type: 'button', 'aria-pressed': String(flowPref('ribbon')), onclick: () => { setFlowPref('ribbon', !flowPref('ribbon')); render(); } }, '◆ Beats on grid'),
      h('button', { class: 'tl-toggle' + (flowPref('panel') ? ' is-on' : ''), type: 'button', 'aria-pressed': String(flowPref('panel')), onclick: () => { setFlowPref('panel', !flowPref('panel')); render(); } }, 'Story flow panel'),
    ] : null,
    actsOn(p) ? h('button', { class: 'btn btn--sm', type: 'button', onclick: addAct }, icon('plus'), ` ${p.labels.act}`) : null,
    h('button', { class: 'btn btn--sm', type: 'button', onclick: () => addColumn() }, icon('plus'), ` ${p.labels.column}`),
    h('button', { class: 'btn btn--sm', type: 'button', title: 'A short side chapter between parts, often from another point of view', onclick: () => addColumn(undefined, true) }, icon('plus'), ' Interlude'),
    h('button', { class: 'btn btn--sm', type: 'button', onclick: addRow }, icon('plus'), ` ${p.labels.row}`),
    p.rows.some((r) => r.flash) ? null : h('button', { class: 'btn btn--sm', type: 'button', title: 'A lane for one character’s past, told in flashbacks', onclick: addFlashLane }, icon('plus'), ' Flashback lane'));

  const useActs = actsOn(p);
  // A slot is one grid column: a real column, or the placeholder of an empty act.
  const slots = useActs
    ? p.acts.flatMap((a) => { const cs = p.columns.filter((c) => c.actId === a.id); return cs.length ? cs.map((c) => ({ c })) : [{ act: a }]; })
    : p.columns.map((c) => ({ c }));
  const grid = h('div', { class: 'grid' + (S.compact ? ' is-compact' : '') + (useActs ? ' has-acts' : ''), style: { '--cols': slots.length } });
  if (slots.some((sl) => sl.c && sl.c.interlude)) grid.style.gridTemplateColumns = `var(--rowhead) ${slots.map((sl) => (sl.c && sl.c.interlude ? 'var(--intw)' : 'var(--colw)')).join(' ')} var(--addw)`;
  if (useActs) {
    grid.append(h('div', { class: 'grid__actcorner' }));
    p.acts.forEach((a, i) => grid.append(actHeader(p, a, i)));
    grid.append(h('button', { class: 'grid__addact', type: 'button', onclick: addAct, title: `Add ${lower(p.labels.act)}`, 'aria-label': `Add ${lower(p.labels.act)}` }, icon('plus')));
  }
  if (p.flow.beats.length && flowPref('ribbon')) {
    grid.append(h('div', { class: 'grid__beatlab' }, 'Beats'), beatRibbon(p, slots), h('div', {}));
  }
  grid.append(h('div', { class: 'grid__corner' }, h('span', {}, `${p.labels.row}s`), h('span', { class: 'muted' }, ` / ${p.labels.column}s`)));
  for (const sl of slots) grid.append(sl.c ? colHeader(p, sl.c, colIndex(sl.c.id)) : emptyActHead(p, sl.act));
  grid.append(h('button', { class: 'grid__addcol', type: 'button', onclick: () => addColumn(), 'aria-label': `Add ${lower(p.labels.column)}` }, icon('plus')));
  for (const r of p.rows) {
    grid.append(rowHeader(p, r));
    for (const sl of slots) grid.append(sl.c ? cell(p, sl.c, r) : h('div', { class: 'cell cell--void' }));
    grid.append(h('div', { class: 'grid__pad' }));
  }
  grid.append(h('button', { class: 'grid__addrow', type: 'button', onclick: addRow }, icon('plus'), ` Add ${lower(p.labels.row)}`));

  const empty = !p.cards.length && p.rows.length && p.columns.length
    ? h('p', { class: 'hint' }, `Each column is a ${lower(p.labels.column)}, each row a ${lower(p.labels.row)}. Click + in any square to add a scene card, then drag cards around as the story changes. Click a ${lower(p.labels.column)}’s header to add its teaser, recap and notes.`)
    : null;
  const panel = p.flow.beats.length && flowPref('panel') ? flowPanel(p) : null;
  return [toolbar, empty, panel ? h('div', { class: 'grid-wrap' }, h('div', { class: 'grid-scroll' }, grid), panel) : h('div', { class: 'grid-scroll' }, grid)];
}

function colHeader(p, c, i) {
  const n = p.cards.filter((k) => k.colId === c.id).length;
  const el = h('div', { class: 'colhead' + (c.canon ? ' is-canon' : '') + (c.interlude ? ' colhead--interlude' : ''), role: 'button', tabindex: '0', title: `Edit ${c.interlude ? 'interlude' : lower(p.labels.column)} (drag to move)`,
    onclick: () => editColumn(c.id), onkeydown: (e) => { if (e.key === 'Enter') editColumn(c.id); } },
  icon('grip', 'grip'),
  h('span', { class: 'colhead__num' }, numeral(p, i)),
  h('span', { class: 'colhead__text' },
    h('span', { class: 'colhead__title' + (c.title ? '' : ' muted') }, c.title || `${c.interlude ? 'Interlude' : p.labels.column} ${numeral(p, i)}`),
    h('span', { class: 'colhead__meta' },
      c.interlude && c.pov ? h('span', { class: 'pill pill--interlude' }, c.pov) : null,
      c.epi && c.epi.text ? h('span', { class: 'colhead__epi', title: c.epi.text + (c.epi.src ? ` (${c.epi.src})` : '') }, '❝') : null,
      c.canon ? h('span', { class: 'pill pill--canon' }, icon('lock'), 'Published') : null,
      h('span', {}, plural(n, 'card'))),
    (() => { const w = wordsOf(p.cards.filter((k) => k.colId === c.id)); return w || c.wordGoal ? h('span', { class: wordClass(w, c.wordGoal) + ' colhead__words' }, wordText(w, c.wordGoal)) : null; })(),
    h('span', { class: 'statusbar' + (n ? '' : ' statusbar--empty'), title: STATUSES.map(([v, l]) => [l, p.cards.filter((k) => k.colId === c.id && k.status === v).length]).filter(([, x]) => x).map(([l, x]) => `${l}: ${x}`).join(' · ') },
      STATUSES.map(([v]) => {
        const x = p.cards.filter((k) => k.colId === c.id && k.status === v).length;
        return x ? h('span', { class: 'statusbar__seg st-' + v, style: { flexGrow: String(x) } }) : null;
      }))));
  dragSource(el, 'col', c.id);
  dropTarget(el, { col: 'x' }, (it, after) => moveColumn(it.id, c.id, after));
  return el;
}

function actHeader(p, a, i) {
  const cols = p.columns.filter((c) => c.actId === a.id);
  const first = colIndex(cols[0]?.id), last = colIndex(cols[cols.length - 1]?.id);
  const el = h('div', { class: 'acthead' + (i % 2 ? ' acthead--alt' : ''), role: 'button', tabindex: '0', style: { gridColumn: `span ${Math.max(1, cols.length)}` }, title: `Edit ${lower(p.labels.act)} (drag to move)`,
    onclick: () => editAct(a.id), onkeydown: (e) => { if (e.key === 'Enter') editAct(a.id); } },
  icon('grip', 'grip'),
  h('span', { class: 'acthead__num' }, `${p.labels.act} ${roman(i + 1)}`),
  a.title ? h('span', { class: 'acthead__title' }, a.title) : null,
  h('span', { class: 'spacer' }),
  (() => { const ids = new Set(cols.map((c) => c.id)); const w = wordsOf(p.cards.filter((k) => ids.has(k.colId))); return w || a.wordGoal ? h('span', { class: wordClass(w, a.wordGoal) + ' acthead__words' }, wordText(w, a.wordGoal)) : null; })(),
  cols.length ? h('span', { class: 'acthead__range' }, first === last ? `${p.labels.column} ${numeral(p, first)}` : `${p.labels.column}s ${numeral(p, first)}–${numeral(p, last)}`) : null);
  dragSource(el, 'act', a.id);
  dropTarget(el, { act: 'x', col: 'into' }, (it, after) => {
    if (it.kind === 'act') moveAct(it.id, a.id, after);
    else change((p) => { const c = p.columns.find((x) => x.id === it.id); const [x] = p.columns.splice(p.columns.indexOf(c), 1); x.actId = a.id; p.columns.push(x); syncActs(p); });
  });
  return el;
}

function emptyActHead(p, a) {
  const el = h('div', { class: 'colhead colhead--empty' },
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => addColumn(a.id) }, icon('plus'), ` ${p.labels.column}`));
  dropTarget(el, { col: 'into' }, (it) => change((p) => { const c = p.columns.find((x) => x.id === it.id); c.actId = a.id; syncActs(p); }));
  return el;
}

// ---------- Dragging columns, acts and rows ----------

function clearDrops() {
  document.querySelectorAll('.drop-left, .drop-right, .drop-above, .drop-below, .drop-into')
    .forEach((x) => x.classList.remove('drop-left', 'drop-right', 'drop-above', 'drop-below', 'drop-into'));
}

function dragSource(el, kind, id) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    S.dragItem = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    requestAnimationFrame(() => el.classList.add('is-dragging'));
  });
  el.addEventListener('dragend', () => { S.dragItem = null; el.classList.remove('is-dragging'); clearDrops(); });
}

// modes: { kind: 'x' | 'y' | 'into' }; onDrop(item, after)
function dropTarget(el, modes, onDrop) {
  const where = (e, mode) => {
    if (mode === 'into') return 'drop-into';
    const b = el.getBoundingClientRect();
    if (mode === 'x') return e.clientX > b.left + b.width / 2 ? 'drop-right' : 'drop-left';
    return e.clientY > b.top + b.height / 2 ? 'drop-below' : 'drop-above';
  };
  el.addEventListener('dragover', (e) => {
    const it = S.dragItem;
    if (!it || !modes[it.kind]) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cls = where(e, modes[it.kind]);
    if (!el.classList.contains(cls)) { clearDrops(); el.classList.add(cls); }
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-left', 'drop-right', 'drop-above', 'drop-below', 'drop-into'); });
  el.addEventListener('drop', (e) => {
    const it = S.dragItem;
    if (!it || !modes[it.kind]) return;
    e.preventDefault();
    const after = el.classList.contains('drop-right') || el.classList.contains('drop-below');
    clearDrops();
    S.dragItem = null;
    onDrop(it, after);
  });
}

function moveColumn(id, targetId, after) {
  if (id === targetId) return;
  change((p) => {
    const i = p.columns.findIndex((x) => x.id === id);
    const [c] = p.columns.splice(i, 1);
    const t = p.columns.find((x) => x.id === targetId);
    c.actId = t.actId;
    p.columns.splice(p.columns.indexOf(t) + (after ? 1 : 0), 0, c);
    syncActs(p);
  });
}

function moveAct(id, targetId, after) {
  if (id === targetId) return;
  change((p) => {
    const [a] = p.acts.splice(p.acts.findIndex((x) => x.id === id), 1);
    p.acts.splice(p.acts.findIndex((x) => x.id === targetId) + (after ? 1 : 0), 0, a);
    syncActs(p);
  });
}

function moveRow(id, targetId, after) {
  if (id === targetId) return;
  change((p) => {
    const [r] = p.rows.splice(p.rows.findIndex((x) => x.id === id), 1);
    p.rows.splice(p.rows.findIndex((x) => x.id === targetId) + (after ? 1 : 0), 0, r);
  });
}

// Moves a column one step; crossing into a neighboring act joins that act.
function stepColumn(id, dir) {
  change((p) => {
    const i = p.columns.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= p.columns.length) return;
    const c = p.columns[i], n = p.columns[j];
    if (actsOn(p) && n.actId !== c.actId) c.actId = n.actId;
    else { p.columns[i] = n; p.columns[j] = c; }
    syncActs(p);
  });
}

function rowHeader(p, r) {
  const n = p.cards.filter((k) => k.rowId === r.id).length;
  const el = h('div', { class: 'rowhead' + (r.flash ? ' rowhead--flash' : ''), role: 'button', tabindex: '0', style: { '--c': r.color }, title: `Edit ${lower(p.labels.row)} (drag to move)`,
    onclick: () => editRow(r.id), onkeydown: (e) => { if (e.key === 'Enter') editRow(r.id); } },
  icon('grip', 'grip'),
  h('span', { class: 'rowhead__text' },
    h('span', { class: 'rowhead__title' }, r.title || 'Untitled'),
    r.flash ? h('span', { class: 'rowhead__meta' }, r.focus && entity(r.focus) ? `${entity(r.focus).name}’s past` : 'Flashbacks') : null,
    h('span', { class: 'rowhead__meta' }, plural(n, 'card')),
    (() => { const w = wordsOf(p.cards.filter((k) => k.rowId === r.id)); return w ? h('span', { class: 'words rowhead__words' }, `${fmtN(w)} words`) : null; })()));
  dragSource(el, 'row', r.id);
  dropTarget(el, { row: 'y' }, (it, after) => moveRow(it.id, r.id, after));
  return el;
}

function cell(p, c, r) {
  const cards = p.cards.filter((k) => k.colId === c.id && k.rowId === r.id);
  const el = h('div', { class: 'cell' + (c.canon ? ' is-canon' : '') + (c.interlude ? ' cell--interlude' : '') + (r.flash ? ' cell--flash' : ''), dataset: { col: c.id, row: r.id } },
    cards.map((k) => cardEl(p, k, r)),
    h('button', { class: 'cell__add', type: 'button', 'aria-label': `Add card to ${colName(p, c)}, ${r.title}`, onclick: () => newCard(c.id, r.id) }, icon('plus')));

  const clearMarks = () => {
    el.classList.remove('is-over');
    el.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
  };
  const beforeEl = (y) => [...el.querySelectorAll('.card:not(.is-dragging)')].find((x) => {
    const b = x.getBoundingClientRect(); return y < b.top + b.height / 2;
  });
  el.addEventListener('dragover', (e) => {
    if (!S.drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    el.classList.add('is-over');
    const b = beforeEl(e.clientY);
    if (b) b.classList.add('drop-before');
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) clearMarks(); });
  el.addEventListener('drop', (e) => {
    if (!S.drag) return;
    e.preventDefault();
    const b = beforeEl(e.clientY);
    clearMarks();
    moveCard(S.drag, c.id, r.id, b ? b.dataset.id : null);
    S.drag = null;
  });
  return el;
}

function cardEl(p, k, r) {
  const ents = k.entityIds.map(entity).filter(Boolean);
  const dim = (S.highlight && !k.entityIds.includes(S.highlight)) || (S.statusFilter && k.status !== S.statusFilter) || (S.flowSel && k.beatId !== S.flowSel);
  const hit = !dim && (S.highlight || S.statusFilter || S.flowSel);
  const beat = k.beatId ? p.flow.beats.find((b) => b.id === k.beatId) : null;
  const payoffOf = scopeCards().find((x) => x.payoffId === k.id);
  const payoff = k.setup && k.payoffId ? findCard(k.payoffId) : null;
  const where = (x) => { const ci = cardInfo(x); return otherBook(ci.b) ? ci.b.title : ci.num; };
  const st = STATUSES.find(([v]) => v === k.status) || STATUSES[0];
  const el = h('article', {
    class: `card st-${k.status}` + (dim ? ' is-dim' : '') + (hit ? ' is-hit' : ''),
    draggable: 'true', tabindex: '0', style: { '--c': r.color }, dataset: { id: k.id },
    onclick: () => editCard(k.id),
    onkeydown: (e) => { if (e.key === 'Enter') editCard(k.id); },
    ondragstart: (e) => { S.drag = k.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k.id); requestAnimationFrame(() => el.classList.add('is-dragging')); },
    ondragend: () => { S.drag = null; el.classList.remove('is-dragging'); },
    ondragover: (e) => { if (S.dragBeat) { e.preventDefault(); e.stopPropagation(); el.classList.add('is-beat-over'); } },
    ondragleave: () => el.classList.remove('is-beat-over'),
    ondrop: (e) => {
      if (!S.dragBeat) return;
      e.preventDefault(); e.stopPropagation();
      const id = S.dragBeat; S.dragBeat = null;
      change(() => { k.beatId = id; });
      toast(`Tagged “${k.title || 'Untitled scene'}” with ${p.flow.beats.find((b) => b.id === id)?.name || 'that beat'}`);
    },
  },
  h('div', { class: 'card__top' },
    h('h3', { class: 'card__title' + (k.title ? '' : ' muted') }, k.title || 'Untitled scene'),
    h('span', { class: 'card__status', title: st[1] }, STATUS_SHORT[k.status] || st[1])),
  !S.compact && k.summary ? h('p', { class: 'card__sum' }, k.summary) : null,
  beat ? h('span', { class: 'card__beat', title: beat.text || beat.hint || '' }, '◆ ' + (beat.name || 'Untitled beat')) : null,
  gameOn() && (k.game || []).length ? h('div', { class: 'card__game' }, icon('spark'), (() => {
    const lvs = k.game.filter((x) => x.kind === 'level');
    const ids = [...new Set(k.game.map((x) => x.who))];
    const who = ids.map((id) => entity(id)?.name).filter(Boolean);
    if (ids.length === 1 && lvs.length) return `Level ${lvs[lvs.length - 1].value || '?'} · ${who[0] || ''}`;
    return `${lvs.length ? plural(lvs.length, 'level-up') : plural(k.game.length, 'game event')}${who.length ? ' · ' + who.join(', ') : ''}`;
  })()) : null,
  (k.setup || payoffOf) ? h('div', { class: 'card__flags' },
    k.setup ? h('span', { class: 'flag' + (payoff ? '' : ' flag--open') }, icon('flag'),
      payoff ? `Pays off in ${where(payoff)}` : 'Setup, not paid off') : null,
    payoffOf ? h('span', { class: 'flag flag--done' }, icon('check'), `Payoff from ${where(payoffOf)}`) : null) : null,
  !S.compact && ents.length ? h('div', { class: 'card__chips' },
    ents.slice(0, 6).map((e) => h('span', { class: 'chip chip--sm', style: { '--c': typeOf(e)?.color } }, e.name || 'Unnamed')),
    ents.length > 6 ? h('span', { class: 'chip chip--sm chip--more' }, `+${ents.length - 6}`) : null) : null,
  cardExtras(p, k),
  k.words || k.wordGoal ? h('div', { class: 'card__words' }, h('span', { class: wordClass(k.words || 0, k.wordGoal) }, k.words || k.wordGoal ? (k.wordGoal ? wordText(k.words || 0, k.wordGoal) : `${fmtN(k.words)} words`) : '')) : null);
  return el;
}

function moveCard(id, colId, rowId, beforeId) {
  change((p) => {
    const i = p.cards.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [k] = p.cards.splice(i, 1);
    k.colId = colId; k.rowId = rowId;
    const j = beforeId && beforeId !== id ? p.cards.findIndex((x) => x.id === beforeId) : -1;
    if (j >= 0) p.cards.splice(j, 0, k);
    else {
      let last = -1;
      p.cards.forEach((x, ix) => { if (x.colId === colId && x.rowId === rowId) last = ix; });
      p.cards.splice(last + 1, 0, k);
    }
  });
}

function addColumn(actId, interlude = false) {
  const p = P();
  const act = actsOn(p) ? (actId || p.acts[p.acts.length - 1].id) : undefined;
  change((p) => {
    p.columns.push({ id: uid(), actId: act, title: '', teaser: '', recap: '', notes: '', date: '', canon: false, interlude, pov: '', seeds: '', passes: {}, epi: { text: '', src: '', where: '', reveals: [], clue: false } });
    syncActs(p);
  });
  if (!actId) requestAnimationFrame(() => { const s = document.querySelector('.grid-scroll'); if (s) s.scrollLeft = s.scrollWidth; });
}

function addAct() {
  const id = uid();
  change((p) => {
    p.acts.push({ id, title: '', notes: '' });
    p.columns.push({ id: uid(), actId: id, title: '', teaser: '', recap: '', notes: '', date: '', canon: false, interlude: false, passes: {}, epi: { text: '', src: '', where: '', reveals: [], clue: false } });
    syncActs(p);
  });
  requestAnimationFrame(() => { const s = document.querySelector('.grid-scroll'); if (s) s.scrollLeft = s.scrollWidth; });
  editAct(id);
}

function editAct(id) {
  const p = P();
  const a = () => p.acts.find((x) => x.id === id);
  if (!a()) return;
  const i = p.acts.findIndex((x) => x.id === id);
  const n = p.columns.filter((c) => c.actId === id).length;
  const upd = (fn) => change(() => fn(a()), { render: false });
  const label = `${p.labels.act} ${roman(i + 1)}`;
  const d = openDialog({
    title: label,
    body: [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name'),
        h('input', { class: 'input input--title', value: a().title, placeholder: 'e.g. The Fog', oninput: (e) => upd((a) => { a.title = e.target.value; }) })),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Notes'),
        autosize(h('textarea', { class: 'input', rows: 3, value: a().notes || '', placeholder: `What this ${lower(p.labels.act)} has to accomplish, where it turns`, oninput: (e) => upd((a) => { a.notes = e.target.value; }) }))),
      goalField('Word goal', () => a().wordGoal, (v) => upd((a) => { a.wordGoal = v; }), (() => { const ids = new Set(p.columns.filter((c) => c.actId === id).map((c) => c.id)); return `So far: ${fmtN(wordsOf(p.cards.filter((k) => ids.has(k.colId))))} words`; })()),
    ],
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        d.close();
        if (p.acts.length === 1) { toast(`To remove the last ${lower(p.labels.act)}, turn off acts in the Project tab.`); return; }
        const into = p.acts[i > 0 ? i - 1 : 1];
        const intoName = `${p.labels.act} ${roman((i > 0 ? i - 1 : 1) + 1)}`;
        if (await confirmDanger(`Delete ${label}?`, n ? `Its ${plural(n, lower(p.labels.column))} and their cards stay, and move into ${intoName}.` : `It has no ${lower(p.labels.column)}s.`)) {
          change((p) => { for (const c of p.columns) if (c.actId === id) c.actId = into.id; p.acts = p.acts.filter((x) => x.id !== id); syncActs(p); });
        }
      } }, icon('trash'), ' Delete'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move earlier', title: 'Move earlier', disabled: i === 0, onclick: () => { d.close(); moveAct(id, p.acts[i - 1].id, false); } }, icon('left')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move later', title: 'Move later', disabled: i === p.acts.length - 1, onclick: () => { d.close(); moveAct(id, p.acts[i + 1].id, true); } }, icon('right')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: () => { d.close(); addColumn(id); } }, icon('plus'), ` Add a ${lower(p.labels.column)}`),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => render(),
  });
}

async function addFlashLane() {
  const p = P();
  const cs = p.entities.filter(isChar).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const id = uid();
  change((p) => p.rows.push({ id, title: 'Flashbacks', color: '#9A5B12', flash: true, focus: cs[0] ? cs[0].id : null }));
  editRow(id);
}

async function addRow() {
  const p = P();
  const name = await ask(`New ${lower(p.labels.row)}`, 'Name', '', 'Add');
  if (!name) return;
  change((p) => p.rows.push({ id: uid(), title: name, color: PALETTE[p.rows.length % PALETTE.length] }));
}

function newCard(colId, rowId) {
  const id = uid();
  change((p) => {
    let last = -1;
    p.cards.forEach((x, ix) => { if (x.colId === colId && x.rowId === rowId) last = ix; });
    p.cards.splice(last + 1, 0, blankCard(id, colId, rowId));
  }, { render: false });
  editCard(id, true);
}

function blankCard(id, colId, rowId) {
  return { id, colId, rowId, title: '', summary: '', notes: '', status: 'idea', entityIds: [], setup: false, payoffId: null, fields: {}, links: [], when: null, game: [], words: null, wordGoal: null,
    beatId: null, reveals: [], rels: [], raises: [], answers: [], moves: [], magic: [], explains: [], payoff: false, past: '', flags: [], arcs: [], clips: [], quests: [], chk: {} };
}

// ---------- Card dialog ----------

function editCard(id, isNew = false, after = null) {
  const p = P();
  const k = () => p.cards.find((x) => x.id === id);
  if (!k()) return;
  const upd = (fn) => change(() => fn(k()), { render: false });
  const col = p.columns.find((c) => c.id === k().colId);
  const row = p.rows.find((r) => r.id === k().rowId);

  const setupBox = h('div', { class: 'setup' });
  const drawSetup = () => {
    clear(setupBox);
    const c = k();
    const paysOff = scopeCards().filter((x) => x.payoffId === c.id);
    append(setupBox, [
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!c.setup, onchange: (e) => { upd((c) => { c.setup = e.target.checked; if (!c.setup) c.payoffId = null; }); drawSetup(); } }),
        ' Plants a setup that has to pay off later'),
      c.setup ? h('label', { class: 'field field--inline' }, h('span', { class: 'field__label' }, 'Pays off in'),
        cardSelect(p, c.payoffId, c.id, (v) => upd((c) => { c.payoffId = v || null; }))) : null,
      paysOff.map((s) => h('p', { class: 'note' }, icon('check'), 'Pays off the setup in ',
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { d.close(); setTimeout(() => openCard(s.id), 0); } }, cardLabel(p, s)))),
    ]);
  };
  drawSetup();

  const moveCol = h('select', { class: 'input', 'aria-label': p.labels.column, onchange: (e) => upd((c) => { c.colId = e.target.value; }) },
    p.columns.map((c, i) => h('option', { value: c.id, selected: c.id === k().colId }, `${p.labels.column} ${numeral(p, i)}${c.title ? ': ' + c.title : ''}`)));
  const moveRow = h('select', { class: 'input', 'aria-label': p.labels.row, onchange: (e) => upd((c) => { c.rowId = e.target.value; }) },
    p.rows.map((r) => h('option', { value: r.id, selected: r.id === k().rowId }, r.title)));

  const body = [
    col && col.canon ? h('p', { class: 'banner' }, icon('lock'), `${colName(p, col)} is published. Readers have already seen this.`) : null,
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Title'),
      h('input', { class: 'input input--title', value: k().title, placeholder: 'What happens, in a few words', oninput: (e) => upd((c) => { c.title = e.target.value; }) })),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Summary'),
      autosize(h('textarea', { class: 'input', rows: 3, value: k().summary, placeholder: 'The beats of the scene', oninput: (e) => upd((c) => { c.summary = e.target.value; }) }))),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Status'),
      h('div', { class: 'seg', role: 'radiogroup' }, STATUSES.map(([v, l]) => h('label', { class: 'seg__opt st-' + v },
        h('input', { type: 'radio', name: 'card-status', value: v, checked: k().status === v, onchange: () => upd((c) => { c.status = v; }) }),
        h('span', {}, h('i', { class: 'legend__dot' }), l))))),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'In this scene'),
      p.types.length ? entityPicker(p, () => k().entityIds, (ids) => upd((c) => { c.entityIds = ids; }))
        : h('p', { class: 'muted small' }, 'Add entry types (characters, places…) in the Project tab to link them here.')),
    p.cardFields.map((f) => fieldInput(p, f, () => k().fields[f.id], (v) => upd((c) => { c.fields[f.id] = v; }))),
    p.flow && p.flow.beats.length ? beatBox(p, k, upd, () => d) : null,
    wordsBox(p, k, upd),
    gameOn() ? gameBox(p, k, upd) : null,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Setup & payoff'), setupBox),
    timelineFields(p, k, upd, () => d),
    sceneExtras(p, k, upd, () => d),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Notes'),
      autosize(h('textarea', { class: 'input', rows: 2, value: k().notes, placeholder: 'Anything else: lines of dialogue, research, doubts', oninput: (e) => upd((c) => { c.notes = e.target.value; }) }))),
    h('details', { class: 'more' }, h('summary', {}, 'Move'),
      h('div', { class: 'row2' }, moveCol, moveRow)),
  ];

  const d = openDialog({
    title: `${isSeries() ? p.title + ' · ' : ''}${col ? colName(p, col) : ''} · ${row ? row.title : ''}`,
    body, wide: true,
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        const book = p;
        d.close();
        if (await confirmDanger('Delete this card?', `“${k()?.title || 'Untitled scene'}” will be removed. You can get it back from the backups.`)) {
          change(() => {
            book.cards = book.cards.filter((x) => x.id !== id);
            scopeCards().forEach((x) => { if (x.payoffId === id) x.payoffId = null; x.links = (x.links || []).filter((l) => l.id !== id); });
          });
        }
      } }, icon('trash'), ' Delete'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => {
      const c = k();
      if (isNew && c && !c.title.trim() && !c.summary.trim() && !c.notes.trim() && !c.entityIds.length) {
        change(() => { p.cards = p.cards.filter((x) => x.id !== id); }, { render: !after });
      }
      if (after) after();
      else if (S.route.view === 'project') render();
    },
  });
}

// Every card in reach, grouped by part (and by book in a series).
function cardOptions(p, value, selfId) {
  const books = isSeries() ? [p, ...S.project.books.filter((b) => b !== p)] : [p];
  return books.flatMap((b) => b.columns.map((c, i) => {
    const cards = b.cards.filter((x) => x.colId === c.id && x.id !== selfId);
    const label = `${otherBook(b) ? b.title + ' · ' : ''}${c.interlude ? 'Interlude' : b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}`;
    return cards.length ? h('optgroup', { label },
      cards.map((x) => h('option', { value: x.id, selected: x.id === value }, x.title || 'Untitled scene'))) : null;
  }));
}

// Word count and goal on a scene, with the running totals around it.
function wordsBox(p, k, upd) {
  const totals = h('p', { class: 'wbox__totals' });
  const drawTotals = () => {
    clear(totals);
    const c = k();
    const col = p.columns.find((x) => x.id === c.colId);
    const cw = wordsOf(p.cards.filter((x) => x.colId === c.colId));
    const pw = wordsOf(p.cards);
    const bits = [];
    if (col) bits.push([`This ${lower(p.labels.column)}: `, wordText(cw, col.wordGoal) || '0 words']);
    bits.push([isSeries() ? 'This book: ' : 'Project: ', wordText(pw, p.wordGoal) || '0 words']);
    if (isSeries()) bits.push(['Series: ', wordText(wordsOf(scopeCards()), S.project.wordGoal) || '0 words']);
    bits.forEach(([l, v], i) => append(totals, [i ? ' · ' : '', l, h('strong', {}, v)]));
  };
  drawTotals();
  return h('section', { class: 'wbox', 'aria-label': 'Word count' },
    h('div', { class: 'wbox__row' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Word count'),
        numberInput(() => k().words, (v) => { upd((c) => { c.words = v; }); drawTotals(); }, { placeholder: '0', class: 'input input--num input--words' })),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Goal (optional)'),
        numberInput(() => k().wordGoal, (v) => { upd((c) => { c.wordGoal = v; }); }, { placeholder: 'No goal' }))),
    totals);
}

function cardSelect(p, value, selfId, onChange) {
  return h('select', { class: 'input', onchange: (e) => onChange(e.target.value) },
    h('option', { value: '' }, 'Not yet (still open)'),
    cardOptions(p, value, selfId));
}

// "When in the story" and linked scenes, for cards in a series.
function timelineFields(p, k, upd, dlg) {
  const cal = S.project.calendar;
  const box = h('div', { class: 'tlf' });
  const draw = () => {
    clear(box);
    const c = k();
    const w = c.when;
    if (!c.links) c.links = [];
    const linkedHere = scopeCards().filter((x) => x !== c && (x.links || []).some((l) => l.id === c.id));
    append(box, [
      h('div', { class: 'tlf__head' }, icon('timeline', 'ico--accent'), h('strong', {}, isSeries() ? 'On the series timeline' : 'When in the story')),
      h('div', { class: 'row3' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Year'),
          h('select', { class: 'input', onchange: (e) => { const v = e.target.value; upd((c) => { c.when = v === '' ? null : { y: +v, p: c.when ? c.when.p : 0, day: c.when ? c.when.day : '' }; }); draw(); } },
            h('option', { value: '', selected: !w }, 'Not placed yet'),
            cal.years.map((y, i) => h('option', { value: String(i), selected: !!w && w.y === i }, y)))),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'When in the year'),
          h('select', { class: 'input', disabled: !w, onchange: (e) => upd((c) => { if (c.when) c.when.p = +e.target.value; }) },
            cal.parts.map((x, i) => h('option', { value: String(i), selected: !!w && w.p === i }, x)))),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Day (optional)'),
          h('input', { class: 'input', disabled: !w, value: (w && w.day) || '', placeholder: 'First frost', oninput: (e) => upd((c) => { if (c.when) c.when.day = e.target.value; }) }))),
      whenInfo(c), ageLine(c),
      !isSeries() ? null : h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Linked scenes'),
        h('div', { class: 'tlf__links' },
          (c.links || []).map((l, i) => {
            const o = findCard(l.id);
            if (!o) return null;
            return h('div', { class: 'tlf__link' },
              h('button', { class: 'linkbtn', type: 'button', onclick: () => { dlg().close(); setTimeout(() => openCard(o.id), 0); } }, cardLabel(p, o)),
              h('select', { class: 'input input--sm', 'aria-label': 'How the scenes are linked', onchange: (e) => upd((c) => { c.links[i].kind = e.target.value; }) },
                LINK_KINDS.map(([v, lbl]) => h('option', { value: v, selected: l.kind === v }, lbl))),
              h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove link', onclick: () => { upd((c) => { c.links.splice(i, 1); }); draw(); } }, icon('x')));
          }),
          linkedHere.map((o) => h('div', { class: 'tlf__link tlf__link--in' },
            h('button', { class: 'linkbtn', type: 'button', onclick: () => { dlg().close(); setTimeout(() => openCard(o.id), 0); } }, cardLabel(p, o)),
            h('span', { class: 'muted small' }, (LINK_KINDS.find(([v]) => v === (o.links.find((l) => l.id === c.id) || {}).kind) || ['', 'Linked'])[1] + ' (linked from that scene)'))),
          h('select', { class: 'input input--sm tlf__add', 'aria-label': 'Link a scene', onchange: (e) => {
            const v = e.target.value; if (!v) return;
            upd((c) => { c.links.push({ id: v, kind: 'same' }); }); draw();
          } }, h('option', { value: '' }, '+ Link a scene…'), cardOptions(p, '', c.id)))),
    ]);
  };
  draw();
  return box;
}

// ---------- Column & row dialogs ----------

function editColumn(id) {
  const p = P();
  const c = () => p.columns.find((x) => x.id === id);
  if (!c()) return;
  const upd = (fn) => change(() => fn(c()), { render: false });
  const i = colIndex(id);
  const text = (label, key, placeholder, long = false, hint = null) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null,
    long ? autosize(h('textarea', { class: 'input', rows: 2, value: c()[key] || '', placeholder, oninput: (e) => upd((c) => { c[key] = e.target.value; }) }))
      : h('input', { class: 'input', value: c()[key] || '', placeholder, oninput: (e) => upd((c) => { c[key] = e.target.value; }) }));
  const n = p.cards.filter((k) => k.colId === id).length;

  const d = openDialog({
    title: `${p.labels.column} ${numeral(p, i)}`,
    body: [
      text('Title', 'title', 'Title of this ' + lower(p.labels.column)),
      actsOn(p) ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, p.labels.act),
        h('select', { class: 'input', onchange: (e) => change((p) => { c().actId = e.target.value; syncActs(p); }, { render: false }) },
          p.acts.map((a, ai) => h('option', { value: a.id, selected: a.id === c().actId }, `${p.labels.act} ${roman(ai + 1)}${a.title ? ': ' + a.title : ''}`)))) : null,
      h('div', { class: 'row2' },
        h('label', { class: 'check check--box' }, h('input', { type: 'checkbox', checked: !!c().interlude, onchange: (e) => upd((c) => { c.interlude = e.target.checked; }) }),
          h('span', {}, h('strong', {}, 'Interlude'), h('br'), h('span', { class: 'muted small' }, 'A side chapter between parts; doesn’t take a number'))),
        text('Interlude point of view', 'pov', 'Whose eyes: the ferryman, Old Pell…')),
      text('Sets up', 'seeds', 'What this interlude plants for later'),
      text('One-line teaser', 'teaser', 'Shown on the home page and in link previews'),
      text('Previously…', 'recap', 'A short recap for returning readers', true),
      text('Planning notes', 'notes', 'Goals for this part, the cliffhanger, what must be true by the end', true),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Epigraph'), h('span', { class: 'field__hint' }, 'An in-world document at the head of this part. Sources and reveals are in Story › Epigraphs.'),
        autosize(h('textarea', { class: 'input epi__text', rows: 2, value: c().epi ? c().epi.text : '', placeholder: '“The trees do not keep what we give them…”', oninput: (e) => upd((c) => { c.epi = c.epi || { text: '', src: '', where: '', reveals: [], clue: false }; c.epi.text = e.target.value; }) }))),
      goalField('Word goal', () => c().wordGoal, (v) => upd((c) => { c.wordGoal = v; }), `So far: ${fmtN(wordsOf(p.cards.filter((k) => k.colId === id)))} words`),
      h('div', { class: 'row2' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Publish date'),
          h('input', { class: 'input', type: 'date', value: c().date || '', onchange: (e) => upd((c) => { c.date = e.target.value; }) })),
        h('label', { class: 'check check--box' },
          h('input', { type: 'checkbox', checked: !!c().canon, onchange: async (e) => {
            const on = e.target.checked;
            if (on && !(await publishCheck(p, c()))) { e.target.checked = false; return; }
            upd((c) => { c.canon = on; });
          } }),
          h('span', {}, h('strong', {}, 'Published'), h('br'), h('span', { class: 'muted small' }, 'Readers have seen it, so it’s canon')))),
    ],
    wide: true,
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        d.close();
        if (await confirmDanger(`Delete ${p.labels.column} ${numeral(p, i)}?`, n ? `Its ${plural(n, 'card')} will be deleted too.` : 'It has no cards.')) {
          change((p) => { p.columns = p.columns.filter((x) => x.id !== id); p.cards = p.cards.filter((k) => k.colId !== id); });
        }
      } }, icon('trash'), ' Delete'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move earlier', title: 'Move earlier', disabled: i === 0, onclick: () => { d.close(); stepColumn(id, -1); } }, icon('left')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move later', title: 'Move later', disabled: i === p.columns.length - 1, onclick: () => { d.close(); stepColumn(id, 1); } }, icon('right')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: () => { d.close(); exportColumn(id); } }, icon('download'), ' Export for the site'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => render(),
  });
}

function editRow(id) {
  const p = P();
  const r = () => p.rows.find((x) => x.id === id);
  if (!r()) return;
  const i = p.rows.findIndex((x) => x.id === id);
  const n = p.cards.filter((k) => k.rowId === id).length;
  const sw = swatches(() => r().color, (c) => change(() => { r().color = c; }, { render: false }));
  const d = openDialog({
    title: `Edit ${lower(p.labels.row)}`,
    body: [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name'),
        h('input', { class: 'input', value: r().title, oninput: (e) => change(() => { r().title = e.target.value; }, { render: false }) })),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Color'), sw),
      h('label', { class: 'check check--box' }, h('input', { type: 'checkbox', checked: !!r().flash, onchange: (e) => change(() => { r().flash = e.target.checked; }, { render: false }) }),
        h('span', {}, h('strong', {}, 'Flashback lane'), h('br'), h('span', { class: 'muted small' }, 'Scenes here are one character’s past. Give each its “when in the past” on the card.'))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Whose past (the book’s focus character)'),
        h('select', { class: 'input', onchange: (e) => change(() => { r().focus = e.target.value || null; }, { render: false }) },
          h('option', { value: '' }, 'Nobody yet'),
          p.entities.filter(isChar).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((x) => h('option', { value: x.id, selected: x.id === r().focus }, x.name || 'Unnamed')))),
    ],
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        d.close();
        if (await confirmDanger(`Delete “${r().title}”?`, n ? `Its ${plural(n, 'card')} will be deleted too.` : 'It has no cards.')) {
          change((p) => { p.rows = p.rows.filter((x) => x.id !== id); p.cards = p.cards.filter((k) => k.rowId !== id); });
        }
      } }, icon('trash'), ' Delete'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { d.close(); change((p) => { const [x] = p.rows.splice(i, 1); p.rows.splice(i - 1, 0, x); }); } }, icon('up')),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: i === p.rows.length - 1, onclick: () => { d.close(); change((p) => { const [x] = p.rows.splice(i, 1); p.rows.splice(i + 1, 0, x); }); } }, icon('down')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => render(),
  });
}

function swatches(get, set) {
  const wrap = h('div', { class: 'swatches' });
  const draw = () => {
    clear(wrap);
    for (const c of PALETTE) {
      wrap.append(h('button', { class: 'swatch' + (get() === c ? ' is-on' : ''), type: 'button', style: { '--c': c }, 'aria-label': 'Color ' + c, 'aria-pressed': String(get() === c),
        onclick: () => { set(c); draw(); } }));
    }
  };
  draw();
  return wrap;
}

// ---------- Export a part as an episode file ----------

function yaml(s) { return s ? JSON.stringify(String(s)) : "''"; }

function exportColumn(id) {
  const p = P();
  const c = p.columns.find((x) => x.id === id);
  const i = colIndex(id);
  const rowOrder = (k) => p.rows.findIndex((r) => r.id === k.rowId);
  const cards = p.cards.filter((k) => k.colId === id).sort((a, b) => rowOrder(a) - rowOrder(b));
  const outline = cards.map((k) => {
    const lines = [];
    if (k.title) lines.push(`**${k.title}**`);
    if (k.summary) lines.push(k.summary);
    return lines.join('\n\n') || '…';
  }).join('\n\n---\n\n');
  const today = new Date().toISOString().slice(0, 10);
  const front = ['---',
    `story: ${p.storySlug}`, `number: ${i + 1}`, `title: ${yaml(c.title)}`, `date: ${c.date || today}`,
    'draft: true', "cover: ''", `summary: ${yaml(c.teaser)}`, `previously: ${yaml(c.recap)}`, "authorNote: ''", '---', ''].join('\n');
  const md = front + '\n' + outline + '\n';
  const filename = `${p.storySlug}-part-${i + 1}.md`;
  const ta = h('textarea', { class: 'input mono', rows: 14, readonly: true, value: md });
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { ta.select(); toast('Select and copy with Ctrl+C'); } };
  openDialog({
    title: `Export ${p.labels.column} ${numeral(p, i)}`,
    wide: true,
    body: [
      h('p', { class: 'muted' }, 'A draft episode for oliveratwood.com, with your scene cards as the outline. It’s marked as a draft, so nothing goes live until you turn draft off in the editor.'),
      h('ul', { class: 'small muted tight' },
        h('li', {}, 'Quickest: in /admin choose Serial Episodes → New, then paste the outline into the body.'),
        h('li', {}, `Or add the downloaded file to src/episodes/ in the site repository.`)),
      p.storySlug ? null : h('p', { class: 'banner' }, 'Set the serial’s site name in the Project tab first.'),
      ta,
    ],
    actions: [
      h('button', { class: 'btn', type: 'button', onclick: () => copy(outline, 'Outline') }, icon('copy'), ' Copy outline'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => download(filename, md, 'text/markdown') }, icon('download'), ` Download ${filename}`),
    ],
  });
}

function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ======================================================================
// Entity picker and field inputs
// ======================================================================

function newEntity(typeId, name = '') {
  const e = normalizeEntity({ id: uid(), typeId, name, summary: '', fields: {}, notes: '' });
  change((p) => p.entities.push(e), { render: false });
  return e;
}

function entityPicker(p, getIds, setIds, { typeId = null } = {}) {
  const chips = h('div', { class: 'picker__chips' });
  const input = h('input', { class: 'input picker__input', placeholder: typeId ? `Add ${lower(p.types.find((t) => t.id === typeId)?.singular || 'entry')}…` : 'Add a character, place…', autocomplete: 'off', 'data-nofocus': '1' });
  const list = h('div', { class: 'picker__list', hidden: true, role: 'listbox' });
  let options = [];

  const add = (id) => {
    if (!getIds().includes(id)) setIds([...getIds(), id]);
    input.value = '';
    drawChips(); drawList(); input.focus();
  };
  const drawChips = () => {
    clear(chips);
    for (const id of getIds()) {
      const e = entity(id);
      if (!e) continue;
      chips.append(h('span', { class: 'chip chip--x', style: { '--c': typeOf(e)?.color } },
        h('a', { href: phref('e/' + e.id) }, e.name || 'Unnamed'),
        h('button', { type: 'button', 'aria-label': 'Remove ' + (e.name || 'entry'), onclick: () => { setIds(getIds().filter((x) => x !== id)); drawChips(); } }, icon('x'))));
    }
  };
  const drawList = () => {
    clear(list);
    options = [];
    if (document.activeElement !== input) { list.hidden = true; return; }
    const q = input.value.trim();
    const ql = q.toLowerCase();
    const have = new Set(getIds());
    const pool = p.entities.filter((e) => !have.has(e.id) && (!typeId || e.typeId === typeId) && (!ql || (e.name || '').toLowerCase().includes(ql)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 8);
    for (const e of pool) options.push({ label: e.name || 'Unnamed', sub: typeOf(e)?.singular || '', color: typeOf(e)?.color, pick: () => add(e.id) });
    if (q) {
      const types = typeId ? p.types.filter((t) => t.id === typeId) : p.types;
      for (const t of types) {
        if (p.entities.some((e) => e.typeId === t.id && (e.name || '').toLowerCase() === ql)) continue;
        options.push({ label: `Create “${q}”`, sub: `New ${lower(t.singular)}`, color: t.color, create: true, pick: () => add(newEntity(t.id, q).id) });
      }
    }
    for (const o of options) {
      list.append(h('button', { class: 'picker__opt' + (o.create ? ' is-create' : ''), type: 'button', style: { '--c': o.color || 'var(--rule)' },
        onmousedown: (e) => e.preventDefault(), onclick: o.pick },
      h('span', { class: 'dot' }), h('span', { class: 'picker__label' }, o.label), h('span', { class: 'picker__sub' }, o.sub)));
    }
    list.hidden = !options.length;
  };
  input.addEventListener('focus', drawList);
  input.addEventListener('input', drawList);
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (options[0]) options[0].pick(); }
    if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); e.preventDefault(); list.hidden = true; }
    if (e.key === 'Backspace' && !input.value && getIds().length) { setIds(getIds().slice(0, -1)); drawChips(); }
  });
  drawChips();
  return h('div', { class: 'picker' }, chips, h('div', { class: 'picker__box' }, input, list));
}

function fieldInput(p, f, get, set) {
  let ctl;
  switch (f.type) {
    case 'longtext':
      ctl = autosize(h('textarea', { class: 'input', rows: 2, value: get() || '', oninput: (e) => set(e.target.value) }));
      break;
    case 'number':
      ctl = h('input', { class: 'input input--num', type: 'number', value: get() ?? '', oninput: (e) => set(e.target.value) });
      break;
    case 'select': {
      const opts = [...(f.options || [])];
      if (get() && !opts.includes(get())) opts.push(get());
      ctl = h('select', { class: 'input', onchange: (e) => set(e.target.value) },
        h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o, selected: get() === o }, o)));
      break;
    }
    case 'tags':
      ctl = h('input', { class: 'input', value: (get() || []).join(', '), placeholder: 'Comma, separated', oninput: (e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) });
      break;
    case 'link':
      ctl = entityPicker(p, () => get() || [], set, { typeId: f.linkType || null });
      break;
    case 'ledger':
      ctl = ledgerEditor(p, get, set);
      break;
    default:
      ctl = h('input', { class: 'input', value: get() || '', oninput: (e) => set(e.target.value) });
  }
  const group = f.type === 'link' || f.type === 'ledger';
  return h(group ? 'div' : 'label', { class: 'field field--' + f.type },
    h('span', { class: 'field__label' }, f.name || 'Untitled field'),
    f.hint ? h('span', { class: 'field__hint' }, f.hint) : null,
    ctl);
}

function ledgerEditor(p, get, set) {
  const wrap = h('div', { class: 'ledger' });
  const rows = () => get() || [];
  const draw = (focusLast = false) => {
    clear(wrap);
    rows().forEach((r, i) => {
      wrap.append(h('div', { class: 'ledger__row' },
        h('span', { class: 'ledger__num' }, String(i + 1)),
        autosize(h('textarea', { class: 'input', rows: 1, value: r.text || '', placeholder: 'e.g. Every use costs the caster a memory',
          oninput: (e) => { const l = rows(); l[i].text = e.target.value; set(l); } })),
        h('select', { class: 'input ledger__col', 'aria-label': 'First shown to readers in', title: 'First shown to readers in',
          onchange: (e) => { const l = rows(); l[i].colId = e.target.value; set(l); } },
        h('option', { value: '' }, 'Not revealed yet'),
        isSeries()
          ? S.project.books.map((b) => h('optgroup', { label: b.title }, b.columns.map((c, ci) => h('option', { value: c.id, selected: r.colId === c.id }, `Revealed in ${b.labels.column} ${numeral(b, ci)}`))))
          : p.columns.map((c, ci) => h('option', { value: c.id, selected: r.colId === c.id }, `Revealed in ${numeral(p, ci)}`))),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove', onclick: () => { set(rows().filter((_, j) => j !== i)); draw(); } }, icon('x'))));
    });
    wrap.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { set([...rows(), { id: uid(), text: '', colId: '' }]); draw(true); } }, icon('plus'), ' Add'));
    if (focusLast) { const t = wrap.querySelectorAll('textarea'); t[t.length - 1]?.focus(); }
  };
  draw();
  return wrap;
}

// ======================================================================
// Name generator
// ======================================================================

// onUse: when given, picking a name hands it back (e.g. to name an entry).
// createType: the entry type preselected for "Create" in browse mode.
function nameDialog({ kind, onUse, useLabel, createType } = {}) {
  const p = P();
  const N = S.names;
  if (kind && KINDS[kind]) N.kind = kind;
  let results = [];
  let createAs = createType || p.types.find((t) => kindForType(t.name) === N.kind)?.id || p.types[0]?.id || '';

  const styleOf = () => N.style[N.kind] || KINDS[N.kind].styles[0][0];
  const usesFlavor = () => N.kind === 'word' || ['invented', 'realm', 'noble', 'legend', 'ship'].includes(styleOf());

  const kindSel = h('select', { class: 'input', 'aria-label': 'Kind of name', onchange: (e) => { N.kind = e.target.value; createAs = p.types.find((t) => kindForType(t.name) === N.kind)?.id || createAs; drawControls(); roll(); } },
    Object.entries(KINDS).map(([k, v]) => h('option', { value: k, selected: k === N.kind }, v.label)));
  const controls = h('div', { class: 'names__controls' });
  const list = h('div', { class: 'names__list', 'aria-live': 'polite' });
  const bank = h('div', { class: 'names__bank' });

  const drawControls = () => {
    clear(controls);
    const k = KINDS[N.kind];
    append(controls, [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Kind'), kindSel),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Style'),
        h('select', { class: 'input', onchange: (e) => { N.style[N.kind] = e.target.value; drawControls(); roll(); } },
          k.styles.map(([v, l]) => h('option', { value: v, selected: v === styleOf() }, l)))),
      k.gender && styleOf() !== 'invented' ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'First names'),
        h('select', { class: 'input', onchange: (e) => { N.gender = e.target.value; roll(); } },
          [['any', 'Any'], ['f', 'Feminine'], ['m', 'Masculine'], ['n', 'Gender-neutral']].map(([v, l]) => h('option', { value: v, selected: v === N.gender }, l)))) : null,
      usesFlavor() ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Sound'),
        h('select', { class: 'input', onchange: (e) => { N.flavor = e.target.value; roll(); } },
          FLAVORS.map(([v, l]) => h('option', { value: v, selected: v === N.flavor }, l)))) : null,
      h('label', { class: 'field names__start' }, h('span', { class: 'field__label' }, 'Starts with'),
        h('input', { class: 'input', value: N.start, maxlength: 4, placeholder: 'Any', 'data-nofocus': '1', oninput: (e) => { N.start = e.target.value.replace(/[^a-z]/gi, ''); roll(); } })),
    ]);
  };

  const saved = (n) => p.nameBank.some((x) => x.name === n);
  const toggleSave = (n) => {
    change((p) => {
      if (saved(n)) p.nameBank = p.nameBank.filter((x) => x.name !== n);
      else p.nameBank.unshift({ name: n, kind: N.kind });
    }, { render: false });
    drawList(); drawBank();
  };
  const use = (n) => {
    if (onUse) { onUse(n); d.close(); toast(`Named “${n}”`); return; }
    const t = p.types.find((x) => x.id === createAs);
    if (!t) { copy(n); return; }
    const e = newEntity(t.id, n);
    d.close();
    go(pbase('e/' + e.id));
    toast(`Created ${lower(t.singular)} “${n}”`);
  };
  const copy = async (n) => { try { await navigator.clipboard.writeText(n); toast(`Copied “${n}”`); } catch { toast(n); } };
  const taken = (n) => p.entities.some((e) => (e.name || '').toLowerCase() === n.toLowerCase());

  const nameRow = (n, { inBank = false } = {}) => h('div', { class: 'names__row' + (taken(n) ? ' is-taken' : '') },
    h('button', { class: 'names__name', type: 'button', title: onUse ? 'Use this name' : 'Copy', onclick: () => (onUse ? use(n) : copy(n)) }, n),
    taken(n) ? h('span', { class: 'names__taken' }, 'in use') : null,
    h('button', { class: 'iconbtn names__star' + (saved(n) ? ' is-on' : ''), type: 'button', 'aria-pressed': String(saved(n)),
      title: saved(n) ? 'Remove from saved names' : 'Save for later', 'aria-label': saved(n) ? `Unsave ${n}` : `Save ${n}`, onclick: () => toggleSave(n) }, icon(inBank ? 'x' : 'star')),
    onUse ? null : (p.types.length ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'Create an entry with this name', onclick: () => use(n) }, icon('plus'), ' Create') : null));

  const drawList = () => { clear(list); results.forEach((n) => list.append(nameRow(n))); };
  const drawBank = () => {
    clear(bank);
    if (!p.nameBank.length) return;
    append(bank, [h('h3', { class: 'names__h' }, `Saved names (${p.nameBank.length})`),
      h('div', { class: 'names__list names__list--bank' }, p.nameBank.map((x) => nameRow(x.name, { inBank: true })))]);
  };
  const roll = () => {
    results = generate(N.kind, styleOf(), { gender: N.gender, flavor: N.flavor, start: N.start }, 12);
    drawList();
  };

  const createSel = !onUse && p.types.length ? h('label', { class: 'names__create' }, h('span', { class: 'small muted' }, 'Create as'),
    h('select', { class: 'input input--sm', onchange: (e) => { createAs = e.target.value; } },
      p.types.map((t) => h('option', { value: t.id, selected: t.id === createAs }, t.singular)))) : null;

  drawControls(); roll(); drawBank();
  const d = openDialog({
    title: useLabel || 'Name generator',
    wide: true,
    className: 'dlg--names',
    body: [
      controls,
      h('p', { class: 'small muted names__tip' }, onUse ? 'Click a name to use it. Star the ones worth keeping.' : 'Click a name to copy it, star it to save it for later, or create an entry with it.'),
      list, bank,
    ],
    actions: [
      createSel,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: roll }, icon('dice'), ' More names'),
    ],
  });
}

// ======================================================================
// World
// ======================================================================

// Entry types shown under World: everything but characters, which have their own tab.
const worldTypes = (p) => { const ct = charType(); return p.types.filter((t) => !ct || t.id !== ct.id); };
function worldSide(p, current) {
  return h('nav', { class: 'side', 'aria-label': 'Entry types' },
    h('div', { class: 'side__label' }, 'World'),
    worldTypes(p).map((t) => h('a', { class: 'side__item' + (current === t.id ? ' is-on' : ''), href: phref('world/' + t.id), style: { '--c': t.color } },
      h('span', { class: 'dot' }), h('span', { class: 'side__name' }, t.name),
      h('span', { class: 'side__count' }, String(p.entities.filter((e) => e.typeId === t.id).length)))),
    h('a', { class: 'side__item side__item--edit', href: phref('project') + '#types' }, icon('gear'), h('span', {}, 'Edit types & fields')));
}

function viewWorld(p, typeId) {
  const ct = charType();
  if (ct && typeId === ct.id) { setTimeout(() => go(pbase('chars')), 0); return h('div', {}); }
  const t = worldTypes(p).find((x) => x.id === typeId) || worldTypes(p)[0];
  if (!t) {
    return h('div', { class: 'wrap empty' },
      h('h1', { class: 'display' }, 'No entry types yet'),
      h('p', { class: 'muted' }, 'Entry types are the kinds of things in your world: characters, places, magic systems, ships, gods… You decide which ones exist and what fields each one has.'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => newType(true) }, icon('plus'), ' Add an entry type'));
  }
  const q = S.worldFilter.toLowerCase();
  const all = p.entities.filter((e) => e.typeId === t.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const list = all.filter((e) => !q || [e.name, e.summary].join(' ').toLowerCase().includes(q));
  const firstSelect = t.fields.find((f) => f.type === 'select');

  const grid = h('div', { class: 'ecards' }, list.map((e) => {
    const n = appearances(p, e.id).length;
    const tag = firstSelect && e.fields[firstSelect.id];
    return h('a', { class: 'ecard', href: phref('e/' + e.id), style: { '--c': t.color } },
      h('span', { class: 'ecard__name' + (e.name ? '' : ' muted') }, e.name || 'Unnamed'),
      tag ? h('span', { class: 'pill pill--soft' }, tag) : null,
      e.summary ? h('span', { class: 'ecard__sum' }, e.summary) : null,
      h('span', { class: 'ecard__meta' }, n ? `In ${plural(n, 'scene')}` : 'Not in any scene yet'));
  }));

  const filter = h('input', { class: 'input input--sm', type: 'search', placeholder: `Filter ${lower(t.name)}`, value: S.worldFilter, 'aria-label': 'Filter',
    oninput: (e) => { S.worldFilter = e.target.value; const pos = e.target.selectionStart; render(); const f = document.querySelector('.world__filter input'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } } });

  return h('div', { class: 'world' }, worldSide(p, t.id),
    h('section', { class: 'world__main' },
      h('div', { class: 'world__head' },
        h('h1', { class: 'display' }, t.name),
        h('span', { class: 'spacer' }),
        all.length > 6 ? h('div', { class: 'world__filter' }, filter) : null,
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => nameDialog({ kind: kindForType(t.name), createType: t.id }) }, icon('dice'), ' Name ideas'),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => { const e = newEntity(t.id); go(pbase('e/' + e.id)); } }, icon('plus'), ` New ${lower(t.singular)}`)),
      isSeries() ? duplicatesPanel() : null,
      all.length ? grid : h('p', { class: 'muted' }, `No ${lower(t.name)} yet. Add one here, or type a new name into “In this scene” on any card.`)));
}

// Entries with the same type and name, usually from books moved into a series.
function duplicatesPanel() {
  const dups = findDuplicates(S.project);
  if (!dups.length) return null;
  return h('section', { class: 'dups' },
    h('h2', { class: 'dups__title' }, icon('layers'), ` Possible duplicates (${dups.length})`),
    h('p', { class: 'muted small' }, 'Same name, same type. Merging keeps one entry with everything from both, and points every scene at it.'),
    h('ul', { class: 'list' }, dups.map((g) => {
      const t = typeOf(g[0]);
      return h('li', { class: 'list__row' },
        h('span', { class: 'chip', style: { '--c': t?.color } }, g[0].name),
        h('span', { class: 'muted small' }, `${t?.singular || 'Entry'} · ${g.length} copies · in ${g.map((e) => appearances(P(), e.id).length).join(' + ')} scenes`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
          if (!(await choose({ title: `Merge “${g[0].name}”?`, message: `The ${g.length} entries become one. Fields that differ are combined, and you can tidy them afterwards. The series backups keep the separate versions.`,
            choices: [{ label: 'Cancel', value: false }, { label: 'Merge', value: true, kind: 'primary' }] }))) return;
          change(() => { for (const e of g.slice(1)) mergeEntities(S.project, g[0].id, e.id); });
          toast(`Merged into one “${g[0].name}”`);
        } }, 'Merge'));
    })));
}

function viewEntity(p, id) {
  const e = entity(id);
  if (!e) {
    return h('div', { class: 'wrap empty' }, h('h1', { class: 'display' }, 'Not found'),
      h('p', { class: 'muted' }, 'That entry was deleted or never existed.'),
      h('a', { class: 'btn', href: phref('world') }, 'Back to the world'));
  }
  const t = typeOf(e);
  const upd = (fn) => change(() => fn(e), { render: false });
  const apps = appearances(p, id);
  const linkedFrom = [];
  for (const o of p.entities) {
    if (o.id === id) continue;
    const ot = typeOf(o);
    for (const f of ot?.fields || []) if (f.type === 'link' && (o.fields[f.id] || []).includes(id)) linkedFrom.push({ e: o, field: f.name, color: ot.color });
  }
  const typeSel = h('select', { class: 'input input--sm', 'aria-label': 'Type', onchange: (ev) => { change(() => { e.typeId = ev.target.value; }); } },
    p.types.map((x) => h('option', { value: x.id, selected: x.id === e.typeId }, x.singular)));

  const nameInput = h('input', { class: 'title-input', value: e.name, placeholder: `Name this ${lower(t?.singular || 'entry')}`, 'aria-label': 'Name', oninput: (ev) => upd((e) => { e.name = ev.target.value; }) });
  const form = h('div', { class: 'entity__form' },
    h('div', { class: 'entity__name' }, nameInput,
      h('button', { class: 'iconbtn iconbtn--dice', type: 'button', title: 'Suggest a name', 'aria-label': 'Suggest a name',
        onclick: () => nameDialog({ kind: kindForType(t?.name), useLabel: `Name this ${lower(t?.singular || 'entry')}`,
          onUse: (n) => { upd((e) => { e.name = n; }); nameInput.value = n; } }) }, icon('dice'))),
    h('input', { class: 'input input--lede', value: e.summary, placeholder: 'In one line: who or what this is', 'aria-label': 'One-line summary', oninput: (ev) => upd((e) => { e.summary = ev.target.value; }) }),
    profileExtras(p, e, upd),
    (t?.fields || []).map((f) => fieldInput(p, f, () => e.fields[f.id], (v) => upd((e) => { e.fields[f.id] = v; }))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Notes'),
      autosize(h('textarea', { class: 'input', rows: 4, value: e.notes, placeholder: 'Everything else', oninput: (ev) => upd((e) => { e.notes = ev.target.value; }) }))));

  const aside = h('aside', { class: 'entity__aside' },
    asideExtras(p, e),
    h('h2', { class: 'aside__title' }, 'Appears in'),
    apps.length ? h('ul', { class: 'apps' }, apps.map((k) => {
      const ci = cardInfo(k);
      return h('li', {}, h('button', { class: 'app', type: 'button', style: { '--c': ci.row?.color }, onclick: () => openCard(k.id) },
        h('span', { class: 'app__num' }, ci.num),
        h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, k.title || 'Untitled scene'),
          h('span', { class: 'app__sub' }, (isSeries() ? ci.b.title + ' · ' : '') + (ci.row?.title || '')))));
    })) : h('p', { class: 'muted small' }, 'Not in any scene yet. Link it from a card’s “In this scene”.'),
    (() => {
      const m = sheetMentions(e);
      if (!m.length) return null;
      return [h('h2', { class: 'aside__title' }, 'On game sheets'),
        h('ul', { class: 'apps' }, m.map((x) => h('li', {}, x.k
          ? h('button', { class: 'app', type: 'button', onclick: () => openCard(x.k.id) },
            h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, x.c.name), h('span', { class: 'app__sub' }, `${describeEvent(x.ev)} · ${x.k.title || 'Untitled scene'}`)))
          : h('a', { class: 'app', href: href(pbase('e/' + x.c.id)), onclick: () => { S.entityView = 'sheet'; S.sheetV = 0; } },
            h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, x.c.name), h('span', { class: 'app__sub' }, 'On their starting sheet'))))))];
    })(),
    linkedFrom.length ? [h('h2', { class: 'aside__title' }, 'Linked from'),
      h('ul', { class: 'apps' }, linkedFrom.map((l) => h('li', {}, h('a', { class: 'app', href: phref('e/' + l.e.id), style: { '--c': l.color } },
        h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, l.e.name || 'Unnamed'), h('span', { class: 'app__sub' }, l.field))))))] : null);

  return h('div', { class: 'world' }, (isChar(e) ? h('nav', { class: 'side', 'aria-label': 'Characters' }, h('div', { class: 'side__label' }, 'Characters'),
    [['chars', 'All'], ['web', 'Relationships'], ['arcs', 'Arcs'], ['family', 'Family trees']].map(([t, l]) => h('a', { class: 'side__item', href: phref(t) }, h('span', { class: 'side__name' }, l))))
    : worldSide(p, e.typeId)),
    h('section', { class: 'world__main entity', style: { '--c': t?.color } },
      h('div', { class: 'entity__bar' },
        isChar(e) ? h('a', { class: 'back', href: phref('chars') }, icon('back'), 'Characters') : h('a', { class: 'back', href: phref('world/' + (t?.id || '')) }, icon('back'), t?.name || 'World'),
        h('span', { class: 'spacer' }),
        entityTabs(e),
        typeSel,
        h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: async () => {
          if (await confirmDanger(`Delete ${e.name || 'this entry'}?`, apps.length || linkedFrom.length ? 'It will also be unlinked from every card and entry that mentions it.' : 'It isn’t linked anywhere.')) {
            const back = pbase('world/' + (t?.id || ''));
            change((p) => {
              p.entities = p.entities.filter((x) => x.id !== id);
              for (const k of scopeCards()) k.entityIds = k.entityIds.filter((x) => x !== id);
              for (const o of p.entities) for (const [fid, v] of Object.entries(o.fields)) if (Array.isArray(v)) o.fields[fid] = v.filter((x) => x !== id);
              for (const k of scopeCards()) for (const [fid, v] of Object.entries(k.fields)) if (Array.isArray(v)) k.fields[fid] = v.filter((x) => x !== id);
            }, { render: false });
            go(back);
          }
        } }, icon('trash'), ' Delete')),
      entityExtra(p, e, () => h('div', { class: 'entity__cols' }, form, aside))));
}

// ======================================================================
// Continuity
// ======================================================================

// Where a part sits: its book, position, and a readable name.
function colRef(colId) {
  const books = isSeries() ? S.project.books : [S.project];
  for (const [bi, b] of books.entries()) {
    const i = b.columns.findIndex((c) => c.id === colId);
    if (i >= 0) {
      const c = b.columns[i];
      return { b, c, i, order: bi * 10000 + i, label: `${isSeries() ? b.title + ' · ' : ''}${c.interlude ? 'Interlude' : b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}` };
    }
  }
  return null;
}

function viewContinuity(p) {
  const pos = (k) => { const ci = cardInfo(k); return (isSeries() ? S.project.books.indexOf(ci.b) : 0) * 10000 + ci.i; };
  const open = p.cards.filter((k) => k.setup && !k.payoffId).sort((a, b) => pos(a) - pos(b));
  const pairs = p.cards.filter((k) => k.setup && k.payoffId).map((k) => ({ s: k, o: findCard(k.payoffId) })).filter((x) => x.o);
  const ledgers = [];
  for (const e of p.entities) {
    const t = typeOf(e);
    for (const f of t?.fields || []) {
      if (f.type !== 'ledger') continue;
      for (const r of e.fields[f.id] || []) if ((r.text || '').trim()) ledgers.push({ e, t, f, r });
    }
  }
  const unused = p.entities.filter((e) => !appearances(p, e.id).length);
  const loose = p.cards.filter((k) => colRef(k.colId)?.c.canon && ['idea', 'outlined', 'drafting'].includes(k.status));

  const cardBtn = (k) => h('button', { class: 'linkbtn', type: 'button', onclick: () => openCard(k.id) }, cardLabel(p, k));
  const section = (title, blurb, count, content) => h('section', { class: 'cont' },
    h('h2', { class: 'cont__title' }, title, h('span', { class: 'cont__count' }, String(count))),
    h('p', { class: 'muted small' }, blurb), content);

  const groups = new Map();
  for (const l of ledgers) {
    const ref = l.r.colId ? colRef(l.r.colId) : null;
    const key = ref ? l.r.colId : '';
    if (!groups.has(key)) groups.set(key, { ref, items: [] });
    groups.get(key).items.push(l);
  }
  const byCol = [...groups.values()].sort((a, b) => (a.ref ? a.ref.order : 1e9) - (b.ref ? b.ref.order : 1e9));

  return h('div', { class: 'wrap cont-wrap' },
    h('h1', { class: 'display' }, 'Continuity'),
    h('p', { class: 'muted lede' }, inSeriesTop() ? 'Promises made to readers across every book in the series, and whether they’ve been kept.' : 'Promises you’ve made to readers, and whether you’ve kept them.'),
    section('Open setups', 'Cards marked as a setup with no payoff chosen yet.', open.length,
      open.length ? h('ul', { class: 'clist' }, open.map((k) => h('li', {}, icon('flag', 'ico--accent'), cardBtn(k)))) : h('p', { class: 'ok' }, icon('check'), ' Every setup has a payoff.')),
    section('Setups & payoffs', 'Each setup and where it pays off.', pairs.length,
      pairs.length ? h('ul', { class: 'clist' }, pairs.map(({ s, o }) => {
        const bad = pos(o) < pos(s);
        return h('li', { class: bad ? 'is-warn' : '' }, cardBtn(s), h('span', { class: 'arrow' }, ' → '), cardBtn(o),
          bad ? h('span', { class: 'warn' }, icon('alert'), ' Pays off before it’s set up') : null);
      })) : h('p', { class: 'muted small' }, 'None yet. Tick “Plants a setup” on a card to track it.')),
    section('Rules & facts, in the order readers learn them', 'Collected from every rules/facts ledger in your world (magic systems, lore…).', ledgers.length,
      byCol.length ? h('div', { class: 'timeline' }, byCol.map((g) => h('div', { class: 'timeline__group' },
        h('h3', { class: 'timeline__head' }, g.ref ? g.ref.label : 'Not revealed yet',
          g.ref?.c.canon ? h('span', { class: 'pill pill--canon' }, icon('lock'), 'Published') : null),
        h('ul', { class: 'clist' }, g.items.map((l) => h('li', {},
          h('a', { class: 'chip chip--sm', href: phref('e/' + l.e.id), style: { '--c': l.t.color } }, l.e.name || 'Unnamed'),
          h('span', {}, ' ' + l.r.text))))))) : h('p', { class: 'muted small' }, 'Add rules to a magic system (or any entry with a ledger field) and they’ll line up here by part.')),
    section('Loose ends in published parts', 'Cards in published parts still marked Idea, Outlined or In progress (Draft).', loose.length,
      loose.length ? h('ul', { class: 'clist' }, loose.map((k) => h('li', {}, cardBtn(k)))) : h('p', { class: 'ok' }, icon('check'), ' Nothing loose.')),
    section('Waiting in the wings', 'Entries that aren’t in any scene yet.', unused.length,
      unused.length ? h('div', { class: 'chips' }, unused.map((e) => h('a', { class: 'chip', href: phref('e/' + e.id), style: { '--c': typeOf(e)?.color } }, e.name || 'Unnamed'))) : h('p', { class: 'ok' }, icon('check'), ' Everyone has a scene.')));
}

// ======================================================================
// Project settings
// ======================================================================

function viewProject(p) {
  const upd = (fn) => change(fn, { render: false });
  const text = (label, get, set, { long = false, hint, placeholder } = {}) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null,
    long ? autosize(h('textarea', { class: 'input', rows: 3, value: get(), placeholder, oninput: (e) => upd(() => set(e.target.value)) }))
      : h('input', { class: 'input', value: get(), placeholder, oninput: (e) => upd(() => set(e.target.value)) }));

  const typesWrap = h('div', { class: 'types' });
  const drawTypes = () => {
    clear(typesWrap);
    for (const t of p.types) typesWrap.append(typeEditor(p, t, drawTypes));
    typesWrap.append(h('button', { class: 'btn', type: 'button', onclick: () => newType(false, drawTypes) }, icon('plus'), ' New entry type'));
  };
  drawTypes();

  const sec = (id, title, blurb, ...kids) => h('section', { class: 'psec', id }, h('h2', { class: 'psec__title' }, title), blurb ? h('p', { class: 'muted small' }, blurb) : null, kids);

  const book = isSeries();
  const view = h('div', { class: 'wrap project' },
    h('h1', { class: 'display' }, book ? 'Book settings' : 'Project'),
    book ? h('p', { class: 'muted lede' }, `This book is part of “${S.project.title}”. Its world is shared with every book in the series.`) : null,
    sec('basics', 'Basics', null,
      text('Title', () => p.title, (v) => { p.title = v; }),
      text('Synopsis', () => p.synopsis, (v) => { p.synopsis = v; }, { long: true }),
      goalField(isSeries() ? 'Word goal for this book' : 'Word goal', () => p.wordGoal, (v) => upd(() => { p.wordGoal = v; }), `So far: ${fmtN(wordsOf(p.cards))} words`),
      text('Serial name on the site', () => p.storySlug, (v) => { p.storySlug = slugify(v); }, { hint: 'Used when exporting a part. It’s the serial’s address on oliveratwood.com, e.g. the-glass-orchard for /stories/the-glass-orchard/.' }),
      h('div', { class: 'row3' },
        text('Columns are called', () => p.labels.column, (v) => { p.labels.column = v || 'Part'; }, { placeholder: 'Part' }),
        text('Rows are called', () => p.labels.row, (v) => { p.labels.row = v || 'Thread'; }, { placeholder: 'Thread' }),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Numbering'),
          h('select', { class: 'input', onchange: (e) => upd(() => { p.labels.numerals = e.target.value; }) },
            h('option', { value: 'roman', selected: p.labels.numerals !== 'arabic' }, 'I, II, III'),
            h('option', { value: 'arabic', selected: p.labels.numerals === 'arabic' }, '1, 2, 3')))),
      h('div', { class: 'row2 row2--acts' },
        h('label', { class: 'check check--box' },
          h('input', { type: 'checkbox', checked: !!p.labels.useActs, onchange: (e) => change((p) => { p.labels.useActs = e.target.checked; syncActs(p); }, { render: false }) }),
          h('span', {}, h('strong', {}, `Group ${lower(p.labels.column)}s into acts`), h('br'),
            h('span', { class: 'muted small' }, 'Adds a row of acts above the grid. Turning it off keeps your acts for later.'))),
        text('Acts are called', () => p.labels.act, (v) => { p.labels.act = v || 'Act'; }, { placeholder: 'Act' }))),
    book ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Series line'),
      h('select', { class: 'input', onchange: (e) => upd(() => { p.groupId = e.target.value; }) },
        S.project.groups.map((g) => h('option', { value: g.id, selected: g.id === p.groupId }, g.title)))) : null,
    sec('notebook', 'Notebook', book ? 'A scratchpad for this book.' : 'A scratchpad for the whole project: themes, the ending you’re aiming for, questions to answer.',
      autosize(h('textarea', { class: 'input notebook', rows: 6, value: p.notes, 'aria-label': 'Notebook', oninput: (e) => upd(() => { p.notes = e.target.value; }) }))),
    sec('types', 'Entry types', book ? 'Shared by every book in the series. Changes apply to every entry of that type, in every book.' : 'The kinds of things in this world, and the fields each one has. Changes apply to every entry of that type.', typesWrap),
    gameSettings(),
    sec('checklist', 'Scene checklist', 'Optional fields on every scene card: goal, conflict, outcome and what changes. Scenes where nothing changes get a gentle tag.',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!p.checklist.on, onchange: (e) => change(() => { p.checklist.on = e.target.checked; }) }), ' Show the scene checklist on cards'),
      p.checklist.on ? h('div', { class: 'row2' }, ['goal', 'conflict', 'outcome', 'change'].map((k) => text(`“${k[0].toUpperCase() + k.slice(1)}” is called`, () => p.checklist.labels[k], (v) => { p.checklist.labels[k] = v || k; }))) : null),
    sec('clips', 'Clippings', `Links, notes and images for the whole ${book ? 'book' : 'project'}.`, clipsPanel(() => p.clips, (fn) => upd(() => fn(p.clips)))),
    sec('cardfields', 'Extra card fields', 'Fields every scene card gets, on top of title, summary, status and links.',
      fieldsEditor(p, p.cardFields)),
    book ? null : backupSection(),
    book ? null : sec('move', 'Move into a series', 'Make this project a book in one of your series. Its characters, places and other entries join the series’ shared world, and you can merge any duplicates afterwards.',
      h('button', { class: 'btn', type: 'button', onclick: () => moveIntoSeriesDialog(S.slug) }, icon('layers'), ' Choose a series…')),
    book
      ? sec('danger', 'Remove this book', null,
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
          if (!(await confirmDanger(`Remove “${p.title}” from the series?`, 'Its grid and cards are deleted. Shared characters and places stay. The series backups keep a copy.'))) return;
          const id = p.id;
          S.bookId = null;
          change(() => {
            const gone = new Set(S.project.books.find((b) => b.id === id).cards.map((k) => k.id));
            S.project.books = S.project.books.filter((b) => b.id !== id);
            for (const k of scopeCards()) { if (gone.has(k.payoffId)) k.payoffId = null; k.links = (k.links || []).filter((l) => !gone.has(l.id)); }
          }, { render: false });
          go(`s/${S.slug}/books`);
        } }, icon('trash'), ' Remove book'))
      : sec('danger', 'Delete', null,
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
          if (!(await confirmDanger(`Delete “${p.title}”?`, 'It disappears from your projects. You can bring it back from “Restore a deleted project” on the home screen.'))) return;
          try { await saveNow(); await store.remove(S.slug); unsaved.clear(scope(), S.slug); S.project = null; S.slug = null; go(''); }
          catch (e) { toast(e.message); }
        } }, icon('trash'), ' Delete project')));

  if (location.hash.endsWith('#types')) requestAnimationFrame(() => document.getElementById('types')?.scrollIntoView());
  return view;
}

function backupSection() {
  const series = isSeries();
  return h('section', { class: 'psec', id: 'backups' }, h('h2', { class: 'psec__title' }, 'Backups & files'),
    h('p', { class: 'muted small' }, DEMO ? 'Demo mode keeps no backups.' : `The server keeps the last 40 saves of this ${series ? 'series (every book and the shared world)' : 'project'}, plus the first save of each day for four months.`),
    h('div', { class: 'btnrow' },
      DEMO ? null : h('button', { class: 'btn', type: 'button', onclick: backupsDialog }, 'Browse backups'),
      h('button', { class: 'btn', type: 'button', onclick: () => download(`${S.slug}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S.project, null, 1)) }, icon('download'), ' Download a copy'),
      h('label', { class: 'btn' }, 'Replace from a file…', h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: importFile }))));
}

function typeEditor(p, t, redraw) {
  const n = p.entities.filter((e) => e.typeId === t.id).length;
  const upd = (fn) => change(fn, { render: false });
  return h('details', { class: 'tcard', style: { '--c': t.color } },
    h('summary', { class: 'tcard__sum' }, h('span', { class: 'dot' }), h('span', { class: 'tcard__name' }, t.name || 'Untitled type'),
      h('span', { class: 'muted small' }, `${plural(t.fields.length, 'field')} · ${plural(n, 'entry')}`.replace('entrys', 'entries'))),
    h('div', { class: 'tcard__body' },
      h('div', { class: 'row2' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name (plural)'),
          h('input', { class: 'input', value: t.name, oninput: (e) => upd(() => { t.name = e.target.value; }) })),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'One of them is a…'),
          h('input', { class: 'input', value: t.singular, oninput: (e) => upd(() => { t.singular = e.target.value; }) }))),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Color'), swatches(() => t.color, (c) => upd(() => { t.color = c; }))),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Fields'), fieldsEditor(p, t.fields)),
      h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: async () => {
        if (!(await confirmDanger(`Delete “${t.name}”?`, n ? `All ${plural(n, 'entry').replace('entrys', 'entries')} of this type will be deleted and unlinked from cards.` : 'There are no entries of this type.'))) return;
        change((p) => {
          const gone = new Set(p.entities.filter((e) => e.typeId === t.id).map((e) => e.id));
          p.types = p.types.filter((x) => x.id !== t.id);
          p.entities = p.entities.filter((e) => !gone.has(e.id));
          for (const k of scopeCards()) k.entityIds = k.entityIds.filter((x) => !gone.has(x));
          for (const ty of p.types) for (const f of ty.fields) if (f.linkType === t.id) f.linkType = null;
        }, { render: false });
        redraw();
      } }, icon('trash'), ' Delete this type')));
}

async function newType(navigate = false, redraw) {
  const name = await ask('New entry type', 'What are they called? (plural)', '', 'Add');
  if (!name) return;
  const singular = name.replace(/ies$/i, 'y').replace(/s$/i, '');
  const t = { id: uid(), name, singular: singular || name, color: PALETTE[P().types.length % PALETTE.length], fields: [{ id: uid(), name: 'Description', type: 'longtext' }] };
  change((p) => p.types.push(t), { render: !redraw });
  if (redraw) redraw();
  if (navigate) go(pbase('world/' + t.id));
}

function fieldsEditor(p, fields) {
  const wrap = h('div', { class: 'fed-list' });
  const upd = (fn) => change(fn, { render: false });
  const draw = (focusLast = false) => {
    clear(wrap);
    fields.forEach((f, i) => {
      let extra = h('span', { class: 'fed__extra' });
      if (f.type === 'select') {
        extra = h('input', { class: 'input fed__extra', value: (f.options || []).join(', '), placeholder: 'Choices, comma separated', 'aria-label': 'Choices',
          oninput: (e) => upd(() => { f.options = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); }) });
      } else if (f.type === 'link') {
        extra = h('select', { class: 'input fed__extra', 'aria-label': 'Links to', onchange: (e) => upd(() => { f.linkType = e.target.value || null; }) },
          h('option', { value: '' }, 'Links to any entry'),
          p.types.map((t) => h('option', { value: t.id, selected: f.linkType === t.id }, `Links to ${t.name}`)));
      }
      wrap.append(h('div', { class: 'fed' },
        h('input', { class: 'input fed__name', value: f.name, 'aria-label': 'Field name', oninput: (e) => upd(() => { f.name = e.target.value; }) }),
        h('select', { class: 'input fed__type', 'aria-label': 'Field type', onchange: (e) => { upd(() => { f.type = e.target.value; if (f.type === 'select' && !f.options) f.options = []; }); draw(); } },
          FIELD_TYPES.map(([v, l]) => h('option', { value: v, selected: f.type === v }, l))),
        extra,
        h('span', { class: 'fed__btns' },
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { upd(() => { fields.splice(i - 1, 0, fields.splice(i, 1)[0]); }); draw(); } }, icon('up')),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: i === fields.length - 1, onclick: () => { upd(() => { fields.splice(i + 1, 0, fields.splice(i, 1)[0]); }); draw(); } }, icon('down')),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove field', onclick: () => { upd(() => { fields.splice(i, 1); }); draw(); } }, icon('x')))));
    });
    wrap.append(h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { upd(() => fields.push({ id: uid(), name: '', type: 'text' })); draw(true); } }, icon('plus'), ' Add field'));
    if (focusLast) { const ins = wrap.querySelectorAll('.fed__name'); ins[ins.length - 1]?.focus(); }
  };
  draw();
  return wrap;
}

async function backupsDialog() {
  let list;
  try { await saveNow(); list = await store.backups(S.slug); } catch (e) { return toast(e.message); }
  const d = openDialog({
    title: 'Backups',
    body: list.length ? [
      h('p', { class: 'muted small' }, 'Restoring replaces the current version. The current version is backed up first, so restoring can be undone the same way.'),
      h('ul', { class: 'list' }, list.map((b) => h('li', { class: 'list__row' },
        h('span', {}, fmtTime(b.at)), h('span', { class: 'muted small' }, `${Math.max(1, Math.round(b.size / 1024))} KB`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
          try {
            const data = await store.backup(S.slug, b.id);
            d.close();
            S.project = prepare(data);
            if (S.bookId && isSeries() && !S.project.books.some((x) => x.id === S.bookId)) S.bookId = null;
            change(() => {});
            toast('Restored the version from ' + fmtTime(b.at));
          } catch (e) { toast(e.message); }
        } }, 'Restore'))))]
      : h('p', { class: 'muted' }, 'No backups yet. One is made every time the project saves.'),
  });
}

async function importFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if ((raw.kind === 'series') !== isSeries()) { toast(isSeries() ? 'That file is a single project, not a series.' : 'That file is a whole series. Open a series to replace it.'); return; }
    const data = prepare(raw);
    if (!(await confirmDanger(isSeries() ? 'Replace this whole series?' : 'Replace this project?', `Everything here will be replaced with “${data.title}” from ${file.name}. The current version is kept in backups.`, 'Replace'))) return;
    S.project = data;
    if (S.bookId && isSeries() && !S.project.books.some((x) => x.id === S.bookId)) S.bookId = null;
    change(() => {});
    toast('Replaced from ' + file.name);
  } catch { toast('That file isn’t a planner project.'); }
}

// ======================================================================
// Series: books list, settings, creating and moving
// ======================================================================

function bookStats(b) {
  const pub = b.columns.filter((c) => c.canon).length;
  const parts = plural(b.columns.length, lower(b.labels.column));
  const w = wordsOf(b.cards);
  return `${parts} · ${plural(b.cards.length, 'scene')}${pub ? ` · ${pub} published` : ''}${w || b.wordGoal ? ' · ' + (b.wordGoal ? wordText(w, b.wordGoal) + ' words' : `${fmtN(w)} words`) : ''}`;
}

function viewBooks(series) {
  const books = series.books;
  const groups = series.groups.map((g) => {
    const mine = books.filter((b) => b.groupId === g.id);
    return h('section', { class: 'line', style: { '--c': g.color } },
      h('div', { class: 'line__head' },
        h('span', { class: 'line__swatch' }),
        h('h2', { class: 'line__title' }, g.title),
        h('span', { class: 'muted small' }, plural(mine.length, 'book')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editLine(g.id) }, icon('gear'), ' Edit')),
      mine.length ? h('ol', { class: 'blist' }, mine.map((b) => {
        const i = books.indexOf(b);
        return h('li', { class: 'brow' },
          h('span', { class: 'brow__num', title: 'Reading order' }, String(i + 1)),
          h('a', { class: 'brow__main', href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}`) },
            h('span', { class: 'brow__title' }, b.title || 'Untitled book'),
            h('span', { class: 'brow__meta' }, bookStats(b))),
          h('select', { class: 'input input--sm brow__kind', 'aria-label': `Kind of book: ${b.title}`, onchange: (e) => change(() => { b.bookKind = e.target.value; }) },
            BOOK_KINDS.map(([v, l]) => h('option', { value: v, selected: (b.bookKind || 'main') === v }, l))),
          h('span', { class: 'brow__btns' },
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Earlier in reading order', title: 'Earlier in reading order', disabled: i === 0,
              onclick: () => change((s) => { const [x] = s.books.splice(i, 1); s.books.splice(i - 1, 0, x); }) }, icon('up')),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Later in reading order', title: 'Later in reading order', disabled: i === books.length - 1,
              onclick: () => change((s) => { const [x] = s.books.splice(i, 1); s.books.splice(i + 1, 0, x); }) }, icon('down')),
            h('a', { class: 'btn btn--sm', href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}`) }, 'Open grid')));
      })) : h('p', { class: 'muted small line__empty' }, 'No books in this line yet.'),
      h('button', { class: 'btn btn--ghost btn--sm line__add', type: 'button', onclick: () => newBookDialog(g.id) }, icon('plus'), ' Add a book'));
  });

  return h('div', { class: 'wrap books' },
    h('div', { class: 'books__head' },
      h('div', {},
        h('h1', { class: 'display' }, 'Books'),
        h('p', { class: 'muted lede' }, 'Numbers are the reading order across the whole series. The timeline uses it too.')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const name = await ask('New supporting series', 'Name', '', 'Add');
        if (!name) return;
        change((s) => s.groups.push({ id: uid(), title: name, color: LINE_COLORS[s.groups.length % LINE_COLORS.length] }));
      } }, icon('plus'), ' Supporting series')),
    groups);
}

function editLine(id) {
  const series = S.project;
  const g = series.groups.find((x) => x.id === id);
  const n = series.books.filter((b) => b.groupId === id).length;
  const d = openDialog({
    title: 'Edit series line',
    body: [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name'),
        h('input', { class: 'input', value: g.title, oninput: (e) => change(() => { g.title = e.target.value; }, { render: false }) })),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Color on the timeline'),
        (() => {
          const wrap = h('div', { class: 'swatches' });
          const draw = () => { clear(wrap); for (const c of LINE_COLORS) wrap.append(h('button', { class: 'swatch' + (g.color === c ? ' is-on' : ''), type: 'button', style: { '--c': c }, 'aria-label': 'Color ' + c, 'aria-pressed': String(g.color === c), onclick: () => { change(() => { g.color = c; }, { render: false }); draw(); } })); };
          draw();
          return wrap;
        })()),
    ],
    actions: [
      series.groups.length > 1 ? h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        d.close();
        const into = series.groups.find((x) => x.id !== id);
        if (await confirmDanger(`Delete “${g.title}”?`, n ? `Its ${plural(n, 'book')} move to “${into.title}”. Nothing else changes.` : 'It has no books.')) {
          change((s) => { for (const b of s.books) if (b.groupId === id) b.groupId = into.id; s.groups = s.groups.filter((x) => x.id !== id); });
        }
      } }, icon('trash'), ' Delete') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => render(),
  });
}

async function newBookDialog(groupId) {
  const series = S.project;
  let tpl = 'serial';
  let standalone = [];
  try { standalone = (await store.list()).filter((x) => x.kind !== 'series'); } catch { /* offline: blank only */ }
  const title = h('input', { class: 'input', placeholder: `Book ${series.books.length + 1}`, autocomplete: 'off' });
  const opts = h('div', { class: 'tpls' }, Object.entries(TEMPLATES).map(([key, t]) =>
    h('label', { class: 'tpl' },
      h('input', { type: 'radio', name: 'btpl', value: key, checked: key === tpl, onchange: () => { tpl = key; } }),
      h('span', { class: 'tpl__name' }, t.label), h('span', { class: 'tpl__blurb' }, t.blurb.replace(/,? and a full world bible|, characters and places only/, '')))));
  const create = () => {
    const name = title.value.trim() || `Book ${series.books.length + 1}`;
    let book;
    change(() => { book = newBook(S.project, name, tpl, groupId); }, { render: false });
    d.close();
    go(`s/${S.slug}/b/${book.id}`);
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  const d = openDialog({
    title: 'Add a book',
    wide: true,
    body: [
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Title'), title),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Lay out the grid like'), opts),
      standalone.length ? h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Or move in one of your projects'),
        h('ul', { class: 'list' }, standalone.map((x) => h('li', { class: 'list__row' },
          h('span', {}, x.title), h('span', { class: 'muted small' }, plural(x.counts.cards, 'card')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { d.close(); moveIntoSeries(x.slug, S.slug, groupId); } }, 'Move in'))))) : null,
    ],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create book')],
  });
}

async function moveIntoSeriesDialog(projectSlug) {
  let series;
  try { series = (await store.list()).filter((x) => x.kind === 'series'); } catch (e) { return toast(e.message); }
  if (!series.length) {
    const ok = await choose({ title: 'No series yet', message: 'Create a series from the home screen first, then move this project into it.', choices: [{ label: 'OK', value: true }] });
    return ok;
  }
  const d = openDialog({
    title: 'Move into a series',
    body: [
      h('p', { class: 'muted' }, 'This project becomes a book in the series. Its entries join the shared world, and you can merge duplicates in the series’ World tab.'),
      h('ul', { class: 'list' }, series.map((x) => h('li', { class: 'list__row' },
        h('span', {}, x.title), h('span', { class: 'muted small' }, plural(x.counts.books || 0, 'book')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { d.close(); moveIntoSeries(projectSlug, x.slug, null); } }, 'Move here')))),
    ],
  });
}

async function moveIntoSeries(projectSlug, seriesSlug, groupId) {
  try {
    await saveNow();
    const [pr, sr] = await Promise.all([store.read(projectSlug), store.read(seriesSlug)]);
    if (pr.data.kind === 'series') return toast('A series can’t go inside another series.');
    const series = prepare(sr.data);
    const book = importProject(series, normalize(pr.data), groupId || series.groups[0].id);
    await store.write(seriesSlug, series, sr.sha);
    await store.remove(projectSlug);
    unsaved.clear(scope(), projectSlug);
    unsaved.clear(scope(), seriesSlug);
    S.slug = null; S.project = null; S.dirty = false;
    const dups = findDuplicates(series).length;
    toast(dups ? `Moved in. ${plural(dups, 'possible duplicate')} to review in Shared world.` : 'Moved into the series.');
    go(`s/${seriesSlug}/b/${book.id}`);
  } catch (e) {
    toast(e.kind === 'conflict' ? 'The series changed while moving. Try again.' : e.message);
  }
}

function newSeriesDialog() {
  const title = h('input', { class: 'input', placeholder: 'e.g. The Orchard Cycle', autocomplete: 'off' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const create = async () => {
    const name = title.value.trim();
    if (!name) { err.textContent = 'Give the series a name (you can change it later).'; title.focus(); return; }
    btn.disabled = true;
    try {
      const existing = new Set((await store.list()).map((x) => x.slug));
      let slug = slugify(name), n = 2;
      while (existing.has(slug)) slug = `${slugify(name)}-${n++}`;
      await store.write(slug, newSeries(name), null);
      d.close();
      go(`s/${slug}/books`);
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  const btn = h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create series');
  const d = openDialog({
    title: 'New series',
    body: [
      h('p', { class: 'muted' }, 'A series holds several books that share one world: characters, places, magic and lore. You can add supporting series alongside the main one, and see every book on one timeline.'),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Series name'), title), err],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel'), btn],
  });
}

function viewSeriesSettings(series) {
  const upd = (fn) => change(fn, { render: false });
  const text = (label, get, set, { long = false, hint, placeholder } = {}) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null,
    long ? autosize(h('textarea', { class: 'input', rows: 3, value: get(), placeholder, oninput: (e) => upd(() => set(e.target.value)) }))
      : h('input', { class: 'input', value: get(), placeholder, oninput: (e) => upd(() => set(e.target.value)) }));
  const lines = (label, hint, key) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label), h('span', { class: 'field__hint' }, hint),
    autosize(h('textarea', { class: 'input', rows: 4, value: series.calendar[key].join('\n'),
      oninput: (e) => upd(() => { const v = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); series.calendar[key] = v.length ? v : [key === 'years' ? 'Year 1' : '—']; }) })));
  const placed = series.books.flatMap((b) => b.cards).filter((k) => k.when).length;
  const sec = (id, title, blurb, ...kids) => h('section', { class: 'psec', id }, h('h2', { class: 'psec__title' }, title), blurb ? h('p', { class: 'muted small' }, blurb) : null, kids);

  const typesWrap = h('div', { class: 'types' });
  const drawTypes = () => {
    clear(typesWrap);
    for (const t of series.types) typesWrap.append(typeEditor(series, t, drawTypes));
    typesWrap.append(h('button', { class: 'btn', type: 'button', onclick: () => newType(false, drawTypes) }, icon('plus'), ' New entry type'));
  };
  drawTypes();

  return h('div', { class: 'wrap project' },
    h('h1', { class: 'display' }, 'Series settings'),
    sec('basics', 'Basics', null,
      text('Name', () => series.title, (v) => { series.title = v; }),
      text('Synopsis', () => series.synopsis, (v) => { series.synopsis = v; }, { long: true }),
      goalField('Word goal for the whole series', () => series.wordGoal, (v) => upd(() => { series.wordGoal = v; }), `So far: ${fmtN(wordsOf(series.books.flatMap((b) => b.cards)))} words across every book`)),
    sec('calendar', 'Story calendar', `How in-world time is divided on the timeline. ${placed ? `${plural(placed, 'scene')} already placed: renaming is safe, but removing or reordering lines moves those scenes.` : 'Rename freely: ages, reigns, seasons, stardates.'}`,
      h('div', { class: 'row2' },
        lines('Years (one per line)', 'Or eras, reigns, cycles…', 'years'),
        lines('Each year is divided into', 'Seasons, months, chapters of time…', 'parts'))),
    sec('notebook', 'Series notebook', 'The big picture: where the whole series is headed, rules that hold across books.',
      autosize(h('textarea', { class: 'input notebook', rows: 6, value: series.notes, 'aria-label': 'Series notebook', oninput: (e) => upd(() => { series.notes = e.target.value; }) }))),
    sec('types', 'Entry types', 'Shared by every book in the series.', typesWrap),
    gameSettings(),
    sec('clips', 'Clippings', 'Links, notes and images for the whole series.', clipsPanel(() => series.clips, (fn) => upd(() => fn(series.clips)))),
    backupSection(),
    sec('danger', 'Delete', null,
      h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
        if (!(await confirmDanger(`Delete “${series.title}”?`, `The whole series goes: ${plural(series.books.length, 'book')} and the shared world. You can bring it back from “Restore a deleted project” on the home screen.`))) return;
        try { await saveNow(); await store.remove(S.slug); unsaved.clear(scope(), S.slug); S.project = null; S.slug = null; go(''); }
        catch (e) { toast(e.message); }
      } }, icon('trash'), ' Delete series')));
}

// ======================================================================
// Series timeline
// ======================================================================

const TL = { LANE: 70, ELANE: 44, TLANE: 58, CHIP: 128, STEP: 72 };
const STAGE_LABEL = { pub: 'Published', written: 'Written', plan: 'Planned' };

function viewTimeline(series) {
  const T = S.tl;
  const order = T.order;
  const books = series.books;
  if (!books.length) {
    return h('div', { class: 'wrap empty' },
      h('h1', { class: 'display' }, 'Nothing on the timeline yet'),
      h('p', { class: 'muted' }, 'Add a book, or move one of your projects into this series. Every scene card shows up here.'),
      h('a', { class: 'btn btn--primary', href: shref('books') }, icon('plus'), ' Add a book'));
  }
  const groupOf = (b) => series.groups.find((g) => g.id === b.groupId) || series.groups[0];
  const colorOf = (b) => groupOf(b).color;
  const laneBooks = series.groups.flatMap((g) => books.filter((b) => b.groupId === g.id));
  const cal = series.calendar;
  const Y = cal.years.length, PN = cal.parts.length;

  // Every card, in reading order within its book.
  const items = [];
  for (const b of books) {
    bookSeq(b)
      .forEach((k, n) => {
        const col = b.columns.find((c) => c.id === k.colId);
        const stage = col && col.canon ? 'pub' : ['drafted', 'editing', 'final'].includes(k.status) ? 'written' : 'plan';
        const w = k.when;
        const slot = w && w.y < Y && w.p < PN ? w.y * PN + w.p : null;
        items.push({ k, b, n, stage, slot, x: null });
      });
  }
  const byId = new Map(items.map((it) => [it.k.id, it]));

  // Horizontal layout
  let TW = 0, calGeo = null;
  const ruler1 = [], ruler2 = [], lines = [];
  if (order === 'world') {
    const counts = Array.from({ length: Y * PN }, () => 0);
    for (const b of books) {
      const per = {};
      for (const it of items) if (it.b === b && it.slot != null) per[it.slot] = (per[it.slot] || 0) + 1;
      for (const [sl, n] of Object.entries(per)) counts[sl] = Math.max(counts[sl], n);
    }
    const slotX = [];
    let x = 0;
    counts.forEach((n, sl) => { slotX[sl] = x; x += Math.max(150, n ? (n - 1) * TL.STEP + TL.CHIP + 32 : 150); });
    TW = x;
    const slotW = (sl) => (sl + 1 < slotX.length ? slotX[sl + 1] : TW) - slotX[sl];
    calGeo = { slotX, slotW, Y, PN };
    for (let y = 0; y < Y; y++) {
      const a = slotX[y * PN], e = y + 1 < Y ? slotX[(y + 1) * PN] : TW;
      ruler1.push({ label: cal.years[y], left: a, width: e - a });
      for (let q = 0; q < PN; q++) {
        const sl = y * PN + q;
        ruler2.push({ label: cal.parts[q], left: slotX[sl], width: slotW(sl) });
        lines.push({ left: slotX[sl], strong: q === 0 });
      }
    }
    for (const b of books) {
      const mine = items.filter((it) => it.b === b && it.slot != null).sort((p, q) => p.slot - q.slot || p.n - q.n);
      let last = null, j = 0;
      for (const it of mine) { j = it.slot === last ? j + 1 : 0; last = it.slot; it.x = slotX[it.slot] + 16 + j * TL.STEP; }
    }
  } else {
    let off = 0;
    books.forEach((b, bi) => {
      const mine = items.filter((it) => it.b === b).sort((p, q) => p.n - q.n);
      mine.forEach((it, j) => { it.x = off + 24 + j * TL.STEP; });
      const w = Math.max(220, 24 + Math.max(0, mine.length - 1) * TL.STEP + TL.CHIP + 28);
      ruler1.push({ label: `${bi + 1}. ${b.title || 'Untitled book'}`, left: off, width: w });
      ruler2.push({ label: groupOf(b).title, left: off, width: w });
      lines.push({ left: off, strong: true });
      off += w;
    });
    TW = off;
  }
  const shown = items.filter((it) => it.x != null);
  const laneIndex = new Map(laneBooks.map((b, i) => [b, i]));
  for (const b of laneBooks) {
    shown.filter((it) => it.b === b).sort((p, q) => p.x - q.x).forEach((it, i) => { it.top = i % 2 ? 37 : 8; });
  }

  // Tracing
  const tr = T.trace;
  const traceCard = tr && tr.startsWith('t:') ? findCard(tr.slice(2)) : null;
  const hit = (it) => {
    if (!tr) return true;
    if (tr.startsWith('e:')) return it.k.entityIds.includes(tr.slice(2));
    return traceCard && (it.k === traceCard || it.k.id === traceCard.payoffId);
  };
  const setTrace = (v) => { T.trace = T.trace === v ? null : v; render(); };

  // ---------- toolbar ----------
  const seg = (v, label) => h('button', { class: 'tl-seg__btn' + (order === v ? ' is-on' : ''), type: 'button', 'aria-pressed': String(order === v), onclick: () => { T.order = v; render(); } }, label);
  const toggle = (key, label) => h('button', { class: 'tl-toggle' + (T.hide[key] ? '' : ' is-on'), type: 'button', 'aria-pressed': String(!T.hide[key]),
    onclick: () => { T.hide = { ...T.hide, [key]: !T.hide[key] }; render(); } }, label);
  const usedTypes = series.types.filter((t) => series.entities.some((e) => e.typeId === t.id && shown.some((it) => it.k.entityIds.includes(e.id))));
  const unplaced = order === 'world' ? items.filter((it) => it.slot == null) : [];

  const toolbar = h('div', { class: 'tl-bar' },
    h('div', { class: 'tl-seg', role: 'group', 'aria-label': 'Order' }, seg('world', 'In-world time'), seg('reading', 'Reading order')),
    h('div', { class: 'tl-toggles', role: 'group', 'aria-label': 'Show' },
      h('span', { class: 'tl-label' }, 'Show'),
      toggle('books', 'Books'), usedTypes.map((t) => toggle(t.id, t.name)), toggle('threads', 'Threads'),
      order === 'world' ? h('button', { class: 'tl-toggle' + (T.showCal ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!T.showCal), title: 'Seasons, holidays and moons from the story calendar',
        onclick: () => { T.showCal = !T.showCal; render(); } }, 'Calendar') : null,
      h('button', { class: 'tl-toggle' + (T.showBeats ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!T.showBeats), title: 'Show the series arc and each book’s beats',
        onclick: () => { T.showBeats = !T.showBeats; render(); } }, '◆ Beats')),
    h('span', { class: 'spacer' }),
    h('div', { class: 'tl-legend' },
      series.groups.map((g) => h('span', { class: 'tl-legend__i' }, h('span', { class: 'tl-sw', style: { background: g.color } }), g.title)),
      h('span', { class: 'tl-legend__sep' }),
      h('span', { class: 'tl-legend__i' }, h('span', { class: 'tl-sw tl-sw--pub' }), 'Published'),
      h('span', { class: 'tl-legend__i' }, h('span', { class: 'tl-sw tl-sw--written' }), 'Written'),
      h('span', { class: 'tl-legend__i' }, h('span', { class: 'tl-sw tl-sw--plan' }), 'Planned')));

  // ---------- trace strip ----------
  let strip;
  if (tr) {
    const hits = shown.filter(hit).sort((p, q) => p.x - q.x);
    const allHits = items.filter(hit);
    const inBooks = [...new Set(allHits.map((it) => it.b))];
    const inLines = new Set(inBooks.map((b) => groupOf(b).id));
    const absent = books.filter((b) => !inBooks.includes(b)).map((b) => b.title);
    let name = '', kind = '';
    if (tr.startsWith('e:')) { const e = entity(tr.slice(2)); name = e ? e.name || 'Unnamed' : 'Deleted entry'; kind = e ? typeOf(e)?.singular || '' : ''; }
    else { name = traceCard ? traceCard.title || 'Untitled scene' : 'Thread'; kind = 'Setup and payoff'; }
    strip = h('div', { class: 'tl-trace' },
      h('span', { class: 'tl-trace__tag' }, 'Tracing'),
      h('span', { class: 'tl-trace__name' }, name),
      kind ? h('span', { class: 'muted' }, kind) : null,
      h('span', { class: 'tl-trace__sep' }),
      h('strong', {}, `${plural(allHits.length, 'scene')} · ${plural(inBooks.length, 'book')} · ${inLines.size} series`),
      hits.length ? h('span', { class: 'muted' }, `${order === 'world' ? 'Earliest' : 'First read'}: “${hits[0].k.title || 'Untitled scene'}”, ${hits[0].b.title}`) : null,
      tr.startsWith('e:') && absent.length ? h('span', { class: 'tl-trace__absent' }, 'Not in ' + absent.join(', ')) : null,
      h('span', { class: 'spacer' }),
      tr.startsWith('e:') ? h('a', { class: 'btn btn--sm', href: shref('e/' + tr.slice(2)) }, 'Open entry') : null,
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => setTrace(null) }, 'Stop tracing'));
  } else {
    strip = h('p', { class: 'tl-hint' }, 'Click a character, place or thread on the left to trace it through every book. Click a scene to edit it.');
  }

  // ---------- the timeline ----------
  const labelCell = (cls, ...kids) => h('div', { class: 'tl-lab ' + (cls || '') }, kids);
  const track = (height, ...kids) => h('div', { class: 'tl-track', style: { width: TW + 'px', height: height + 'px' } }, kids);
  const sectionHead = (title) => h('div', { class: 'tl-row tl-row--head' }, labelCell('tl-lab--head', title));

  const gridLayer = h('div', { class: 'tl-gridlayer', style: { width: TW + 'px' } },
    lines.map((l) => h('span', { class: 'tl-line' + (l.strong ? ' is-strong' : ''), style: { left: l.left + 'px' } })));
  if (order === 'reading') {
    const pubs = shown.filter((it) => it.stage === 'pub').sort((p, q) => p.x - q.x);
    if (pubs.length) {
      const cx = pubs[pubs.length - 1].x + TL.CHIP - 2;
      gridLayer.append(h('span', { class: 'tl-canon', style: { left: cx + 'px' } }), h('span', { class: 'tl-canon__tag', style: { left: cx + 6 + 'px' } }, 'Published so far'));
    }
  }

  const ruler = h('div', { class: 'tl-row tl-row--ruler' },
    labelCell('tl-lab--ruler', order === 'world' ? 'In-world time' : 'Reading order'),
    track(64,
      ruler1.map((r) => h('span', { class: 'tl-r1', style: { left: r.left + 'px', width: r.width + 'px' } }, r.label)),
      ruler2.map((r) => h('span', { class: 'tl-r2', style: { left: r.left + 'px', width: r.width + 'px' } }, r.label))));

  const chip = (it) => {
    const c = colorOf(it.b);
    const ci = cardInfo(it.k);
    const w = it.k.when;
    const tip = `${it.b.title} · ${ci.b.labels.column} ${ci.num} · ${it.k.title || 'Untitled scene'}` + (w && order === 'world' ? ` · ${cal.years[w.y]}, ${cal.parts[w.p]}${w.day ? ' (' + w.day + ')' : ''}` : '') + ` · ${STAGE_LABEL[it.stage]}` + agesText(it.k);
    return h('button', { class: `tl-chip tl-chip--${it.stage}` + (hit(it) ? '' : ' is-dim'), type: 'button', title: tip,
      style: { left: it.x - 9 + 'px', top: it.top + 'px', '--c': c }, onclick: () => openCard(it.k.id) },
    h('span', { class: 'tl-chip__dot st-' + it.k.status }),
    h('span', { class: 'tl-chip__t' }, T.showBeats && it.k.beatId ? '◆ ' : '', it.k.title || 'Untitled scene'),
    gameOn() && (it.k.game || []).length ? icon('spark', 'tl-chip__ico') : null,
    ((it.k.links || []).length || items.some((o) => (o.k.links || []).some((l) => l.id === it.k.id))) && order !== 'world' ? icon('link', 'tl-chip__ico') : null);
  };

  const parts = [gridLayer, ruler];

  if (T.showCal && calGeo) parts.push(calendarRow(series, calGeo, TW, labelCell, track));
  if (T.showBeats) parts.push(...timelineBeats(series, { shown, order, TW, ruler1, books, colorOf, labelCell, track }));

  if (!T.hide.books) {
    parts.push(sectionHead('Books'));
    const wrap = h('div', { class: 'tl-books' });
    for (const b of laneBooks) {
      const mine = shown.filter((it) => it.b === b);
      const xs = mine.map((it) => it.x);
      const un = order === 'world' ? items.filter((it) => it.b === b && it.slot == null).length : 0;
      wrap.append(h('div', { class: 'tl-row', style: { height: TL.LANE + 'px' } },
        labelCell('tl-lab--book',
          h('span', { class: 'tl-lab__bar', style: { background: colorOf(b) } }),
          h('a', { class: 'tl-lab__text', href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}`), title: 'Open this book’s grid' },
            h('span', { class: 'tl-lab__title' }, b.title || 'Untitled book'),
            h('span', { class: 'tl-lab__meta' }, `${groupOf(b).title}${un ? ` · ${un} not placed` : ''}`))),
        track(TL.LANE,
          xs.length ? h('span', { class: 'tl-band', style: { left: Math.min(...xs) - 16 + 'px', width: Math.max(...xs) - Math.min(...xs) + TL.CHIP + 14 + 'px', '--c': colorOf(b) } }) : null,
          mine.map(chip))));
    }
    // Linked scenes, joined across books
    if (order === 'world') {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'tl-links');
      svg.setAttribute('width', TW);
      svg.setAttribute('height', laneBooks.length * TL.LANE);
      svg.setAttribute('aria-hidden', 'true');
      const tags = [];
      const seen = new Set();
      for (const it of shown) {
        for (const l of it.k.links || []) {
          const o = byId.get(l.id);
          if (!o || o.x == null) continue;
          const key = [it.k.id, o.k.id].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          let [a, z] = [it, o];
          if (laneIndex.get(a.b) > laneIndex.get(z.b)) [a, z] = [z, a];
          const same = laneIndex.get(a.b) === laneIndex.get(z.b);
          const x1 = a.x, y1 = laneIndex.get(a.b) * TL.LANE + a.top + (same ? 13 : 26);
          const x2 = z.x, y2 = laneIndex.get(z.b) * TL.LANE + z.top + (same ? 13 : 0);
          const line = document.createElementNS(svgNS, 'line');
          for (const [k2, v] of Object.entries({ x1, y1, x2, y2 })) line.setAttribute(k2, v);
          line.setAttribute('class', 'tl-link' + (hit(it) || hit(o) ? '' : ' is-dim'));
          svg.append(line);
          if (!same) tags.push(h('span', { class: 'tl-link__tag', style: { left: (x1 + x2) / 2 + 8 + 'px', top: (y1 + y2) / 2 - 10 + 'px' } }, (LINK_KINDS.find(([v]) => v === l.kind) || ['', 'Linked'])[1]));
        }
      }
      const overlay = h('div', { class: 'tl-overlay', style: { width: TW + 'px' } }, tags);
      overlay.prepend(svg);
      wrap.append(overlay);
    }
    parts.push(wrap);
  }

  // Characters, places and every other entry type
  for (const t of usedTypes) {
    if (T.hide[t.id]) continue;
    const ents = series.entities.filter((e) => e.typeId === t.id)
      .map((e) => ({ e, its: shown.filter((it) => it.k.entityIds.includes(e.id)).sort((p, q) => p.x - q.x) }))
      .filter((x) => x.its.length)
      .sort((a, b) => a.its[0].x - b.its[0].x);
    if (!ents.length) continue;
    parts.push(sectionHead(t.name));
    for (const { e, its } of ents) {
      const key = 'e:' + e.id;
      const on = tr === key;
      const segs = [];
      for (const b of books) {
        const m = its.filter((it) => it.b === b);
        if (m.length > 1) segs.push(h('span', { class: 'tl-seg-rail', style: { left: m[0].x + 'px', width: m[m.length - 1].x - m[0].x + 'px', background: colorOf(b) } }));
      }
      const initials = (e.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      parts.push(h('div', { class: 'tl-row', style: { height: TL.ELANE + 'px' } },
        h('button', { class: 'tl-lab tl-lab--ent' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': String(on), title: on ? 'Stop tracing' : 'Trace through every book', onclick: () => setTrace(key) },
          h('span', { class: 'tl-ava', style: { '--c': t.color } }, initials),
          h('span', { class: 'tl-lab__name' }, e.name || 'Unnamed'),
          h('span', { class: 'tl-lab__count' }, String(its.length))),
        h('div', { class: 'tl-track' + (tr && !on ? ' is-dim' : ''), style: { width: TW + 'px', height: TL.ELANE + 'px' } },
          segs,
          its.map((it) => h('span', { class: 'tl-dot', title: `${it.b.title} · ${it.k.title || 'Untitled scene'}`, style: { left: it.x - 6 + 'px', background: colorOf(it.b) } })))));
    }
  }

  // Threads: setups and their payoffs, across books
  if (!T.hide.threads) {
    const setups = shown.filter((it) => it.k.setup).sort((p, q) => p.x - q.x);
    if (setups.length) {
      parts.push(sectionHead('Threads and plot points'));
      for (const it of setups) {
        const key = 't:' + it.k.id;
        const on = tr === key;
        const po = it.k.payoffId ? byId.get(it.k.payoffId) : null;
        const marks = [], extra = [];
        const mark = (m, kind) => h('button', { class: 'tl-mark tl-mark--' + kind, type: 'button', title: `${kind === 'payoff' ? 'Pays off' : 'Set up'}: ${m.k.title || 'Untitled scene'} (${m.b.title})`,
          style: { left: m.x - 9 + 'px', background: colorOf(m.b) }, onclick: () => openCard(m.k.id) }, icon(kind === 'payoff' ? 'check' : 'flag'));
        marks.push(mark(it, 'setup'), h('span', { class: 'tl-mark__lab', style: { left: it.x - 9 + 'px' } }, 'Set up'));
        if (po && po.x != null) {
          const a = Math.min(it.x, po.x), z = Math.max(it.x, po.x);
          extra.push(h('span', { class: 'tl-rail', style: { left: a + 'px', width: z - a + 'px' } }));
          if (po.b !== it.b) extra.push(h('span', { class: 'tl-rail__note', style: { left: a + 70 + 'px' } }, `Crosses into ${po.b.title}`));
          if (po.x < it.x) extra.push(h('span', { class: 'tl-rail__note tl-rail__note--warn', style: { left: a + 70 + 'px' } }, 'Pays off before it’s set up'));
          marks.push(mark(po, 'payoff'), h('span', { class: 'tl-mark__lab', style: { left: po.x - 30 + 'px' } }, 'Pays off'));
        } else if (po) {
          extra.push(h('span', { class: 'tl-rail tl-rail--open', style: { left: it.x + 'px', width: '160px' } }),
            h('span', { class: 'tl-rail__note', style: { left: it.x + 70 + 'px' } }, `Pays off in ${po.b.title} (not placed yet)`));
        } else {
          extra.push(h('span', { class: 'tl-rail tl-rail--open', style: { left: it.x + 'px', width: '160px' } }),
            h('span', { class: 'tl-rail__note tl-rail__note--warn', style: { left: it.x + 70 + 'px' } }, 'Not paid off yet'));
        }
        parts.push(h('div', { class: 'tl-row', style: { height: TL.TLANE + 'px' } },
          h('button', { class: 'tl-lab tl-lab--ent' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': String(on), title: on ? 'Stop tracing' : 'Trace this thread', onclick: () => setTrace(key) },
            icon('flag', 'tl-lab__flag'), h('span', { class: 'tl-lab__name' }, it.k.title || 'Untitled scene')),
          h('div', { class: 'tl-track' + (tr && !on ? ' is-dim' : ''), style: { width: TW + 'px', height: TL.TLANE + 'px' } }, extra, marks)));
      }
    }
  }

  const box = h('div', { class: 'tl-box' }, h('div', { class: 'tl-inner', style: { width: `calc(var(--labw) + ${TW + 24}px)` } }, parts));

  // Scenes without a time yet
  let tray = null;
  if (unplaced.length) {
    tray = h('section', { class: 'tl-tray' },
      h('h2', { class: 'tl-tray__title' }, `Not placed in time yet (${unplaced.length})`),
      h('p', { class: 'muted small' }, 'Open a scene and set “When in the story” to put it on the in-world timeline. They all show in Reading order already.'),
      laneBooks.map((b) => {
        const m = unplaced.filter((it) => it.b === b);
        return m.length ? h('div', { class: 'tl-tray__book' },
          h('span', { class: 'tl-tray__name', style: { '--c': colorOf(b) } }, b.title),
          h('div', { class: 'tl-tray__chips' }, m.map((it) => h('button', { class: `tl-chip tl-chip--static tl-chip--${it.stage}`, type: 'button', style: { '--c': colorOf(b) }, onclick: () => openCard(it.k.id) },
            h('span', { class: 'tl-chip__dot st-' + it.k.status }), h('span', { class: 'tl-chip__t' }, it.k.title || 'Untitled scene'))))) : null;
      }));
  }

  return h('div', { class: 'tl' },
    h('div', { class: 'tl-head' },
      h('div', {},
        h('h1', { class: 'display' }, 'Series timeline'),
        h('p', { class: 'muted' }, order === 'world' ? 'Every book, placed by when things happen in the story.' : 'Every book, in the order readers meet it.')),
      h('span', { class: 'spacer' }),
      h('a', { class: 'btn', href: shref('books') }, icon('plus'), ' Book')),
    toolbar, strip,
    order === 'world' && !shown.length ? h('p', { class: 'tl-hint tl-hint--warn' }, 'No scenes are placed in time yet. Open any scene and set “When in the story”, or switch to Reading order.') : null,
    box, tray);
}

// ======================================================================
// Game sheets (LitRPG)
// ======================================================================

const gameOn = () => !!(S.project && S.project.game && S.project.game.on);
const sheetChars = () => (S.project ? S.project.entities.filter((e) => e.sheet) : []);
const initialsOf = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Every card in reading order: the whole series, or the project.
function readingSeq() {
  const books = isSeries() ? S.project.books : [S.project];
  return books.flatMap((b) => bookSeq(b).map((k) => ({ k, b })));
}
// One book's cards in reading order: part by part; inside a part, the order
// set on the Braid if there is one, otherwise thread by thread.
function bookSeq(b) {
  const ci = new Map(b.columns.map((c, i) => [c.id, i]));
  const ri = new Map(b.rows.map((r, i) => [r.id, i]));
  return b.cards.map((k, i) => ({ k, i })).sort((x, y) => (ci.get(x.k.colId) ?? 1e6) - (ci.get(y.k.colId) ?? 1e6)
    || (Number.isFinite(x.k.seq) && Number.isFinite(y.k.seq) ? x.k.seq - y.k.seq : 0)
    || (ri.get(x.k.rowId) ?? 1e6) - (ri.get(y.k.rowId) ?? 1e6) || x.i - y.i).map(({ k }) => k);
}

// A character's sheet over the story: the start, then one step per scene with events.
function progressOf(e) {
  let sheet = cloneSheet(e.sheet ? e.sheet.base : blankSheet());
  const base = cloneSheet(sheet);
  const steps = [];
  for (const { k, b } of readingSeq()) {
    const evs = (k.game || []).filter((x) => x.who === e.id);
    if (!evs.length) continue;
    const before = cloneSheet(sheet);
    const lines = [];
    for (const ev of evs) { lines.push({ kind: ev.kind, text: describeEvent(ev, sheet) }); applyEvent(sheet, ev); }
    steps.push({ k, b, evs, lines, before, after: cloneSheet(sheet) });
  }
  return { base, steps };
}

// Sheet as of the end of a given card (or the start if the card is before any event).
function sheetAt(e, card) {
  const pr = progressOf(e);
  const seq = readingSeq();
  const pos = seq.findIndex((x) => x.k === card);
  let cur = pr.base;
  for (const st of pr.steps) { if (seq.findIndex((x) => x.k === st.k) <= pos) cur = st.after; }
  return cur;
}

function stepWhere(st) {
  const ci = cardInfo(st.k);
  return `${isSeries() ? st.b.title + ' · ' : ''}${ci.b.labels.column} ${ci.num}`;
}

// ---------- The sheet itself ----------

function renderSheet(e, sh, prev) {
  const tpl = S.project.game.tpl;
  const look = S.project.game.look;
  const diffN = (a, b) => { if (!prev) return ''; const d = (+a || 0) - (+b || 0); return d ? (d > 0 ? '+' : '') + d : ''; };
  const isNew = (cond) => (prev && cond ? ' is-new' : '');
  const tag = sh.id['Gamer tag'] || '';
  const others = tpl.identity.filter((k) => k !== 'Gamer tag' && sh.id[k]).map((k) => sh.id[k]);
  const lvlD = prev ? diffN(sh.level, prev.level) : '';
  const prevSkill = (n) => prev && prev.skills.find((x) => sameName(x.name, n));
  return h('section', { class: 'gs gs--' + look, 'aria-label': 'Game sheet' },
    h('div', { class: 'gs__head' },
      h('span', { class: 'gs__ava', 'aria-hidden': 'true' }, initialsOf(e.name)),
      h('div', { class: 'gs__who' },
        h('span', { class: 'gs__tag' }, tag ? `⟨ ${tag} ⟩` : e.name || 'Unnamed'),
        h('span', { class: 'gs__line' }, [tag ? e.name : null, ...others].filter(Boolean).join(' · ') || 'No class or race yet')),
      h('div', { class: 'gs__lvl' }, h('span', { class: 'gs__k' }, 'LEVEL'), h('span', { class: 'gs__lv' }, String(sh.level ?? 1)),
        lvlD ? h('span', { class: 'gs__d' }, lvlD) : null)),
    sh.xp ? h('div', { class: 'gs__xp' }, h('span', { class: 'gs__k' }, 'XP'), h('span', {}, sh.xp)) : null,
    tpl.resources.length ? h('div', { class: 'gs__res' }, tpl.resources.map((r) => {
      const d = prev ? diffN(sh.res[r], prev.res[r]) : '';
      return h('div', { class: 'gs__tile' + (d ? ' is-new' : '') }, h('span', { class: 'gs__k' }, r), h('span', { class: 'gs__v' }, sh.res[r] ?? '—'), h('span', { class: 'gs__d' }, d));
    })) : null,
    tpl.stats.length ? h('div', { class: 'gs__block' }, h('span', { class: 'gs__h' }, 'STATS'),
      h('div', { class: 'gs__stats' }, tpl.stats.map((k) => {
        const d = prev ? diffN(sh.stats[k], prev.stats[k]) : '';
        return h('div', { class: 'gs__tile gs__tile--stat' + (d ? ' is-new' : '') }, h('span', { class: 'gs__k' }, k), h('span', { class: 'gs__v gs__v--big' }, sh.stats[k] ?? '—'), h('span', { class: 'gs__d' }, d));
      }))) : null,
    h('div', { class: 'gs__two' },
      h('div', { class: 'gs__block' }, h('span', { class: 'gs__h' }, 'SKILLS'),
        sh.skills.length ? sh.skills.map((x) => {
          const was = prevSkill(x.name);
          const nw = prev && !was, up = prev && was && (was.rank !== x.rank || was.rarity !== x.rarity);
          return h('div', { class: 'gs__row' + (nw || up ? ' is-new' : '') },
            h('span', { class: 'gs__name' }, x.name), x.rarity ? h('span', { class: 'gs__rar gs__rar--' + String(x.rarity).toLowerCase() }, x.rarity) : null,
            h('span', { class: 'gs__rank' }, (x.rank || '') + (up ? ' ▲' : '')), nw ? h('span', { class: 'gs__new' }, 'NEW') : null);
        }) : h('span', { class: 'gs__none' }, 'None yet')),
      h('div', { class: 'gs__block' }, h('span', { class: 'gs__h' }, 'EQUIPMENT'),
        tpl.slots.length ? tpl.slots.map((sl) => {
          const v = sh.slots[sl] || '';
          const nw = prev && v && v !== (prev.slots[sl] || '');
          return h('div', { class: 'gs__row' + (nw ? ' is-new' : '') }, h('span', { class: 'gs__slot' }, sl), h('span', { class: 'gs__name' + (v ? '' : ' is-empty') }, v || '—'), nw ? h('span', { class: 'gs__new' }, 'NEW') : null);
        }) : h('span', { class: 'gs__none' }, 'No slots'))),
    h('div', { class: 'gs__two' },
      h('div', { class: 'gs__block' }, h('span', { class: 'gs__h' }, 'INVENTORY'),
        h('div', { class: 'gs__chips' }, sh.items.length ? sh.items.map((x) => h('span', { class: 'gs__chip' + isNew(!prev?.items.some((y) => sameName(y, x))) }, x)) : h('span', { class: 'gs__none' }, 'Empty'))),
      h('div', { class: 'gs__block' }, h('span', { class: 'gs__h' }, 'TITLES'),
        h('div', { class: 'gs__chips' }, sh.titles.length ? sh.titles.map((x) => h('span', { class: 'gs__chip gs__chip--title' + isNew(!prev?.titles.some((y) => sameName(y, x))) }, x)) : h('span', { class: 'gs__none' }, 'None yet')))));
}

// ---------- Game sheet tab on a character ----------

function viewSheet(p, e) {
  if (!e.sheet) {
    return h('div', { class: 'sheet-empty' },
      h('p', { class: 'muted' }, `${e.name || 'This character'} doesn’t have a game sheet yet.`),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => change(() => { e.sheet = { base: blankSheet() }; }) }, icon('plus'), ` Give ${e.name || 'them'} a game sheet`));
  }
  const pr = progressOf(e);
  const versions = [{ label: 'Start', sub: `Lv ${pr.base.level ?? 1}`, sheet: pr.base, prev: null, step: null }]
    .concat(pr.steps.map((st, i) => ({ label: `v${i + 2} · Lv ${st.after.level ?? '?'}`, sub: `${stepWhere(st)} · ${st.k.title || 'Untitled scene'}`, sheet: st.after, prev: st.before, step: st })));
  if (S.sheetV == null || S.sheetFor !== e.id || S.sheetV >= versions.length) { S.sheetV = versions.length - 1; S.sheetFor = e.id; }
  const v = versions[S.sheetV];
  const cmp = S.sheetCompare !== false;

  const strip = h('div', { class: 'vstrip', role: 'group', 'aria-label': 'Versions' },
    versions.map((x, i) => h('button', { class: 'vstrip__v' + (i === S.sheetV ? ' is-on' : ''), type: 'button', 'aria-pressed': String(i === S.sheetV), onclick: () => { S.sheetV = i; render(); } },
      h('span', { class: 'vstrip__l' }, x.label), h('span', { class: 'vstrip__s' }, x.sub))),
    h('button', { class: 'vstrip__add', type: 'button', onclick: () => addChangeDialog(e) }, icon('plus'), ' Level up / add a change'));

  const side = h('aside', { class: 'sheet__side' },
    h('div', { class: 'sheet__card' },
      h('h2', { class: 'aside__title' }, S.sheetV === 0 ? 'Starting sheet' : 'This version'),
      v.step ? [
        h('p', { class: 'sheet__where' }, 'Takes effect in ', h('button', { class: 'linkbtn', type: 'button', onclick: () => openCard(v.step.k.id) }, `${stepWhere(v.step)} · ${v.step.k.title || 'Untitled scene'}`)),
        h('ul', { class: 'evlist' }, v.step.lines.map((l) => h('li', {}, h('span', { class: 'evk evk--' + l.kind }, (GAME_EVENTS.find(([k]) => k === l.kind) || ['', l.kind])[1]), ' ', l.text))),
        h('p', { class: 'muted small' }, 'To change this version, edit the game events on that scene.'),
      ] : [
        h('p', { class: 'muted small' }, 'Who they are when the story begins. Every later version builds on this.'),
        h('button', { class: 'btn', type: 'button', onclick: () => editBaseSheet(e) }, icon('gear'), ' Edit starting sheet'),
      ]),
    h('div', { class: 'sheet__card muted small' }, 'Changes are recorded as game events on scene cards, in reading order. Move a scene and its level-up moves with it.'));

  return h('div', { class: 'sheet' },
    h('div', { class: 'sheet__bar' }, strip,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cmp, onchange: (ev) => { S.sheetCompare = ev.target.checked; render(); } }), ' Show changes from the version before')),
    h('div', { class: 'sheet__cols' }, renderSheet(e, v.sheet, cmp ? v.prev : null), side));
}

function addChangeDialog(e) {
  const p = P();
  const sel = h('select', { class: 'input' }, h('option', { value: '' }, 'Choose the scene…'), cardOptions(isSeries() && !S.bookId ? (S.project.books[0] || p) : p, '', null));
  const d = openDialog({
    title: `Add a change for ${e.name || 'this character'}`,
    body: [h('p', { class: 'muted' }, 'Level-ups, new skills and loot are added as game events on the scene where they happen.'),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Scene'), sel)],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Cancel'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
        if (!sel.value) return;
        const id = sel.value;
        S.gameWho = e.id;
        d.close();
        setTimeout(() => openCard(id), 0);
      } }, 'Open scene')],
  });
}

function editBaseSheet(e) {
  const tpl = S.project.game.tpl;
  const b = () => e.sheet.base;
  const upd = (fn) => change(() => fn(b()), { render: false });
  const txt = (label, get, set, ph) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('input', { class: 'input', value: get() || '', placeholder: ph || '', oninput: (ev) => upd(() => set(ev.target.value)) }));
  const num = (label, get, set) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('input', { class: 'input input--num', inputmode: 'numeric', value: get() ?? '', oninput: (ev) => upd(() => { const v = ev.target.value.trim(); set(v === '' || isNaN(+v) ? undefined : +v); }) }));
  const lines = (label, hint, get, set) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('span', { class: 'field__hint' }, hint),
    autosize(h('textarea', { class: 'input', rows: 3, value: get(), oninput: (ev) => upd(() => set(ev.target.value)) })));
  openDialog({
    title: `${e.name || 'Character'}: starting sheet`,
    wide: true,
    body: [
      h('div', { class: 'row3' }, num('Level', () => b().level, (v) => { b().level = v ?? 1; }), txt('XP', () => b().xp, (v) => { b().xp = v; }, '40 / 100')),
      h('div', { class: 'row3' }, tpl.identity.map((k) => txt(k, () => b().id[k], (v) => { b().id[k] = v; }))),
      tpl.resources.length ? h('div', { class: 'row3' }, tpl.resources.map((k) => num(k, () => b().res[k], (v) => { b().res[k] = v; }))) : null,
      tpl.stats.length ? h('div', { class: 'gs-statgrid' }, tpl.stats.map((k) => num(k, () => b().stats[k], (v) => { b().stats[k] = v; }))) : null,
      tpl.slots.length ? h('div', { class: 'row2' }, tpl.slots.map((k) => txt(k, () => b().slots[k], (v) => { b().slots[k] = v; }))) : null,
      lines('Skills', 'One per line: name, rank, rarity', () => b().skills.map((x) => [x.name, x.rank, x.rarity].filter(Boolean).join(', ')).join('\n'),
        (v) => { b().skills = v.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((a) => a[0]).map(([name, rank, rarity]) => ({ name, rank: rank || '', rarity: rarity || '' })); }),
      h('div', { class: 'row2' },
        lines('Inventory', 'One item per line', () => b().items.join('\n'), (v) => { b().items = v.split('\n').map((x) => x.trim()).filter(Boolean); }),
        lines('Titles', 'One per line', () => b().titles.join('\n'), (v) => { b().titles = v.split('\n').map((x) => x.trim()).filter(Boolean); })),
    ],
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        if (await confirmDanger('Remove this game sheet?', 'The starting sheet is removed. Game events on scenes stay, and come back if you add a sheet again.', 'Remove sheet')) {
          change(() => { delete e.sheet; });
        }
      } }, icon('trash'), ' Remove sheet'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: (ev) => ev.target.closest('dialog').close() }, 'Done')],
    onClose: () => render(),
  });
}

// Where a World entry (a skill, item, class…) shows up on game sheets.
function sheetMentions(e) {
  if (!gameOn() || !e.name) return [];
  const out = [];
  const chars = new Map(sheetChars().map((c) => [c.id, c]));
  for (const { k } of readingSeq()) {
    for (const ev of k.game || []) {
      const c = chars.get(ev.who);
      if (!c || c.id === e.id) continue;
      if (sameName(ev.name, e.name) || sameName(ev.value, e.name)) out.push({ c, k, ev });
    }
  }
  for (const c of sheetChars()) {
    const b = c.sheet.base;
    if (c.id !== e.id && (b.skills.some((x) => sameName(x.name, e.name)) || b.items.some((x) => sameName(x, e.name)) || b.titles.some((x) => sameName(x, e.name)) || Object.values(b.slots).some((x) => sameName(x, e.name)) || Object.values(b.id).some((x) => sameName(x, e.name)))) {
      out.unshift({ c, k: null, ev: null });
    }
  }
  return out;
}

// ---------- Game events on a scene card ----------

function gameBox(p, k, upd) {
  const box = h('section', { class: 'gev', 'aria-label': 'Game events' });
  const draw = () => {
    clear(box);
    const c = k();
    if (!Array.isArray(c.game)) c.game = [];
    const chars = sheetChars();
    const tpl = S.project.game.tpl;
    const inScene = chars.filter((x) => c.entityIds.includes(x.id));
    let who = S.gameWho && chars.some((x) => x.id === S.gameWho) ? S.gameWho : (inScene[0] || chars[0] || {}).id;
    append(box, [h('div', { class: 'gev__head' }, icon('spark'), h('strong', {}, 'Game events in this scene'))]);
    if (!chars.length) {
      box.append(h('p', { class: 'muted small' }, 'No one has a game sheet yet. Open a character in World and choose “Game sheet”.'));
      return;
    }
    const sel = (opts, val, on, label) => h('select', { class: 'input input--sm', 'aria-label': label, onchange: (e) => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
    const inp = (val, on, ph, cls = '') => h('input', { class: 'input input--sm ' + cls, value: val ?? '', placeholder: ph, oninput: (e) => on(e.target.value) });
    const set = (i, patch, redraw = false) => { upd((cc) => { Object.assign(cc.game[i], patch); }); if (redraw) draw(); };
    const opSel = (i, ev, a, b) => sel([['add', a], ['remove', b]], ev.op || 'add', (v) => set(i, { op: v }), 'Gains or loses');
    c.game.forEach((ev, i) => {
      let fields;
      switch (ev.kind) {
        case 'level': fields = [h('span', { class: 'gev__t' }, 'to level'), inp(ev.value, (v) => set(i, { value: v }), '7', 'gev__num')]; break;
        case 'stat': fields = [sel(tpl.stats.map((x) => [x, x]), ev.key, (v) => set(i, { key: v }), 'Stat'), inp(ev.delta, (v) => set(i, { delta: v }), '+2', 'gev__num')]; break;
        case 'res': fields = [sel(tpl.resources.map((x) => [x, x]), ev.key, (v) => set(i, { key: v }), 'Resource'), h('span', { class: 'gev__t' }, 'becomes'), inp(ev.value, (v) => set(i, { value: v }), '150', 'gev__num')]; break;
        case 'id': fields = [sel(tpl.identity.map((x) => [x, x]), ev.key, (v) => set(i, { key: v }), 'Identity'), h('span', { class: 'gev__t' }, 'becomes'), inp(ev.value, (v) => set(i, { value: v }), 'Pathwarden')]; break;
        case 'equip': fields = [sel(tpl.slots.map((x) => [x, x]), ev.key, (v) => set(i, { key: v }), 'Slot'), inp(ev.value, (v) => set(i, { value: v }), 'Item (empty to unequip)')]; break;
        case 'skill': fields = [opSel(i, ev, 'Learns or ranks up', 'Loses'), inp(ev.name, (v) => set(i, { name: v }), 'Skill'), inp(ev.rank, (v) => set(i, { rank: v }), 'Rank', 'gev__num'), inp(ev.rarity, (v) => set(i, { rarity: v }), 'Rarity', 'gev__num')]; break;
        case 'item': fields = [opSel(i, ev, 'Gets', 'Loses'), inp(ev.name, (v) => set(i, { name: v }), 'Item')]; break;
        case 'title': fields = [opSel(i, ev, 'Earns', 'Loses'), inp(ev.name, (v) => set(i, { name: v }), 'Title')]; break;
        default: fields = [inp(ev.text, (v) => set(i, { text: v }), 'What happened (for your notes)')];
      }
      box.append(h('div', { class: 'gev__row' },
        chars.length > 1 ? sel(chars.map((x) => [x.id, x.name || 'Unnamed']), ev.who, (v) => set(i, { who: v }), 'Character') : null,
        h('span', { class: 'evk evk--' + ev.kind }, (GAME_EVENTS.find(([x]) => x === ev.kind) || ['', ev.kind])[1]),
        h('span', { class: 'gev__fields' }, fields),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove event', onclick: () => { upd((cc) => { cc.game.splice(i, 1); }); draw(); } }, icon('x'))));
    });
    const whoSel = chars.length > 1 ? sel(chars.map((x) => [x.id, x.name || 'Unnamed']), who, (v) => { S.gameWho = v; draw(); }, 'Add events for') : null;
    box.append(h('div', { class: 'gev__add' },
      chars.length > 1 ? [h('span', { class: 'muted small' }, 'Add for'), whoSel] : h('span', { class: 'muted small' }, `Add for ${chars[0].name}:`),
      GAME_EVENTS.map(([kind, label]) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => {
        const ev = { id: uid(), who, kind };
        if (kind === 'stat') ev.key = tpl.stats[0]; if (kind === 'res') ev.key = tpl.resources[0];
        if (kind === 'id') ev.key = tpl.identity.find((x) => x !== 'Gamer tag') || tpl.identity[0];
        if (kind === 'equip') ev.key = tpl.slots[0];
        if (kind === 'level') { const now = sheetAt(chars.find((x) => x.id === who), c); ev.value = String((+now.level || 0) + 1); }
        upd((cc) => { (cc.game || (cc.game = [])).push(ev); }); draw();
        const rows = box.querySelectorAll('.gev__row input'); if (rows.length) rows[rows.length - 1].focus();
      } }, '+ ' + label))));
    const touched = chars.filter((x) => c.game.some((ev) => ev.who === x.id));
    if (touched.length) {
      box.append(h('div', { class: 'gev__after' }, touched.map((x) => {
        const sh = sheetAt(x, c);
        const cls = S.project.game.tpl.identity.filter((kk) => kk !== 'Gamer tag').map((kk) => sh.id[kk]).filter(Boolean).join(' · ');
        return h('p', { class: 'small' }, h('strong', {}, `${x.name}, after this scene: `), `Lv ${sh.level ?? 1}${cls ? ' · ' + cls : ''} · ${plural(sh.skills.length, 'skill')} · ${plural(sh.items.length, 'item')} `,
          h('a', { href: href(pbase('e/' + x.id)), onclick: () => { S.entityView = 'sheet'; S.sheetV = null; } }, 'Open sheet'));
      })));
    }
  };
  draw();
  return box;
}

function gameSettings() {
  const g = S.project.game;
  const upd = (fn) => change(fn, { render: false });
  const list = (label, key, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('span', { class: 'field__hint' }, hint),
    h('input', { class: 'input', value: g.tpl[key].join(', '), oninput: (e) => upd(() => { g.tpl[key] = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); }) }));
  return h('section', { class: 'psec', id: 'game' },
    h('div', { class: 'psec__row' },
      h('div', {},
        h('h2', { class: 'psec__title' }, 'Game sheets (LitRPG)'),
        h('p', { class: 'muted small' }, `Video-game style sheets for the characters you choose, with versions that change as the story goes.${isSeries() ? ' Shared by every book in the series.' : ''} Turning this off hides the sheets without deleting them.`)),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: g.on, onchange: (e) => change(() => { g.on = e.target.checked; }) }), h('span', { class: 'switch__ui', 'aria-hidden': 'true' }), h('span', {}, g.on ? 'On' : 'Off'))),
    g.on ? [
      h('div', { class: 'row2' },
        list('Identity', 'identity', 'Text fields; “Gamer tag” is shown as the sheet’s name'),
        list('Resources', 'resources', 'Numbers like HP and MP')),
      h('div', { class: 'row2' },
        list('Stats', 'stats', 'Comma separated'),
        list('Equipment slots', 'slots', 'Comma separated')),
      h('p', { class: 'muted small' }, 'Every sheet also has level, XP, skills (with rank and rarity), inventory and titles. Renaming a stat or slot here doesn’t rename it on events that already use the old name.'),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Look'),
        h('div', { class: 'tl-seg' },
          h('button', { class: 'tl-seg__btn' + (g.look === 'game' ? ' is-on' : ''), type: 'button', onclick: () => change(() => { g.look = 'game'; }) }, 'Status window'),
          h('button', { class: 'tl-seg__btn' + (g.look === 'planner' ? ' is-on' : ''), type: 'button', onclick: () => change(() => { g.look = 'planner'; }) }, 'Planner style'))),
    ] : null);
}

// ---------- Progression: timeline and grid ----------

function viewProgression(p) {
  const PR = S.prog || (S.prog = { view: 'timeline', metric: 'level', hide: {}, who: null, changesOnly: true });
  const chars = sheetChars();
  const head = h('div', { class: 'tl-head' },
    h('div', {}, h('h1', { class: 'display' }, 'Progression'),
      h('p', { class: 'muted' }, isSeries() && !S.bookId ? 'Every game sheet across the whole series, in reading order.' : 'Every game sheet across this ' + (isSeries() ? 'book' : 'story') + ', in reading order.')));
  if (!chars.length) {
    return h('div', { class: 'tl' }, head, h('p', { class: 'tl-hint' }, 'No one has a game sheet yet. Open a character in ', h('a', { href: phref('world') }, 'World'), ' and switch to “Game sheet”.'));
  }
  const tpl = S.project.game.tpl;
  const seg = (v, label) => h('button', { class: 'tl-seg__btn' + (PR.view === v ? ' is-on' : ''), type: 'button', 'aria-pressed': String(PR.view === v), onclick: () => { PR.view = v; render(); } }, label);
  const books = isSeries() ? (S.bookId ? [P()] : S.project.books) : [S.project];
  const seqAll = readingSeq();
  const seqIdx = new Map(seqAll.map((x, i) => [x.k, i]));
  const inScope = seqAll.filter((x) => books.includes(x.b));
  const first = inScope.length ? seqIdx.get(inScope[0].k) : Infinity;
  const progress = new Map(chars.map((c) => {
    const pr = progressOf(c);
    let start = pr.base;
    for (const st of pr.steps) if (seqIdx.get(st.k) < first) start = st.after;
    return [c.id, { start, steps: pr.steps.filter((st) => books.includes(st.b)), all: pr.steps }];
  }));

  const bar = h('div', { class: 'tl-bar' },
    h('div', { class: 'tl-seg', role: 'group', 'aria-label': 'View' }, seg('timeline', 'Timeline'), seg('grid', 'Grid')));
  let body;
  if (PR.view === 'grid') {
    const who = chars.find((c) => c.id === PR.who) || chars[0];
    bar.append(h('div', { class: 'tl-toggles', role: 'group', 'aria-label': 'Character' },
      chars.map((c) => h('button', { class: 'tl-toggle' + (c === who ? ' is-on' : ''), type: 'button', 'aria-pressed': String(c === who), onclick: () => { PR.who = c.id; render(); } },
        c.name + (c.sheet.base.id['Gamer tag'] ? ' · ' + c.sheet.base.id['Gamer tag'] : '')))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: PR.changesOnly, onchange: (e) => { PR.changesOnly = e.target.checked; render(); } }), ' Only rows that change'));
    body = progressGrid(who, progress.get(who.id), tpl, !(first > 0 && first !== Infinity));
  } else {
    const metrics = [['level', 'Level'], ...tpl.stats.map((x) => ['stat:' + x, x]), ...tpl.resources.map((x) => ['res:' + x, x])];
    bar.append(
      h('label', { class: 'tl-metric' }, h('span', { class: 'tl-label' }, 'Track'),
        h('select', { class: 'input input--sm', onchange: (e) => { PR.metric = e.target.value; render(); } }, metrics.map(([v, l]) => h('option', { value: v, selected: PR.metric === v }, l)))),
      h('div', { class: 'tl-toggles', role: 'group', 'aria-label': 'Show' }, h('span', { class: 'tl-label' }, 'Show'),
        chars.map((c) => h('button', { class: 'tl-toggle' + (PR.hide[c.id] ? '' : ' is-on'), type: 'button', 'aria-pressed': String(!PR.hide[c.id]), onclick: () => { PR.hide = { ...PR.hide, [c.id]: !PR.hide[c.id] }; render(); } }, c.name))));
    body = progressTimeline(books, inScope, chars.filter((c) => !PR.hide[c.id]), progress, PR.metric);
  }
  return h('div', { class: 'tl' }, head, bar, body);
}

const metricOf = (sh, m) => {
  if (m === 'level') return +sh.level || 0;
  const [kind, key] = m.split(':');
  return +((kind === 'stat' ? sh.stats : sh.res)[key]) || 0;
};

function progressTimeline(books, inScope, chars, progress, metric) {
  const STEP = 34, LH = 124, PT = 22, PH = 40;
  const pos = new Map();
  const r1 = [], r2 = [], lines = [];
  let off = 0;
  const multi = books.length > 1;
  for (const b of books) {
    const bStart = off;
    b.columns.forEach((c, ci) => {
      const cards = inScope.filter((x) => x.b === b && x.k.colId === c.id);
      cards.forEach((x, j) => pos.set(x.k, off + 18 + j * STEP));
      const w = Math.max(120, 18 + cards.length * STEP + 20);
      (multi ? r2 : r1).push({ label: `${b.labels.column} ${numeral(b, ci)}${c.title ? ' · ' + c.title : ''}`, left: off, width: w });
      if (!multi) r2.push({ label: plural(cards.length, 'scene'), left: off, width: w });
      lines.push({ left: off, strong: ci === 0 });
      off += w;
    });
    if (multi) r1.push({ label: b.title || 'Untitled book', left: bStart, width: off - bStart });
  }
  const TW = Math.max(off, 400);
  const mLabel = metric === 'level' ? 'Lv' : metric.split(':')[1];

  const gridLayer = h('div', { class: 'tl-gridlayer', style: { width: TW + 'px' } },
    lines.map((l) => h('span', { class: 'tl-line' + (l.strong ? ' is-strong' : ''), style: { left: l.left + 'px' } })));
  const ruler = h('div', { class: 'tl-row tl-row--ruler' },
    h('div', { class: 'tl-lab tl-lab--ruler' }, 'Reading order'),
    h('div', { class: 'tl-track', style: { width: TW + 'px', height: '64px' } },
      r1.map((r) => h('span', { class: 'tl-r1', style: { left: r.left + 'px', width: r.width + 'px' } }, r.label)),
      r2.map((r) => h('span', { class: 'tl-r2', style: { left: r.left + 'px', width: r.width + 'px' } }, r.label))));

  const lanes = chars.map((c) => {
    const pr = progress.get(c.id);
    const steps = pr.steps.filter((st) => pos.has(st.k));
    const vals = [metricOf(pr.start, metric), ...steps.map((st) => metricOf(st.after, metric))];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const y = (v) => PT + (hi === lo ? PH / 2 : (1 - (v - lo) / (hi - lo)) * PH);
    let d = `M0 ${y(vals[0])}`;
    steps.forEach((st, i) => { d += ` H${pos.get(st.k)} V${y(vals[i + 1])}`; });
    d += ` H${TW}`;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'pg-line'); svg.setAttribute('width', TW); svg.setAttribute('height', LH); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', d); svg.append(path);
    let lastTag = -1e9, tagRow = 0;
    const marks = steps.map((st, i) => {
      const x = pos.get(st.k), v = vals[i + 1], changed = v !== vals[i];
      const notable = st.evs.filter((ev) => ['id', 'skill', 'title', 'equip'].includes(ev.kind) || (ev.kind === 'item' && ev.op !== 'remove'));
      const tags = notable.slice(0, 2).map((ev) => {
        if (ev.kind === 'id') return ev.value || '';
        if (ev.kind === 'skill') return (ev.op === 'remove' ? '−' : '+') + (ev.name || '');
        if (ev.kind === 'title') return '★ ' + (ev.name || '');
        return ev.value || ev.name || '';
      }).filter(Boolean);
      if (notable.length > 2) tags.push(`+${notable.length - 2} more`);
      // Neighbouring markers alternate between two label rows so they don't overlap.
      if (tags.length) { tagRow = x - lastTag < 130 ? 1 - tagRow : 0; lastTag = x; }
      return [
        h('button', { class: 'pg-mark' + (changed ? ' is-up' : ''), type: 'button', style: { left: x - 8 + 'px', top: y(v) - 8 + 'px' },
          title: `${stepWhere(st)} · ${st.k.title || 'Untitled scene'}\n` + st.lines.map((l) => '• ' + l.text).join('\n'),
          'aria-label': `${c.name}: ${st.lines.map((l) => l.text).join(', ')}`, onclick: () => openCard(st.k.id) }),
        changed ? h('span', { class: 'pg-val', style: { left: x + 'px', top: y(v) - 24 + 'px' } }, `${mLabel} ${v}`) : null,
        tags.length ? h('span', { class: 'pg-tags', style: { left: x - 8 + 'px', top: (tagRow ? 96 : 68) + 'px' } }, h('span', {}, tags[0]), tags.length > 1 ? h('span', { class: 'pg-tags__more' }, `+${tags.length - 1}`) : null) : null,
      ];
    });
    const endV = vals[vals.length - 1];
    return h('div', { class: 'tl-row', style: { height: LH + 'px' } },
      h('a', { class: 'tl-lab tl-lab--ent pg-lab', href: href(pbase('e/' + c.id)), onclick: () => { S.entityView = 'sheet'; S.sheetV = null; } },
        h('span', { class: 'tl-ava', style: { '--c': '#C9531A' } }, initialsOf(c.name)),
        h('span', { class: 'pg-lab__text' }, h('span', { class: 'tl-lab__name' }, c.name || 'Unnamed'),
          h('span', { class: 'tl-lab__meta' }, c.sheet.base.id['Gamer tag'] || plural(steps.length, 'change'))),
        h('span', { class: 'pg-lab__now' }, `${mLabel} ${endV}`)),
      h('div', { class: 'tl-track', style: { width: TW + 'px', height: LH + 'px' } }, svg, marks));
  });

  const any = chars.some((c) => progress.get(c.id).steps.length);
  return [
    any ? null : h('p', { class: 'tl-hint' }, 'No game events in this stretch yet. Add them on scene cards (“Game events in this scene”).'),
    h('div', { class: 'tl-box' }, h('div', { class: 'tl-inner', style: { width: `calc(var(--labw) + ${TW + 24}px)` } }, gridLayer, ruler, lanes)),
  ];
}

function progressGrid(who, pr, tpl, fromStart) {
  const cols = [{ label: fromStart ? 'Start' : 'Coming in', sub: fromStart ? 'Starting sheet' : 'From earlier books', sheet: pr.start, step: null }]
    .concat(pr.steps.map((st) => ({ label: `v${pr.all.indexOf(st) + 2} · Lv ${st.after.level ?? '?'}`, sub: stepWhere(st), sheet: st.after, step: st })));
  const union = (f) => { const seen = []; for (const c of cols) for (const n of f(c.sheet)) if (!seen.some((x) => sameName(x, n))) seen.push(n); return seen; };
  const has = (list, n) => list.some((x) => sameName(x, n));
  const groups = [
    ['Core', [['Level', (sh) => sh.level ?? ''], ['XP', (sh) => sh.xp || ''], ...tpl.identity.map((k) => [k, (sh) => sh.id[k] || '']), ...tpl.resources.map((k) => [k, (sh) => sh.res[k] ?? ''])]],
    ['Stats', tpl.stats.map((k) => [k, (sh) => sh.stats[k] ?? ''])],
    ['Skills', union((sh) => sh.skills.map((x) => x.name)).map((n) => [n, (sh) => { const x = sh.skills.find((y) => sameName(y.name, n)); return x ? (x.rank || '✓') + (x.rarity ? ' · ' + x.rarity : '') : ''; }])],
    ['Equipment', tpl.slots.map((k) => [k, (sh) => sh.slots[k] || ''])],
    ['Inventory', union((sh) => sh.items).map((n) => [n, (sh) => (has(sh.items, n) ? '✓' : '')])],
    ['Titles', union((sh) => sh.titles).map((n) => [n, (sh) => (has(sh.titles, n) ? '✓' : '')])],
  ];
  const rowsFor = (rows) => rows.map(([label, f]) => {
    const vals = cols.map((c) => f(c.sheet));
    const changes = vals.map((v, i) => i > 0 && String(v) !== String(vals[i - 1]));
    if (S.prog.changesOnly && !changes.some(Boolean)) return null;
    return h('tr', {}, h('th', { scope: 'row', class: 'pg-th' }, label),
      vals.map((v, i) => {
        const prev = vals[i - 1];
        const dn = changes[i] && typeof v === 'number' && typeof prev === 'number' ? (v - prev > 0 ? ' +' : ' ') + (v - prev) : '';
        return h('td', { class: 'pg-td' + (changes[i] ? ' is-changed' : '') + (v === '' ? ' is-empty' : '') }, v === '' ? '—' : String(v), dn ? h('span', { class: 'pg-d' }, dn) : null);
      }));
  }).filter(Boolean);
  const body = groups.flatMap(([title, rows]) => {
    const rs = rowsFor(rows);
    return rs.length ? [h('tr', {}, h('th', { scope: 'rowgroup', class: 'pg-group', colspan: String(cols.length + 1) }, title)), ...rs] : [];
  });
  return h('div', { class: 'pg-box' }, h('table', { class: 'pg-table' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'pg-th pg-th--corner' }, who.name),
      cols.map((c) => h('th', { scope: 'col', class: 'pg-col' },
        h('span', { class: 'pg-col__v' }, c.label), h('span', { class: 'pg-col__w' }, c.sub),
        c.step ? h('button', { class: 'linkbtn pg-col__s', type: 'button', onclick: () => openCard(c.step.k.id) }, c.step.k.title || 'Untitled scene') : null)))),
    h('tbody', {}, body.length ? body : h('tr', {}, h('td', { class: 'pg-td', colspan: String(cols.length + 1) }, 'Nothing changes here yet.')))));
}

// The series arc and each book's beats, as rows on the series timeline.
function timelineBeats(series, { shown, order, TW, ruler1, books, colorOf, labelCell, track }) {
  const marks = (list) => {
    // Stagger labels over two rows so neighbours don't collide.
    list.sort((a, b) => a.x - b.x);
    let lastTop = -1e9, lastBot = -1e9;
    for (const m of list) {
      if (m.x - lastTop >= 150) { m.row = 0; lastTop = m.x; } else if (m.x - lastBot >= 150) { m.row = 1; lastBot = m.x; } else { m.row = m.x - lastTop > m.x - lastBot ? 0 : 1; if (m.row) lastBot = m.x; else lastTop = m.x; }
    }
    return list.map((m) => [
      m.band ? h('span', { class: 'tlb-band', style: { left: m.x + 'px', width: m.band + 'px', '--c': m.color } }) : null,
      h(m.href ? 'a' : 'span', { class: 'tlb-mark' + (m.hollow ? ' is-hollow' : ''), href: m.href || null, title: m.tip, style: { left: m.x + 'px', '--c': m.color } },
        h('span', { class: 'tlb-dia' }), h('span', { class: 'tlb-lab', style: { top: (m.row ? 30 : 4) + 'px' } }, m.label)),
    ]);
  };
  const xsFor = (ids) => shown.filter((it) => it.k.beatId && ids.has(it.k.beatId)).map((it) => it.x);
  const bookFlow = (b) => href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}/flow`);
  const seg = (b) => (order === 'reading' ? ruler1[books.indexOf(b)] : null);

  const arc = series.flow.beats.map((sb, i) => {
    const ids = new Set(books.flatMap((b) => b.flow.beats.filter((x) => x.parent === sb.id).map((x) => x.id)));
    const xs = xsFor(ids);
    const name = `${i + 1}. ${sb.name || 'Untitled'}`;
    if (xs.length) {
      const a = Math.min(...xs), z = Math.max(...xs);
      return { x: a, band: z > a ? z - a + TL.CHIP - 18 : 0, color: 'var(--accent)', label: name, tip: `${name} · ${plural(xs.length, 'scene')}`, href: shref('flow') };
    }
    return order === 'reading' ? { x: (sb.pct / 100) * TW, hollow: true, color: 'var(--accent)', label: name, tip: `${name} · planned, no scenes yet`, href: shref('flow') } : null;
  }).filter(Boolean);

  const bookMarks = books.flatMap((b) => b.flow.beats.map((x) => {
    const xs = xsFor(new Set([x.id]));
    const tip = `${b.title || 'Untitled book'} · ${x.name || 'Untitled beat'}`;
    if (xs.length) return { x: Math.min(...xs), color: colorOf(b), label: x.name || 'Untitled beat', tip: tip + ` · ${plural(xs.length, 'scene')}`, href: bookFlow(b) };
    const sg = seg(b);
    return sg ? { x: sg.left + 24 + (x.pct / 100) * Math.max(0, sg.width - 60), hollow: true, color: colorOf(b), label: x.name || 'Untitled beat', tip: tip + ' · planned, no scenes yet', href: bookFlow(b) } : null;
  }).filter(Boolean));

  if (!arc.length && !bookMarks.length) {
    return [h('div', { class: 'tl-row tl-row--head tlb' }, labelCell('tl-lab--head', 'Beats'),
      track(40, h('span', { class: 'tlb-empty' }, 'No beats yet. Plan them in Story flow. ', h('a', { href: shref('flow') }, 'Open Story flow'))))];
  }
  return [
    h('div', { class: 'tl-row tl-row--head tlb' }, labelCell('tl-lab--head', 'Beats')),
    h('div', { class: 'tl-row tlb' }, labelCell('tl-lab--book', h('span', { class: 'tl-lab__text' }, h('span', { class: 'tl-lab__title' }, 'Series arc'), h('span', { class: 'tl-lab__meta' }, plural(series.flow.beats.length, 'beat')))), track(58, marks(arc))),
    h('div', { class: 'tl-row tlb' }, labelCell('tl-lab--book', h('span', { class: 'tl-lab__text' }, h('span', { class: 'tl-lab__title' }, 'Book beats'), h('span', { class: 'tl-lab__meta' }, order === 'world' ? 'Placed by their scenes' : 'Hollow: no scenes yet'))), track(58, marks(bookMarks))),
  ];
}

// ======================================================================
// Story flow
// ======================================================================

function flowPref(k) {
  if (!S.flowPrefs) { try { S.flowPrefs = JSON.parse(localStorage.getItem('planner:flow') || '{}'); } catch { S.flowPrefs = {}; } }
  return S.flowPrefs[k] !== undefined ? S.flowPrefs[k] : k === 'ribbon';
}
function setFlowPref(k, v) {
  flowPref(k); S.flowPrefs[k] = v;
  try { localStorage.setItem('planner:flow', JSON.stringify(S.flowPrefs)); } catch { /* blocked */ }
}

const beatScenes = (p, b) => p.cards.filter((k) => k.beatId === b.id);
// Index of the part a beat is planned for: chosen explicitly, or from its position.
function plannedCol(p, b) {
  if (b.colId) { const i = p.columns.findIndex((c) => c.id === b.colId); if (i >= 0) return i; }
  const n = p.columns.length;
  return n ? Math.min(n - 1, Math.floor((b.pct / 100) * n)) : -1;
}
const colLabel = (p, i) => (i >= 0 ? `${p.labels.column} ${numeral(p, i)}` : '—');
// Book beats that move a series beat forward.
const childBeats = (series, sb) => series.books.flatMap((b) => b.flow.beats.filter((x) => x.parent === sb.id).map((x) => ({ b, x })));
const seriesBeatDone = (series, sb) => childBeats(series, sb).some(({ b, x }) => beatScenes(b, x).length);

// Smooth curve through points (Catmull-Rom as cubic Béziers).
function curvePath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// The tension curve with draggable beats. extra: [{ d, color }] faint paths drawn behind.
function shapeEl(beats, { done, extra = [], bands = [], below = null, diamond = false }) {
  const H = 220, TOP = 20, PH = 170;
  const X = (pct) => pct * 10, Y = (t) => TOP + (1 - t / 100) * PH;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 1000 ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'shape__svg'); svg.setAttribute('aria-hidden', 'true');
  for (const bd of bands) {
    const r = document.createElementNS(svgNS, 'rect');
    r.setAttribute('x', X(bd.from)); r.setAttribute('y', 0); r.setAttribute('width', X(bd.to - bd.from)); r.setAttribute('height', H);
    r.setAttribute('class', 'shape__band'); svg.append(r);
  }
  for (const ex of extra) {
    const pe = document.createElementNS(svgNS, 'path'); pe.setAttribute('d', ex.d); pe.setAttribute('class', 'shape__extra'); pe.style.stroke = ex.color; svg.append(pe);
  }
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'shape__line');
  const draw = () => path.setAttribute('d', curvePath([...beats].sort((a, b) => a.pct - b.pct).map((b) => [X(b.pct), Y(b.tension)])));
  draw();
  svg.append(path);
  const box = h('div', { class: 'shape' }, svg);
  for (const b of beats) {
    const isDone = done(b);
    const dot = h('button', { class: 'shape__dot' + (isDone ? ' is-done' : '') + (diamond ? ' is-diamond' : ''), type: 'button',
      title: `${b.name || 'Untitled beat'} · ${Math.round(b.pct)}% · drag to move`, 'aria-label': `${b.name || 'Untitled beat'}: drag to move or change tension` });
    const lab = h('span', { class: 'shape__lab' + (b.pct < 8 ? ' is-start' : b.pct > 92 ? ' is-end' : '') }, b.name || 'Untitled beat');
    const wrap = h('div', { class: 'shape__beat', style: { left: b.pct + '%', top: Y(b.tension) + 'px' } }, dot, lab);
    dot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dot.setPointerCapture(e.pointerId);
      const rect = box.getBoundingClientRect();
      const move = (ev) => {
        b.pct = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 1000) / 10));
        b.tension = Math.max(0, Math.min(100, Math.round((1 - (ev.clientY - rect.top - TOP) / PH) * 100)));
        wrap.style.left = b.pct + '%'; wrap.style.top = Y(b.tension) + 'px';
        draw();
      };
      const up = () => { dot.removeEventListener('pointermove', move); dot.removeEventListener('pointerup', up); change(() => {}); };
      dot.addEventListener('pointermove', move);
      dot.addEventListener('pointerup', up);
    });
    dot.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key];
      if (!step) return;
      e.preventDefault();
      change(() => { b.pct = Math.max(0, Math.min(100, b.pct + step[0])); b.tension = Math.max(0, Math.min(100, b.tension + step[1])); });
    });
    box.append(wrap);
  }
  return h('div', { class: 'shape-wrap' }, box, below);
}

function flowSwitch(series, current) {
  return h('div', { class: 'flow-switch', role: 'group', 'aria-label': 'Which story flow' },
    h('a', { class: 'flow-switch__b' + (current === 'series' ? ' is-on' : ''), href: shref('flow'), 'aria-current': current === 'series' ? 'page' : null }, 'Series arc'),
    series.books.map((b) => h('a', { class: 'flow-switch__b' + (current === b.id ? ' is-on' : ''), href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}/flow`), 'aria-current': current === b.id ? 'page' : null }, b.title || 'Untitled book')));
}

function flowBasics(f, fields) {
  return h('section', { class: 'flow-basics' }, fields.map(([key, label, ph]) => h('label', { class: 'flow-basic' },
    h('span', { class: 'field__label' }, label),
    autosize(h('textarea', { class: 'flow-basic__t', rows: 2, value: f[key], placeholder: ph, oninput: (e) => change(() => { f[key] = e.target.value; }, { render: false }) })))));
}

function structurePicker(p, f, isSeries) {
  const keys = Object.keys(STRUCTURES).filter((k) => (isSeries ? ['series', 'three', 'blank'] : Object.keys(STRUCTURES).filter((x) => x !== 'series')).includes(k));
  return h('label', { class: 'flow-structure' }, h('span', { class: 'field__label' }, f.beats.length ? 'Replace with a structure' : 'Start from'),
    h('select', { class: 'input', onchange: async (e) => {
      const key = e.target.value;
      if (!key) return;
      if (f.beats.length && !(await confirmDanger(`Replace your ${plural(f.beats.length, 'beat')}?`, `They’ll be replaced with “${STRUCTURES[key].label}”. Scenes tagged with the old beats lose their tag. The backups keep the old version.`, 'Replace'))) { e.target.value = ''; return; }
      change(() => { f.structure = key; f.beats = makeBeats(key, p); });
    } }, h('option', { value: '' }, f.beats.length ? 'Choose…' : 'Choose a structure…'), keys.map((k) => h('option', { value: k }, STRUCTURES[k].label))));
}

function addBeat(f) {
  const last = f.beats[f.beats.length - 1];
  const b = { id: uid(), name: '', text: '', hint: '', pct: last ? Math.min(100, last.pct + 5) : 10, tension: 50, colId: null, parent: null };
  change(() => { f.beats.push(b); });
  requestAnimationFrame(() => document.querySelector(`[data-beat="${b.id}"] .beat__name`)?.focus());
}

function newSceneForBeat(p, b) {
  const ci = plannedCol(p, b);
  if (ci < 0 || !p.rows.length) { toast(`Add a ${lower(p.labels.column)} and a ${lower(p.labels.row)} on the grid first.`); return; }
  const id = uid();
  change(() => { p.cards.push({ ...blankCard(id, p.columns[ci].id, p.rows[0].id), beatId: b.id }); });
  editCard(id, true);
}

// ---------- A project's or book's flow ----------

function viewFlow(p) {
  const f = p.flow;
  const series = isSeries() ? S.project : null;
  const n = f.beats.filter((b) => beatScenes(p, b).length).length;
  const notes = flowView(f) === 'notes';
  const head = h('div', { class: 'flow-head' },
    h('div', {},
      h('h1', { class: 'display display--xl' }, 'Story flow'),
      h('p', { class: 'muted' }, notes ? 'Scratch paper for the whole story. Get it all down, then turn the parts that matter into beats.' : 'The shape of the whole story before the scenes. Plan the beats here; the grid keeps them in view while you build.')),
    h('span', { class: 'spacer' }),
    notes ? null : structurePicker(p, f, false));
  if (notes) return h('div', { class: 'wrap flow' }, series ? flowSwitch(series, p.id) : null, head, flowModes(f), notesView(p, f, false));
  const parts = h('div', { class: 'shape__parts' }, p.columns.map((c, i) => h('span', {}, colLabel(p, i))));
  const nCols = p.columns.length || 1;
  const actBands = actsOn(p) ? p.acts.map((a, ai) => {
    const idx = p.columns.map((c, i) => (c.actId === a.id ? i : -1)).filter((i) => i >= 0);
    return idx.length && ai % 2 === 0 ? { from: (idx[0] / nCols) * 100, to: ((idx[idx.length - 1] + 1) / nCols) * 100 } : null;
  }).filter(Boolean) : [];
  const list = h('section', { class: 'beats' },
    h('div', { class: 'beats__head' },
      h('h2', { class: 'display' }, 'Beats'),
      h('span', { class: 'muted' }, f.beats.length ? `${n} of ${f.beats.length} have scenes` : ''),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: () => addBeat(f) }, icon('plus'), ' Beat')),
    f.beats.length ? f.beats.map((b, i) => beatEditor(p, f, b, i, series)) : h('p', { class: 'muted' }, 'No beats yet. Start from a structure above, or add your own.'));
  return h('div', { class: 'wrap flow' },
    series ? flowSwitch(series, p.id) : null,
    head,
    flowModes(f),
    flowBasics(f, [['logline', 'Logline', 'One or two sentences: who, what they want, what stands in the way'], ['theme', 'Theme', 'What the story is really about'], ['ending', 'Where it lands', 'How it ends, so every beat can aim there']]),
    f.beats.length ? h('section', { class: 'flow-card' },
      h('div', { class: 'flow-card__head' }, h('h2', { class: 'display' }, 'Shape'),
        h('span', { class: 'muted small' }, 'Drag a beat left or right to move it, up or down to set its tension. Arrow keys work too.'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'legend-i' }, h('span', { class: 'shape__key is-done' }), 'Has scenes'),
        h('span', { class: 'legend-i' }, h('span', { class: 'shape__key' }), 'No scenes yet')),
      shapeEl(f.beats, { done: (b) => beatScenes(p, b).length > 0, bands: actBands, below: parts })) : null,
    list);
}

function beatEditor(p, f, b, i, series) {
  const upd = (fn) => change(fn, { render: false });
  const scenes = beatScenes(p, b);
  const auto = plannedCol(p, { ...b, colId: null });
  return h('article', { class: 'beat', 'data-beat': b.id },
    h('div', { class: 'beat__num' }, h('span', { class: 'beat__n' }, String(i + 1)), h('span', { class: 'beat__pct' }, Math.round(b.pct) + '%')),
    h('div', { class: 'beat__body' },
      h('input', { class: 'beat__name', value: b.name, placeholder: 'Name this beat', 'aria-label': 'Beat name', oninput: (e) => upd(() => { b.name = e.target.value; }) }),
      autosize(h('textarea', { class: 'beat__text', rows: 2, value: b.text, placeholder: 'What happens at this point in the story', 'aria-label': 'What happens', oninput: (e) => upd(() => { b.text = e.target.value; }) })),
      h('input', { class: 'beat__hint', value: b.hint, placeholder: 'What this beat is for (optional)', 'aria-label': 'What this beat is for', oninput: (e) => upd(() => { b.hint = e.target.value; }) }),
      h('div', { class: 'beat__meta' },
        h('label', { class: 'beat__sel' }, h('span', { class: 'muted small' }, 'Planned for'),
          h('select', { class: 'input input--sm', onchange: (e) => change(() => { b.colId = e.target.value || null; }) },
            h('option', { value: '' }, `Auto (${colLabel(p, auto)})`),
            p.columns.map((c, ci) => h('option', { value: c.id, selected: b.colId === c.id }, colLabel(p, ci) + (c.title ? ': ' + c.title : ''))))),
        series ? h('label', { class: 'beat__sel' }, h('span', { class: 'muted small' }, 'Moves the series beat'),
          h('select', { class: 'input input--sm', onchange: (e) => change(() => { b.parent = e.target.value || null; }) },
            h('option', { value: '' }, '— None —'),
            series.flow.beats.map((sb, si) => h('option', { value: sb.id, selected: b.parent === sb.id }, `${si + 1}. ${sb.name || 'Untitled'}`)))) : null)),
    h('div', { class: 'beat__side' },
      h('span', { class: 'beat__status' + (scenes.length ? ' is-done' : '') }, scenes.length ? plural(scenes.length, 'scene') : 'No scenes yet'),
      scenes.map((k) => h('button', { class: 'beat__scene', type: 'button', onclick: () => openCard(k.id) }, `${cardInfo(k).num} · ${k.title || 'Untitled scene'}`)),
      h('button', { class: 'btn btn--ghost btn--sm beat__add', type: 'button', onclick: () => newSceneForBeat(p, b) }, icon('plus'), ' Scene for this beat'),
      h('button', { class: 'iconbtn beat__del', type: 'button', 'aria-label': 'Delete beat', title: 'Delete beat', onclick: async () => {
        if (!(await confirmDanger(`Delete “${b.name || 'this beat'}”?`, scenes.length ? `${plural(scenes.length, 'scene')} lose${scenes.length === 1 ? 's' : ''} this tag. The scenes stay.` : 'No scenes use it.'))) return;
        change(() => { f.beats = f.beats.filter((x) => x !== b); for (const k of p.cards) if (k.beatId === b.id) k.beatId = null; });
      } }, icon('trash'))));
}

// ---------- Story notes: a free-form document per book, project and series ----------

// Notes or Beats & shape. Until you choose, a flow with no beats opens on its notes.
function flowView() {
  return S.route.tab === 'notes' ? 'notes' : 'beats';
}
function flowModes() { return null; }
function flowModesOld(f, cur = flowView(f)) {
  const b = (v, label, extra) => h('button', { class: 'tl-seg__btn' + (cur === v ? ' is-on' : ''), type: 'button', 'aria-pressed': String(cur === v),
    onclick: () => { setFlowPref('view', v); render(); } }, label, extra ? h('span', { class: 'flow-modes__n' }, extra) : null);
  const words = notesWords(f.notes);
  return h('div', { class: 'tl-seg flow-modes', role: 'group', 'aria-label': 'Story flow view' },
    b('notes', 'Story notes', words ? words.toLocaleString() + ' words' : null),
    b('beats', 'Beats & shape', f.beats.length ? String(f.beats.length) : null));
}

// Only these tags survive; everything else is unwrapped to its text. No attributes at all.
const NOTE_TAGS = { H2: 'h2', H3: 'h3', P: 'p', DIV: 'p', UL: 'ul', OL: 'ol', LI: 'li', B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', BLOCKQUOTE: 'blockquote', BR: 'br', H1: 'h2', H4: 'h3', H5: 'h3', H6: 'h3' };
const NOTE_BLOCKS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'blockquote']);
function cleanNotes(src) {
  const out = document.createElement('div');
  const walk = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'IMG', 'META', 'LINK', 'TITLE'].includes(n.tagName)) continue;
      const tag = NOTE_TAGS[n.tagName];
      if (!tag) { walk(n, to); continue; }
      // A block inside a line (Safari and some pastes put a new line's <div> inside the <p> or <li>
      // before it) becomes a line break, so the break survives.
      if (NOTE_BLOCKS.has(tag) && ['p', 'h2', 'h3', 'li', 'blockquote'].includes(to.tagName?.toLowerCase()) && tag !== 'ul' && tag !== 'ol') {
        const br = () => document.createElement('br');
        if (to.lastChild && to.lastChild.nodeName !== 'BR' && to.textContent.trim()) to.append(br());
        const before = to.childNodes.length;
        walk(n, to);
        if (to.childNodes.length === before) to.append(br());
        else if (n.nextSibling && (n.nextSibling.nodeType === 1 ? n.nextSibling.nodeName !== 'BR' : n.nextSibling.nodeValue.trim())) to.append(br());
        continue;
      }
      const el = document.createElement(tag);
      to.append(el);
      if (tag !== 'br') walk(n, el);
    }
  };
  walk(src, out);
  // Loose text or bold/italic sitting at the top level (Safari types the first line that way)
  // goes into its own paragraph, split at line breaks.
  let run = null;
  for (const n of [...out.childNodes]) {
    const inline = n.nodeType === 3 || !NOTE_BLOCKS.has(n.nodeName.toLowerCase());
    if (!inline) { run = null; continue; }
    if (n.nodeName === 'BR') { if (run) run = null; else out.insertBefore(Object.assign(document.createElement('p'), {}), n).append(document.createElement('br')); n.remove(); continue; }
    if (n.nodeType === 3 && !n.nodeValue.trim() && !run) { n.remove(); continue; }
    if (!run) { run = document.createElement('p'); out.insertBefore(run, n); }
    run.append(n);
  }
  // Drop empty wrappers left over from editing (an empty line keeps its <br>, so it stays).
  out.querySelectorAll('b, i, u, s').forEach((x) => { if (!x.textContent) x.remove(); });
  out.querySelectorAll('p, h2, h3, blockquote').forEach((x) => { if (!x.childNodes.length) x.remove(); });
  return out;
}
// Stored notes are parsed in an inert document, then rebuilt from the allowlist.
function notesToDom(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  return cleanNotes(doc.body);
}
function notesWords(html) {
  if (!html) return 0;
  const t = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.textContent || '';
  return (t.match(/[\p{L}\p{N}’']+/gu) || []).length;
}

const NOTES_STARTER = [
  ['h2', 'The idea'], ['p', ''],
  ['h2', 'Characters'], ['ul', ''],
  ['h2', 'World'], ['ul', ''],
  ['h2', 'How it goes'], ['ul', ''],
  ['h2', 'How it ends'], ['p', ''],
  ['h2', 'Open questions'], ['ul', ''],
];

function notesView(p, f, isSeriesArc) {
  const ed = h('div', { class: 'notes__ed', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Story notes', spellcheck: 'true',
    'data-placeholder': 'Get the whole story out. Headings, bullets, half-ideas, questions: anything goes. Select a line and press “Make a beat” when something is ready.' });
  append(ed, [...notesToDom(f.notes).childNodes]);
  const count = h('span', { class: 'muted small' });
  const showCount = () => { const w = (ed.innerText.match(/[\p{L}\p{N}’']+/gu) || []).length; count.textContent = w ? `${w.toLocaleString()} words` : ''; };
  showCount();

  let t = null;
  const persist = () => {
    clearTimeout(t);
    t = null;
    const html = cleanNotes(ed).innerHTML;
    const empty = !ed.textContent.trim() && !ed.querySelector('li, h2, h3');
    if ((empty ? '' : html) !== f.notes) change(() => { f.notes = empty ? '' : html; }, { render: false });
  };
  const soon = () => { showCount(); clearTimeout(t); t = setTimeout(persist, 500); };
  ed.addEventListener('input', soon);
  ed.addEventListener('blur', persist);
  // Anything that redraws the page saves the notes first (see render).
  S.flushNotes = () => { if (ed.isConnected) persist(); };

  const cmd = (name, val) => { ed.focus(); document.execCommand(name, false, val); soon(); syncTools(); };
  const block = (tag) => {
    ed.focus();
    const cur = currentBlock();
    document.execCommand('formatBlock', false, cur && cur.tagName.toLowerCase() === tag ? 'p' : tag);
    soon(); syncTools();
  };
  const currentBlock = () => {
    const sel = getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return null;
    let n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    while (n && n !== ed && !['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE', 'DIV'].includes(n.tagName)) n = n.parentElement;
    return n && n !== ed ? n : null;
  };

  const tb = (label, title, fn, cls = '') => h('button', { class: 'notes__tb ' + cls, type: 'button', title, 'aria-label': title,
    onmousedown: (e) => e.preventDefault(), onclick: fn }, label);
  const tools = {
    h2: tb('H1', 'Section heading (type # then space)', () => block('h2'), 'is-h'),
    h3: tb('H2', 'Subheading (type ## then space)', () => block('h3'), 'is-h'),
    ul: tb('• List', 'Bullet list (type - then space). Tab to indent.', () => cmd('insertUnorderedList')),
    ol: tb('1. List', 'Numbered list (type 1. then space)', () => cmd('insertOrderedList')),
    quote: tb('❝', 'Quote or aside (type > then space)', () => block('blockquote')),
    b: tb(h('b', {}, 'B'), 'Bold (Ctrl/⌘ B)', () => cmd('bold')),
    i: tb(h('i', {}, 'I'), 'Italic (Ctrl/⌘ I)', () => cmd('italic')),
    s: tb(h('s', {}, 'S'), 'Strike through: done with this idea', () => cmd('strikeThrough')),
  };
  const syncTools = () => {
    const cur = currentBlock();
    const tag = cur ? cur.tagName.toLowerCase() : '';
    const inList = (k) => !!(cur && cur.closest(k));
    const on = { h2: tag === 'h2', h3: tag === 'h3', quote: tag === 'blockquote', ul: inList('ul'), ol: inList('ol') };
    for (const k of ['b', 'i', 's']) { try { on[k] = document.queryCommandState({ b: 'bold', i: 'italic', s: 'strikeThrough' }[k]); } catch { on[k] = false; } }
    for (const [k, el] of Object.entries(tools)) { el.classList.toggle('is-on', !!on[k]); el.setAttribute('aria-pressed', String(!!on[k])); }
    const has = selectedText().length > 0;
    makeBeat.disabled = !has;
  };
  const selectedText = () => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode)) return '';
    return sel.toString().trim();
  };
  // One page-wide listener; it follows whichever notes editor is on screen.
  S.notesSync = () => { if (ed.isConnected) syncTools(); };
  if (!S.notesListening) { S.notesListening = true; document.addEventListener('selectionchange', () => S.notesSync && S.notesSync()); }

  const rail = h('div', { class: 'notes__beats' });
  const drawRail = () => {
    clear(rail);
    append(rail, [
      h('div', { class: 'notes__railhead' }, h('h2', { class: 'notes__railt' }, isSeriesArc ? 'Series beats' : 'Beats'), h('span', { class: 'muted small' }, f.beats.length ? String(f.beats.length) : '')),
      f.beats.length ? h('ol', { class: 'notes__blist' }, f.beats.map((b, i) => {
        const done = isSeriesArc ? seriesBeatDone(S.project, b) : beatScenes(p, b).length > 0;
        return h('li', {}, h('button', { class: 'notes__bi', type: 'button', title: b.text || 'Open in Beats & shape',
          onclick: () => { persist(); go(isSeries() && !S.bookId ? `s/${encodeURIComponent(S.slug)}/flow` : pbase('flow')); requestAnimationFrame(() => { const el = document.querySelector(`[data-beat="${b.id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.querySelector('.beat__name')?.focus({ preventScroll: true }); } }); } },
        h('span', { class: 'fbeat__mark' + (done ? ' is-done' : '') }, done ? '✓' : String(i + 1)), h('span', { class: 'notes__bn' }, b.name || 'Untitled beat')));
      })) : h('p', { class: 'muted small' }, 'None yet. Select a line in your notes and press “Make a beat”.'),
    ]);
  };
  drawRail();

  const makeBeat = h('button', { class: 'btn btn--sm notes__mk', type: 'button', disabled: true, title: 'Turn the selected text into a beat',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => {
      const txt = selectedText();
      if (!txt) return;
      const lines = txt.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      let name = lines[0], text = lines.slice(1).join('\n');
      if (name.length > 60) { text = lines.join('\n'); name = name.split(/\s+/).slice(0, 6).join(' ').replace(/[,.;:]$/, '') + '…'; }
      const last = f.beats[f.beats.length - 1];
      const b = { id: uid(), name, text, hint: '', pct: last ? Math.min(100, last.pct + 5) : 5, tension: 50, colId: null, parent: null };
      persist();
      change(() => { f.beats.push(b); }, { render: false });
      drawRail();
      flowModesRefresh();
      toast(`Beat ${f.beats.length} added: “${name}”`);
    } }, '◆ Make a beat');
  // The Notes / Beats switch shows a beat count, so keep it current without a redraw.
  const flowModesRefresh = () => { const old = document.querySelector('.flow-modes'); if (old) old.replaceWith(flowModes(f, 'notes')); };

  const starter = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => {
    ed.focus();
    clear(ed);
    for (const [tag, txt] of NOTES_STARTER) {
      const el = document.createElement(tag);
      if (tag === 'ul') { const li = document.createElement('li'); li.append(document.createElement('br')); el.append(li); }
      else if (txt) el.textContent = txt;
      else el.append(document.createElement('br'));
      ed.append(el);
    }
    persist(); starter.remove();
  } }, 'Start with sections');

  // Markdown-style shortcuts at the start of a line.
  ed.addEventListener('keydown', (e) => {
    // A new line is a change of structure: save it right away rather than after the pause.
    if (e.key === 'Enter') setTimeout(persist, 0);
    if (e.key === 'Tab') {
      const cur = currentBlock();
      if (cur && cur.closest('li')) { e.preventDefault(); cmd(e.shiftKey ? 'outdent' : 'indent'); }
      return;
    }
    if (e.key !== ' ') return;
    const cur = currentBlock();
    if (!cur) return;
    const pre = cur.textContent;
    const map = { '#': ['h2'], '##': ['h3'], '>': ['blockquote'], '-': ['ul'], '*': ['ul'], '1.': ['ol'] };
    const m = map[pre];
    if (!m || cur.tagName === 'LI' && m[0] !== 'ul' && m[0] !== 'ol') return;
    const sel = getSelection();
    if (!sel.isCollapsed) return;
    e.preventDefault();
    cur.textContent = '';
    cur.append(document.createElement('br'));
    const r = document.createRange(); r.setStart(cur, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    if (m[0] === 'ul') cmd('insertUnorderedList');
    else if (m[0] === 'ol') cmd('insertOrderedList');
    else block(m[0]);
  });
  // Paste: keep structure, drop everything else.
  ed.addEventListener('paste', (e) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (html) {
      const clean = cleanNotes(new DOMParser().parseFromString(html, 'text/html').body);
      document.execCommand('insertHTML', false, clean.innerHTML);
    } else document.execCommand('insertText', false, text);
    soon();
  });
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* older browsers */ }
  // Always type inside a paragraph, so shortcuts and headings have a line to work on.
  const ensureBlock = () => {
    if (ed.firstElementChild && ![...ed.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) return;
    const para = document.createElement('p');
    while (ed.firstChild) para.append(ed.firstChild);
    if (!para.firstChild) para.append(document.createElement('br'));
    ed.append(para);
    const r = document.createRange(); r.selectNodeContents(para); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  };
  ed.addEventListener('focus', ensureBlock);

  return h('div', { class: 'notes' },
    h('section', { class: 'notes__doc flow-card' },
      h('div', { class: 'notes__bar', role: 'toolbar', 'aria-label': 'Formatting' },
        tools.h2, tools.h3, h('span', { class: 'notes__sep' }), tools.ul, tools.ol, tools.quote, h('span', { class: 'notes__sep' }), tools.b, tools.i, tools.s,
        h('span', { class: 'spacer' }), count, makeBeat),
      f.notes ? null : h('div', { class: 'notes__start' }, starter),
      ed),
    h('aside', { class: 'notes__rail flow-card' }, rail,
      h('p', { class: 'muted small notes__tip' }, 'Select text in your notes, then “Make a beat”. The first line becomes its name, the rest what happens. Click a beat to open it in Beats & shape, where it gets a place in the story and its scenes.')));
}

// ---------- The series arc ----------

function viewSeriesArc(series) {
  const f = series.flow;
  const books = series.books;
  // Each book's share of the series, by its number of scenes (at least a little).
  const weights = books.map((b) => Math.max(3, b.cards.length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const seg = books.map((b, i) => { const from = (acc / total) * 100; acc += weights[i]; return { b, from, to: (acc / total) * 100 }; });
  const extra = seg.filter(({ b }) => b.flow.beats.length > 1).map(({ b, from, to }) => {
    const pts = [...b.flow.beats].sort((x, y) => x.pct - y.pct).map((x) => [(from + (x.pct / 100) * (to - from)) * 10, 20 + (1 - x.tension / 100) * 170 * 0.7 + 50]);
    return { d: curvePath(pts), color: (series.groups.find((g) => g.id === b.groupId) || series.groups[0]).color };
  });
  const strip = h('div', { class: 'arc-strip' }, seg.map(({ b, from, to }, i) => h('a', { class: 'arc-strip__b', href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}/flow`),
    style: { flexGrow: String(to - from), background: (series.groups.find((g) => g.id === b.groupId) || series.groups[0]).color } }, `${i + 1}. ${b.title || 'Untitled book'}`)));
  const unassigned = books.flatMap((b) => b.flow.beats.filter((x) => !x.parent || !f.beats.some((sb) => sb.id === x.parent)).map((x) => ({ b, x })));
  const chip = (b, x) => h('a', { class: 'arc-chip' + (beatScenes(b, x).length ? ' is-done' : ''), href: href(`s/${encodeURIComponent(S.slug)}/b/${encodeURIComponent(b.id)}/flow`), draggable: 'true',
    title: (x.text || x.hint || '') + ' (drag onto another series beat to move it)',
    ondragstart: (e) => { S.dragArc = { b: b.id, x: x.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); },
    ondragend: () => { S.dragArc = null; } }, h('span', { class: 'arc-chip__dot' }), x.name || 'Untitled beat');
  const dropOn = (el, parentId) => {
    el.addEventListener('dragover', (e) => { if (S.dragArc) { e.preventDefault(); el.classList.add('is-over'); } });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('is-over'); });
    el.addEventListener('drop', (e) => {
      if (!S.dragArc) return;
      e.preventDefault(); el.classList.remove('is-over');
      const { b, x } = S.dragArc; S.dragArc = null;
      change(() => { const bk = books.find((y) => y.id === b); const bt = bk && bk.flow.beats.find((y) => y.id === x); if (bt) bt.parent = parentId; });
    });
    return el;
  };
  const groupByBook = (pairs) => {
    const m = new Map();
    for (const pr of pairs) { if (!m.has(pr.b)) m.set(pr.b, []); m.get(pr.b).push(pr.x); }
    return [...m.entries()].map(([b, xs]) => h('div', { class: 'arc-book' },
      h('span', { class: 'arc-book__name' }, h('span', { class: 'arc-book__sw', style: { background: (series.groups.find((g) => g.id === b.groupId) || series.groups[0]).color } }), b.title || 'Untitled book'),
      h('div', { class: 'arc-book__chips' }, xs.map((x) => chip(b, x)))));
  };
  const upd = (fn) => change(fn, { render: false });
  const nDone = f.beats.filter((sb) => seriesBeatDone(series, sb)).length;
  if (flowView(f) === 'notes') {
    return h('div', { class: 'wrap flow' }, flowSwitch(series, 'series'),
      h('div', { class: 'flow-head' }, h('div', {}, h('h1', { class: 'display display--xl' }, 'Series arc'),
        h('p', { class: 'muted' }, 'Scratch paper for the whole series. Get it all down, then turn the parts that matter into series beats.'))),
      flowModes(f),
      notesView(series, f, true));
  }
  return h('div', { class: 'wrap flow' },
    flowSwitch(series, 'series'),
    h('div', { class: 'flow-head' },
      h('div', {}, h('h1', { class: 'display display--xl' }, 'Series arc'),
        h('p', { class: 'muted' }, 'The story the whole series tells. Each book’s own beats sit under the series beat they move forward.')),
      h('span', { class: 'spacer' }), structurePicker(series, f, true)),
    flowModes(f),
    flowBasics(f, [['logline', 'Series logline', 'The story all the books tell together'], ['theme', 'Theme', 'What the series is really about'], ['ending', 'Where it ends', 'The final image of the whole series']]),
    h('section', { class: 'flow-card' },
      h('div', { class: 'flow-card__head' }, h('h2', { class: 'display' }, 'Shape across the books'),
        h('span', { class: 'muted small' }, 'Solid: the series arc. Faint lines: each book’s own shape, in reading order.')),
      f.beats.length ? shapeEl(f.beats, { done: (sb) => seriesBeatDone(series, sb), extra, diamond: true, below: strip }) : h('div', {}, h('p', { class: 'muted' }, 'No series beats yet. Start from a structure above, or add your own.'), strip)),
    h('section', { class: 'beats' },
      h('div', { class: 'beats__head' }, h('h2', { class: 'display' }, 'Series beats'),
        h('span', { class: 'muted' }, f.beats.length ? `${nDone} of ${f.beats.length} have scenes · drag a book beat onto a different series beat to move it` : ''),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onclick: () => addBeat(f) }, icon('plus'), ' Series beat')),
      f.beats.map((sb, i) => dropOn(h('article', { class: 'beat beat--series', 'data-beat': sb.id },
        h('div', { class: 'beat__num' }, h('span', { class: 'beat__diamond' + (seriesBeatDone(series, sb) ? ' is-done' : '') }, h('span', {}, String(i + 1)))),
        h('div', { class: 'beat__body' },
          h('input', { class: 'beat__name', value: sb.name, placeholder: 'Name this series beat', 'aria-label': 'Series beat name', oninput: (e) => upd(() => { sb.name = e.target.value; }) }),
          autosize(h('textarea', { class: 'beat__text', rows: 2, value: sb.text, placeholder: 'What happens across the series at this point', oninput: (e) => upd(() => { sb.text = e.target.value; }) })),
          h('div', { class: 'arc-nest' }, childBeats(series, sb).length ? groupByBook(childBeats(series, sb)) : h('span', { class: 'muted small' }, 'No book beats here yet. Drag one in, or pick this series beat in a book’s Story flow.'))),
        h('div', { class: 'beat__side' },
          h('button', { class: 'iconbtn beat__del', type: 'button', 'aria-label': 'Delete series beat', onclick: async () => {
            if (!(await confirmDanger(`Delete “${sb.name || 'this series beat'}”?`, 'Book beats under it become unassigned. Nothing else changes.'))) return;
            change(() => { f.beats = f.beats.filter((x) => x !== sb); for (const b of books) for (const x of b.flow.beats) if (x.parent === sb.id) x.parent = null; });
          } }, icon('trash')))), sb.id)),
      unassigned.length ? dropOn(h('article', { class: 'beat beat--loose' },
        h('div', { class: 'beat__num' }),
        h('div', { class: 'beat__body' }, h('h3', { class: 'beat__looseh' }, 'Not under a series beat yet'), h('div', { class: 'arc-nest' }, groupByBook(unassigned)))), null) : null));
}

// ---------- On the grid ----------

function beatRibbon(p, slots) {
  const n = slots.length;
  const colToSlot = (ci) => slots.findIndex((sl) => sl.c && sl.c.id === p.columns[ci]?.id);
  const lanes = [];
  const chips = p.flow.beats.map((b, i) => {
    const si = colToSlot(plannedCol(p, b));
    if (si < 0) return null;
    let lane = lanes.findIndex((l) => !l.includes(si));
    if (lane < 0) { lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push(si);
    const done = beatScenes(p, b).length > 0;
    const on = S.flowSel === b.id;
    return h('button', { class: 'ribbon__b' + (done ? ' is-done' : '') + (on ? ' is-on' : ''), type: 'button', title: (b.text || b.hint || b.name) + (done ? '' : ' · no scenes yet'),
      style: { gridColumn: `${si + 1}`, gridRow: `${lane + 1}` }, onclick: () => { S.flowSel = on ? null : b.id; render(); } },
    h('span', { class: 'ribbon__n' }, String(i + 1)), b.name || 'Untitled beat');
  });
  return h('div', { class: 'ribbon', style: { gridColumn: `span ${n}`, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } }, chips);
}

function flowPanel(p) {
  const f = p.flow;
  const n = f.beats.filter((b) => beatScenes(p, b).length).length;
  return h('aside', { class: 'fpanel', 'aria-label': 'Story flow' },
    h('div', { class: 'fpanel__head' }, h('h2', { class: 'fpanel__t' }, 'Story flow'), h('a', { class: 'small', href: phref('flow') }, 'Open'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close panel', onclick: () => { setFlowPref('panel', false); render(); } }, icon('x'))),
    f.logline ? h('p', { class: 'fpanel__log' }, f.logline) : null,
    h('div', { class: 'fpanel__bar' }, h('span', { style: { width: (f.beats.length ? (n / f.beats.length) * 100 : 0) + '%' } })),
    h('span', { class: 'muted small' }, `${n} of ${plural(f.beats.length, 'beat')} have scenes`),
    h('ol', { class: 'fpanel__list' }, f.beats.map((b, i) => {
      const sc = beatScenes(p, b).length;
      const on = S.flowSel === b.id;
      return h('li', {}, h('button', { class: 'fbeat' + (on ? ' is-on' : ''), type: 'button', draggable: 'true', 'aria-pressed': String(on),
        ondragstart: (e) => { S.dragBeat = b.id; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', b.name || 'beat'); },
        ondragend: () => { S.dragBeat = null; document.querySelectorAll('.is-beat-over').forEach((x) => x.classList.remove('is-beat-over')); },
        onclick: () => { S.flowSel = on ? null : b.id; render(); } },
      h('span', { class: 'fbeat__top' },
        h('span', { class: 'fbeat__mark' + (sc ? ' is-done' : '') }, sc ? '✓' : String(i + 1)),
        h('span', { class: 'fbeat__name' }, b.name || 'Untitled beat'),
        h('span', { class: 'fbeat__where' }, colLabel(p, plannedCol(p, b)))),
      on ? [b.text ? h('span', { class: 'fbeat__text' }, b.text) : null, b.hint ? h('span', { class: 'fbeat__hint' }, b.hint) : null,
        h('span', { class: 'fbeat__st' + (sc ? ' is-done' : '') }, sc ? plural(sc, 'scene') + ' highlighted' : 'No scenes yet')] : null));
    })),
    h('p', { class: 'muted small fpanel__foot' }, 'Click a beat to highlight its scenes. Drag a beat onto a card to tag it.'));
}

// ---------- On a scene card ----------

function beatBox(p, k, upd, dlg) {
  const box = h('section', { class: 'bbox', 'aria-label': 'Story beat' });
  const draw = () => {
    clear(box);
    const c = k();
    const beats = p.flow.beats;
    const i = beats.findIndex((b) => b.id === c.beatId);
    const b = beats[i];
    const ci = cardInfo(c).i;
    append(box, [
      h('label', { class: 'field' }, h('span', { class: 'field__label bbox__label' }, 'Serves the beat'),
        h('select', { class: 'input', onchange: (e) => { upd((cc) => { cc.beatId = e.target.value || null; }); draw(); } },
          h('option', { value: '' }, '— None —'),
          beats.map((x, j) => h('option', { value: x.id, selected: x.id === c.beatId }, `${j + 1} · ${x.name || 'Untitled beat'}`)))),
      b ? [
        b.text ? h('p', { class: 'bbox__text' }, b.text) : null,
        b.hint ? h('p', { class: 'bbox__hint' }, b.hint) : null,
        h('div', { class: 'bbox__meta' },
          h('span', {}, 'Planned for ', h('strong', {}, colLabel(p, plannedCol(p, b))),
            plannedCol(p, b) === ci ? ' · this scene is there ✓' : ` · this scene is in ${colLabel(p, ci)}`),
          h('span', { class: 'spacer' }),
          h('a', { href: phref('flow'), onclick: () => dlg().close() }, 'Open in Story flow')),
        h('div', { class: 'bbox__nav' },
          h('span', {}, beats[i - 1] ? ['← Before: ', h('strong', {}, beats[i - 1].name || 'Untitled')] : 'First beat'),
          h('span', {}, beats[i + 1] ? ['Next: ', h('strong', {}, beats[i + 1].name || 'Untitled'), ' →'] : 'Last beat')),
      ] : h('p', { class: 'muted small' }, 'Pick the beat this scene moves forward, to keep it in step with your Story flow.'),
    ]);
  };
  draw();
  return box;
}

boot();

// For the feature modules (x-*.js).
export {
  S, store, DEMO, P, isSeries, inSeriesTop, scopeCards, findCard, bookOf, cardInfo, cardLabel, appearances, openCard, editCard, change, render, saveNow,
  go, href, phref, shref, pbase, entity, typeOf, plural, lower, fmtN, readingSeq, bookSeq, progressOf, sheetAt, gameOn, sheetChars, initialsOf, sameName,
  newEntity, entityPicker, cardOptions, cardSelect, cardLabel as cardName, colLabel, colName, colRef, beatScenes, plannedCol, blankCard, viewGrid, viewSheet,
  timelineFields, worldSide, numberInput, flowPref, setFlowPref, nameDialog,
};
