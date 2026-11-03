// Where projects are kept.
//
// ServerStore talks to api.php next to this page, which keeps one file per
// project on the web host (behind the planner password) plus rolling backups.
//
// LocalStore keeps everything in this browser only. It is used by the ?demo mode.

export class StoreError extends Error {
  constructor(message, status, kind) { super(message); this.status = status; this.kind = kind; }
}

export class ServerStore {
  constructor(base = 'api.php') { this.base = base; this.label = 'oliveratwood.com'; }

  async req(action, { method = 'GET', params = {}, body } = {}) {
    const qs = new URLSearchParams({ action, ...params });
    let res;
    try {
      res = await fetch(`${this.base}?${qs}`, {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'X-Planner': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new StoreError('Can’t reach the server. Check your connection.', 0, 'offline');
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data) {
      if (!data && res.ok) throw new StoreError('The server sent back something unexpected. Is PHP running on this host?', res.status, 'error');
      throw new StoreError((data && data.error) || `Server error (${res.status})`, res.status, (data && data.kind) || (res.status >= 500 ? 'server' : 'error'));
    }
    return data;
  }

  status() { return this.req('status'); }
  async login(username, password) { return this.req('login', { method: 'POST', body: { username, password } }); }
  async logout() { await this.req('logout', { method: 'POST', body: {} }); }
  async list() { return (await this.req('list')).projects; }
  async read(slug) { const r = await this.req('read', { params: { slug } }); return { data: r.data, sha: r.rev }; }
  async write(slug, data, sha) {
    const r = await this.req('write', { method: 'POST', params: { slug }, body: { data, rev: sha || null } });
    return r.rev;
  }
  async remove(slug) { await this.req('delete', { method: 'POST', params: { slug }, body: {} }); }
  async backups(slug) { return (await this.req('backups', { params: { slug } })).backups; }
  async backup(slug, id) { return (await this.req('backup', { params: { slug, id } })).data; }
  async deleted() { return (await this.req('deleted')).projects; }
  // Images: the server keeps them; the planner stores only their names.
  async upload(file) {
    let res;
    try {
      res = await fetch(`${this.base}?action=upload`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Planner': '1', 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    } catch { throw new StoreError('Can’t reach the server. Check your connection.', 0, 'offline'); }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data) throw new StoreError((data && data.error) || `Upload failed (${res.status})`, res.status, (data && data.kind) || 'error');
    return data.name;
  }
  fileUrl(name) { return /^[a-f0-9]{20}\.(png|jpg|gif|webp)$/.test(name || '') ? `${this.base}?action=file&n=${name}` : ''; }
  async ideas() { return this.req('ideas'); }
  async saveIdeas(ideas, rev) { return (await this.req('ideas', { method: 'POST', body: { ideas, rev: rev || null } })).rev; }
}

export class LocalStore {
  constructor() { this.label = 'this browser (demo)'; this.key = 'planner:demo:'; }
  async status() { return { configured: true, authed: true, user: 'Demo' }; }
  async login() {}
  async logout() {}
  async backups() { return []; }
  async backup() { return null; }
  async deleted() { return []; }
  all() {
    try { return JSON.parse(localStorage.getItem(this.key + 'projects') || '{}'); } catch { return {}; }
  }
  put(all) { localStorage.setItem(this.key + 'projects', JSON.stringify(all)); }
  async list() {
    return Object.entries(this.all()).map(([slug, v]) => ({
      slug, rev: v.sha, title: v.data.title, synopsis: v.data.synopsis || '', updated: v.updated || '',
      counts: { cards: v.data.cards.length, entities: v.data.entities.length, columns: v.data.columns.length },
    }));
  }
  async read(slug) {
    const v = this.all()[slug];
    if (!v) throw new StoreError('Not found', 404, 'missing');
    return { data: v.data, sha: v.sha };
  }
  async write(slug, data, sha) {
    const all = this.all();
    if (all[slug] && all[slug].sha !== sha) throw new StoreError('Changed elsewhere', 409, 'conflict');
    const next = Math.random().toString(36).slice(2);
    if (!all[slug] && sha) throw new StoreError('Deleted elsewhere', 409, 'conflict');
    all[slug] = { data, sha: next, updated: new Date().toISOString() };
    this.put(all);
    return next;
  }
  async remove(slug) { const all = this.all(); delete all[slug]; this.put(all); }
  async upload(file) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new StoreError('Couldn’t read that file.', 0, 'error')); r.readAsDataURL(file); });
  }
  fileUrl(name) { return /^data:image\/(png|jpeg|gif|webp);base64,/.test(name || '') ? name : ''; }
  async ideas() { try { return JSON.parse(localStorage.getItem(this.key + 'ideas')) || { ideas: [], rev: null }; } catch { return { ideas: [], rev: null }; } }
  async saveIdeas(ideas) { const rev = Math.random().toString(36).slice(2); localStorage.setItem(this.key + 'ideas', JSON.stringify({ ideas, rev })); return rev; }
}

// ---------- Unsaved-changes safety net (per device) ----------

const LOCAL = 'planner:unsaved:';
export const unsaved = {
  get(scope, slug) {
    try { return JSON.parse(localStorage.getItem(LOCAL + scope + ':' + slug)); } catch { return null; }
  },
  set(scope, slug, value) {
    try { localStorage.setItem(LOCAL + scope + ':' + slug, JSON.stringify(value)); } catch { /* full or blocked */ }
  },
  clear(scope, slug) {
    try { localStorage.removeItem(LOCAL + scope + ':' + slug); } catch { /* blocked */ }
  },
};
