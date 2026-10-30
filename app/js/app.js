import { h, append, clear, icon, openDialog, choose, confirmDanger, ask, toast, autosize } from './dom.js';
import { TEMPLATES, PALETTE, FIELD_TYPES, STATUSES, STATUS_SHORT, uid, slugify, numeral, roman, normalize, valueText, actsOn, syncActs,
  prepare, newSeries, newBook, importProject, findDuplicates, mergeEntities, LINE_COLORS, LINK_KINDS,
  GAME_EVENTS, blankSheet, applyEvent, describeEvent, cloneSheet } from './model.js';
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
  if (d && d.kind === 'series' && S.bookId) return d.books.find((b) => b.id === S.bookId) || d;
  return d;
};
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
const colName = (p, c) => `${p.labels.column} ${numeral(p, colIndex(c.id))}`;

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
  el.title = kind === 'error' ? (msg || '') + ' (your changes are kept on this device and will retry)' : '';
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

async function route() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  S.route = parseRoute();
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
  if (S.bookId && !S.project.books.some((b) => b.id === S.bookId)) { toast('That book isn’t in this series any more.'); return go(`s/${S.slug}/books`); }
  render();
  window.scrollTo(0, 0);
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

function render() {
  const p = P();
  if (!p) return renderHome();
  const tab = S.route.tab;
  const series = isSeries() ? S.project : null;
  let tabs, activeTab, main, crumbs;

  if (series && !S.bookId) {
    // Series-wide screens
    document.title = `${series.title} · Planner`;
    tabs = [
      ['timeline', 'Timeline', 'timeline', shref()],
      gameOn() ? ['progress', 'Progression', 'spark', shref('progress')] : null,
      ['books', 'Books', 'book', shref('books')],
      ['world', 'Shared world', 'globe', shref('world')],
      ['continuity', 'Continuity', 'link', shref('continuity')],
      ['settings', 'Series', 'gear', shref('settings')],
    ];
    activeTab = tab === 'e' ? 'world' : tab;
    if (tab === 'books') main = viewBooks(series);
    else if (tab === 'world') main = viewWorld(p, S.route.id);
    else if (tab === 'e') main = viewEntity(p, S.route.id);
    else if (tab === 'continuity') main = viewContinuity(p);
    else if (tab === 'settings') main = viewSeriesSettings(series);
    else if (tab === 'progress' && gameOn()) main = viewProgression(p);
    else { activeTab = 'timeline'; main = viewTimeline(series); }
    crumbs = [h('a', { class: 'top__project', href: shref() }, series.title), h('span', { class: 'pill pill--series' }, 'Series')];
  } else {
    document.title = `${p.title} · Planner`;
    tabs = [
      ['grid', 'Grid', 'grid', phref()],
      gameOn() ? ['progress', 'Progression', 'spark', phref('progress')] : null,
      ['world', series ? 'Shared world' : 'World', 'globe', phref('world')],
      ['continuity', 'Continuity', 'link', phref('continuity')],
      ['project', series ? 'Book' : 'Project', 'gear', phref('project')],
    ];
    if (series) tabs.unshift(['series', 'Timeline', 'timeline', shref()]);
    activeTab = tab === 'e' ? 'world' : tab;
    if (tab === 'world') main = viewWorld(p, S.route.id);
    else if (tab === 'e') main = viewEntity(p, S.route.id);
    else if (tab === 'continuity') main = viewContinuity(p);
    else if (tab === 'project') main = viewProject(p);
    else if (tab === 'progress' && gameOn()) main = viewProgression(p);
    else { activeTab = 'grid'; main = viewGrid(p); }
    crumbs = series
      ? [h('a', { class: 'top__project', href: shref() }, series.title), h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'), h('a', { class: 'top__book', href: phref() }, p.title)]
      : [h('a', { class: 'top__project', href: phref() }, p.title)];
  }

  const wide = activeTab === 'grid' || activeTab === 'timeline' || activeTab === 'progress';
  const shell = h('div', { class: 'page' + (wide ? ' page--grid' : '') },
    h('header', { class: 'top' },
      brand(),
      h('span', { class: 'top__crumbs' }, crumbs),
      h('nav', { class: 'tabs', 'aria-label': 'Views' }, tabs.filter(Boolean).map(([id, label, ic, url]) =>
        h('a', { class: 'tab' + (activeTab === id ? ' is-on' : ''), href: url, 'aria-current': activeTab === id ? 'page' : null },
          icon(ic), h('span', {}, label)))),
      h('div', { class: 'top__right' }, wordPill(), searchBox(p),
        h('button', { class: 'iconbtn', type: 'button', title: 'Name generator', 'aria-label': 'Name generator', onclick: () => nameDialog({ kind: S.route.tab === 'world' || S.route.tab === 'e' ? kindForType((p.types.find((t) => t.id === S.route.id) || typeOf(entity(S.route.id)) || {}).name) : undefined, createType: S.route.tab === 'world' ? S.route.id : null }) }, icon('dice')),
        h('span', { id: 'save-status', class: 'status', 'aria-live': 'polite' }))),
    h('main', { class: 'main main--' + activeTab }, main));
  clear(root).append(shell);
  setStatus(S.status, S.statusMsg);
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
      const text = [e.name, e.summary, e.notes, ...(t ? t.fields.map((f) => valueText(p, f, e.fields[f.id])) : [])].join(' ').toLowerCase();
      if (text.includes(q)) results.push({ label: e.name || 'Unnamed', sub: t ? t.singular : 'Entry', color: t?.color, go: () => go(pbase('e/' + e.id)), rank: (e.name || '').toLowerCase().includes(q) ? 0 : 2 });
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
    actsOn(p) ? h('button', { class: 'btn btn--sm', type: 'button', onclick: addAct }, icon('plus'), ` ${p.labels.act}`) : null,
    h('button', { class: 'btn btn--sm', type: 'button', onclick: () => addColumn() }, icon('plus'), ` ${p.labels.column}`),
    h('button', { class: 'btn btn--sm', type: 'button', onclick: addRow }, icon('plus'), ` ${p.labels.row}`));

  const useActs = actsOn(p);
  // A slot is one grid column: a real column, or the placeholder of an empty act.
  const slots = useActs
    ? p.acts.flatMap((a) => { const cs = p.columns.filter((c) => c.actId === a.id); return cs.length ? cs.map((c) => ({ c })) : [{ act: a }]; })
    : p.columns.map((c) => ({ c }));
  const grid = h('div', { class: 'grid' + (S.compact ? ' is-compact' : '') + (useActs ? ' has-acts' : ''), style: { '--cols': slots.length } });
  if (useActs) {
    grid.append(h('div', { class: 'grid__actcorner' }));
    p.acts.forEach((a, i) => grid.append(actHeader(p, a, i)));
    grid.append(h('button', { class: 'grid__addact', type: 'button', onclick: addAct, title: `Add ${lower(p.labels.act)}`, 'aria-label': `Add ${lower(p.labels.act)}` }, icon('plus')));
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
  return [toolbar, empty, h('div', { class: 'grid-scroll' }, grid)];
}

function colHeader(p, c, i) {
  const n = p.cards.filter((k) => k.colId === c.id).length;
  const el = h('div', { class: 'colhead' + (c.canon ? ' is-canon' : ''), role: 'button', tabindex: '0', title: `Edit ${lower(p.labels.column)} (drag to move)`,
    onclick: () => editColumn(c.id), onkeydown: (e) => { if (e.key === 'Enter') editColumn(c.id); } },
  icon('grip', 'grip'),
  h('span', { class: 'colhead__num' }, numeral(p, i)),
  h('span', { class: 'colhead__text' },
    h('span', { class: 'colhead__title' + (c.title ? '' : ' muted') }, c.title || `${p.labels.column} ${numeral(p, i)}`),
    h('span', { class: 'colhead__meta' },
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
  const el = h('div', { class: 'rowhead', role: 'button', tabindex: '0', style: { '--c': r.color }, title: `Edit ${lower(p.labels.row)} (drag to move)`,
    onclick: () => editRow(r.id), onkeydown: (e) => { if (e.key === 'Enter') editRow(r.id); } },
  icon('grip', 'grip'),
  h('span', { class: 'rowhead__text' },
    h('span', { class: 'rowhead__title' }, r.title || 'Untitled'),
    h('span', { class: 'rowhead__meta' }, plural(n, 'card')),
    (() => { const w = wordsOf(p.cards.filter((k) => k.rowId === r.id)); return w ? h('span', { class: 'words rowhead__words' }, `${fmtN(w)} words`) : null; })()));
  dragSource(el, 'row', r.id);
  dropTarget(el, { row: 'y' }, (it, after) => moveRow(it.id, r.id, after));
  return el;
}

function cell(p, c, r) {
  const cards = p.cards.filter((k) => k.colId === c.id && k.rowId === r.id);
  const el = h('div', { class: 'cell' + (c.canon ? ' is-canon' : ''), dataset: { col: c.id, row: r.id } },
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
  const dim = (S.highlight && !k.entityIds.includes(S.highlight)) || (S.statusFilter && k.status !== S.statusFilter);
  const hit = !dim && (S.highlight || S.statusFilter);
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
  },
  h('div', { class: 'card__top' },
    h('h3', { class: 'card__title' + (k.title ? '' : ' muted') }, k.title || 'Untitled scene'),
    h('span', { class: 'card__status', title: st[1] }, STATUS_SHORT[k.status] || st[1])),
  !S.compact && k.summary ? h('p', { class: 'card__sum' }, k.summary) : null,
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

function addColumn(actId) {
  const p = P();
  const act = actsOn(p) ? (actId || p.acts[p.acts.length - 1].id) : undefined;
  change((p) => {
    p.columns.push({ id: uid(), actId: act, title: '', teaser: '', recap: '', notes: '', date: '', canon: false });
    syncActs(p);
  });
  if (!actId) requestAnimationFrame(() => { const s = document.querySelector('.grid-scroll'); if (s) s.scrollLeft = s.scrollWidth; });
}

function addAct() {
  const id = uid();
  change((p) => {
    p.acts.push({ id, title: '', notes: '' });
    p.columns.push({ id: uid(), actId: id, title: '', teaser: '', recap: '', notes: '', date: '', canon: false });
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
    p.cards.splice(last + 1, 0, { id, colId, rowId, title: '', summary: '', notes: '', status: 'idea', entityIds: [], setup: false, payoffId: null, fields: {}, links: [], when: null });
  }, { render: false });
  editCard(id, true);
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
    wordsBox(p, k, upd),
    gameOn() ? gameBox(p, k, upd) : null,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Setup & payoff'), setupBox),
    isSeries() ? timelineFields(p, k, upd, () => d) : null,
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
    const label = `${otherBook(b) ? b.title + ' · ' : ''}${b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}`;
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
      h('div', { class: 'tlf__head' }, icon('timeline', 'ico--accent'), h('strong', {}, 'On the series timeline')),
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
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Linked scenes'),
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
      text('One-line teaser', 'teaser', 'Shown on the home page and in link previews'),
      text('Previously…', 'recap', 'A short recap for returning readers', true),
      text('Planning notes', 'notes', 'Goals for this part, the cliffhanger, what must be true by the end', true),
      goalField('Word goal', () => c().wordGoal, (v) => upd((c) => { c.wordGoal = v; }), `So far: ${fmtN(wordsOf(p.cards.filter((k) => k.colId === id)))} words`),
      h('div', { class: 'row2' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Publish date'),
          h('input', { class: 'input', type: 'date', value: c().date || '', onchange: (e) => upd((c) => { c.date = e.target.value; }) })),
        h('label', { class: 'check check--box' },
          h('input', { type: 'checkbox', checked: !!c().canon, onchange: (e) => upd((c) => { c.canon = e.target.checked; }) }),
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
  const e = { id: uid(), typeId, name, summary: '', fields: {}, notes: '' };
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

function worldSide(p, current) {
  return h('nav', { class: 'side', 'aria-label': 'Entry types' },
    h('div', { class: 'side__label' }, 'World'),
    p.types.map((t) => h('a', { class: 'side__item' + (current === t.id ? ' is-on' : ''), href: phref('world/' + t.id), style: { '--c': t.color } },
      h('span', { class: 'dot' }), h('span', { class: 'side__name' }, t.name),
      h('span', { class: 'side__count' }, String(p.entities.filter((e) => e.typeId === t.id).length)))),
    h('a', { class: 'side__item side__item--edit', href: phref('project') + '#types' }, icon('gear'), h('span', {}, 'Edit types & fields')));
}

function viewWorld(p, typeId) {
  const t = p.types.find((x) => x.id === typeId) || p.types[0];
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
    (t?.fields || []).map((f) => fieldInput(p, f, () => e.fields[f.id], (v) => upd((e) => { e.fields[f.id] = v; }))),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Notes'),
      autosize(h('textarea', { class: 'input', rows: 4, value: e.notes, placeholder: 'Everything else', oninput: (ev) => upd((e) => { e.notes = ev.target.value; }) }))));

  const aside = h('aside', { class: 'entity__aside' },
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

  return h('div', { class: 'world' }, worldSide(p, e.typeId),
    h('section', { class: 'world__main entity', style: { '--c': t?.color } },
      h('div', { class: 'entity__bar' },
        h('a', { class: 'back', href: phref('world/' + (t?.id || '')) }, icon('back'), t?.name || 'World'),
        h('span', { class: 'spacer' }),
        gameOn() ? h('div', { class: 'tl-seg', role: 'group', 'aria-label': 'Entry view' },
          h('button', { class: 'tl-seg__btn' + (S.entityView !== 'sheet' ? ' is-on' : ''), type: 'button', 'aria-pressed': String(S.entityView !== 'sheet'), onclick: () => { S.entityView = 'profile'; render(); } }, 'Profile'),
          h('button', { class: 'tl-seg__btn' + (S.entityView === 'sheet' ? ' is-on' : ''), type: 'button', 'aria-pressed': String(S.entityView === 'sheet'), onclick: () => { S.entityView = 'sheet'; render(); } }, icon('spark'), ' Game sheet')) : null,
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
      gameOn() && S.entityView === 'sheet' ? viewSheet(p, e) : h('div', { class: 'entity__cols' }, form, aside)));
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
      return { b, c, i, order: bi * 10000 + i, label: `${isSeries() ? b.title + ' · ' : ''}${b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}` };
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
    const ci = (id) => b.columns.findIndex((c) => c.id === id);
    const ri = (id) => b.rows.findIndex((r) => r.id === id);
    b.cards.map((k, i) => ({ k, i })).sort((x, y) => ci(x.k.colId) - ci(y.k.colId) || ri(x.k.rowId) - ri(y.k.rowId) || x.i - y.i)
      .forEach(({ k }, n) => {
        const col = b.columns.find((c) => c.id === k.colId);
        const stage = col && col.canon ? 'pub' : ['drafted', 'editing', 'final'].includes(k.status) ? 'written' : 'plan';
        const w = k.when;
        const slot = w && w.y < Y && w.p < PN ? w.y * PN + w.p : null;
        items.push({ k, b, n, stage, slot, x: null });
      });
  }
  const byId = new Map(items.map((it) => [it.k.id, it]));

  // Horizontal layout
  let TW = 0;
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
      toggle('books', 'Books'), usedTypes.map((t) => toggle(t.id, t.name)), toggle('threads', 'Threads')),
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
    const tip = `${it.b.title} · ${ci.b.labels.column} ${ci.num} · ${it.k.title || 'Untitled scene'}` + (w && order === 'world' ? ` · ${cal.years[w.y]}, ${cal.parts[w.p]}${w.day ? ' (' + w.day + ')' : ''}` : '') + ` · ${STAGE_LABEL[it.stage]}`;
    return h('button', { class: `tl-chip tl-chip--${it.stage}` + (hit(it) ? '' : ' is-dim'), type: 'button', title: tip,
      style: { left: it.x - 9 + 'px', top: it.top + 'px', '--c': c }, onclick: () => openCard(it.k.id) },
    h('span', { class: 'tl-chip__dot st-' + it.k.status }),
    h('span', { class: 'tl-chip__t' }, it.k.title || 'Untitled scene'),
    gameOn() && (it.k.game || []).length ? icon('spark', 'tl-chip__ico') : null,
    ((it.k.links || []).length || items.some((o) => (o.k.links || []).some((l) => l.id === it.k.id))) && order !== 'world' ? icon('link', 'tl-chip__ico') : null);
  };

  const parts = [gridLayer, ruler];

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
  return books.flatMap((b) => {
    const ci = (id) => b.columns.findIndex((c) => c.id === id);
    const ri = (id) => b.rows.findIndex((r) => r.id === id);
    return b.cards.map((k, i) => ({ k, i })).sort((x, y) => ci(x.k.colId) - ci(y.k.colId) || ri(x.k.rowId) - ri(y.k.rowId) || x.i - y.i).map(({ k }) => ({ k, b }));
  });
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
        upd((cc) => { cc.game.push(ev); }); draw();
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

boot();
