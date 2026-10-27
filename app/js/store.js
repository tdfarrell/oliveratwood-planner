// Where projects are kept.
//
// GitHubStore keeps one JSON file per project at data/projects/<slug>.json in a
// (private) GitHub repository, using a fine-grained personal access token with
// "Contents: Read and write" on that repository. Every save is a commit, so the
// repository's history doubles as version history and backup.
//
// LocalStore keeps everything in this browser only. It is used by the ?demo mode.

const API = 'https://api.github.com';
const DIR = 'data/projects';

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class StoreError extends Error {
  constructor(message, status, kind) { super(message); this.status = status; this.kind = kind; }
}

export class GitHubStore {
  constructor({ token, repo, branch }) {
    this.token = token;
    this.repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    this.branch = branch || null;
    this.label = this.repo;
  }

  async req(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opts,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (e) {
      throw new StoreError('Can’t reach GitHub. Check your connection.', 0, 'offline');
    }
    if (res.status === 204) return null;
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const msg = (body && body.message) || res.statusText;
      let kind = 'error';
      if (res.status === 401) kind = 'auth';
      else if (res.status === 409 || (res.status === 422 && /sha/i.test(msg))) kind = 'conflict';
      else if (res.status === 404) kind = 'missing';
      else if (res.status === 403 && /rate limit/i.test(msg)) kind = 'rate';
      throw new StoreError(msg, res.status, kind);
    }
    return body;
  }

  ref() { return this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ''; }

  // Confirms the token works and can write. Returns { private, branch }.
  async check() {
    let info;
    try { info = await this.req(`/repos/${this.repo}`); }
    catch (e) {
      if (e.kind === 'auth') throw new StoreError('GitHub didn’t accept that token. It may be mistyped or expired.', 401, 'auth');
      if (e.kind === 'missing') throw new StoreError(`Couldn’t find ${this.repo}. Check the name, and that the token was given access to it.`, 404, 'missing');
      throw e;
    }
    if (info.permissions && info.permissions.push === false) {
      throw new StoreError('That token can read the repository but not save to it. Give it “Contents: Read and write”.', 403, 'auth');
    }
    this.branch = this.branch || info.default_branch || 'main';
    return { private: !!info.private, branch: this.branch };
  }

  async list() {
    try {
      const items = await this.req(`/repos/${this.repo}/contents/${DIR}${this.ref()}`);
      return items.filter((i) => i.type === 'file' && i.name.endsWith('.json'))
        .map((i) => ({ slug: i.name.replace(/\.json$/, ''), sha: i.sha }));
    } catch (e) {
      if (e.kind === 'missing') return [];
      throw e;
    }
  }

  async read(slug) {
    const f = await this.req(`/repos/${this.repo}/contents/${DIR}/${encodeURIComponent(slug)}.json${this.ref()}`);
    let content = f.content;
    if (!content || f.encoding === 'none') {
      const blob = await this.req(`/repos/${this.repo}/git/blobs/${f.sha}`);
      content = blob.content;
    }
    return { data: JSON.parse(b64decode(content)), sha: f.sha };
  }

  async write(slug, data, sha, message) {
    const body = {
      message,
      content: b64encode(JSON.stringify(data, null, 1) + '\n'),
      ...(sha ? { sha } : {}),
      ...(this.branch ? { branch: this.branch } : {}),
    };
    const r = await this.req(`/repos/${this.repo}/contents/${DIR}/${encodeURIComponent(slug)}.json`, {
      method: 'PUT', body: JSON.stringify(body),
    });
    return r.content.sha;
  }

  async remove(slug, sha, message) {
    await this.req(`/repos/${this.repo}/contents/${DIR}/${encodeURIComponent(slug)}.json`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, ...(this.branch ? { branch: this.branch } : {}) }),
    });
  }
}

export class LocalStore {
  constructor() { this.label = 'this browser (demo)'; this.key = 'planner:demo:'; }
  async check() { return { private: true, branch: 'local' }; }
  all() {
    try { return JSON.parse(localStorage.getItem(this.key + 'projects') || '{}'); } catch { return {}; }
  }
  put(all) { localStorage.setItem(this.key + 'projects', JSON.stringify(all)); }
  async list() { return Object.entries(this.all()).map(([slug, v]) => ({ slug, sha: v.sha })); }
  async read(slug) {
    const v = this.all()[slug];
    if (!v) throw new StoreError('Not found', 404, 'missing');
    return { data: v.data, sha: v.sha };
  }
  async write(slug, data, sha) {
    const all = this.all();
    if (all[slug] && all[slug].sha !== sha) throw new StoreError('Changed elsewhere', 409, 'conflict');
    const next = Math.random().toString(36).slice(2);
    all[slug] = { data, sha: next };
    this.put(all);
    return next;
  }
  async remove(slug) { const all = this.all(); delete all[slug]; this.put(all); }
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
