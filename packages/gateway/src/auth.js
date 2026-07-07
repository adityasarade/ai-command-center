import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

/**
 * Zero-dependency auth for the dashboard + gateway keys for the proxy.
 *
 * Lifecycle:
 *   - disabled   (config.auth === false / --no-auth): nothing is enforced.
 *   - needsSetup (no users yet): nothing is enforced, dashboard shows a
 *     "create admin" callout - first-run stays friction-free.
 *   - locked     (>=1 user): dashboard/API require a session cookie;
 *     proxy routes require a project gateway key (/k/<key>/… or x-aicc-key).
 *
 * Storage: dataDir/auth.json (0600) - users (scrypt-hashed passwords), teams,
 * projects with their gateway keys, and the session-cookie HMAC secret.
 */

const SESSION_COOKIE = 'aicc_session';
const SESSION_DAYS = 7;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export class AuthService {
  constructor(dataDir, { disabled = false } = {}) {
    this.file = path.join(dataDir, 'auth.json');
    this.disabled = disabled;
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.db = {
        sessionSecret: crypto.randomBytes(32).toString('hex'),
        users: [],
        teams: [],
        projects: [],
      };
      this._persist();
    }
    this.db.users ??= [];
    this.db.teams ??= [];
    this.db.projects ??= [];
  }

  _persist() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  get locked() {
    return !this.disabled && this.db.users.length > 0;
  }

  get needsSetup() {
    return !this.disabled && this.db.users.length === 0;
  }

  // ---------------------------------------------------------------- users
  // Async so a burst of login/setup attempts can't block the event loop
  // (and stall proxied LLM traffic) while scrypt runs.
  static async hashPassword(password, salt) {
    const buf = await scryptAsync(String(password), salt, 64);
    return buf.toString('hex');
  }

  async createUser({ username, password, role = 'member', teamId = null }) {
    username = String(username || '')
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9._@-]{2,64}$/.test(username)) {
      throw httpError(400, 'username must be 2-64 chars (letters, digits, . _ @ -)');
    }
    if (String(password || '').length < 8)
      throw httpError(400, 'password must be at least 8 characters');
    if (this.db.users.some((u) => u.username === username))
      throw httpError(409, 'username already exists');
    if (role !== 'admin' && role !== 'member') throw httpError(400, 'role must be admin or member');
    if (teamId && !this.db.teams.some((t) => t.id === teamId)) throw httpError(400, 'unknown team');
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: 'u_' + crypto.randomUUID().slice(0, 8),
      username,
      salt,
      passwordHash: await AuthService.hashPassword(password, salt),
      role,
      teamId: teamId || null,
      createdAt: Date.now(),
    };
    this.db.users.push(user);
    this._persist();
    return this.publicUser(user);
  }

  async updateUser(id, { role, teamId, password }) {
    const user = this.db.users.find((u) => u.id === id);
    if (!user) throw httpError(404, 'no such user');
    if (role) {
      if (role !== 'admin' && role !== 'member')
        throw httpError(400, 'role must be admin or member');
      if (user.role === 'admin' && role === 'member' && this.adminCount() === 1) {
        throw httpError(400, 'cannot demote the last admin');
      }
      user.role = role;
    }
    if (teamId !== undefined) {
      if (teamId && !this.db.teams.some((t) => t.id === teamId))
        throw httpError(400, 'unknown team');
      user.teamId = teamId || null;
    }
    if (password) {
      if (String(password).length < 8)
        throw httpError(400, 'password must be at least 8 characters');
      user.salt = crypto.randomBytes(16).toString('hex');
      user.passwordHash = await AuthService.hashPassword(password, user.salt);
    }
    this._persist();
    return this.publicUser(user);
  }

  deleteUser(id) {
    const user = this.db.users.find((u) => u.id === id);
    if (!user) throw httpError(404, 'no such user');
    if (user.role === 'admin' && this.adminCount() === 1)
      throw httpError(400, 'cannot delete the last admin');
    this.db.users = this.db.users.filter((u) => u.id !== id);
    this._persist();
  }

  adminCount() {
    return this.db.users.filter((u) => u.role === 'admin').length;
  }

  async verifyLogin(username, password) {
    const user = this.db.users.find(
      (u) =>
        u.username ===
        String(username || '')
          .trim()
          .toLowerCase(),
    );
    if (!user) return null;
    const hash = await AuthService.hashPassword(password, user.salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(user.passwordHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? user : null;
  }

  publicUser(user) {
    if (!user) return null;
    const team = this.db.teams.find((t) => t.id === user.teamId) || null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
      teamName: team?.name ?? null,
      createdAt: user.createdAt,
    };
  }

  // -------------------------------------------------------------- sessions
  issueSessionCookie(user, { secure = false } = {}) {
    const payload = b64url(
      JSON.stringify({ uid: user.id, exp: Date.now() + SESSION_DAYS * 24 * 3600e3 }),
    );
    const sig = crypto
      .createHmac('sha256', this.db.sessionSecret)
      .update(payload)
      .digest('base64url');
    const maxAge = SESSION_DAYS * 24 * 3600;
    // Secure is added when the request arrived over TLS (e.g. via a reverse proxy),
    // never on plain-HTTP localhost (browsers reject Secure cookies over http).
    return `${SESSION_COOKIE}=${payload}.${sig}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  clearSessionCookie() {
    return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  }

  sessionUser(req) {
    const cookies = req.headers.cookie;
    if (!cookies) return null;
    const match = cookies.split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + '='));
    if (!match) return null;
    const token = match.slice(SESSION_COOKIE.length + 1);
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto
      .createHmac('sha256', this.db.sessionSecret)
      .update(payload)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof exp !== 'number' || exp < Date.now()) return null;
      return this.db.users.find((u) => u.id === uid) || null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- teams
  createTeam(name) {
    name = String(name || '').trim();
    if (!name || name.length > 64) throw httpError(400, 'team name required (max 64 chars)');
    if (this.db.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw httpError(409, 'team already exists');
    }
    const team = { id: 't_' + crypto.randomUUID().slice(0, 8), name, createdAt: Date.now() };
    this.db.teams.push(team);
    this._persist();
    return team;
  }

  deleteTeam(id) {
    if (!this.db.teams.some((t) => t.id === id)) throw httpError(404, 'no such team');
    this.db.teams = this.db.teams.filter((t) => t.id !== id);
    for (const u of this.db.users) if (u.teamId === id) u.teamId = null;
    for (const p of this.db.projects) if (p.teamId === id) p.teamId = null;
    this._persist();
  }

  // -------------------------------------------------------------- projects
  createProject(name, teamId = null) {
    name = String(name || '').trim();
    if (!/^[a-zA-Z0-9._ -]{1,64}$/.test(name)) {
      throw httpError(400, 'project name required (letters, digits, . _ - space, max 64)');
    }
    if (this.db.projects.some((p) => p.name === name))
      throw httpError(409, 'project already exists');
    if (teamId && !this.db.teams.some((t) => t.id === teamId)) throw httpError(400, 'unknown team');
    const project = {
      name,
      teamId: teamId || null,
      key: 'aicc_' + crypto.randomBytes(24).toString('hex'),
      createdAt: Date.now(),
    };
    this.db.projects.push(project);
    this._persist();
    return project;
  }

  updateProject(name, { teamId }) {
    const project = this.db.projects.find((p) => p.name === name);
    if (!project) throw httpError(404, 'no such project');
    if (teamId !== undefined) {
      if (teamId && !this.db.teams.some((t) => t.id === teamId))
        throw httpError(400, 'unknown team');
      project.teamId = teamId || null;
    }
    this._persist();
    return project;
  }

  rotateProjectKey(name) {
    const project = this.db.projects.find((p) => p.name === name);
    if (!project) throw httpError(404, 'no such project');
    project.key = 'aicc_' + crypto.randomBytes(24).toString('hex');
    this._persist();
    return project;
  }

  deleteProject(name) {
    if (!this.db.projects.some((p) => p.name === name)) throw httpError(404, 'no such project');
    this.db.projects = this.db.projects.filter((p) => p.name !== name);
    this._persist();
  }

  /** Resolve a gateway key to its project, or null (constant-time compare). */
  projectForKey(key) {
    if (!key || typeof key !== 'string') return null;
    const kb = Buffer.from(key);
    let found = null;
    for (const p of this.db.projects) {
      const pb = Buffer.from(p.key);
      if (pb.length === kb.length && crypto.timingSafeEqual(pb, kb)) found = p;
    }
    return found;
  }

  /**
   * Which project names a user may see. `null` means "all" (admins, or auth
   * not locked). Members see projects assigned to their team; unassigned
   * projects stay admin-only.
   */
  allowedProjects(user) {
    if (!this.locked) return null;
    if (!user) return new Set();
    if (user.role === 'admin') return null;
    return new Set(
      this.db.projects.filter((p) => p.teamId && p.teamId === user.teamId).map((p) => p.name),
    );
  }
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
