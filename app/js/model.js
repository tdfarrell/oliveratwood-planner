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
  for (const c of p.cards) {
    c.entityIds = c.entityIds || [];
    c.fields = c.fields || {};
    c.status = STATUSES.some(([v]) => v === c.status) ? c.status : 'idea';
    c.links = Array.isArray(c.links) ? c.links : [];
    c.when = c.when && Number.isInteger(c.when.y) ? c.when : null;
  }
  for (const e of p.entities) { e.fields = e.fields || {}; e.summary = e.summary || ''; e.notes = e.notes || ''; }
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

const WORLD_KEYS = ['types', 'entities', 'nameBank'];
const BOOK_KEYS = ['title', 'synopsis', 'storySlug', 'labels', 'columns', 'rows', 'cards', 'cardFields', 'acts', 'notes', 'created'];

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
  for (const t of s.types) t.fields = t.fields || [];
  for (const e of s.entities) { e.fields = e.fields || {}; e.summary = e.summary || ''; e.notes = e.notes || ''; }
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
