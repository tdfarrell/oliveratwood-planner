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
  ['drafted', 'Drafted'],
  ['final', 'Final'],
];

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
      p.labels = { column: 'Chapter', row: 'POV', numerals: 'arabic' };
      p.columns = [1, 2, 3, 4, 5].map(() => ({ id: uid(), title: '', teaser: '', recap: '', notes: '', date: '', canon: false }));
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
  p.labels = Object.assign({ column: 'Part', row: 'Thread', numerals: 'roman' }, p.labels);
  for (const k of ['columns', 'rows', 'cards', 'cardFields', 'types', 'entities']) p[k] = Array.isArray(p[k]) ? p[k] : [];
  p.notes = p.notes || '';
  p.nameBank = Array.isArray(p.nameBank) ? p.nameBank : [];
  for (const c of p.cards) {
    c.entityIds = c.entityIds || [];
    c.fields = c.fields || {};
    c.status = c.status || 'idea';
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
