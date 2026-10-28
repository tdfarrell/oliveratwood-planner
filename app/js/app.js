import { h, append, clear, icon, openDialog, choose, confirmDanger, ask, toast, autosize } from './dom.js';
import { TEMPLATES, PALETTE, FIELD_TYPES, STATUSES, STATUS_SHORT, uid, slugify, numeral, roman, normalize, valueText, actsOn, syncActs } from './model.js';
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
  drag: null, dragItem: null, route: { view: 'home' },
  names: { kind: 'person', style: {}, gender: 'any', flavor: 'soft', start: '' },
};

// ======================================================================
// Small lookups
// ======================================================================

const P = () => S.project;
const entity = (id) => P().entities.find((e) => e.id === id);
const typeOf = (e) => e && P().types.find((t) => t.id === e.typeId);
const colIndex = (id) => P().columns.findIndex((c) => c.id === id);
const lower = (s) => (s.length > 1 && s === s.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const colName = (p, c) => `${p.labels.column} ${numeral(p, colIndex(c.id))}`;

function cardLabel(p, k) {
  const i = colIndex(k.colId);
  return `${i >= 0 ? numeral(p, i) : '?'} · ${k.title || 'Untitled scene'}`;
}
function appearances(p, id) {
  return p.cards.filter((k) => k.entityIds.includes(id))
    .sort((a, b) => colIndex(a.colId) - colIndex(b.colId));
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
  fn(S.project);
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
      S.project = normalize(r.data);
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
  if (parts[0] !== 'p' || !parts[1]) return { view: 'home' };
  return { view: 'project', slug: parts[1], tab: parts[2] || 'grid', id: parts[3] || null };
}
const go = (path) => { location.hash = '#/' + path; };
const href = (path) => '#/' + path;
const phref = (tail = '') => href(`p/${encodeURIComponent(S.slug)}${tail ? '/' + tail : ''}`);

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
  let data = normalize(r.data);
  let dirty = false;
  const local = unsaved.get(scope(), slug);
  if (local && local.dirty && local.data) {
    if (local.baseRev === r.sha) {
      data = normalize(local.data); dirty = true;
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
      if (keep) { data = normalize(local.data); dirty = true; }
      else unsaved.clear(scope(), slug);
    }
  }
  S.slug = slug; S.project = data; S.rev = r.sha; S.dirty = dirty;
  S.highlight = ''; S.statusFilter = ''; S.worldFilter = '';
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
      h('h1', { class: 'display display--xl' }, 'Your projects'),
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
          d.close(); go('p/' + x.slug);
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
  document.title = `${p.title} · Planner`;
  const tab = S.route.tab;
  const tabs = [
    ['grid', 'Grid', 'grid'],
    ['world', 'World', 'globe'],
    ['continuity', 'Continuity', 'link'],
    ['project', 'Project', 'gear'],
  ];
  const activeTab = tab === 'e' ? 'world' : tab;

  let main;
  if (tab === 'world') main = viewWorld(p, S.route.id);
  else if (tab === 'e') main = viewEntity(p, S.route.id);
  else if (tab === 'continuity') main = viewContinuity(p);
  else if (tab === 'project') main = viewProject(p);
  else main = viewGrid(p);

  const shell = h('div', { class: 'page' + (activeTab === 'grid' ? ' page--grid' : '') },
    h('header', { class: 'top' },
      brand(),
      h('a', { class: 'top__project', href: phref() }, p.title),
      h('nav', { class: 'tabs', 'aria-label': 'Views' }, tabs.map(([id, label, ic]) =>
        h('a', { class: 'tab' + (activeTab === id ? ' is-on' : ''), href: phref(id === 'grid' ? '' : id), 'aria-current': activeTab === id ? 'page' : null },
          icon(ic), h('span', {}, label)))),
      h('div', { class: 'top__right' }, searchBox(p),
        h('button', { class: 'iconbtn', type: 'button', title: 'Name generator', 'aria-label': 'Name generator', onclick: () => nameDialog({ kind: S.route.tab === 'world' || S.route.tab === 'e' ? kindForType((p.types.find((t) => t.id === S.route.id) || typeOf(entity(S.route.id)) || {}).name) : undefined, createType: S.route.tab === 'world' ? S.route.id : null }) }, icon('dice')),
        h('span', { id: 'save-status', class: 'status', 'aria-live': 'polite' }))),
    h('main', { class: 'main main--' + activeTab }, main));
  clear(root).append(shell);
  setStatus(S.status, S.statusMsg);
}

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
      if (text.includes(q)) results.push({ label: e.name || 'Unnamed', sub: t ? t.singular : 'Entry', color: t?.color, go: () => go(`p/${S.slug}/e/${e.id}`), rank: (e.name || '').toLowerCase().includes(q) ? 0 : 2 });
    }
    for (const k of p.cards) {
      const text = [k.title, k.summary, k.notes, ...p.cardFields.map((f) => valueText(p, f, k.fields[f.id]))].join(' ').toLowerCase();
      if (text.includes(q)) results.push({ label: k.title || 'Untitled scene', sub: cardLabel(p, k).split(' · ')[0] + ' · ' + (p.rows.find((r) => r.id === k.rowId)?.title || ''), color: p.rows.find((r) => r.id === k.rowId)?.color, go: () => editCard(k.id), rank: (k.title || '').toLowerCase().includes(q) ? 1 : 3 });
    }
    p.columns.forEach((c) => {
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
    h('span', { class: 'rowhead__meta' }, plural(n, 'card'))));
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
  const payoffOf = p.cards.find((x) => x.payoffId === k.id);
  const payoff = k.setup && k.payoffId ? p.cards.find((x) => x.id === k.payoffId) : null;
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
  (k.setup || payoffOf) ? h('div', { class: 'card__flags' },
    k.setup ? h('span', { class: 'flag' + (payoff ? '' : ' flag--open') }, icon('flag'),
      payoff ? `Pays off in ${numeral(p, colIndex(payoff.colId))}` : 'Setup, not paid off') : null,
    payoffOf ? h('span', { class: 'flag flag--done' }, icon('check'), `Payoff from ${numeral(p, colIndex(payoffOf.colId))}`) : null) : null,
  !S.compact && ents.length ? h('div', { class: 'card__chips' },
    ents.slice(0, 6).map((e) => h('span', { class: 'chip chip--sm', style: { '--c': typeOf(e)?.color } }, e.name || 'Unnamed')),
    ents.length > 6 ? h('span', { class: 'chip chip--sm chip--more' }, `+${ents.length - 6}`) : null) : null);
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
    p.cards.splice(last + 1, 0, { id, colId, rowId, title: '', summary: '', notes: '', status: 'idea', entityIds: [], setup: false, payoffId: null, fields: {} });
  }, { render: false });
  editCard(id, true);
}

// ---------- Card dialog ----------

function editCard(id, isNew = false) {
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
    const paysOff = p.cards.filter((x) => x.payoffId === c.id);
    append(setupBox, [
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!c.setup, onchange: (e) => { upd((c) => { c.setup = e.target.checked; if (!c.setup) c.payoffId = null; }); drawSetup(); } }),
        ' Plants a setup that has to pay off later'),
      c.setup ? h('label', { class: 'field field--inline' }, h('span', { class: 'field__label' }, 'Pays off in'),
        cardSelect(p, c.payoffId, c.id, (v) => upd((c) => { c.payoffId = v || null; }))) : null,
      paysOff.map((s) => h('p', { class: 'note' }, icon('check'), 'Pays off the setup in ',
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { d.close(); editCard(s.id); } }, cardLabel(p, s)))),
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
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Setup & payoff'), setupBox),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Notes'),
      autosize(h('textarea', { class: 'input', rows: 2, value: k().notes, placeholder: 'Anything else: lines of dialogue, research, doubts', oninput: (e) => upd((c) => { c.notes = e.target.value; }) }))),
    h('details', { class: 'more' }, h('summary', {}, 'Move'),
      h('div', { class: 'row2' }, moveCol, moveRow)),
  ];

  const d = openDialog({
    title: `${col ? colName(p, col) : ''} · ${row ? row.title : ''}`,
    body, wide: true,
    actions: [
      h('button', { class: 'btn btn--ghost btn--danger', type: 'button', onclick: async () => {
        d.close();
        if (await confirmDanger('Delete this card?', `“${k()?.title || 'Untitled scene'}” will be removed. You can get it back from the project’s backups.`)) {
          change((p) => { p.cards = p.cards.filter((x) => x.id !== id); p.cards.forEach((x) => { if (x.payoffId === id) x.payoffId = null; }); });
        }
      } }, icon('trash'), ' Delete'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.close() }, 'Done'),
    ],
    onClose: () => {
      const c = k();
      if (isNew && c && !c.title.trim() && !c.summary.trim() && !c.notes.trim() && !c.entityIds.length) {
        change((p) => { p.cards = p.cards.filter((x) => x.id !== id); });
      } else if (S.route.view === 'project') render();
    },
  });
}

function cardSelect(p, value, selfId, onChange) {
  return h('select', { class: 'input', onchange: (e) => onChange(e.target.value) },
    h('option', { value: '' }, 'Not yet (still open)'),
    p.columns.map((c, i) => {
      const cards = p.cards.filter((x) => x.colId === c.id && x.id !== selfId);
      return cards.length ? h('optgroup', { label: `${p.labels.column} ${numeral(p, i)}${c.title ? ': ' + c.title : ''}` },
        cards.map((x) => h('option', { value: x.id, selected: x.id === value }, x.title || 'Untitled scene'))) : null;
    }));
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
        p.columns.map((c, ci) => h('option', { value: c.id, selected: r.colId === c.id }, `Revealed in ${numeral(p, ci)}`))),
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
    go(`p/${S.slug}/e/${e.id}`);
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
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => { const e = newEntity(t.id); go(`p/${S.slug}/e/${e.id}`); } }, icon('plus'), ` New ${lower(t.singular)}`)),
      all.length ? grid : h('p', { class: 'muted' }, `No ${lower(t.name)} yet. Add one here, or type a new name into “In this scene” on any card.`)));
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
      const r = p.rows.find((x) => x.id === k.rowId);
      return h('li', {}, h('button', { class: 'app', type: 'button', style: { '--c': r?.color }, onclick: () => editCard(k.id) },
        h('span', { class: 'app__num' }, numeral(p, colIndex(k.colId))),
        h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, k.title || 'Untitled scene'), h('span', { class: 'app__sub' }, r?.title || ''))));
    })) : h('p', { class: 'muted small' }, 'Not in any scene yet. Link it from a card’s “In this scene”.'),
    linkedFrom.length ? [h('h2', { class: 'aside__title' }, 'Linked from'),
      h('ul', { class: 'apps' }, linkedFrom.map((l) => h('li', {}, h('a', { class: 'app', href: phref('e/' + l.e.id), style: { '--c': l.color } },
        h('span', { class: 'app__text' }, h('span', { class: 'app__title' }, l.e.name || 'Unnamed'), h('span', { class: 'app__sub' }, l.field))))))] : null);

  return h('div', { class: 'world' }, worldSide(p, e.typeId),
    h('section', { class: 'world__main entity', style: { '--c': t?.color } },
      h('div', { class: 'entity__bar' },
        h('a', { class: 'back', href: phref('world/' + (t?.id || '')) }, icon('back'), t?.name || 'World'),
        h('span', { class: 'spacer' }), typeSel,
        h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: async () => {
          if (await confirmDanger(`Delete ${e.name || 'this entry'}?`, apps.length || linkedFrom.length ? 'It will also be unlinked from every card and entry that mentions it.' : 'It isn’t linked anywhere.')) {
            const back = 'p/' + S.slug + '/world/' + (t?.id || '');
            change((p) => {
              p.entities = p.entities.filter((x) => x.id !== id);
              for (const k of p.cards) k.entityIds = k.entityIds.filter((x) => x !== id);
              for (const o of p.entities) for (const [fid, v] of Object.entries(o.fields)) if (Array.isArray(v)) o.fields[fid] = v.filter((x) => x !== id);
              for (const k of p.cards) for (const [fid, v] of Object.entries(k.fields)) if (Array.isArray(v)) k.fields[fid] = v.filter((x) => x !== id);
            }, { render: false });
            go(back);
          }
        } }, icon('trash'), ' Delete')),
      h('div', { class: 'entity__cols' }, form, aside)));
}

// ======================================================================
// Continuity
// ======================================================================

function viewContinuity(p) {
  const open = p.cards.filter((k) => k.setup && !k.payoffId).sort((a, b) => colIndex(a.colId) - colIndex(b.colId));
  const pairs = p.cards.filter((k) => k.setup && k.payoffId).map((k) => ({ s: k, o: p.cards.find((x) => x.id === k.payoffId) })).filter((x) => x.o);
  const ledgers = [];
  for (const e of p.entities) {
    const t = typeOf(e);
    for (const f of t?.fields || []) {
      if (f.type !== 'ledger') continue;
      for (const r of e.fields[f.id] || []) if ((r.text || '').trim()) ledgers.push({ e, t, f, r });
    }
  }
  const unused = p.entities.filter((e) => !appearances(p, e.id).length);
  const loose = p.cards.filter((k) => p.columns.find((c) => c.id === k.colId)?.canon && ['idea', 'outlined', 'drafting'].includes(k.status));

  const cardBtn = (k) => h('button', { class: 'linkbtn', type: 'button', onclick: () => editCard(k.id) }, cardLabel(p, k));
  const section = (title, blurb, count, content) => h('section', { class: 'cont' },
    h('h2', { class: 'cont__title' }, title, h('span', { class: 'cont__count' }, String(count))),
    h('p', { class: 'muted small' }, blurb), content);

  const byCol = [...p.columns.map((c) => ({ c, items: ledgers.filter((l) => l.r.colId === c.id) })), { c: null, items: ledgers.filter((l) => !l.r.colId || colIndex(l.r.colId) < 0) }]
    .filter((g) => g.items.length);

  return h('div', { class: 'wrap cont-wrap' },
    h('h1', { class: 'display' }, 'Continuity'),
    h('p', { class: 'muted lede' }, 'Promises you’ve made to readers, and whether you’ve kept them.'),
    section('Open setups', 'Cards marked as a setup with no payoff chosen yet.', open.length,
      open.length ? h('ul', { class: 'clist' }, open.map((k) => h('li', {}, icon('flag', 'ico--accent'), cardBtn(k)))) : h('p', { class: 'ok' }, icon('check'), ' Every setup has a payoff.')),
    section('Setups & payoffs', 'Each setup and where it pays off.', pairs.length,
      pairs.length ? h('ul', { class: 'clist' }, pairs.map(({ s, o }) => {
        const bad = colIndex(o.colId) < colIndex(s.colId);
        return h('li', { class: bad ? 'is-warn' : '' }, cardBtn(s), h('span', { class: 'arrow' }, ' → '), cardBtn(o),
          bad ? h('span', { class: 'warn' }, icon('alert'), ' Pays off before it’s set up') : null);
      })) : h('p', { class: 'muted small' }, 'None yet. Tick “Plants a setup” on a card to track it.')),
    section('Rules & facts, in the order readers learn them', 'Collected from every rules/facts ledger in your world (magic systems, lore…).', ledgers.length,
      byCol.length ? h('div', { class: 'timeline' }, byCol.map((g) => h('div', { class: 'timeline__group' },
        h('h3', { class: 'timeline__head' }, g.c ? `${p.labels.column} ${numeral(p, colIndex(g.c.id))}${g.c.title ? ': ' + g.c.title : ''}` : 'Not revealed yet',
          g.c?.canon ? h('span', { class: 'pill pill--canon' }, icon('lock'), 'Published') : null),
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

  const view = h('div', { class: 'wrap project' },
    h('h1', { class: 'display' }, 'Project'),
    sec('basics', 'Basics', null,
      text('Title', () => p.title, (v) => { p.title = v; }),
      text('Synopsis', () => p.synopsis, (v) => { p.synopsis = v; }, { long: true }),
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
    sec('notebook', 'Notebook', 'A scratchpad for the whole project: themes, the ending you’re aiming for, questions to answer.',
      autosize(h('textarea', { class: 'input notebook', rows: 6, value: p.notes, 'aria-label': 'Notebook', oninput: (e) => upd(() => { p.notes = e.target.value; }) }))),
    sec('types', 'Entry types', 'The kinds of things in this world, and the fields each one has. Changes apply to every entry of that type.', typesWrap),
    sec('cardfields', 'Extra card fields', 'Fields every scene card gets, on top of title, summary, status and links.',
      fieldsEditor(p, p.cardFields)),
    sec('backups', 'Backups & files', DEMO ? 'Demo mode keeps no backups.' : 'The server keeps your last 40 saves, plus the first save of each day for four months.',
      h('div', { class: 'btnrow' },
        DEMO ? null : h('button', { class: 'btn', type: 'button', onclick: backupsDialog }, 'Browse backups'),
        h('button', { class: 'btn', type: 'button', onclick: () => download(`${S.slug}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(p, null, 1)) }, icon('download'), ' Download a copy'),
        h('label', { class: 'btn' }, 'Replace from a file…', h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: importFile })))),
    sec('danger', 'Delete', null,
      h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
        if (!(await confirmDanger(`Delete “${p.title}”?`, 'It disappears from your projects. You can bring it back from “Restore a deleted project” on the home screen.'))) return;
        try { await saveNow(); await store.remove(S.slug); unsaved.clear(scope(), S.slug); S.project = null; S.slug = null; go(''); }
        catch (e) { toast(e.message); }
      } }, icon('trash'), ' Delete project')));

  if (location.hash.endsWith('#types')) requestAnimationFrame(() => document.getElementById('types')?.scrollIntoView());
  return view;
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
          for (const k of p.cards) k.entityIds = k.entityIds.filter((x) => !gone.has(x));
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
  if (navigate) go(`p/${S.slug}/world/${t.id}`);
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
            S.project = normalize(data);
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
    const data = normalize(JSON.parse(await file.text()));
    if (!(await confirmDanger('Replace this project?', `Everything here will be replaced with “${data.title}” from ${file.name}. The current version is kept in backups.`, 'Replace'))) return;
    S.project = data;
    change(() => {});
    toast('Replaced from ' + file.name);
  } catch { toast('That file isn’t a planner project.'); }
}

boot();
