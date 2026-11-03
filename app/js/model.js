// Project data: shape, helpers and starting templates.

export const SCHEMA = 1;

export const PALETTE = [
  '#C9531A', // site orange
  '#2F6F7E', // teal
  '#7A5C9E', // violet
  '#3E7D4F', // green
  '#B8862B', // ochre
  '#A8344E', // wine
  '#4B6584', // slate blue
  '#00A3A6', // cyan
  '#8A6A4F', // walnut
  '#5F6B73', // graphite
];

export const FIELD_TYPES = [
  ['text', 'Short text'],
  ['longtext', 'Paragraph'],
  ['number', 'Number'],
  ['select', 'Choice'],
  ['tags', 'Tags'],
  ['link', 'Links to entries'],
  ['ledger', 'Rules / facts ledger'],
];

export const STATUSES = [
  ['idea', 'Idea'],
  ['outlined', 'Outlined'],
  ['drafting', 'In progress (Draft)'],
  ['drafted', 'Drafted'],
  ['editing', 'In progress (Editing)'],
  ['final', 'Final'],
];
// Short labels for the cards on the grid.
export const STATUS_SHORT = { idea: 'Idea', outlined: 'Outlined', drafting: 'Drafting', drafted: 'Drafted', editing: 'Editing', final: 'Final' };

export function uid() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
}

export function roman(n) {
  if (n <= 0 || n >= 4000) return String(n);
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

export function numeral(project, index) {
  return project.labels.numerals === 'arabic' ? String(index + 1) : roman(index + 1);
}

const f = (name, type, extra = {}) => ({ id: uid(), name, type, ...extra });

function type(name, singular, color, fields) {
  return { id: uid(), name, singular, color, fields };
}

function baseProject(title) {
  return {
    schema: SCHEMA,
    title,
    synopsis: '',
    storySlug: slugify(title),
    created: new Date().toISOString(),
    labels: { column: 'Part', row: 'Thread', numerals: 'roman' },
    columns: [],
    rows: [],
    cards: [],
    cardFields: [],
    acts: [],
    types: [],
    entities: [],
    notes: '',
    nameBank: [],
  };
}

function worldTypes() {
  const characters = type('Characters', 'Character', PALETTE[0], []);
  const places = type('Places', 'Place', PALETTE[1], []);
  const factions = type('Factions', 'Faction', PALETTE[2], []);
  const magic = type('Magic & Systems', 'System', PALETTE[3], []);
  const lore = type('Lore & History', 'Lore entry', PALETTE[4], []);
  const items = type('Objects', 'Object', PALETTE[6], []);

  characters.fields = [
    f('Role', 'select', { options: ['Protagonist', 'Antagonist', 'Supporting', 'Minor'] }),
    f('Wants', 'text', { hint: 'What they’re chasing' }),
    f('Needs', 'text', { hint: 'What they actually need (often what they resist)' }),
    f('Wound / secret', 'longtext'),
    f('Voice', 'longtext', { hint: 'How they talk: rhythm, words they use, words they never would' }),
    f('Appearance', 'longtext'),
    f('Arc', 'longtext', { hint: 'Where they start → where they end' }),
    f('Relationships', 'link', { linkType: null }),
    f('Belongs to', 'link', { linkType: factions.id }),
  ];
  places.fields = [
    f('Kind', 'text', { hint: 'City, room, ship, planet…' }),
    f('Description', 'longtext'),
    f('Senses', 'longtext', { hint: 'What it smells, sounds, feels like' }),
    f('Inside / part of', 'link', { linkType: places.id }),
    f('Controlled by', 'link', { linkType: factions.id }),
  ];
  factions.fields = [
    f('Goal', 'text'),
    f('Leader', 'link', { linkType: characters.id }),
    f('Members', 'link', { linkType: characters.id }),
    f('Base', 'link', { linkType: places.id }),
    f('Beliefs & methods', 'longtext'),
  ];
  magic.fields = [
    f('Source', 'text', { hint: 'Where the power comes from' }),
    f('Cost', 'longtext', { hint: 'What it takes from the user. The cost is what makes it interesting.' }),
    f('Limits', 'longtext', { hint: 'What it can’t do, ever' }),
    f('Who can use it', 'link', { linkType: characters.id }),
    f('Hard or soft', 'select', { options: ['Hard (explained rules)', 'Soft (mysterious)', 'In between'] }),
    f('Rules', 'ledger', { hint: 'Each rule, and the part where readers first learn it' }),
  ];
  lore.fields = [
    f('Era / when', 'text'),
    f('What happened', 'longtext'),
    f('Who knows the truth', 'link', { linkType: characters.id }),
    f('Established facts', 'ledger'),
  ];
  items.fields = [
    f('Description', 'longtext'),
    f('Owner', 'link', { linkType: characters.id }),
    f('What it can do', 'longtext'),
  ];
  return [characters, places, factions, magic, lore, items];
}

export const TEMPLATES = {
  serial: {
    label: 'Serial',
    blurb: 'Parts across the top, plot threads down the side, and a full world bible.',
    make(title) {
      const p = baseProject(title);
      p.columns = [1, 2, 3].map(() => ({ id: uid(), title: '', teaser: '', recap: '', notes: '', date: '', canon: false }));
      p.rows = [
        { id: uid(), title: 'Main plot', color: PALETTE[0] },
        { id: uid(), title: 'Subplot', color: PALETTE[1] },
        { id: uid(), title: 'Mystery & clues', color: PALETTE[2] },
      ];
      p.cardFields = [f('Where / when', 'text')];
      p.types = worldTypes();
      return p;
    },
  },
  novel: {
    label: 'Novel',
    blurb: 'Chapters across the top, POV characters down the side.',
    make(title) {
      const p = baseProject(title);
      p.labels = { column: 'Chapter', row: 'POV', numerals: 'arabic', act: 'Act', useActs: true };
      p.acts = [{ id: uid(), title: 'Setup', notes: '' }, { id: uid(), title: 'Confrontation', notes: '' }, { id: uid(), title: 'Resolution', notes: '' }];
      p.columns = [0, 0, 1, 1, 2].map((a) => ({ id: uid(), actId: p.acts[a].id, title: '', teaser: '', recap: '', notes: '', date: '', canon: false }));
      p.rows = [
        { id: uid(), title: 'Protagonist', color: PALETTE[0] },
        { id: uid(), title: 'Second POV', color: PALETTE[1] },
      ];
      p.cardFields = [f('Where / when', 'text'), f('Beat', 'select', { options: ['Setup', 'Inciting incident', 'Rising action', 'Midpoint', 'Crisis', 'Climax', 'Resolution'] })];
      p.types = worldTypes();
      return p;
    },
  },
  short: {
    label: 'Short story',
    blurb: 'Three acts, a few beats, characters and places only.',
    make(title) {
      const p = baseProject(title);
      p.labels = { column: 'Act', row: 'Track', numerals: 'roman' };
      p.columns = [1, 2, 3].map(() => ({ id: uid(), title: '', teaser: '', recap: '', notes: '', date: '', canon: false }));
      p.rows = [
        { id: uid(), title: 'Story', color: PALETTE[0] },
        { id: uid(), title: 'Emotion', color: PALETTE[2] },
      ];
      p.types = worldTypes().slice(0, 2);
      p.types[0].fields = p.types[0].fields.filter((x) => x.type !== 'link' || x.name === 'Relationships');
      p.types[1].fields = p.types[1].fields.filter((x) => x.type !== 'link');
      return p;
    },
  },
  blank: {
    label: 'Blank',
    blurb: 'One column, one row, no entry types. Build your own.',
    make(title) {
      const p = baseProject(title);
      p.columns = [{ id: uid(), title: '', teaser: '', recap: '', notes: '', date: '', canon: false }];
      p.rows = [{ id: uid(), title: 'Plot', color: PALETTE[0] }];
      return p;
    },
  },
};

// Fill in anything an older or hand-edited file might be missing.
export function normalize(p) {
  p.schema = p.schema || SCHEMA;
  p.title = p.title || 'Untitled';
  p.synopsis = p.synopsis || '';
  p.storySlug = p.storySlug || slugify(p.title);
  p.labels = Object.assign({ column: 'Part', row: 'Thread', numerals: 'roman', act: 'Act', useActs: false }, p.labels);
  for (const k of ['columns', 'rows', 'cards', 'cardFields', 'types', 'entities', 'acts']) p[k] = Array.isArray(p[k]) ? p[k] : [];
  syncActs(p);
  p.notes = p.notes || '';
  p.nameBank = Array.isArray(p.nameBank) ? p.nameBank : [];
  p.game = normalizeGame(p.game);
  p.flow = normalizeFlow(p.flow);
  normalizeBook(p);
  if (!Object.getOwnPropertyDescriptor(p, 'entities')?.get) normalizeWorld(p);
  for (const c of p.cards) {
    c.entityIds = c.entityIds || [];
    c.fields = c.fields || {};
    c.status = STATUSES.some(([v]) => v === c.status) ? c.status : 'idea';
    c.links = Array.isArray(c.links) ? c.links : [];
    c.when = c.when && Number.isInteger(c.when.y) ? c.when : null;
    c.game = Array.isArray(c.game) ? c.game : [];
    c.beatId = c.beatId || null;
    for (const k of ['reveals', 'rels', 'raises', 'answers', 'flags', 'arcs', 'clips', 'quests']) c[k] = Array.isArray(c[k]) ? c[k] : [];
    c.chk = c.chk && typeof c.chk === 'object' ? c.chk : {};
  }
  for (const e of p.entities) normalizeEntity(e);
  for (const t of p.types) t.fields = t.fields || [];
  return p;
}

// Plain text of any field value, for search.
export function valueText(project, field, v) {
  if (v == null) return '';
  if (field.type === 'link') return (v || []).map((id) => project.entities.find((e) => e.id === id)?.name || '').join(' ');
  if (field.type === 'ledger') return (v || []).map((r) => r.text + ' ' + (r.note || '')).join(' ');
  if (Array.isArray(v)) return v.join(' ');
  return String(v);
}

// ---------- Acts ----------

export const actsOn = (p) => !!(p.labels.useActs && p.acts.length);

// Keeps acts and columns consistent: at least one act when acts are on, every
// column in a real act, and columns ordered act by act (keeping their order
// within each act).
export function syncActs(p) {
  if (!p.labels.useActs) return p;
  if (!p.acts.length) p.acts.push({ id: uid(), title: '', notes: '' });
  const ids = new Set(p.acts.map((a) => a.id));
  let prev = p.acts[0].id;
  for (const c of p.columns) {
    if (!ids.has(c.actId)) c.actId = prev;
    prev = c.actId;
  }
  const order = new Map(p.acts.map((a, i) => [a.id, i]));
  p.columns = p.columns.map((c, i) => [c, i]).sort((x, y) => order.get(x[0].actId) - order.get(y[0].actId) || x[1] - y[1]).map(([c]) => c);
  return p;
}

// ======================================================================
// Series: several books sharing one world
// ======================================================================
//
// A series is one file: { kind: 'series', title, calendar, groups, books,
// types, entities, nameBank, notes }. Each book has the same shape as a
// project's grid (columns, rows, cards, acts, labels…) but no world of its
// own: its types/entities/nameBank are read from and written to the series
// through non-enumerable accessors, so the rest of the app can treat a book
// exactly like a project, and saving the series never duplicates the world.

export const LINE_COLORS = ['#B04A1A', '#2F6F7E', '#6A4C93', '#3E7D4F', '#8A6A1F', '#4B6584', '#A8344E', '#00838A'];

export const LINK_KINDS = [
  ['same', 'Same scene, other POV'],
  ['simul', 'Happens at the same time'],
  ['retold', 'Retold or remembered'],
];

export const WORLD_KEYS = ['types', 'entities', 'nameBank', 'game', 'secrets', 'rels', 'maps', 'questions', 'travel', 'webPos', 'dismissed', 'calendar'];
const BOOK_KEYS = ['title', 'synopsis', 'storySlug', 'labels', 'columns', 'rows', 'cards', 'cardFields', 'acts', 'notes', 'created', 'flow', 'wordGoal',
  'branches', 'passes', 'checklist', 'braid', 'mood', 'clips'];

export function newSeries(title) {
  return {
    kind: 'series', schema: SCHEMA, title, synopsis: '', created: new Date().toISOString(),
    calendar: { years: ['Year 1', 'Year 2', 'Year 3'], parts: ['Spring', 'Summer', 'Autumn', 'Winter'] },
    groups: [{ id: uid(), title: 'Main series', color: LINE_COLORS[0] }],
    books: [], types: worldTypes(), entities: [], nameBank: [], notes: '',
  };
}

function attachBook(series, book) {
  for (const k of WORLD_KEYS) {
    Object.defineProperty(book, k, { get: () => series[k], set: (v) => { series[k] = v; }, enumerable: false, configurable: true });
  }
  return book;
}

// A blank book, laid out like the chosen template.
export function newBook(series, title, template, groupId) {
  const p = (TEMPLATES[template] || TEMPLATES.serial).make(title);
  const book = { id: uid(), groupId };
  for (const k of BOOK_KEYS) book[k] = p[k];
  attachBook(series, book);
  normalize(book);
  series.books.push(book);
  return book;
}

// Moves a standalone project into a series: its entry types are matched to
// the series' by name, its entries are added (duplicates can be merged later),
// and its grid becomes a book.
export function importProject(series, project, groupId) {
  const typeMap = {}, fieldMap = {};
  for (const t of project.types || []) {
    let st = series.types.find((x) => x.name.trim().toLowerCase() === (t.name || '').trim().toLowerCase());
    if (!st) { st = { ...t, fields: [] }; series.types.push(st); }
    typeMap[t.id] = st.id;
    for (const fl of t.fields || []) {
      let sf = st.fields.find((x) => x.name.trim().toLowerCase() === (fl.name || '').trim().toLowerCase() && x.type === fl.type);
      if (!sf) { sf = { ...fl }; st.fields.push(sf); }
      fieldMap[fl.id] = sf.id;
    }
  }
  for (const st of series.types) for (const fl of st.fields) if (fl.linkType && typeMap[fl.linkType]) fl.linkType = typeMap[fl.linkType];
  for (const e of project.entities || []) {
    const fields = {};
    for (const [k, v] of Object.entries(e.fields || {})) fields[fieldMap[k] || k] = v;
    series.entities.push({ ...e, typeId: typeMap[e.typeId] || e.typeId, fields });
  }
  for (const n of project.nameBank || []) if (!series.nameBank.some((x) => x.name === n.name)) series.nameBank.push(n);
  if (project.game && project.game.on && !series.game.on) series.game = normalizeGame(JSON.parse(JSON.stringify(project.game)));
  const book = { id: uid(), groupId };
  for (const k of BOOK_KEYS) if (project[k] !== undefined) book[k] = project[k];
  attachBook(series, book);
  normalize(book);
  series.books.push(book);
  return book;
}

// Entries of the same type with the same name.
export function findDuplicates(series) {
  const groups = new Map();
  for (const e of series.entities) {
    const name = (e.name || '').trim().toLowerCase();
    if (!name) continue;
    const key = e.typeId + '|' + name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

// Folds entry `dropId` into `keepId` everywhere in the series.
export function mergeEntities(series, keepId, dropId) {
  const keep = series.entities.find((e) => e.id === keepId);
  const drop = series.entities.find((e) => e.id === dropId);
  if (!keep || !drop || keep === drop) return;
  for (const [k, v] of Object.entries(drop.fields || {})) {
    const cur = keep.fields[k];
    if (isEmpty(cur)) keep.fields[k] = v;
    else if (Array.isArray(cur) && Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') keep.fields[k] = cur.concat(v.filter((x) => !cur.some((c) => c.id === x.id)));
      else keep.fields[k] = [...new Set(cur.concat(v))];
    } else if (typeof cur === 'string' && typeof v === 'string' && v.trim() && !cur.includes(v.trim())) {
      keep.fields[k] = cur + '\n\n' + v;
    }
  }
  if (!keep.summary && drop.summary) keep.summary = drop.summary;
  if (drop.notes && drop.notes.trim()) keep.notes = keep.notes ? keep.notes + '\n\n' + drop.notes : drop.notes;
  const swap = (arr) => [...new Set(arr.map((x) => (x === dropId ? keepId : x)))].filter((x) => x !== undefined);
  for (const b of series.books) {
    for (const c of b.cards) {
      c.entityIds = swap(c.entityIds);
      for (const [k, v] of Object.entries(c.fields || {})) if (Array.isArray(v) && v.includes(dropId)) c.fields[k] = swap(v);
    }
  }
  for (const e of series.entities) {
    for (const [k, v] of Object.entries(e.fields || {})) if (Array.isArray(v) && v.includes(dropId)) e.fields[k] = swap(v).filter((x) => x !== e.id);
  }
  if (!keep.sheet && drop.sheet) keep.sheet = drop.sheet;
  for (const b of series.books) for (const c of b.cards) for (const ev of c.game || []) if (ev.who === dropId) ev.who = keepId;
  series.entities = series.entities.filter((e) => e.id !== dropId);
}

// Readies a file loaded from storage, project or series.
export function prepare(data) {
  if (!data || data.kind !== 'series') return normalize(data);
  const s = data;
  s.schema = s.schema || SCHEMA;
  s.title = s.title || 'Untitled series';
  s.synopsis = s.synopsis || '';
  s.notes = s.notes || '';
  s.calendar = s.calendar || {};
  s.calendar.years = Array.isArray(s.calendar.years) && s.calendar.years.length ? s.calendar.years : ['Year 1'];
  s.calendar.parts = Array.isArray(s.calendar.parts) && s.calendar.parts.length ? s.calendar.parts : ['—'];
  s.groups = Array.isArray(s.groups) && s.groups.length ? s.groups : [{ id: uid(), title: 'Main series', color: LINE_COLORS[0] }];
  for (const k of ['books', 'types', 'entities', 'nameBank']) s[k] = Array.isArray(s[k]) ? s[k] : [];
  s.game = normalizeGame(s.game);
  s.flow = normalizeFlow(s.flow, true);
  normalizeWorld(s);
  s.mood = Array.isArray(s.mood) ? s.mood : [];
  s.clips = Array.isArray(s.clips) ? s.clips : [];
  for (const t of s.types) t.fields = t.fields || [];
  for (const e of s.entities) normalizeEntity(e);
  for (const b of s.books) {
    if (!s.groups.some((g) => g.id === b.groupId)) b.groupId = s.groups[0].id;
    attachBook(s, b);
    normalize(b);
  }
  // Read-only views across every book, for series-wide screens.
  const flat = (k) => ({ get: () => s.books.flatMap((b) => b[k]), set: () => {}, enumerable: false, configurable: true });
  Object.defineProperty(s, 'cards', flat('cards'));
  Object.defineProperty(s, 'columns', flat('columns'));
  Object.defineProperty(s, 'rows', flat('rows'));
  Object.defineProperty(s, 'cardFields', { get: () => [], set: () => {}, enumerable: false, configurable: true });
  Object.defineProperty(s, 'acts', { get: () => [], set: () => {}, enumerable: false, configurable: true });
  Object.defineProperty(s, 'labels', { get: () => ({ column: 'Part', row: 'Thread', numerals: 'roman', act: 'Act', useActs: false }), set: () => {}, enumerable: false, configurable: true });
  return s;
}

// ======================================================================
// Game sheets (LitRPG)
// ======================================================================
//
// A character's sheet is never stored whole. It is their starting sheet
// (entity.sheet.base) plus every game event on scene cards (card.game), applied
// in reading order. Each scene with events for a character is one "version".

export const DEFAULT_TEMPLATE = {
  identity: ['Gamer tag', 'Class', 'Race'],
  resources: ['HP', 'MP', 'Stamina'],
  stats: ['STR', 'AGI', 'VIT', 'INT', 'WIS', 'LCK'],
  slots: ['Weapon', 'Off-hand', 'Armor', 'Trinket'],
};

export const GAME_EVENTS = [
  ['level', 'Level up'],
  ['stat', 'Stat'],
  ['res', 'HP / MP…'],
  ['skill', 'Skill'],
  ['item', 'Item'],
  ['equip', 'Equip'],
  ['id', 'Class / identity'],
  ['title', 'Title'],
  ['note', 'Note'],
];

export function normalizeGame(g) {
  g = g && typeof g === 'object' ? g : {};
  g.on = !!g.on;
  for (const k of ['items', 'loot', 'quests']) g[k] = Array.isArray(g[k]) ? g[k] : [];
  const msgs = Array.isArray(g.msgs) ? g.msgs : [];
  g.msgs = DEFAULT_MSGS.map(([key, label, tpl]) => msgs.find((m) => m.key === key) || { key, label, tpl }).concat(msgs.filter((m) => !DEFAULT_MSGS.some(([k]) => k === m.key)));
  g.msgStyle = Object.assign({ brackets: '[]', caps: 'first' }, g.msgStyle);
  g.look = g.look === 'planner' ? 'planner' : 'game';
  const t = g.tpl && typeof g.tpl === 'object' ? g.tpl : {};
  g.tpl = {};
  for (const k of Object.keys(DEFAULT_TEMPLATE)) g.tpl[k] = Array.isArray(t[k]) ? t[k] : [...DEFAULT_TEMPLATE[k]];
  return g;
}

export function blankSheet() {
  return { level: 1, xp: '', id: {}, res: {}, stats: {}, slots: {}, skills: [], items: [], titles: [] };
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function applyEvent(sh, e) {
  const n = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
  switch (e.kind) {
    case 'level': if (n(e.value) != null) sh.level = n(e.value); break;
    case 'stat': if (e.key) sh.stats[e.key] = (n(sh.stats[e.key]) || 0) + (n(e.delta) || 0); break;
    case 'res': if (e.key && n(e.value) != null) sh.res[e.key] = n(e.value); break;
    case 'id': if (e.key) sh.id[e.key] = e.value || ''; break;
    case 'equip': if (e.key) sh.slots[e.key] = e.value || ''; break;
    case 'skill': {
      if (!e.name) break;
      const i = sh.skills.findIndex((x) => same(x.name, e.name));
      if (e.op === 'remove') { if (i >= 0) sh.skills.splice(i, 1); break; }
      if (i >= 0) sh.skills[i] = { ...sh.skills[i], rank: e.rank || sh.skills[i].rank, rarity: e.rarity || sh.skills[i].rarity };
      else sh.skills.push({ name: e.name, rank: e.rank || '', rarity: e.rarity || '' });
      break;
    }
    case 'item': case 'title': {
      if (!e.name) break;
      const list = e.kind === 'item' ? sh.items : sh.titles;
      const i = list.findIndex((x) => same(x, e.name));
      if (e.op === 'remove') { if (i >= 0) list.splice(i, 1); } else if (i < 0) list.push(e.name);
      break;
    }
    default: break;
  }
  return sh;
}

// Plain-language summary of one event.
export function describeEvent(e, before) {
  switch (e.kind) {
    case 'level': return `Level ${before ? before.level + ' → ' : ''}${e.value || '?'}`;
    case 'stat': { const d = +e.delta || 0; return `${e.key || 'Stat'} ${d >= 0 ? '+' : ''}${d}`; }
    case 'res': return `${e.key || 'Resource'} → ${e.value || '?'}`;
    case 'id': return `${e.key || 'Identity'}: ${e.value || '—'}`;
    case 'equip': return e.value ? `Equipped ${e.value} (${e.key || 'slot'})` : `Unequipped ${e.key || 'slot'}`;
    case 'skill': return e.op === 'remove' ? `Lost skill ${e.name || '?'}` : `${before && before.skills.some((x) => same(x.name, e.name)) ? 'Skill' : 'Learned'} ${e.name || '?'}${e.rank ? ' · ' + e.rank : ''}${e.rarity ? ' · ' + e.rarity : ''}`;
    case 'item': return `${e.op === 'remove' ? 'Lost' : 'Got'} ${e.name || '?'}`;
    case 'title': return `${e.op === 'remove' ? 'Lost title' : 'Title:'} ${e.name || '?'}`;
    default: return e.text || 'Note';
  }
}

export const cloneSheet = (sh) => JSON.parse(JSON.stringify(sh));

// ======================================================================
// Story flow: beats planned before scenes
// ======================================================================
//
// Each project (and each book) has a flow: logline, theme, ending, and beats.
// A beat has a position through the story (pct 0–100), a tension (0–100) for
// the shape curve, an optional planned part (colId), and in a series, the
// series beat it moves forward (parent). Scene cards point at a beat (beatId).
// A series has its own flow too: the series arc.

const B = (name, pct, tension, hint) => ({ name, pct, tension, hint });
export const STRUCTURES = {
  three: { label: 'Three acts, 9 beats', beats: [
    B('Opening image', 2, 15, 'Show the world before it changes.'),
    B('Inciting incident', 10, 35, 'The event that makes the story start.'),
    B('Lock-in', 25, 45, 'The choice that commits them; no going back.'),
    B('Promise of the premise', 38, 50, 'The fun the reader came for.'),
    B('Midpoint', 50, 70, 'A turn that changes what the story is about.'),
    B('Bad guys close in', 62, 55, 'Pressure from every side.'),
    B('All is lost', 75, 25, 'The lowest point.'),
    B('Climax', 90, 95, 'Everything collides; the hero acts on what they’ve learned.'),
    B('Final image', 99, 35, 'Mirror of the opening image.'),
  ] },
  stc: { label: 'Save the Cat (15 beats)', beats: [
    B('Opening image', 1, 15, 'A snapshot of the hero’s world before.'), B('Theme stated', 5, 20, 'Someone hints at what the story is really about.'),
    B('Set-up', 8, 25, 'Hero, world and what’s missing.'), B('Catalyst', 11, 40, 'The life-changing event.'),
    B('Debate', 16, 35, 'Should they go?'), B('Break into Two', 22, 50, 'They choose the new world.'),
    B('B story', 26, 45, 'A relationship that carries the theme.'), B('Fun and games', 35, 55, 'The promise of the premise.'),
    B('Midpoint', 50, 72, 'False victory or false defeat; stakes rise.'), B('Bad guys close in', 60, 60, 'Doubt, jealousy and enemies tighten.'),
    B('All is lost', 72, 25, 'The opposite of the midpoint.'), B('Dark night of the soul', 78, 15, 'Wallowing before the realisation.'),
    B('Break into Three', 82, 55, 'The answer, thanks to the B story.'), B('Finale', 90, 95, 'Proving they’ve changed.'),
    B('Final image', 99, 35, 'The opposite of the opening image.'),
  ] },
  hero: { label: 'Hero’s Journey (12 stages)', beats: [
    B('Ordinary world', 2, 15, 'Home, before the adventure.'), B('Call to adventure', 8, 35, 'The problem arrives.'),
    B('Refusal of the call', 12, 30, 'Fear, reluctance.'), B('Meeting the mentor', 17, 40, 'Advice, a gift, courage.'),
    B('Crossing the threshold', 25, 50, 'Into the special world.'), B('Tests, allies, enemies', 35, 55, 'Learning the rules.'),
    B('Approach', 45, 60, 'Preparing for the big ordeal.'), B('The ordeal', 52, 80, 'Facing death or the deepest fear.'),
    B('Reward', 60, 55, 'Seizing the sword.'), B('The road back', 74, 65, 'Consequences give chase.'),
    B('Resurrection', 88, 95, 'The final test, transformed.'), B('Return with the elixir', 98, 35, 'Home, changed, bringing something back.'),
  ] },
  kisho: { label: 'Kishōtenketsu (4 parts)', beats: [
    B('Ki: introduction', 5, 20, 'Characters and setting.'), B('Shō: development', 30, 35, 'Things develop, no conflict needed.'),
    B('Ten: twist', 62, 80, 'Something unexpected recontextualises everything.'), B('Ketsu: reconciliation', 90, 40, 'The parts come together.'),
  ] },
  serial: { label: 'Serial: a hook per installment', beats: null },
  series: { label: 'Series arc (6 beats)', beats: [
    B('The call', 4, 20, 'What pulls the hero into the series’ story.'), B('The world opens', 20, 40, 'The setting and its rules, at scale.'),
    B('Rising cost', 38, 50, 'Each win costs more.'), B('Series midpoint', 52, 72, 'A revelation that reframes every book so far.'),
    B('Darkest point', 72, 30, 'The biggest loss of the series.'), B('Finale', 92, 95, 'Everything the series promised, paid off.'),
  ] },
  blank: { label: 'My own (blank)', beats: [] },
};

export function makeBeats(key, project) {
  const st = STRUCTURES[key] || STRUCTURES.blank;
  if (key === 'serial' && project && project.columns) {
    const n = project.columns.length || 1;
    return project.columns.map((c, i) => ({ id: uid(), name: `${project.labels.column} ${numeral(project, i)}: hook and cliffhanger`, text: '', hint: 'What pulls readers in, and what makes them come back next time.',
      pct: Math.round(((i + 0.5) / n) * 100), tension: 40 + ((i % 2) ? 25 : 0), colId: c.id, parent: null }));
  }
  return (st.beats || []).map((b) => ({ id: uid(), name: b.name, text: '', hint: b.hint, pct: b.pct, tension: b.tension, colId: null, parent: null }));
}

export function normalizeFlow(f, isSeries = false) {
  f = f && typeof f === 'object' ? f : {};
  for (const k of ['logline', 'theme', 'ending']) f[k] = typeof f[k] === 'string' ? f[k] : '';
  f.notes = typeof f.notes === 'string' ? f.notes : '';
  f.structure = f.structure || (isSeries ? 'series' : 'three');
  f.beats = Array.isArray(f.beats) ? f.beats : [];
  for (const b of f.beats) {
    b.id = b.id || uid(); b.name = b.name || ''; b.text = b.text || ''; b.hint = b.hint || '';
    b.pct = Math.max(0, Math.min(100, Number.isFinite(+b.pct) ? +b.pct : 50));
    b.tension = Math.max(0, Math.min(100, Number.isFinite(+b.tension) ? +b.tension : 50));
    b.colId = b.colId || null; b.parent = b.parent || null;
  }
  f.beats.sort((a, b) => a.pct - b.pct);
  return f;
}


// ======================================================================
// World, book, scene and entry extras (round 3)
// ======================================================================

export const DEFAULT_MSGS = [
  ['level', 'Level up', '[Level up! {name} is now Level {level}.]'],
  ['skill', 'Skill acquired', '[Skill acquired: {skill}]'],
  ['skillrank', 'Skill rank up', '[{skill} has reached Rank {rank}.]'],
  ['item', 'Item obtained', '[Item obtained: {item}]'],
  ['itemlost', 'Item lost', '[Item lost: {item}]'],
  ['stat', 'Stat change', '[{stat} {amount}]'],
  ['res', 'HP / MP', '[{stat}: {amount}]'],
  ['title', 'Title earned', '[Title earned: {title}]'],
  ['id', 'Class / identity', '[{stat}: {value}]'],
  ['equip', 'Equipped', '[Equipped: {item} ({slot})]'],
  ['quest', 'Quest updated', '[Quest updated: {quest} · {state}]'],
];

export const SECRET_KINDS = [['secret', 'Secret'], ['twist', 'Twist'], ['clue', 'Clue'], ['lie', 'Lie']];
export const REVEAL_HOW = [['learns', 'learns it'], ['suspects', 'starts to suspect'], ['lie', 'is told a lie about it'], ['acts', 'acts on it']];
export const REL_KINDS = [['family', 'Family', '#1C2326', ''], ['ally', 'Ally', '#2F7A4A', ''], ['friend', 'Friend', '#3E8F6A', ''], ['mentor', 'Mentor', '#2F6F7E', '4 4'], ['love', 'Love', '#C9531A', ''],
  ['rival', 'Rival', '#A8344E', '7 5'], ['enemy', 'Enemy', '#7A1F33', '2 4'], ['owes', 'Owes a debt', '#7A5C9E', '7 5'], ['other', 'Other', '#5A6870', '1 4']];
export const FLAG_KINDS = [['continuity', 'Continuity', '#A8344E'], ['foreshadow', 'Foreshadow', '#7A5C9E'], ['character', 'Character', '#C9531A'], ['fact', 'Fact check', '#2F6F7E'], ['prose', 'Prose', '#5A6870'], ['cut', 'Cut', '#9A5B12']];
export const QUEST_KINDS = [['main', 'Main', '#C9531A'], ['side', 'Side', '#2F6F7E'], ['hidden', 'Hidden', '#7A5C9E']];
export const QUEST_ACTS = [['offer', 'Offered'], ['accept', 'Accepted'], ['step', 'Objective done'], ['complete', 'Completed'], ['fail', 'Failed']];
export const RARITIES = [['Common', '#5A6870'], ['Uncommon', '#2F7A4A'], ['Rare', '#2E6CB0'], ['Epic', '#7A4FB0'], ['Legendary', '#A8610E'], ['Quest', '#8A3410']];
export const ITEM_TYPES = ['Weapon', 'Armor', 'Accessory', 'Consumable', 'Material', 'Tool', 'Quest item'];
export const MAP_KINDS = [['world', 'World'], ['city', 'Cities & towns'], ['stage', 'Stages & dungeons'], ['room', 'Rooms & buildings']];
export const FAMILY_KINDS = [['parent', 'Parent of'], ['spouse', 'Married to'], ['raised', 'Raised'], ['sibling', 'Sibling of']];
export const DEFAULT_PASSES = [['Story pass', 'Does each scene earn its place?'], ['Continuity', 'Names, dates, who knows what'], ['Dialogue', 'Voices sound like themselves'], ['Line edit', 'Sentence by sentence'], ['Proof', 'Typos before posting']];

const arr = (v) => (Array.isArray(v) ? v : []);

// The world: shared by every book of a series, or a standalone project's own.
export function normalizeWorld(w) {
  for (const k of ['secrets', 'rels', 'maps', 'questions', 'dismissed']) w[k] = arr(w[k]);
  w.webPos = w.webPos && typeof w.webPos === 'object' ? w.webPos : {};
  const t = w.travel && typeof w.travel === 'object' ? w.travel : {};
  w.travel = { unit: t.unit || 'mi', speeds: Object.assign({ foot: 20, horse: 40, boat: 60 }, t.speeds), routes: arr(t.routes) };
  const c = w.calendar && typeof w.calendar === 'object' ? w.calendar : {};
  c.years = arr(c.years).length ? c.years : ['Year 1', 'Year 2', 'Year 3'];
  c.parts = arr(c.parts).length ? c.parts : ['Spring', 'Summer', 'Autumn', 'Winter'];
  c.days = Math.max(1, Math.min(400, parseInt(c.days, 10) || 30));
  c.holidays = arr(c.holidays); c.moons = arr(c.moons); c.seasons = arr(c.seasons);
  w.calendar = c;
  for (const m of w.maps) { m.pins = arr(m.pins); m.kind = m.kind || 'world'; }
  for (const x of w.secrets) { x.known = arr(x.known); x.kind = x.kind || 'secret'; }
  return w;
}

export function normalizeBook(b) {
  b.branches = arr(b.branches);
  b.passes = Array.isArray(b.passes) ? b.passes : DEFAULT_PASSES.map(([name, what]) => ({ id: uid(), name, what, required: name === 'Proof' }));
  b.checklist = Object.assign({ on: false, labels: { goal: 'Goal', conflict: 'Conflict', outcome: 'Outcome', change: 'What changes' } }, b.checklist);
  b.braid = Object.assign({ run: 3, gap: 6 }, b.braid);
  b.mood = arr(b.mood); b.clips = arr(b.clips);
  for (const c of b.columns || []) c.passes = c.passes && typeof c.passes === 'object' ? c.passes : {};
  return b;
}

export function normalizeEntity(e) {
  e.fields = e.fields || {}; e.summary = e.summary || ''; e.notes = e.notes || '';
  for (const k of ['aliases', 'wrong', 'family', 'mood', 'clips']) e[k] = arr(e[k]);
  e.voice = Object.assign({ talk: '', dialect: '', loves: [], never: [], lines: [] }, e.voice);
  e.arc = Object.assign({ type: '', want: '', need: '', wound: '', lie: '', truth: '' }, e.arc);
  e.born = e.born && Number.isInteger(e.born.y) ? e.born : null;
  e.say = e.say || ''; e.role = e.role || ''; e.reportsTo = e.reportsTo || null;
  return e;
}

// Absolute day number of a "when" on the story calendar (or null).
export function dayOf(cal, w) {
  if (!w || !Number.isInteger(w.y)) return null;
  const d = parseInt(w.day, 10);
  return (w.y * cal.parts.length + (w.p || 0)) * cal.days + (Number.isFinite(d) ? Math.max(1, Math.min(cal.days, d)) : Math.ceil(cal.days / 2)) - 1;
}
export const hasExactDay = (w) => !!w && Number.isFinite(parseInt(w.day, 10));

// Fill in a system-message template.
export function fillMsg(tpl, vals, style = {}) {
  let t = String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null && vals[k] !== '' ? String(vals[k]) : ''));
  t = t.replace(/\s+([)\].,])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ');
  const inner = t.replace(/^\[(.*)\]$/, '$1');
  const cased = style.caps === 'upper' ? inner.toUpperCase() : style.caps === 'title' ? inner.replace(/\b\w/g, (c) => c.toUpperCase()) : inner;
  const br = { '[]': ['[', ']'], '<>': ['<', '>'], '【】': ['【', '】'], none: ['', ''] }[style.brackets || '[]'] || ['[', ']'];
  return br[0] + cased + br[1];
}
