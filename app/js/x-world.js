// The world: maps with pins, the story calendar (seasons, moons, holidays),
// travel times, faction charts, mood boards and clippings.
import { h, icon, clear, append, confirmDanger, ask, toast, autosize } from './dom.js';
import { uid, numeral, dayOf, hasExactDay, MAP_KINDS } from './model.js';
import { S, P, isSeries, change, render, go, phref, pbase, openCard, cardInfo, readingSeq, entity, typeOf, plural, appearances } from './app.js';
import { chars, places, factions, factionsOf, factionType, isPlace, nameOf, units, cardBtn, seg, sel, pageHead, panel, empty, dismissed, dismissBtn, imgUrl, fileInput, uploadImages } from './x-common.js';

const where = (k) => `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).b.labels.column} ${cardInfo(k).num}`;

// ======================================================================
// Mood boards
// ======================================================================

export function moodBoard(get, mutate, { title = 'Mood board' } = {}) {
  const box = h('section', { class: 'mood' });
  const add = (names) => { if (names.length) mutate((list) => { for (const n of names) list.push({ id: uid(), img: n, cap: '' }); }); };
  const draw = () => {
    clear(box);
    const list = get();
    append(box, [
      h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, title), h('span', { class: 'muted small' }, 'Drop or paste images here, or upload. The first one is the cover.'), h('span', { class: 'spacer' }), fileInput(add)),
      list.length ? h('div', { class: 'mood__grid' }, list.map((m, i) => h('figure', { class: 'mood__tile' },
        h('img', { src: imgUrl(m.img), alt: m.cap || 'Mood board image', loading: 'lazy' }),
        i === 0 ? h('span', { class: 'mood__cover' }, 'Cover') : null,
        h('figcaption', {}, h('input', { class: 'mood__cap', value: m.cap, placeholder: 'Caption', 'aria-label': 'Caption', oninput: (e) => { m.cap = e.target.value; change(() => {}, { render: false }); } }),
          h('span', { class: 'mood__tools' },
            i ? h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Move earlier', onclick: () => mutate((l) => { l.splice(i - 1, 0, l.splice(i, 1)[0]); }) }, icon('left')) : null,
            h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove image', onclick: () => mutate((l) => { l.splice(i, 1); }) }, icon('x'))))))) : h('div', { class: 'mood__empty' }, 'No images yet.'),
    ]);
  };
  box.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((x) => x.kind === 'file')) { e.preventDefault(); box.classList.add('is-over'); } });
  box.addEventListener('dragleave', () => box.classList.remove('is-over'));
  box.addEventListener('drop', async (e) => { e.preventDefault(); box.classList.remove('is-over'); add(await uploadImages([...e.dataTransfer.files])); });
  box.addEventListener('paste', async (e) => { const fl = [...e.clipboardData.files]; if (fl.length) { e.preventDefault(); add(await uploadImages(fl)); } });
  box.tabIndex = -1;
  draw();
  return box;
}

export function viewMood(p) {
  return h('div', { class: 'wrap wrap--wide x' }, pageHead('Mood board', `Images for ${p.title}.`), panel('', moodBoard(() => p.mood, (fn) => change(() => fn(p.mood)), { title: 'Images' })));
}

// ======================================================================
// Clippings: links, notes and images on scenes, entries and books
// ======================================================================

export function clipsPanel(get, mutate) {
  const box = h('div', { class: 'clips' });
  const draw = () => {
    clear(box);
    const list = get();
    const input = h('input', { class: 'input input--sm', placeholder: 'Paste a link, or type a note, then Enter', 'aria-label': 'Add a clipping' });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      e.preventDefault();
      const v = input.value.trim();
      let item;
      if (/^https?:\/\/\S+$/i.test(v)) { let t = v; try { const u = new URL(v); t = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''); } catch { /* keep */ } item = { id: uid(), kind: 'link', url: v, title: t, note: '' }; }
      else item = { id: uid(), kind: 'note', title: '', note: v };
      mutate((l) => l.push(item)); draw();
      box.querySelector('input')?.focus();
    });
    append(box, [h('div', { class: 'clips__add' }, input, fileInput((names) => { mutate((l) => { for (const n of names) l.push({ id: uid(), kind: 'image', img: n, title: '', note: '' }); }); draw(); }, { label: 'Image' })),
      list.map((c, i) => h('div', { class: 'clip clip--' + c.kind },
        c.kind === 'image' ? h('a', { href: imgUrl(c.img), target: '_blank', rel: 'noopener', class: 'clip__img' }, h('img', { src: imgUrl(c.img), alt: c.title || 'Clipping', loading: 'lazy' })) : null,
        h('div', { class: 'clip__body' },
          h('span', { class: 'clip__kind' }, { link: 'Link', note: 'Note', image: 'Image' }[c.kind]),
          c.kind === 'link' ? h('a', { class: 'clip__link', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.title || c.url) : null,
          c.kind !== 'note' ? h('input', { class: 'clip__title', value: c.title, placeholder: c.kind === 'link' ? 'Title' : 'Caption', 'aria-label': 'Title', oninput: (e) => mutate((l) => { l[i].title = e.target.value; }) }) : null,
          autosize(h('textarea', { class: 'clip__note', rows: 1, value: c.note, placeholder: 'Why it matters', 'aria-label': 'Note', oninput: (e) => mutate((l) => { l[i].note = e.target.value; }) }))),
        h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove clipping', onclick: () => { mutate((l) => { l.splice(i, 1); }); draw(); } }, icon('x')))),
    ]);
  };
  draw();
  return box;
}

// ======================================================================
// Maps
// ======================================================================

const pinColor = (pin) => { const e = entity(pin.entityId); return pin.mapId && !e ? '#9A5B12' : e ? (typeOf(e) || {}).color || '#2F7A4A' : '#5A6870'; };

export function viewMaps(p, id) {
  const W = P();
  const maps = W.maps;
  const newMap = () => mapDialog();
  if (!maps.length) {
    return h('div', { class: 'wrap x' }, pageHead('Maps', 'Your own map images, with places pinned on them. Pins can open other maps: a city, a dungeon floor, a room.'),
      empty('No maps yet', 'Upload a world map, a city plan, a dungeon floor or a room layout. Then pin your places on it.', h('button', { class: 'btn btn--primary', type: 'button', onclick: newMap }, icon('plus'), ' New map')));
  }
  const m = maps.find((x) => x.id === id) || maps[0];
  const parent = maps.find((x) => x.pins.some((pn) => pn.mapId === m.id));
  const U = units(p);
  const who = entity(S.mapWho) ? S.mapWho : '';
  const asOf = S.mapAsOf != null && S.mapAsOf < U.length ? S.mapAsOf : U.length - 1;
  // A character's path: the pinned places of their scenes, in reading order.
  const pinOf = new Map(m.pins.filter((pn) => pn.entityId).map((pn) => [pn.entityId, pn]));
  const lastPos = U.slice(0, asOf + 1).flatMap((u) => u.cards);
  const path = [], visited = new Set();
  if (who) {
    for (const { k } of readingSeq()) {
      if (!k.entityIds.includes(who)) continue;
      const pin = k.entityIds.map((x) => pinOf.get(x)).find(Boolean);
      if (!pin) continue;
      const inTime = !U.length || lastPos.includes(k) || !U.some((u) => u.cards.includes(k));
      if (!inTime) continue;
      visited.add(pin.id);
      if (path[path.length - 1] !== pin) path.push(pin);
    }
  }
  const selPin = m.pins.find((x) => x.id === S.pinSel);
  const area = h('div', { class: 'map' + (S.pinMode ? ' is-pinning' : '') });
  if (m.img) {
    const img = h('img', { class: 'map__img', src: imgUrl(m.img), alt: m.name, draggable: 'false' });
    area.append(img);
    area.addEventListener('click', (e) => {
      if (!S.pinMode || e.target.closest('.map__pin')) return;
      const r = img.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      const pin = { id: uid(), x, y, label: '', entityId: null, mapId: null };
      S.pinMode = false; S.pinSel = pin.id;
      change(() => { m.pins.push(pin); });
    });
    if (path.length > 1) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'map__path'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
      const pl = document.createElementNS(svgNS, 'polyline');
      pl.setAttribute('points', path.map((x) => `${x.x},${x.y}`).join(' '));
      svg.append(pl);
      area.append(svg);
    }
    for (const pin of m.pins) {
      const e = entity(pin.entityId);
      const n = e ? appearances(p, e.id).length : 0;
      const faded = who && pin.entityId && !visited.has(pin.id);
      const el = h('button', { class: 'map__pin' + (pin === selPin ? ' is-sel' : '') + (faded ? ' is-faded' : ''), type: 'button', style: { left: pin.x + '%', top: pin.y + '%', '--c': pinColor(pin) },
        'aria-label': pin.label || (e && e.name) || 'Pin' },
      h('span', { class: 'map__drop' }, h('span', {}, n ? String(n) : pin.mapId ? '↗' : '')), h('span', { class: 'map__label' }, pin.label || (e && e.name) || 'Pin'));
      let moved = false;
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        el.setPointerCapture(ev.pointerId);
        const r = area.querySelector('.map__img').getBoundingClientRect();
        moved = false;
        const mv = (mm) => {
          const x = Math.max(0, Math.min(100, ((mm.clientX - r.left) / r.width) * 100)), y = Math.max(0, Math.min(100, ((mm.clientY - r.top) / r.height) * 100));
          if (Math.abs(x - pin.x) + Math.abs(y - pin.y) > 0.4) moved = true;
          if (moved) { pin.x = x; pin.y = y; el.style.left = x + '%'; el.style.top = y + '%'; }
        };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (moved) change(() => {}); else { S.pinSel = pin.id; render(); } };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
      });
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { S.pinSel = pin.id; render(); } });
      area.append(el);
    }
  } else {
    area.append(h('div', { class: 'map__none' }, h('p', {}, 'No image on this map yet.'), fileInput((names) => { if (names[0]) change(() => { m.img = names[0]; }); }, { multiple: false, label: 'Upload the map image' })));
  }
  const pinPanel = selPin ? (() => {
    const e = entity(selPin.entityId);
    const apps = e ? appearances(p, e.id) : [];
    const sub = maps.find((x) => x.id === selPin.mapId);
    const ents = [...places(), ...P().entities.filter((x) => !isPlace(x))];
    return panel('pinp',
      h('div', { class: 'xpanel__head' }, h('span', { class: 'map__dot', style: { '--c': pinColor(selPin) } }), h('h2', { class: 'xpanel__t' }, selPin.label || (e && e.name) || 'Pin'), h('span', { class: 'spacer' }),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => { S.pinSel = null; render(); } }, icon('x'))),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Label'), h('input', { class: 'input input--sm', value: selPin.label, placeholder: e ? e.name : 'Name this pin', oninput: (ev) => change(() => { selPin.label = ev.target.value; }, { render: false }) })),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Entry'), sel([['', '— None —'], ...ents.map((x) => [x.id, `${x.name || 'Unnamed'} · ${(typeOf(x) || {}).singular || ''}`])], selPin.entityId || '', (v) => change(() => { selPin.entityId = v || null; }), 'Entry', 'input input--sm')),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Opens a map'), sel([['', '— None —'], ...maps.filter((x) => x !== m).map((x) => [x.id, x.name || 'Untitled map']), ['__new', 'New map…']], selPin.mapId || '', (v) => { if (v === '__new') mapDialog(selPin); else change(() => { selPin.mapId = v || null; }); }, 'Opens a map', 'input input--sm')),
      e ? [h('span', { class: 'xlabel' }, apps.length ? plural(apps.length, 'scene') + ' here' : 'No scenes here yet'), h('ul', { class: 'xlist' }, apps.slice(0, 8).map((k) => h('li', {}, cardBtn(k, `${where(k)} · ${k.title || 'Untitled scene'}`)))),
        apps.length > 8 ? h('span', { class: 'muted small' }, `+${apps.length - 8} more`) : null] : null,
      h('div', { class: 'xrow' }, e ? h('a', { class: 'btn btn--sm', href: phref('e/' + e.id) }, 'Open entry') : null, sub ? h('a', { class: 'btn btn--sm', href: phref('maps/' + sub.id) }, `Open ${sub.name}`) : null,
        h('span', { class: 'spacer' }), h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: () => { S.pinSel = null; change(() => { m.pins = m.pins.filter((x) => x !== selPin); }); } }, icon('trash'), ' Remove pin')));
  })() : null;
  const tree = MAP_KINDS.map(([k, label]) => [label, maps.filter((x) => x.kind === k)]).filter(([, l]) => l.length);
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside' }, panel('',
      h('div', { class: 'xpanel__head' }, h('h2', { class: 'xpanel__t' }, 'Maps'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn--sm', type: 'button', onclick: newMap }, icon('plus'), ' Map')),
      tree.map(([label, l]) => h('div', { class: 'maplist' }, h('span', { class: 'xlabel' }, label), l.map((x) => h('a', { class: 'xside__item xside__item--row' + (x === m ? ' is-on' : ''), href: phref('maps/' + x.id), 'aria-current': x === m ? 'page' : null },
        x.img ? h('img', { class: 'maplist__thumb', src: imgUrl(x.img), alt: '' }) : h('span', { class: 'maplist__thumb' }), h('span', { class: 'maplist__name' }, x.name || 'Untitled map'), h('span', { class: 'muted small' }, String(x.pins.length)))))),
      h('p', { class: 'muted small' }, 'A pin can open another map: a city, a stage floor, a room.'))),
    h('div', { class: 'xmain' },
      h('div', { class: 'xhead' }, h('div', { class: 'xhead__text' },
        parent ? h('a', { class: 'small', href: phref('maps/' + parent.id) }, '‹ ', parent.name) : null,
        h('input', { class: 'title-input', value: m.name, 'aria-label': 'Map name', oninput: (ev) => change(() => { m.name = ev.target.value; }, { render: false }) })),
      h('span', { class: 'spacer' }),
      sel(MAP_KINDS, m.kind, (v) => change(() => { m.kind = v; }), 'Kind of map'),
      chars().length ? h('label', { class: 'xinline' }, 'Path of', sel([['', 'Nobody'], ...chars().map((e) => [e.id, e.name || 'Unnamed'])], who, (v) => { S.mapWho = v; render(); }, 'Path of')) : null,
      who && U.length ? h('label', { class: 'xinline' }, 'As of', sel(U.map((u, i) => [i, u.long]), asOf, (v) => { S.mapAsOf = +v; render(); }, 'As of')) : null,
      m.img ? h('button', { class: 'btn btn--sm' + (S.pinMode ? ' btn--primary' : ''), type: 'button', 'aria-pressed': String(!!S.pinMode), onclick: () => { S.pinMode = !S.pinMode; render(); } }, icon('plus'), S.pinMode ? ' Click the map…' : ' Pin') : null),
      h('div', { class: 'map-layout' }, h('div', { class: 'map-frame' }, area,
        m.img ? h('div', { class: 'map__bar' }, h('span', { class: 'muted small' }, `${plural(m.pins.length, 'pin')}${who ? ` · ${nameOf(who)}’s path: ${plural(path.length, 'stop')}` : ''}`), h('span', { class: 'spacer' }),
          fileInput((names) => { if (names[0]) change(() => { m.img = names[0]; }); }, { multiple: false, label: 'Replace image' }),
          h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: async () => {
            if (!(await confirmDanger(`Delete the map “${m.name}”?`, 'Its pins go with it. Entries and scenes stay.'))) return;
            change(() => { W.maps = W.maps.filter((x) => x !== m); for (const x of W.maps) for (const pn of x.pins) if (pn.mapId === m.id) pn.mapId = null; }, { render: false });
            go(pbase('maps'));
          } }, icon('trash'), ' Delete map')) : null),
      pinPanel))));
}

function mapDialog(fromPin = null) {
  const name = h('input', { class: 'input', placeholder: 'e.g. The Reach, Saltmarsh, Floor 2', 'aria-label': 'Map name' });
  let kind = fromPin ? 'city' : 'world', img = null;
  const status = h('span', { class: 'muted small' }, 'No image yet (you can add it later).');
  const dl = h('dialog', { class: 'dlg' });
  const create = () => {
    const id = uid();
    change(() => { P().maps.push({ id, name: name.value.trim() || 'Untitled map', kind, img, pins: [] }); if (fromPin) fromPin.mapId = id; }, { render: false });
    dl.close();
    go(pbase('maps/' + id));
  };
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, 'New map'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))),
    h('div', { class: 'dlg__body' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Kind'), sel(MAP_KINDS, kind, (v) => { kind = v; }, 'Kind', 'input')),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Image'), h('div', { class: 'xrow' }, fileInput((names) => { img = names[0] || null; status.textContent = img ? 'Image uploaded.' : 'No image yet.'; }, { multiple: false, label: 'Upload' }), status)),
      fromPin ? h('p', { class: 'muted small' }, 'The pin you picked will open this map.') : null),
    h('footer', { class: 'dlg__foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dl.close() }, 'Cancel'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create map'))]);
  dl.addEventListener('close', () => dl.remove());
  document.body.append(dl);
  dl.showModal();
  name.focus();
}

// ======================================================================
// Calendar: seasons, moons, holidays
// ======================================================================

const partStart = (cal, y, p) => (y * cal.parts.length + p) * cal.days;
function seasonOf(cal, p) {
  return cal.seasons.find((s) => { const a = +s.from, b = +s.to; return a <= b ? p >= a && p <= b : p >= a || p <= b; }) || null;
}
// Full moons (day numbers, 1-based) in a given part of a given year.
function fullMoons(cal, m, y, p) {
  const cyc = Math.max(1, +m.cycle || 30);
  const ref = partStart(cal, 0, +m.p || 0) + Math.max(1, Math.min(cal.days, +m.day || 1)) - 1;
  const a = partStart(cal, y, p), b = a + cal.days;
  const out = [];
  let d = ref + Math.ceil((a - ref) / cyc) * cyc;
  for (; d < b; d += cyc) out.push(d - a + 1);
  return out;
}
const holidaysIn = (cal, y, p) => cal.holidays.filter((x) => +x.p === p && (x.yearly !== false || +x.y === y));

export function whenInfo(c) {
  const w = c.when;
  if (!w) return null;
  const cal = P().calendar;
  const bits = [];
  const s = seasonOf(cal, w.p);
  if (s) bits.push(s.name);
  if (hasExactDay(w)) {
    const d = parseInt(w.day, 10);
    for (const x of holidaysIn(cal, w.y, w.p)) if (+x.day === d) bits.push(x.name);
    for (const m of cal.moons) if (fullMoons(cal, m, w.y, w.p).includes(d)) bits.push(`full ${m.name || 'moon'}`);
  }
  return bits.length ? h('p', { class: 'xwhen' }, icon('timeline'), ' ' + bits.join(' · ')) : null;
}

export function calendarRow(series, geo, TW, labelCell, track) {
  const cal = series.calendar;
  const kids = [];
  for (let y = 0; y < geo.Y; y++) for (let p = 0; p < geo.PN; p++) {
    const sl = y * geo.PN + p, x0 = geo.slotX[sl], w = geo.slotW(sl);
    const s = seasonOf(cal, p);
    if (s) kids.push(h('span', { class: 'tlc-season', style: { left: x0 + 'px', width: w + 'px', background: s.color || '#E3E8EA' }, title: s.name }, p === 0 || seasonOf(cal, p - 1) !== s ? s.name : ''));
    for (const hd of holidaysIn(cal, y, p)) kids.push(h('span', { class: 'tlc-hol', style: { left: x0 + ((Math.max(1, +hd.day || 1) - 1) / cal.days) * w + 'px' }, title: `${hd.name} · ${cal.parts[p]} ${hd.day || ''}` }, h('i', {}), hd.name));
    for (const m of cal.moons) for (const d of fullMoons(cal, m, y, p)) kids.push(h('span', { class: 'tlc-moon', style: { left: x0 + ((d - 1) / cal.days) * w + 'px', '--c': m.color || '#F4EBC9' }, title: `Full ${m.name || 'moon'} · ${cal.parts[p]} ${d}` }));
  }
  return h('div', { class: 'tl-row tlc' }, labelCell('tl-lab--book', h('span', { class: 'tl-lab__text' }, h('span', { class: 'tl-lab__title' }, 'Calendar'), h('span', { class: 'tl-lab__meta' }, 'Seasons, holidays, moons'))), track(52, kids));
}

export function viewCalendar(p) {
  const W = P();
  const cal = W.calendar;
  const upd = (fn) => change(fn, { render: false });
  const Y = Math.min(cal.years.length - 1, S.calYear || 0);
  const lines = (arr) => arr.join('\n');
  const listEdit = (label, key, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), hint ? h('span', { class: 'field__hint' }, hint) : null,
    autosize(h('textarea', { class: 'input', rows: 3, value: lines(cal[key]), onchange: (e) => { const v = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); change(() => { cal[key] = v.length ? v : cal[key]; }); } })));
  const partSel = (val, on, label) => sel(cal.parts.map((x, i) => [i, x]), val, (v) => on(+v), label);
  const row = (kids) => h('div', { class: 'xbox__row' }, kids);
  const del = (arr, i) => h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { arr.splice(i, 1); }) }, icon('x'));
  const strip = h('div', { class: 'calyear', style: { gridTemplateColumns: `110px repeat(${cal.parts.length}, minmax(70px, 1fr))` } },
    h('span', {}), cal.parts.map((x) => h('span', { class: 'calyear__h' }, x)),
    h('span', { class: 'calyear__l' }, 'Season'), cal.parts.map((x, i) => { const s = seasonOf(cal, i); return h('span', { class: 'calyear__season', style: { background: s ? s.color : 'transparent' } }, s ? s.name : ''); }),
    cal.moons.map((m) => [h('span', { class: 'calyear__l' }, m.name || 'Moon'), cal.parts.map((x, i) => h('span', { class: 'calyear__moons' }, fullMoons(cal, m, Y, i).map((d) => h('span', { class: 'calyear__moon', style: { '--c': m.color || '#F4EBC9' }, title: `Full on day ${d}` }, String(d)))))]),
    h('span', { class: 'calyear__l' }, 'Holidays'), cal.parts.map((x, i) => h('span', { class: 'calyear__hol' }, holidaysIn(cal, Y, i).map((hd) => h('span', {}, `${hd.day || ''} ${hd.name}`)))));
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Calendar', 'The story calendar: years, the parts of a year, seasons, moons and holidays. Scenes’ “When in the story” uses it, and the series timeline can show it.'),
    h('div', { class: 'xsplit xsplit--wide' },
      h('aside', { class: 'xside' }, panel('',
        listEdit('Years or eras', 'years', 'One per line. Removing or reordering lines moves placed scenes.'),
        listEdit('Parts of a year', 'parts', 'Months, seasons, moons… one per line.'),
        h('label', { class: 'xinline' }, 'Days in each part', h('input', { class: 'input input--sm xnum', type: 'number', min: 1, max: 400, value: cal.days, 'aria-label': 'Days in each part', onchange: (e) => change(() => { cal.days = Math.max(1, Math.min(400, parseInt(e.target.value, 10) || 30)); }) })))),
      h('div', { class: 'xmain' },
        panel('', h('div', { class: 'xpanel__head' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Previous year', disabled: Y === 0, onclick: () => { S.calYear = Y - 1; render(); } }, icon('left')),
          h('h2', { class: 'xpanel__t' }, cal.years[Y]), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Next year', disabled: Y >= cal.years.length - 1, onclick: () => { S.calYear = Y + 1; render(); } }, icon('right'))),
        h('div', { class: 'calyear__scroll' }, strip)),
        h('div', { class: 'xcards xcards--3' },
          panel('', h('h2', { class: 'xpanel__t' }, 'Seasons'),
            cal.seasons.map((s, i) => row([h('input', { class: 'input input--sm', value: s.name, 'aria-label': 'Season', oninput: (e) => upd(() => { s.name = e.target.value; }) }),
              h('input', { type: 'color', class: 'xcolor', value: s.color || '#E3F1E7', 'aria-label': 'Color', onchange: (e) => change(() => { s.color = e.target.value; }) }),
              partSel(s.from, (v) => change(() => { s.from = v; }), 'From'), h('span', { class: 'muted small' }, 'to'), partSel(s.to, (v) => change(() => { s.to = v; }), 'To'), del(cal.seasons, i)])),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { cal.seasons.push({ id: uid(), name: 'Season', color: ['#DCE9F1', '#E3F1E7', '#F6EBD9', '#F4E1D6'][cal.seasons.length % 4], from: 0, to: 0 }); }) }, icon('plus'), ' Season')),
          panel('', h('h2', { class: 'xpanel__t' }, 'Moons'),
            cal.moons.map((m, i) => row([h('input', { class: 'input input--sm', value: m.name, 'aria-label': 'Moon', oninput: (e) => upd(() => { m.name = e.target.value; }) }),
              h('input', { type: 'color', class: 'xcolor', value: m.color || '#F4EBC9', 'aria-label': 'Color', onchange: (e) => change(() => { m.color = e.target.value; }) }),
              h('label', { class: 'xinline' }, 'every', h('input', { class: 'input input--sm xnum', type: 'number', min: 1, value: m.cycle, 'aria-label': 'Days between full moons', onchange: (e) => change(() => { m.cycle = Math.max(1, +e.target.value || 30); }) }), 'days'),
              h('label', { class: 'xinline' }, 'full on', partSel(m.p || 0, (v) => change(() => { m.p = v; }), 'Full in'), h('input', { class: 'input input--sm xnum', type: 'number', min: 1, value: m.day || 1, 'aria-label': 'Day', onchange: (e) => change(() => { m.day = +e.target.value || 1; }) }), `of ${cal.years[0]}`), del(cal.moons, i)])),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { cal.moons.push({ id: uid(), name: 'Moon', cycle: 30, p: 0, day: 1, color: '#F4EBC9' }); }) }, icon('plus'), ' Moon')),
          panel('', h('h2', { class: 'xpanel__t' }, 'Holidays & events'),
            cal.holidays.map((x, i) => row([h('input', { class: 'input input--sm', value: x.name, 'aria-label': 'Holiday', oninput: (e) => upd(() => { x.name = e.target.value; }) }),
              partSel(x.p || 0, (v) => change(() => { x.p = v; }), 'Part'), h('input', { class: 'input input--sm xnum', type: 'number', min: 1, value: x.day || 1, 'aria-label': 'Day', onchange: (e) => change(() => { x.day = +e.target.value || 1; }) }),
              sel([['yearly', 'Every year'], ...cal.years.map((y, yi) => [String(yi), 'Only ' + y])], x.yearly === false ? String(x.y || 0) : 'yearly', (v) => change(() => { if (v === 'yearly') { x.yearly = true; } else { x.yearly = false; x.y = +v; } }), 'Repeats'), del(cal.holidays, i)])),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => change(() => { cal.holidays.push({ id: uid(), name: 'Holiday', p: 0, day: 1, yearly: true }); }) }, icon('plus'), ' Holiday'))))));
}

// ======================================================================
// Travel
// ======================================================================

const TERRAIN = [['road', 'Road'], ['rough', 'Rough (hills, forest)'], ['coast', 'Coast (any)'], ['water', 'Water (boat only)']];
const modesOf = (t) => (t === 'water' ? ['boat'] : t === 'coast' ? ['foot', 'horse', 'boat'] : ['foot', 'horse']);
const legDays = (r, sp, mode) => { const d = +r.dist || 0; return d / Math.max(0.01, +sp[mode] || 1) * (r.terrain === 'rough' && mode !== 'boat' ? 2 : 1); };
const fmtDays = (d) => { if (d == null || !isFinite(d)) return '—'; if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`; const r = Math.round(d * 4) / 4; const w = Math.floor(r), f = r - w; return `${w || ''}${['', '¼', '½', '¾'][Math.round(f * 4)]} ${r > 1 ? 'days' : 'day'}`.trim(); };

// Fastest time between two places, over any routes.
function fastest(a, b) {
  const T = P().travel;
  const dist = new Map([[a, 0]]), done = new Set();
  while (true) {
    let u = null;
    for (const [k, v] of dist) if (!done.has(k) && (u === null || v < dist.get(u))) u = k;
    if (u === null) return null;
    if (u === b) return dist.get(u);
    done.add(u);
    for (const r of T.routes) {
      const v = r.a === u ? r.b : r.b === u ? r.a : null;
      if (!v) continue;
      const t = Math.min(...modesOf(r.terrain).map((m) => legDays(r, T.speeds, m)));
      if (dist.get(u) + t < (dist.get(v) ?? Infinity)) dist.set(v, dist.get(u) + t);
    }
  }
}

export function travelIssues() {
  const T = P().travel;
  if (!T.routes.length) return [];
  const cal = P().calendar;
  const seq = readingSeq().map(({ k }) => k).filter((k) => hasExactDay(k.when));
  const out = [];
  for (const c of chars()) {
    const stops = seq.filter((k) => k.entityIds.includes(c.id)).map((k) => ({ k, d: dayOf(cal, k.when), place: k.entityIds.find((id) => isPlace(entity(id))) })).filter((x) => x.place).sort((a, b) => a.d - b.d);
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (a.place === b.place) continue;
      const need = fastest(a.place, b.place);
      if (need == null) continue;
      const have = b.d - a.d + 1;
      const key = `travel:${c.id}:${a.k.id}:${b.k.id}`;
      if (have + 1e-6 < need && !dismissed(key)) out.push({ key, c, a, b, need, have });
    }
  }
  return out;
}

export function viewTravel(p) {
  const W = P();
  const T = W.travel;
  const pl = places();
  const opts = pl.map((x) => [x.id, x.name || 'Unnamed']);
  const issues = travelIssues();
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Travel', 'Set the distance once per route; times come from the speeds you set. Scenes with an exact day are checked for impossible journeys.',
      pl.length > 1 ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => change(() => { T.routes.push({ id: uid(), a: opts[0][0], b: opts[1][0], dist: 10, terrain: 'road' }); }) }, icon('plus'), ' Route') : null),
    pl.length < 2 ? empty('Add places first', 'Travel times are between Places in your world. Add at least two.') : h('div', { class: 'xcols' },
      h('div', { class: 'xcols__main' },
        panel('', T.routes.length ? h('div', { class: 'routes__scroll' }, h('table', { class: 'routes' },
          h('thead', {}, h('tr', {}, ['Between', '', 'Distance', 'Terrain', 'On foot', 'Horse', 'Boat', ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, T.routes.map((r, i) => h('tr', {},
            h('td', {}, sel(opts, r.a, (v) => change(() => { r.a = v; }), 'From')), h('td', {}, sel(opts, r.b, (v) => change(() => { r.b = v; }), 'To')),
            h('td', {}, h('input', { class: 'input input--sm xnum', type: 'number', min: 0, value: r.dist, 'aria-label': 'Distance', onchange: (e) => change(() => { r.dist = Math.max(0, +e.target.value || 0); }) }), ' ', T.unit),
            h('td', {}, sel(TERRAIN, r.terrain, (v) => change(() => { r.terrain = v; }), 'Terrain')),
            ['foot', 'horse', 'boat'].map((m) => h('td', { class: modesOf(r.terrain).includes(m) ? '' : 'muted' }, modesOf(r.terrain).includes(m) ? fmtDays(legDays(r, T.speeds, m)) : '—')),
            h('td', {}, h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove route', onclick: () => change(() => { T.routes.splice(i, 1); }) }, icon('x')))))))) : h('p', { class: 'muted' }, 'No routes yet. Add one for each road, river or sea lane you care about; longer trips are worked out through them.')),
        panel('routes-speeds', h('span', { class: 'xlabel' }, 'Speeds'),
          ['foot', 'horse', 'boat'].map((m) => h('label', { class: 'xinline' }, { foot: 'On foot', horse: 'Horse', boat: 'Boat' }[m], h('input', { class: 'input input--sm xnum', type: 'number', min: 1, value: T.speeds[m], 'aria-label': m, onchange: (e) => change(() => { T.speeds[m] = Math.max(1, +e.target.value || 1); }) }), `${T.unit}/day`)),
          h('label', { class: 'xinline' }, 'Units', sel([['mi', 'miles'], ['km', 'km'], ['leagues', 'leagues']], T.unit, (v) => change(() => { T.unit = v; }), 'Units')),
          h('span', { class: 'muted small' }, 'Rough terrain halves walking and riding speed.'))),
      h('aside', { class: 'xcols__side' }, panel('', h('h2', { class: 'xpanel__t' }, 'Too fast'),
        issues.length ? issues.map((x) => h('div', { class: 'xwarnbox' },
          h('strong', {}, `${x.c.name}: ${nameOf(x.a.place)} → ${nameOf(x.b.place)} in ${plural(x.have, 'day')}`),
          h('span', { class: 'small' }, `Fastest is ${fmtDays(x.need)}.`),
          h('span', { class: 'small' }, cardBtn(x.a.k), ' → ', cardBtn(x.b.k)),
          dismissBtn(x.key, 'They had a way'))) : h('p', { class: 'ok' }, icon('check'), ' No impossible journeys.'),
        h('p', { class: 'muted small' }, 'Checked when a character is in scenes at two places that both have an exact day under “When in the story”.')))));
}

// ======================================================================
// Factions: org charts
// ======================================================================

export function viewFactions(p) {
  const ft = factionType();
  if (!ft) return h('div', { class: 'wrap x' }, empty('No factions type', 'Add an entry type called Factions (or Guilds, Houses…) to draw org charts.'));
  const fs = factions();
  if (!fs.length) return h('div', { class: 'wrap x' }, pageHead('Factions', 'Who belongs, and who reports to whom.'), empty('No factions yet', 'Add factions in Entries, then set “Belongs to” on characters.', h('a', { class: 'btn', href: phref('world/' + ft.id) }, 'Open factions')));
  const f = fs.find((x) => x.id === S.facSel) || fs[0];
  const members = chars().filter((e) => factionsOf(e).includes(f.id));
  const leaderField = ft.fields.find((x) => x.type === 'link' && /leader|head|chief/i.test(x.name));
  const leaders = new Set(leaderField ? f.fields[leaderField.id] || [] : []);
  const ids = new Set(members.map((e) => e.id));
  const kids = (id) => members.filter((e) => e.reportsTo === id && e.id !== id);
  const roots = members.filter((e) => leaders.has(e.id) || !e.reportsTo || !ids.has(e.reportsTo)).sort((a, b) => (leaders.has(b.id) ? 1 : 0) - (leaders.has(a.id) ? 1 : 0));
  const BW = 190, BH = 58, GX = 24, GY = 70;
  const nodes = [], lines = [];
  let x = 0;
  const seen = new Set();
  const place = (e, depth) => {
    if (seen.has(e.id)) return null;
    seen.add(e.id);
    const ch = kids(e.id).map((c) => place(c, depth + 1)).filter(Boolean);
    let cx;
    if (ch.length) cx = (ch[0].cx + ch[ch.length - 1].cx) / 2;
    else { cx = x + BW / 2; x += BW + GX; }
    const n = { e, cx, y: depth * (BH + GY) + 16 };
    nodes.push(n);
    for (const c of ch) lines.push(`M${cx},${n.y + BH} V${n.y + BH + GY / 2} H${c.cx} V${c.y}`);
    return n;
  };
  roots.forEach((e) => place(e, 0));
  const width = Math.max(x, BW) + 20, height = Math.max(...nodes.map((n) => n.y), 0) + BH + 30;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'fam__svg'); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('aria-hidden', 'true');
  for (const d of lines) { const el = document.createElementNS(svgNS, 'path'); el.setAttribute('d', d); el.setAttribute('class', 'fam__line fam__line--parent'); el.setAttribute('fill', 'none'); svg.append(el); }
  const chart = h('div', { class: 'fam', style: { width: width + 'px', height: height + 'px' } }, svg,
    nodes.map((n) => h('a', { class: 'fam__box' + (leaders.has(n.e.id) ? ' is-lead' : ''), href: phref('e/' + n.e.id), style: { left: n.cx - BW / 2 + 'px', top: n.y + 'px', width: BW + 'px' } },
      h('span', { class: 'fam__t' }, h('strong', {}, n.e.name || 'Unnamed'), h('span', { class: 'muted small' }, n.e.role || (leaders.has(n.e.id) ? 'Leader' : n.e.summary || ''))))));
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Factions', 'Who belongs, and who reports to whom. Set “Belongs to”, Role and “Reports to” on each character’s profile.',
      h('label', { class: 'xinline' }, 'Faction', sel(fs.map((x) => [x.id, x.name || 'Unnamed']), f.id, (v) => { S.facSel = v; render(); }, 'Faction')),
      h('a', { class: 'btn btn--sm', href: phref('e/' + f.id) }, 'Open entry')),
    panel('fam-wrap', members.length ? h('div', { class: 'fam-scroll' }, chart) : h('p', { class: 'muted' }, `No one belongs to ${f.name || 'this faction'} yet.`),
      h('p', { class: 'muted small' }, f.summary || '')));
}
