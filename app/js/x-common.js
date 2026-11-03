// Helpers shared by the feature modules (x-*.js).
import { h, icon, toast } from './dom.js';
import { numeral } from './model.js';
import { S, store, P, isSeries, inSeriesTop, readingSeq, bookSeq, openCard, cardInfo, change } from './app.js';

// ---------- Which entry types are which ----------

const typeLike = (re) => () => { const t = P().types; return t.find((x) => re.test(x.name || '')) || null; };
export const charType = () => typeLike(/charac|people|person|cast|crew|npc/i)() || P().types[0] || null;
export const placeType = typeLike(/place|location|setting|region|area/i);
export const factionType = typeLike(/faction|guild|organi|group|house|clan|order|team/i);
export const isChar = (e) => !!e && !!charType() && e.typeId === charType().id;
export const isPlace = (e) => !!e && !!placeType() && e.typeId === placeType().id;
export const chars = () => P().entities.filter(isChar).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
export const places = () => P().entities.filter(isPlace).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
export const factions = () => { const t = factionType(); return t ? P().entities.filter((e) => e.typeId === t.id).sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []; };
// The character field that points at factions ("Belongs to").
export function factionField() {
  const ct = charType(), ft = factionType();
  return ct && ft ? ct.fields.find((f) => f.type === 'link' && f.linkType === ft.id) || null : null;
}
export function factionsOf(e) {
  const f = factionField();
  const own = f ? e.fields[f.id] || [] : [];
  const ft = factionType();
  const viaFaction = ft ? P().entities.filter((x) => x.typeId === ft.id && Object.values(x.fields || {}).some((v) => Array.isArray(v) && v.includes(e.id))).map((x) => x.id) : [];
  return [...new Set([...own, ...viaFaction])];
}
export const nameOf = (id) => (id === 'reader' ? 'The reader' : (P().entities.find((e) => e.id === id) || {}).name || 'Unnamed');

// ---------- Reading order ----------

// The parts (columns) in reach, in reading order: one book, or every book of the series.
export function units(p = P()) {
  const books = inSeriesTop() ? S.project.books : [p];
  const out = [];
  for (const b of books) {
    const seq = bookSeq(b);
    b.columns.forEach((c, i) => {
      out.push({ b, c, i, num: numeral(b, i), label: `${isSeries() && inSeriesTop() ? short(b.title) + ' ' : ''}${numeral(b, i)}`,
        long: `${isSeries() && inSeriesTop() ? b.title + ' · ' : ''}${b.labels.column} ${numeral(b, i)}${c.title ? ': ' + c.title : ''}`,
        cards: seq.filter((k) => k.colId === c.id) });
    });
  }
  return out;
}
export const short = (t) => (t || 'Book').split(/\s+/).filter((w) => !/^(the|a|an|of)$/i.test(w)).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'B';
// Position of every card in reading order across the whole series (or project).
export function positions() {
  const m = new Map();
  readingSeq().forEach(({ k }, i) => m.set(k, i));
  return m;
}

// ---------- Small UI pieces ----------

export const cardBtn = (k, label) => h('button', { class: 'linkbtn', type: 'button', onclick: () => openCard(k.id) },
  label || `${cardInfo(k).num} · ${k.title || 'Untitled scene'}`);
export function seg(opts, value, on, label = 'View') {
  return h('div', { class: 'tl-seg', role: 'group', 'aria-label': label }, opts.map(([v, l]) =>
    h('button', { class: 'tl-seg__btn' + (v === value ? ' is-on' : ''), type: 'button', 'aria-pressed': String(v === value), onclick: () => on(v) }, l)));
}
export const sel = (opts, value, on, label, cls = 'input input--sm') => h('select', { class: cls, 'aria-label': label, onchange: (e) => on(e.target.value) },
  opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, l)));
export const pageHead = (title, blurb, ...right) => h('div', { class: 'xhead' },
  h('div', { class: 'xhead__text' }, h('h1', { class: 'display' }, title), blurb ? h('p', { class: 'muted' }, blurb) : null),
  h('span', { class: 'spacer' }), right);
export const panel = (cls, ...kids) => h('section', { class: 'xpanel ' + (cls || '') }, kids);
export const empty = (title, msg, ...actions) => h('div', { class: 'xempty' }, h('h2', { class: 'display' }, title), h('p', { class: 'muted' }, msg), actions);

// Editable list of short strings, as chips.
export function chipsEditor(list, onChange, { placeholder = 'Add…', cls = '', label = 'Add' } = {}) {
  const box = h('div', { class: 'xchips ' + cls });
  const draw = () => {
    box.replaceChildren(
      ...list.map((t, i) => h('span', { class: 'xchip' }, t,
        h('button', { class: 'xchip__x', type: 'button', 'aria-label': `Remove ${t}`, onclick: () => { list.splice(i, 1); onChange(list); draw(); } }, '×'))),
      h('input', { class: 'xchips__in', placeholder, 'aria-label': label, onkeydown: (e) => {
        if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
          e.preventDefault();
          for (const v of e.target.value.split(',').map((x) => x.trim()).filter(Boolean)) if (!list.includes(v)) list.push(v);
          onChange(list); draw(); box.querySelector('input').focus();
        } else if (e.key === 'Backspace' && !e.target.value && list.length) { list.pop(); onChange(list); draw(); box.querySelector('input').focus(); }
      }, onblur: (e) => { const v = e.target.value.trim(); if (v && !list.includes(v)) { list.push(v); onChange(list); draw(); } } }));
  };
  draw();
  return box;
}

// ---------- Checks you’ve chosen to ignore ----------

export const dismissed = (key) => (S.project.dismissed || []).includes(key);
export const dismissBtn = (key, label = 'Ignore') => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'It’s on purpose: stop flagging this',
  onclick: () => change(() => { S.project.dismissed.push(key); }) }, label);

// ---------- Images ----------

export const imgUrl = (name) => store.fileUrl(name);
export async function uploadImages(files) {
  const out = [];
  for (const f of files) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { toast(`${f.name}: only PNG, JPEG, GIF or WebP images.`); continue; }
    try { out.push(await store.upload(f)); } catch (e) { toast(e.message); }
  }
  return out;
}
export const fileInput = (onFiles, { multiple = true, label = 'Upload images' } = {}) => h('label', { class: 'btn btn--sm xupload' }, icon('plus'), ' ' + label,
  h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple, class: 'sr-only', onchange: async (e) => { const fl = [...e.target.files]; e.target.value = ''; onFiles(await uploadImages(fl)); } }));
