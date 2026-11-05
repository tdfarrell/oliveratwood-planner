// LitRPG: the item grid, loot and drop tables, the quest log, and system
// message templates. Everything reads the game events already on scene cards.
import { h, icon, clear, append, confirmDanger, ask, toast, autosize } from './dom.js';
import { uid, describeEvent, fillMsg, RARITIES, ITEM_TYPES, QUEST_KINDS, QUEST_ACTS, DEFAULT_MSGS } from './model.js';
import { S, P, isSeries, change, render, phref, openCard, cardInfo, readingSeq, entity, plural, sheetChars, progressOf, sameName, scopeCards } from './app.js';
import { chars, nameOf, cardBtn, seg, sel, pageHead, panel, empty } from './x-common.js';

const G = () => P().game;
const RC = Object.fromEntries(RARITIES);
const where = (k) => `${isSeries() ? cardInfo(k).b.title + ' · ' : ''}${cardInfo(k).part}`;
const ENCH = [['ench', 'Enchantment'], ['bonus', 'Bonus'], ['curse', 'Curse']];

// ======================================================================
// Items
// ======================================================================

function finalSheet(e) { const pr = progressOf(e); return pr.steps.length ? pr.steps[pr.steps.length - 1].after : pr.base; }
function heldBy(name) {
  return sheetChars().filter((e) => { const sh = finalSheet(e); return sh.items.some((x) => sameName(x, name)) || Object.values(sh.slots || {}).some((x) => sameName(x, name)); });
}
function itemHistory(name) {
  const out = [];
  for (const { k } of readingSeq()) for (const ev of k.game || []) {
    if ((ev.kind === 'item' && sameName(ev.name, name)) || (ev.kind === 'equip' && sameName(ev.value, name))) out.push({ k, ev, text: `${nameOf(ev.who)}: ${describeEvent(ev)}` });
  }
  return out;
}
function namesOnSheets() {
  const names = new Map();
  const add = (n) => { const t = String(n || '').trim(); if (t && !names.has(t.toLowerCase())) names.set(t.toLowerCase(), t); };
  for (const e of sheetChars()) { const b = e.sheet.base; (b.items || []).forEach(add); Object.values(b.slots || {}).forEach(add); }
  for (const k of scopeCards()) for (const ev of k.game || []) { if (ev.kind === 'item') add(ev.name); if (ev.kind === 'equip') add(ev.value); }
  return [...names.values()];
}

export function viewItems(p) {
  const items = G().items;
  const F = S.itemF || (S.itemF = { type: '', rarity: '', who: '', q: '' });
  const missing = namesOnSheets().filter((n) => !items.some((x) => sameName(x.name, n)));
  const addItem = (name = '') => { const it = { id: uid(), name, type: 'Weapon', slot: '', rarity: 'Common', req: '', stats: '', ench: [], set: '', setBonus: '', flavor: '' }; S.itemSel = it.id; change(() => { items.push(it); }); };
  const q = F.q.trim().toLowerCase();
  const list = items.filter((it) => (!F.type || it.type === F.type) && (!F.rarity || it.rarity === F.rarity) && (!F.who || (F.who === '__none' ? !heldBy(it.name).length : heldBy(it.name).some((e) => e.id === F.who)))
    && (!q || [it.name, it.stats, it.set, ...it.ench.map((x) => x.text)].join(' ').toLowerCase().includes(q)));
  const cur = items.find((x) => x.id === S.itemSel) || list[0] || items[0];
  const upd = (fn) => change(fn, { render: false });
  const detail = cur ? (() => {
    const hist = itemHistory(cur.name);
    const rc = RC[cur.rarity] || RC.Common;
    return h('aside', { class: 'xcols__side' },
      h('div', { class: 'icard', style: { '--rc': rc } },
        h('span', { class: 'icard__name' }, cur.name || 'Unnamed item'),
        h('span', { class: 'icard__sub' }, `${cur.rarity} ${cur.type}${cur.slot ? ' · ' + cur.slot : ''}${cur.req ? ' · ' + cur.req : ''}`),
        cur.stats ? h('span', { class: 'icard__stats' }, cur.stats.split(/\s*[·;,\n]\s*/).filter(Boolean).map((x) => h('span', {}, x))) : null,
        cur.ench.length ? h('span', { class: 'icard__ench' }, cur.ench.map((x) => h('span', { class: 'icard__e icard__e--' + x.kind }, '◇ ' + x.text))) : null,
        cur.set ? h('span', { class: 'icard__set' }, h('span', {}, cur.set), cur.setBonus ? h('span', { class: 'icard__dim' }, cur.setBonus) : null) : null,
        cur.flavor ? h('span', { class: 'icard__flavor' }, cur.flavor) : null),
      panel('iform',
        h('div', { class: 'xrow' }, h('input', { class: 'input', value: cur.name, placeholder: 'Item name', 'aria-label': 'Item name', oninput: (e) => upd(() => { cur.name = e.target.value; }), onchange: () => render() })),
        h('div', { class: 'xrow' }, sel(RARITIES.map(([r]) => [r, r]), cur.rarity, (v) => change(() => { cur.rarity = v; }), 'Rarity'), sel(ITEM_TYPES.map((t) => [t, t]), cur.type, (v) => change(() => { cur.type = v; }), 'Type'),
          h('input', { class: 'input input--sm', value: cur.slot, placeholder: 'Slot', 'aria-label': 'Slot', oninput: (e) => upd(() => { cur.slot = e.target.value; }), onchange: () => render() })),
        h('input', { class: 'input input--sm', value: cur.req, placeholder: 'Requirements (Lv 8 · AGI 12)', 'aria-label': 'Requirements', oninput: (e) => upd(() => { cur.req = e.target.value; }), onchange: () => render() }),
        h('input', { class: 'input input--sm', value: cur.stats, placeholder: 'Stats (ATK 14–19 · SPD +3)', 'aria-label': 'Stats', oninput: (e) => upd(() => { cur.stats = e.target.value; }), onchange: () => render() }),
        h('span', { class: 'xlabel' }, 'Enchantments, bonuses, curses'),
        cur.ench.map((x, i) => h('div', { class: 'xrow' }, sel(ENCH, x.kind, (v) => change(() => { x.kind = v; }), 'Kind'),
          h('input', { class: 'input input--sm', value: x.text, 'aria-label': 'Effect', oninput: (e) => upd(() => { x.text = e.target.value; }), onchange: () => render() }),
          h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { cur.ench.splice(i, 1); }) }, icon('x')))),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { cur.ench.push({ kind: 'ench', text: '' }); }) }, icon('plus'), ' Effect'),
        h('div', { class: 'xrow' }, h('input', { class: 'input input--sm', value: cur.set, placeholder: 'Set (Warden’s Regalia)', 'aria-label': 'Set', oninput: (e) => upd(() => { cur.set = e.target.value; }), onchange: () => render() }),
          h('input', { class: 'input input--sm', value: cur.setBonus, placeholder: 'Set bonus', 'aria-label': 'Set bonus', oninput: (e) => upd(() => { cur.setBonus = e.target.value; }), onchange: () => render() })),
        autosize(h('textarea', { class: 'input input--sm', rows: 2, value: cur.flavor, placeholder: 'Flavor text', 'aria-label': 'Flavor text', oninput: (e) => upd(() => { cur.flavor = e.target.value; }), onchange: () => render() })),
        h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: async () => { if (await confirmDanger(`Delete ${cur.name || 'this item'}?`, 'Game sheets that mention it keep the name.')) change(() => { G().items = items.filter((x) => x !== cur); }); } }, icon('trash'), ' Delete item')),
      panel('', h('h2', { class: 'xpanel__t' }, 'History'),
        hist.length ? h('ol', { class: 'ihist' }, hist.map((x) => h('li', {}, h('span', {}, x.text), cardBtn(x.k, where(x.k))))) : h('p', { class: 'muted small' }, 'Not in any scene yet. Add an Item or Equip game event on a scene card.'),
        h('p', { class: 'muted small' }, 'Built from the game events on scene cards, so moving a scene moves the history with it.')));
  })() : null;
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Items', 'Every weapon, armor piece and item on the game sheets.',
      missing.length ? h('button', { class: 'btn btn--sm', type: 'button', title: missing.join(', '), onclick: () => change(() => { for (const n of missing) items.push({ id: uid(), name: n, type: 'Weapon', slot: '', rarity: 'Common', req: '', stats: '', ench: [], set: '', setBonus: '', flavor: '' }); }) }, `Add ${plural(missing.length, 'item')} from game sheets`) : null,
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => addItem() }, icon('plus'), ' Item')),
    !items.length ? empty('No items yet', 'Add weapons, armor and items with their stats and enchantments. Items already on game sheets can be added in one go.') : [
      panel('xbar', h('input', { class: 'input input--sm', type: 'search', placeholder: 'Find an item, stat or enchantment', value: F.q, 'aria-label': 'Search items', oninput: (e) => { F.q = e.target.value; const at = e.target.selectionStart; render(); const f = document.querySelector('.ifind'); if (f) { f.focus(); f.setSelectionRange(at, at); } }, class: 'input input--sm ifind' }),
        h('div', { class: 'xchips' }, ['', ...ITEM_TYPES].map((t) => h('button', { class: 'xfilter' + (F.type === t ? ' is-on' : ''), type: 'button', 'aria-pressed': String(F.type === t), onclick: () => { F.type = t; render(); } }, t || 'All', ' ', h('span', { class: 'muted' }, String(t ? items.filter((x) => x.type === t).length : items.length))))),
        h('span', { class: 'spacer' }),
        h('label', { class: 'xinline' }, 'Rarity', sel([['', 'Any'], ...RARITIES.map(([r]) => [r, r])], F.rarity, (v) => { F.rarity = v; render(); }, 'Rarity')),
        h('label', { class: 'xinline' }, 'Held by', sel([['', 'Anyone'], ...sheetChars().map((e) => [e.id, e.name || 'Unnamed']), ['__none', 'Nobody (loot)']], F.who, (v) => { F.who = v; render(); }, 'Held by'))),
      h('div', { class: 'xcols' }, h('div', { class: 'xcols__main' }, panel('itab', h('div', { class: 'itab__scroll' }, h('table', { class: 'itab__t' },
        h('thead', {}, h('tr', {}, ['Item', 'Type · slot', 'Req', 'Stats', 'Enchantments & bonuses', 'Held by', 'First seen'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, list.map((it) => {
          const held = heldBy(it.name), first = itemHistory(it.name)[0];
          return h('tr', { class: it === cur ? 'is-sel' : '' },
            h('td', {}, h('button', { class: 'itab__name', type: 'button', style: { '--rc': RC[it.rarity] || RC.Common }, 'aria-pressed': String(it === cur), onclick: () => { S.itemSel = it.id; render(); } }, h('strong', {}, it.name || 'Unnamed'), h('span', {}, it.rarity))),
            h('td', {}, it.type, it.slot ? [h('br'), h('span', { class: 'muted small' }, it.slot)] : null),
            h('td', { class: 'mono' }, it.req || '—'), h('td', { class: 'mono' }, it.stats || '—'),
            h('td', {}, it.ench.map((x) => h('span', { class: 'etag etag--' + x.kind }, x.text))),
            h('td', {}, held.map((e) => e.name).join(', ') || h('span', { class: 'muted' }, '—')),
            h('td', { class: 'small' }, first ? cardBtn(first.k, where(first.k)) : h('span', { class: 'muted' }, 'Not yet')));
        }))))), list.length ? null : h('p', { class: 'muted' }, 'Nothing matches.')), detail)]);
}

// ======================================================================
// Loot and drop tables
// ======================================================================

const LOOT_KINDS = [['area', 'Areas'], ['monster', 'Monsters'], ['chest', 'Chests & quests']];
function rollQty(q) {
  const m = String(q || '1').match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) { const a = +m[1], b = +m[2]; return a + Math.floor(Math.random() * (Math.max(a, b) - a + 1)); }
  return Math.max(1, parseInt(q, 10) || 1);
}

export function viewLoot(p) {
  const T = G().loot;
  const add = () => { const t = { id: uid(), name: 'New table', kind: 'monster', where: '', rolls: 1, drops: [] }; S.lootSel = t.id; change(() => { T.push(t); }); };
  if (!T.length) return h('div', { class: 'wrap x' }, pageHead('Loot', 'Drop tables per area, monster or chest.'), empty('No drop tables yet', 'Make one for each area, monster or chest: what can drop, how likely, and when.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Drop table')));
  const cur = T.find((x) => x.id === S.lootSel) || T[0];
  const items = G().items;
  const upd = (fn) => change(fn, { render: false });
  const roll = S.lootRoll && S.lootRoll.id === cur.id ? S.lootRoll.res : null;
  const doRoll = () => {
    const res = [];
    for (let r = 0; r < Math.max(1, +cur.rolls || 1); r++) for (const d of cur.drops) if (d.item && Math.random() * 100 < (+d.chance || 0)) res.push({ item: d.item, qty: rollQty(d.qty) });
    S.lootRoll = { id: cur.id, res }; render();
  };
  const inStory = (name) => readingSeq().filter(({ k }) => (k.game || []).some((e) => e.kind === 'item' && e.op !== 'remove' && sameName(e.name, name))).map(({ k }) => k);
  return h('div', { class: 'wrap wrap--wide x' }, h('div', { class: 'xsplit' },
    h('aside', { class: 'xside' }, panel('',
      LOOT_KINDS.map(([k, l]) => { const ts = T.filter((x) => x.kind === k); return ts.length ? h('div', {}, h('span', { class: 'xlabel' }, l), ts.map((t) => h('button', { class: 'xside__item xside__item--row' + (t === cur ? ' is-on' : ''), type: 'button', 'aria-pressed': String(t === cur), onclick: () => { S.lootSel = t.id; render(); } }, h('span', {}, t.name || 'Untitled'), h('span', { class: 'muted small' }, String(t.drops.length))))) : null; }),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: add }, icon('plus'), ' Drop table'))),
    h('div', { class: 'xmain' },
      h('div', { class: 'xhead' }, h('div', { class: 'xhead__text' },
        h('input', { class: 'title-input', value: cur.name, 'aria-label': 'Table name', oninput: (e) => upd(() => { cur.name = e.target.value; }), onchange: () => render() }),
        h('div', { class: 'xrow' }, sel(LOOT_KINDS.map(([k, l]) => [k, l.replace(/s$/, '').replace('Chests & quest', 'Chest or quest')]), cur.kind, (v) => change(() => { cur.kind = v; }), 'Kind'),
          h('input', { class: 'input input--sm', value: cur.where, placeholder: 'Where (Floor 2 · Lv 18 boss)', 'aria-label': 'Where', oninput: (e) => upd(() => { cur.where = e.target.value; }) }))),
      h('span', { class: 'spacer' }),
      h('label', { class: 'xinline' }, 'Rolls', h('input', { class: 'input input--sm xnum', type: 'number', min: 1, max: 20, value: cur.rolls, 'aria-label': 'Rolls per kill', onchange: (e) => change(() => { cur.rolls = Math.max(1, Math.min(20, +e.target.value || 1)); }) })),
      h('button', { class: 'btn btn--sm btn--dark', type: 'button', onclick: doRoll, disabled: !cur.drops.length }, icon('dice'), ' Roll a drop'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete table', onclick: async () => { if (await confirmDanger(`Delete ${cur.name}?`, 'Items stay in the Items grid.')) change(() => { G().loot = T.filter((x) => x !== cur); }); } }, icon('trash'))),
      h('div', { class: 'xcols' }, h('div', { class: 'xcols__main' }, panel('itab', h('div', { class: 'itab__scroll' }, h('table', { class: 'itab__t loot__t' },
        h('thead', {}, h('tr', {}, ['Item', 'Chance per roll', 'Qty', 'Only if', 'In the story', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, cur.drops.map((d, i) => {
          const it = items.find((x) => sameName(x.name, d.item));
          const st = d.item ? inStory(d.item) : [];
          return h('tr', {},
            h('td', {}, h('input', { class: 'input input--sm', value: d.item, list: 'loot-items', placeholder: 'Item', 'aria-label': 'Item', style: { color: it ? RC[it.rarity] : null, fontWeight: 600 }, onchange: (e) => change(() => { d.item = e.target.value; }) })),
            h('td', {}, h('span', { class: 'loot__ch' }, h('span', { class: 'loot__bar' }, h('span', { style: { width: Math.min(100, +d.chance || 0) + '%', background: it ? RC[it.rarity] : '#5A6870' } })),
              h('input', { class: 'input input--sm xnum', type: 'number', min: 0, max: 100, step: 0.1, value: d.chance, 'aria-label': 'Chance', onchange: (e) => change(() => { d.chance = Math.max(0, Math.min(100, +e.target.value || 0)); }) }), '%')),
            h('td', {}, h('input', { class: 'input input--sm xnum', value: d.qty, placeholder: '1', 'aria-label': 'Quantity', oninput: (e) => upd(() => { d.qty = e.target.value; }) })),
            h('td', {}, h('input', { class: 'input input--sm', value: d.cond, placeholder: '—', 'aria-label': 'Only if', oninput: (e) => upd(() => { d.cond = e.target.value; }) })),
            h('td', { class: 'small' }, st.length ? cardBtn(st[0], where(st[0])) : h('span', { class: 'muted' }, '—')),
            h('td', {}, h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { cur.drops.splice(i, 1); }) }, icon('x'))));
        })))),
      h('datalist', { id: 'loot-items' }, items.map((x) => h('option', { value: x.name }))),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { cur.drops.push({ id: uid(), item: '', chance: 10, qty: '1', cond: '' }); }) }, icon('plus'), ' Drop'),
      h('p', { class: 'muted small' }, 'Chances are per roll and don’t have to add up to 100. Item names link to the Items grid.'))),
      h('aside', { class: 'xcols__side' }, roll ? h('div', { class: 'icard' },
        h('span', { class: 'icard__sub' }, `Last roll · ${plural(Math.max(1, +cur.rolls || 1), 'roll')}`),
        roll.length ? roll.map((r) => { const it = items.find((x) => sameName(x.name, r.item)); return h('span', { style: { color: it ? RC[it.rarity] : '#E6E0D2' } }, `[Loot] ${r.item}${r.qty > 1 ? ' ×' + r.qty : ''}`); }) : h('span', { class: 'icard__dim' }, 'Nothing dropped.'),
        roll.length && sheetChars().length ? h('button', { class: 'btn btn--sm icard__btn', type: 'button', onclick: () => lootToScene(roll) }, 'Add to a scene as game events…') : null)
        : panel('', h('p', { class: 'muted small' }, 'Roll to see what drops. You can add the result to a scene as Item events.')))))));
}

function lootToScene(res) {
  const cs = sheetChars();
  let who = cs[0].id, kid = (readingSeq().slice(-1)[0] || {}).k?.id || '';
  const dl = h('dialog', { class: 'dlg' });
  append(dl, [h('header', { class: 'dlg__head' }, h('h2', { class: 'dlg__title' }, 'Add the loot to a scene'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => dl.close() }, icon('x'))),
    h('div', { class: 'dlg__body' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Who gets it'), sel(cs.map((e) => [e.id, e.name || 'Unnamed']), who, (v) => { who = v; }, 'Who', 'input')),
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'In which scene'), sel(readingSeq().map(({ k }) => [k.id, `${where(k)} · ${k.title || 'Untitled'}`]), kid, (v) => { kid = v; }, 'Scene', 'input')),
      h('p', { class: 'muted small' }, res.map((r) => r.item + (r.qty > 1 ? ' ×' + r.qty : '')).join(', '))),
    h('footer', { class: 'dlg__foot' }, h('button', { class: 'btn', type: 'button', onclick: () => dl.close() }, 'Cancel'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
        const k = scopeCards().find((x) => x.id === kid);
        if (!k) return;
        change(() => { for (const r of res) k.game.push({ id: uid(), who, kind: 'item', op: 'add', name: r.item }); });
        dl.close(); toast(`Added to “${k.title || 'Untitled scene'}”`);
      } }, 'Add'))]);
  dl.addEventListener('close', () => dl.remove());
  document.body.append(dl);
  dl.showModal();
}

// ======================================================================
// Quests
// ======================================================================

const QK = Object.fromEntries(QUEST_KINDS.map(([v, l, c]) => [v, { l, c }]));
const STATUS = { '': 'Not in the story yet', offered: 'Offered', active: 'Active', completed: 'Completed', failed: 'Failed' };
export function questState(q) {
  const st = { status: '', given: null, ended: null, steps: {} };
  for (const { k } of readingSeq()) for (const x of k.quests || []) {
    if (x.q !== q.id) continue;
    if (x.act === 'offer') { if (!st.status) st.status = 'offered'; st.given = st.given || k; }
    else if (x.act === 'accept') { st.status = 'active'; st.given = st.given || k; }
    else if (x.act === 'step') { if (x.step) st.steps[x.step] = k; if (!st.status || st.status === 'offered') st.status = 'active'; }
    else if (x.act === 'complete') { st.status = 'completed'; st.ended = k; }
    else if (x.act === 'fail') { st.status = 'failed'; st.ended = k; }
  }
  return st;
}

export function viewQuests(p) {
  const Q = G().quests;
  const add = () => { const q = { id: uid(), name: 'New quest', kind: 'side', giver: '', blurb: '', reward: '', steps: [] }; S.questSel = q.id; change(() => { Q.push(q); }); };
  if (!Q.length) return h('div', { class: 'wrap x' }, pageHead('Quests', 'The quest log, tied to scenes.'), empty('No quests yet', 'Add quests with who gives them, the reward and the objectives. Then mark progress on scene cards (“Quests”).', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, icon('plus'), ' Quest')));
  const tab = S.questTab || 'all';
  const states = new Map(Q.map((q) => [q, questState(q)]));
  const shown = Q.filter((q) => tab === 'all' || states.get(q).status === (tab === 'none' ? '' : tab));
  const cur = Q.find((x) => x.id === S.questSel) || shown[0] || Q[0];
  const st = states.get(cur);
  const upd = (fn) => change(fn, { render: false });
  const count = (s) => Q.filter((q) => states.get(q).status === s).length;
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('Quests', 'Progress comes from scene cards, so the log is right for any point in the story.', h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: add }, icon('plus'), ' Quest')),
    seg([['all', `All ${Q.length}`], ['active', `Active ${count('active')}`], ['offered', `Offered ${count('offered')}`], ['completed', `Completed ${count('completed')}`], ['failed', `Failed ${count('failed')}`], ['none', `Not started ${count('')}`]], tab, (v) => { S.questTab = v; render(); }, 'Status'),
    h('div', { class: 'xcols' },
      h('div', { class: 'xcols__main' }, h('ul', { class: 'qlist' }, shown.map((q) => {
        const s = states.get(q);
        const done = q.steps.filter((x) => s.steps[x.id]).length;
        return h('li', {}, h('button', { class: 'qitem' + (q === cur ? ' is-on' : ''), type: 'button', 'aria-pressed': String(q === cur), onclick: () => { S.questSel = q.id; render(); } },
          h('span', { class: 'qitem__k', style: { color: (QK[q.kind] || QK.side).c } }, (QK[q.kind] || QK.side).l),
          h('strong', { class: 'qitem__n' }, q.name || 'Untitled quest'),
          h('span', { class: 'qstat qstat--' + (s.status || 'none') }, STATUS[s.status]),
          h('span', { class: 'muted small' }, `${q.giver ? 'From ' + nameOf(q.giver) + ' · ' : ''}${s.given ? where(s.given) : 'not given yet'}${s.ended ? ' → ' + where(s.ended) : ''}`),
          h('span', { class: 'muted small' }, q.steps.length ? `${done} of ${q.steps.length} objectives` : '')));
      })), shown.length ? null : h('p', { class: 'muted' }, 'None here.')),
      h('aside', { class: 'xcols__side' }, panel('qform',
        h('div', { class: 'xrow' }, sel(QUEST_KINDS.map(([v, l]) => [v, l + ' quest']), cur.kind, (v) => change(() => { cur.kind = v; }), 'Kind'), h('span', { class: 'qstat qstat--' + (st.status || 'none') }, STATUS[st.status]), h('span', { class: 'spacer' }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete quest', onclick: async () => { if (await confirmDanger(`Delete ${cur.name}?`, 'Scene cards lose their quest events for it.')) change(() => { G().quests = Q.filter((x) => x !== cur); for (const k of scopeCards()) k.quests = (k.quests || []).filter((x) => x.q !== cur.id); }); } }, icon('trash'))),
        h('input', { class: 'title-input', value: cur.name, 'aria-label': 'Quest name', oninput: (e) => upd(() => { cur.name = e.target.value; }), onchange: () => render() }),
        autosize(h('textarea', { class: 'input', rows: 2, value: cur.blurb, placeholder: 'What the quest says', 'aria-label': 'Description', oninput: (e) => upd(() => { cur.blurb = e.target.value; }) })),
        h('label', { class: 'xinline' }, 'Given by', sel([['', '—'], ...chars().map((e) => [e.id, e.name || 'Unnamed'])], cur.giver, (v) => change(() => { cur.giver = v; }), 'Given by')),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Reward'), h('input', { class: 'input input--sm', value: cur.reward, placeholder: '300 XP · Grafter’s Key', oninput: (e) => upd(() => { cur.reward = e.target.value; }) })),
        h('span', { class: 'xlabel' }, 'Objectives'),
        cur.steps.map((x, i) => h('div', { class: 'qstep' + (st.steps[x.id] ? ' is-done' : '') }, h('span', { class: 'qstep__m' }, st.steps[x.id] ? '✓' : String(i + 1)),
          h('div', { class: 'qstep__b' }, h('input', { class: 'input input--sm', value: x.text, 'aria-label': 'Objective', oninput: (e) => upd(() => { x.text = e.target.value; }) }), st.steps[x.id] ? cardBtn(st.steps[x.id], 'Done in ' + where(st.steps[x.id])) : null),
          h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove objective', onclick: () => change(() => { cur.steps.splice(i, 1); }) }, icon('x')))),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { cur.steps.push({ id: uid(), text: '' }); }) }, icon('plus'), ' Objective'),
        h('dl', { class: 'qdl' }, h('dt', {}, 'Given'), h('dd', {}, st.given ? cardBtn(st.given, where(st.given)) : '—'), h('dt', {}, 'Ends'), h('dd', {}, st.ended ? cardBtn(st.ended, where(st.ended)) : '—')),
        h('p', { class: 'muted small' }, 'On a scene card, “Quests”: offered, accepted, an objective done, completed or failed.')))));
}

export function questsBox(p, k, upd) {
  const box = h('div', { class: 'xbox' });
  const draw = () => {
    clear(box);
    const c = k();
    const Q = G().quests;
    c.quests.forEach((x, i) => {
      const q = Q.find((y) => y.id === x.q);
      box.append(h('div', { class: 'xbox__row' },
        sel(Q.map((y) => [y.id, y.name || 'Untitled']), x.q, (v) => { upd((cc) => { cc.quests[i].q = v; cc.quests[i].step = null; }); draw(); }, 'Quest'),
        sel(QUEST_ACTS, x.act, (v) => { upd((cc) => { cc.quests[i].act = v; }); draw(); }, 'What happens'),
        x.act === 'step' && q ? sel([['', 'Which objective?'], ...q.steps.map((s) => [s.id, s.text || 'Untitled'])], x.step || '', (v) => upd((cc) => { cc.quests[i].step = v || null; }), 'Objective') : null,
        h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => { upd((cc) => { cc.quests.splice(i, 1); }); draw(); } }, icon('x'))));
    });
    box.append(h('div', { class: 'xbox__row' },
      Q.length ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { upd((cc) => { cc.quests.push({ id: uid(), q: Q[Q.length - 1].id, act: 'accept', step: null }); }); draw(); } }, icon('plus'), ' Quest progress') : null,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => {
        const name = await ask('New quest', 'Quest name', '', 'Add');
        if (!name) return;
        const id = uid();
        change(() => { G().quests.push({ id, name, kind: 'side', giver: '', blurb: '', reward: '', steps: [] }); }, { render: false });
        upd((cc) => { cc.quests.push({ id: uid(), q: id, act: 'offer', step: null }); }); draw();
      } }, icon('plus'), ' New quest')));
  };
  draw();
  return box;
}

// ======================================================================
// System messages
// ======================================================================

const tplOf = (key) => (G().msgs.find((m) => m.key === key) || {}).tpl || '';
// The notifications a scene's events would show, in house style.
export function sceneMessages(k) {
  const style = G().msgStyle;
  const seen = new Map();
  const out = [];
  for (const { k: x } of readingSeq()) {
    for (const ev of x.game || []) {
      const who = nameOf(ev.who);
      const key = `${ev.who}|${String(ev.name || '').toLowerCase()}`;
      let m = null;
      switch (ev.kind) {
        case 'level': m = ['level', { name: who, level: ev.value }]; break;
        case 'stat': { const d = +ev.delta || 0; m = ['stat', { name: who, stat: ev.key, amount: (d >= 0 ? '+' : '') + d }]; break; }
        case 'res': m = ['res', { name: who, stat: ev.key, amount: ev.value }]; break;
        case 'id': m = ['id', { name: who, stat: ev.key, value: ev.value }]; break;
        case 'equip': if (ev.value) m = ['equip', { name: who, item: ev.value, slot: ev.key }]; break;
        case 'skill': if (ev.op !== 'remove') m = [seen.has(key) ? 'skillrank' : 'skill', { name: who, skill: ev.name, rank: ev.rank }]; seen.set(key, true); break;
        case 'item': m = [ev.op === 'remove' ? 'itemlost' : 'item', { name: who, item: ev.name }]; break;
        case 'title': if (ev.op !== 'remove') m = ['title', { name: who, title: ev.name }]; break;
        default: break;
      }
      if (x === k && m && tplOf(m[0])) out.push(fillMsg(tplOf(m[0]), m[1], style));
    }
    if (x === k) {
      for (const qx of x.quests || []) { const q = G().quests.find((y) => y.id === qx.q); if (q && tplOf('quest')) out.push(fillMsg(tplOf('quest'), { quest: q.name, state: (QUEST_ACTS.find(([v]) => v === qx.act) || [])[1] }, style)); }
      break;
    }
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function msgMismatches() {
  const style = G().msgStyle;
  const br = { '[]': '[]', '<>': '<>', '【】': '【】', none: '' }[style.brackets];
  const pats = G().msgs.map((m) => esc(String(m.tpl).replace(/^\[(.*)\]$/, '$1')).replace(/\\\{\w+\\\}/g, '(.+?)')).filter(Boolean);
  const out = [];
  for (const { k } of readingSeq()) for (const m of [k.summary, k.notes].join('\n').matchAll(/\[[^\]\n]{2,80}\]|<[^>\n]{2,80}>|【[^】\n]{2,80}】/g)) {
    const s = m[0], inner = s.slice(1, -1), used = s[0] + s[s.length - 1];
    const ci = pats.some((p) => new RegExp('^' + p + '$', 'i').test(inner));
    const cs = pats.some((p) => new RegExp('^' + p + '$').test(inner));
    let why = null;
    if (!ci) why = 'doesn’t match any template';
    else if (br && used !== br) why = `uses ${used} instead of ${br}`;
    else if (!cs && style.caps === 'first') why = 'different capitals';
    if (why) out.push({ k, s, why });
  }
  return out;
}

export function viewSysMsg(p) {
  const g = G();
  const style = g.msgStyle;
  const withEvents = readingSeq().map(({ k }) => k).filter((k) => (k.game || []).length || (k.quests || []).length);
  const k = withEvents.find((x) => x.id === S.msgScene) || withEvents[withEvents.length - 1];
  const prev = k ? sceneMessages(k) : [];
  const used = {};
  for (const { k: x } of readingSeq()) for (const ev of x.game || []) used[ev.kind] = (used[ev.kind] || 0) + 1;
  const usedFor = (key) => ({ level: used.level, skill: used.skill, skillrank: 0, item: used.item, itemlost: 0, stat: used.stat, res: used.res, title: used.title, id: used.id, equip: used.equip, quest: readingSeq().reduce((n, { k: x }) => n + (x.quests || []).length, 0) }[key] || 0);
  const bad = msgMismatches();
  return h('div', { class: 'wrap wrap--wide x' },
    pageHead('System messages', 'One wording per notification, used the same way in every book. Fill-ins in {braces} come from the game event.'),
    h('div', { class: 'xcols' },
      h('div', { class: 'xcols__main' }, panel('itab', h('table', { class: 'itab__t' },
        h('thead', {}, h('tr', {}, ['For', 'Template', 'Used', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, g.msgs.map((m, i) => h('tr', {},
          h('td', {}, DEFAULT_MSGS.some(([key]) => key === m.key) ? h('strong', {}, m.label) : h('input', { class: 'input input--sm', value: m.label, 'aria-label': 'Label', oninput: (e) => change(() => { m.label = e.target.value; }, { render: false }) })),
          h('td', {}, h('input', { class: 'input input--sm mono', value: m.tpl, 'aria-label': `Template for ${m.label}`, onchange: (e) => change(() => { m.tpl = e.target.value; }) })),
          h('td', { class: 'small' }, usedFor(m.key) ? plural(usedFor(m.key), 'time') : h('span', { class: 'muted' }, '—')),
          h('td', {}, DEFAULT_MSGS.some(([key]) => key === m.key) ? null : h('button', { class: 'iconbtn iconbtn--sm', type: 'button', 'aria-label': 'Remove', onclick: () => change(() => { g.msgs.splice(i, 1); }) }, icon('x')))))))),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => change(() => { g.msgs.push({ key: 'c' + uid(), label: 'Custom', tpl: '[Warning: {text}]' }); }) }, icon('plus'), ' Template for your own copy-paste'),
      h('p', { class: 'muted small' }, 'Fill-ins: {name}, {level}, {stat}, {amount}, {value}, {skill}, {rank}, {item}, {slot}, {title}, {quest}, {state}.')),
      h('aside', { class: 'xcols__side' },
        panel('', h('span', { class: 'xlabel' }, 'Preview'),
          withEvents.length ? sel(withEvents.map((x) => [x.id, `${where(x)} · ${x.title || 'Untitled'}`]), k.id, (v) => { S.msgScene = v; render(); }, 'Scene') : null,
          h('div', { class: 'sysbox' }, prev.length ? prev.map((t) => h('span', {}, t)) : h('span', { class: 'sysbox__dim' }, 'Add game events to a scene to preview its messages.')),
          prev.length ? h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(prev.join('\n')); toast('Copied'); } catch { toast('Couldn’t copy. Select the text instead.'); } } }, icon('copy'), ' Copy as plain text') : null),
        panel('', h('span', { class: 'xlabel' }, 'House style'),
          h('label', { class: 'xinline' }, 'Brackets', sel([['[]', '[ … ]'], ['<>', '< … >'], ['【】', '【 … 】'], ['none', 'none']], style.brackets, (v) => change(() => { style.brackets = v; }), 'Brackets')),
          h('label', { class: 'xinline' }, 'Capitals', sel([['first', 'First word only'], ['title', 'Title Case'], ['upper', 'ALL CAPS']], style.caps, (v) => change(() => { style.caps = v; }), 'Capitals'))),
        bad.length ? panel('xwarn xwarn--bad', h('strong', {}, `${plural(bad.length, 'summary')} use another wording`.replace('summarys', 'summaries')),
          bad.slice(0, 8).map((x) => h('span', { class: 'small' }, `“${x.s}” ${x.why} · `, cardBtn(x.k, where(x.k))))) : null)));
}
