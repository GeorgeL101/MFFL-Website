// server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const COMMISH_PASSWORD = process.env.COMMISH_PASSWORD || 'let-me-in';
const SUGGESTIONS_FILE = path.join(__dirname, 'data', 'suggestions.json');
const cors = require('cors');
const jwt  = require('jsonwebtoken');

// === Spiff Bank storage file ===
const SPIFFS_FILE = path.join(__dirname, 'data', 'spiffs.json');

// ➜ NEW: Cam’s Corner deps/paths
const multer = require('multer');
const fss = require('fs'); // non-promise for mkdirSync
const CAM_PASSWORD = process.env.CAM_PASSWORD || 'cams-only';
const CAMS_DATA_FILE = path.join(__dirname, 'data', 'cams.json');
const UPLOAD_ROOT = path.join(__dirname, 'public', 'uploads');
const CAMS_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'cams');
try { fss.mkdirSync(CAMS_UPLOAD_DIR, { recursive: true }); } catch {}

// Use global fetch if on Node 18+, otherwise lazy-load node-fetch
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'change-me';

// === SLEEPER: config & helpers ===
const SLEEPER_LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || '1180723525824606208';
const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const SLEEPER_CACHE = new Map(); // 5-minute in-memory cache
const AVATAR_FULL  = (id) => id ? `https://sleepercdn.com/avatars/${id}` : null;
const AVATAR_THUMB = (id) => id ? `https://sleepercdn.com/avatars/thumbs/${id}` : null;

async function sleeperGet(path) {
  const key = `sleeper:${path}`;
  const now = Date.now();
  const hit = SLEEPER_CACHE.get(key);
  if (hit && (now - hit.ts) < 5 * 60 * 1000) return hit.data;

  const resp = await fetch(`${SLEEPER_BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Sleeper HTTP ${resp.status} for ${path}`);
  const json = await resp.json();
  SLEEPER_CACHE.set(key, { ts: now, data: json });
  return json;
}

// ➜ UPDATED: include username + avatarThumb/avatarFull, and better team name
async function getSleeperLeagueBundle(leagueId) {
  const [league, users, rosters] = await Promise.all([
    sleeperGet(`/league/${leagueId}`),
    sleeperGet(`/league/${leagueId}/users`),
    sleeperGet(`/league/${leagueId}/rosters`)
  ]);

  const userById = new Map(users.map(u => [u.user_id, u]));
  const rosterList = rosters.map(r => {
    const u = userById.get(r.owner_id);
    const display  = (u?.display_name || u?.username || '—').toString();
    const username = (u?.username || '').toString();
    const teamName = (u?.metadata?.team_name && String(u.metadata.team_name).trim())
      ? String(u.metadata.team_name).trim()
      : display || `Team ${r.roster_id}`;

    const avatarId    = u?.avatar || null; // null when no custom avatar set
    const avatarThumb = AVATAR_THUMB(avatarId);
    const avatarFull  = AVATAR_FULL(avatarId);

    return {
      roster_id: r.roster_id,
      owner_id: r.owner_id || null,
      manager: display,
      username,
      team: teamName,
      avatarId,
      avatarThumb,
      avatarFull
    };
  }).sort((a, b) => (a.team || '').localeCompare(b.team || ''));

  return { leagueName: league?.name || 'MFFL', roster: rosterList };
}

// === NEW: Players dump cache (24h) + helpers to resolve player IDs
const PLAYERS_CACHE = { ts: 0, data: null };
async function getPlayersMap() {
  if (PLAYERS_CACHE.data && (Date.now() - PLAYERS_CACHE.ts) < 24 * 60 * 60 * 1000) {
    return PLAYERS_CACHE.data;
  }
  const resp = await fetch('https://api.sleeper.app/v1/players/nfl', { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Sleeper players HTTP ${resp.status}`);
  const json = await resp.json();
  PLAYERS_CACHE.data = json;
  PLAYERS_CACHE.ts = Date.now();
  return json;
}
function pickName(p) {
  return p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.last_name || 'Unknown';
}

// === App middleware ===
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// Allow the mobile app origin (dev + devices). Loosened for dev:
app.use(cors({ origin: true, credentials: true })); // tighten to your domains for prod

app.use(session({
  name: 'friends.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000*60*60*24*7 }
}));

const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders: true, legacyHeaders: false });
function safeEqual(a,b){ const A=Buffer.from(String(a||'')); const B=Buffer.from(String(b||'')); return A.length===B.length && crypto.timingSafeEqual(A,B); }
function requireAuth(req,res,next){ if(req.session?.authed) return next(); res.redirect('/login'); }

const JWT_SECRET = process.env.JWT_SECRET || (process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'));

function bearerPayload(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], JWT_SECRET); } catch { return null; }
}
// For API: accept either session cookie OR Bearer JWT, else 401 JSON
function requireApiAuth(req, res, next) {
  if (req.session?.authed) return next();
  const payload = bearerPayload(req);
  if (payload) { req.user = payload; return next(); }
  return res.status(401).json({ error: 'Auth required' });
}

async function readSpiffs() {
  try {
    const raw = await fs.readFile(SPIFFS_FILE, 'utf8');
    const j = JSON.parse(raw);
    return (j && typeof j === 'object' && j.banks) ? j : { banks: {} };
  } catch {
    return { banks: {} };
  }
}

async function writeSpiffs(obj) {
  await fs.mkdir(path.dirname(SPIFFS_FILE), { recursive: true });
  await fs.writeFile(SPIFFS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}


// Role checks that work with session OR Bearer
function requireApiCam(req, res, next) {
  if (req.session?.is_cam) return next();
  const p = bearerPayload(req);
  if (p?.role === 'cam') return next();
  return res.status(403).json({ error: 'Cam access required' });
}

function requireApiCommish(req, res, next) {
  if (req.session?.is_commish) return next();
  const p = bearerPayload(req);
  if (p?.role === 'commish') return next();
  return res.status(403).json({ error: 'Commissioner access required' });
}


// --- Auth pages ---
app.get('/login',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const err = req.query.err ? '<p style="color:#c00;margin:0 0 1rem;">Incorrect password.</p>' : '';
  res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MFFL – Sign in</title><style>
:root{--bg:#0f172a;--card:#111827;--fg:#e5e7eb;--muted:#94a3b8;--accent:#22c55e}
body{margin:0;min-height:100svh;background:linear-gradient(135deg,#0f172a,#1f2937);display:grid;place-items:center;font:16px system-ui,Segoe UI,Roboto,Arial}
.card{background:var(--card);color:var(--fg);width:min(92vw,420px);padding:28px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
h1{margin:0 0 12px;font-size:22px}p.sub{margin:0 0 20px;color:var(--muted)}.row{display:flex;gap:10px}
input[type=password]{flex:1;padding:12px 14px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;outline:none}
button{padding:12px 16px;border-radius:12px;border:0;background:#22c55e;color:#06210f;font-weight:700;cursor:pointer}
small{display:block;margin-top:10px;color:#94a3b8}
</style></head><body>
  <form class="card" method="POST" action="/login">
    <h1>Welcome to MFFL 👋</h1>
    <p class="sub">Enter the shared password to continue.</p>
    ${err}
    <div class="row">
      <input name="password" type="password" placeholder="Site password" autocomplete="current-password" required />
      <button type="submit">Enter</button>
    </div>
    <small>Welcome to the Dynasty.</small>
  </form>
</body></html>`);
});

// uses express.urlencoded body parsing
app.post('/login', loginLimiter, (req, res) => {
  const pw = (req.body && req.body.password) ? req.body.password : '';
  if (!safeEqual(pw, SITE_PASSWORD)) return res.redirect('/login?err=1');
  req.session.authed = true;
  res.redirect('/');
});

app.post('/commish-login', loginLimiter, (req, res) => {
  const pw = (req.body && (req.body.commish_password || req.body.password)) ? (req.body.commish_password || req.body.password) : '';
  if (!pw || !crypto.timingSafeEqual(Buffer.from(String(pw)), Buffer.from(String(COMMISH_PASSWORD)))) {
    return res.status(401).json({ ok:false, error:'Invalid commissioner password' });
  }
  req.session.is_commish = true;
  res.json({ ok:true });
});

// ➜ NEW: Cam login (separate role)
app.post('/cam-login', loginLimiter, (req, res) => {
  const pw = (req.body && (req.body.cam_password || req.body.password))
    ? (req.body.cam_password || req.body.password) : '';
  if (!safeEqual(pw, CAM_PASSWORD)) {
    return res.status(401).json({ ok:false, error:'Invalid Cam password' });
  }
  req.session.is_cam = true;
  res.json({ ok:true });
});
// Cam logout: remove Cam privileges but keep the normal session
app.post('/cam-logout', (req, res) => {
  if (req.session) req.session.is_cam = false;
  res.json({ ok: true });
});


app.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

// Protected static site
app.get('/', requireAuth, (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use('/app', requireAuth, express.static(path.join(__dirname,'public')));
// ➜ NEW: serve uploads behind auth
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'public', 'uploads')));

// Health
app.get('/health', (_req,res)=>res.send('ok'));

// Spiff Bank: read (all authed users)
app.get('/api/spiffs', requireAuth, async (_req, res) => {
  try {
    const data = await readSpiffs();
    res.json({ banks: data.banks || {} });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to read spiffs' });
  }
});

// Spiff Bank: save (commissioner only)
app.put('/api/spiffs', requireAuth, requireCommish, async (req, res) => {
  try {
    const incoming = req.body && req.body.banks;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing banks object' });
    }

    // sanitize + normalize
    const cleaned = {};
    for (const [key, val] of Object.entries(incoming)) {
      let n = Number(val);
      if (!Number.isFinite(n)) n = 0;
      n = Math.max(0, Math.round(n * 100) / 100);
      cleaned[String(key)] = n;
    }

    await writeSpiffs({ banks: cleaned });
    res.json({ ok: true, banks: cleaned });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to save spiffs' });
  }
});


// === Announcements (local file) ===
const DATA_FILE = path.join(__dirname, 'data', 'mffl.json');
async function readLeagueData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    // default if file missing; you can edit data/mffl.json later
    return {
      leagueName: "MFFL",
      announcements: [
        { id: "welcome", title: "Welcome to MFFL 2025!", body: "Draft night complete. Waivers run Wed 3am ET.", date: "2025-09-01T18:00:00-04:00" }
      ],
      roster: [
        { manager: "George Lucas", team: "Monkey Land", emoji: "🐵" },
        { manager: "Friend #1", team: "Gridiron Gurus", emoji: "🦅" },
        { manager: "Friend #2", team: "Blitz Brigade", emoji: "⚡" }
      ]
    };
  }
}
// >>> NEW: write helper
async function writeLeagueData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readSuggestions() {
  try {
    const raw = await fs.readFile(SUGGESTIONS_FILE, 'utf8');
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}
async function writeSuggestions(list) {
  await fs.mkdir(path.dirname(SUGGESTIONS_FILE), { recursive: true });
  await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
}
function requireCommish(req, res, next) {
  if (req.session?.is_commish) return next();
  return res.status(403).json({ error: 'Commissioner access required' });
}

// ➜ NEW: Cam helpers
async function readCams() {
  try {
    const raw = await fs.readFile(CAMS_DATA_FILE, 'utf8');
    const j = JSON.parse(raw);
    j.blocks = Array.isArray(j.blocks) ? j.blocks : [];
    j.order  = Array.isArray(j.order)  ? j.order  : j.blocks.map(b => b.id);
    return j;
  } catch {
    return { blocks: [], order: [] };
  }
}
async function writeCams(data) {
  await fs.mkdir(path.dirname(CAMS_DATA_FILE), { recursive: true });
  await fs.writeFile(CAMS_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function requireCam(req, res, next) {
  if (req.session?.is_cam) return next();
  return res.status(403).json({ error: 'Cam access required' });
}

// ➜ NEW: multer storage for image uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CAMS_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const name = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Images only'));
  }
});

// --- Announcements uploads ---
const ANN_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'announcements');
try { fss.mkdirSync(ANN_UPLOAD_DIR, { recursive: true }); } catch {}
// --- Documentation uploads ---
const DOCS_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'docs');
try { fss.mkdirSync(DOCS_UPLOAD_DIR, { recursive: true }); } catch {}
const DOCS_FILE = path.join(__dirname, 'data', 'docs.json');


// helper to build a disk storage for any subdir
function makeMulterStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
      cb(null, name);
    }
  });
}
async function readDocs() {
  try {
    const raw = await fs.readFile(DOCS_FILE, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
async function writeDocs(list) {
  await fs.mkdir(path.dirname(DOCS_FILE), { recursive: true });
  await fs.writeFile(DOCS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const uploadDoc = multer({
  storage: makeMulterStorage(DOCS_UPLOAD_DIR),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
    if (ok) return cb(null, true);
    cb(new Error('PDFs or images only'));
  }
});


const imageOnly = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
  cb(new Error('Images only'));
};

const uploadAnn = multer({
  storage: makeMulterStorage(ANN_UPLOAD_DIR),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageOnly,
});

/** Only run Multer when the request is multipart; otherwise
 *  let express.json() / express.urlencoded() handle it.
 *  (Placed AFTER uploadAnn so no TDZ issues)
 */
function optionalAnnUpload(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return uploadAnn.single('image')(req, res, next);
  }
  return next();
}



// Mobile: login with the same SITE_PASSWORD; returns a JWT
app.post('/api/mobile/login', loginLimiter, async (req, res) => {
  const pw = String(req.body?.password || '');
  if (!safeEqual(pw, SITE_PASSWORD)) return res.status(401).json({ error: 'Bad password' });
  const token = jwt.sign({ role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

// Optional: Cam unlock for the app (use COMMISH_PASSWORD for now)
app.post('/api/mobile/cam-login', loginLimiter, async (req, res) => {
  const pw = String(req.body?.cam_password || req.body?.password || '');
  if (!safeEqual(pw, COMMISH_PASSWORD)) return res.status(401).json({ error: 'Bad password' });
  const token = jwt.sign({ role: 'cam' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, is_cam: true });
});


+ app.get('/api/me', requireApiAuth, (req, res) => {
  // ➜ UPDATED to include is_cam
  res.json({ is_commish: !!req.session?.is_commish, is_cam: !!req.session?.is_cam });
});

// (REMOVED) old placeholder Cam route using readCamPosts (it didn’t exist)

// >>> NEW: Create announcement (commissioners only)
// Create announcement (commissioners only) – now supports optional image upload
app.post('/api/announcements', requireAuth, requireCommish, optionalAnnUpload, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body  = String(req.body?.body  || '').trim();
    if (!title || !body) return res.status(400).json({ ok:false, error:'Title and body required' });

    const imageUrl =
      req.file
        ? `/uploads/announcements/${req.file.filename}`
        : (req.body?.image_url ? String(req.body.image_url) : null);

    const db = await readLeagueData();
    db.announcements = Array.isArray(db.announcements) ? db.announcements : [];

    const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex');
    const item = {
      id,
      title: title.slice(0, 140),
      body:  body.slice(0, 5000),
      date:  new Date().toISOString(),
      image: imageUrl || undefined,         // <-- NEW
    };

    db.announcements.push(item);
    db.announcements.sort((a,b)=> new Date(b.date) - new Date(a.date));

    await writeLeagueData(db);
    res.json({ ok:true, item });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});
// List docs (all authed users)
app.get('/api/docs', requireAuth, async (_req, res) => {
  const items = await readDocs();
  res.json({ items });
});

// Upload a doc (commissioners only)
app.post('/api/docs', requireAuth, requireCommish, uploadDoc.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'file required' });
    const list = await readDocs();
    const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex');
    const item = {
      id,
      name: req.file.originalname || req.file.filename,
      url: `/uploads/docs/${req.file.filename}`,
      size: req.file.size,
      when: new Date().toISOString()
    };
    list.unshift(item);
    await writeDocs(list);
    res.json({ ok:true, item });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Delete a doc (commissioners only)
app.delete('/api/docs/:id', requireAuth, requireCommish, async (req, res) => {
  try {
    const id = String(req.params.id);
    const list = await readDocs();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ ok:false, error:'Not found' });

    const [removed] = list.splice(idx, 1);
    if (removed?.url && removed.url.startsWith('/uploads/docs/')) {
      const file = path.join(DOCS_UPLOAD_DIR, path.basename(removed.url));
      try { await fs.unlink(file); } catch {}
    }
    await writeDocs(list);
    res.json({ ok:true, deleted:id });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});


// >>> NEW: Delete announcement (commissioners only)
// Delete announcement (commissioners only) – also removes uploaded image
app.delete('/api/announcements/:id', requireAuth, requireCommish, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const db = await readLeagueData();
    const idx = (db.announcements || []).findIndex(a => String(a.id) === id);
    if (idx === -1) return res.status(404).json({ ok:false, error:'Announcement not found' });

    const [removed] = db.announcements.splice(idx, 1);

    // attempt to unlink local image if it was uploaded here
    if (removed?.image && removed.image.startsWith('/uploads/announcements/')) {
      const file = path.join(ANN_UPLOAD_DIR, path.basename(removed.image));
      try { await fs.unlink(file); } catch {}
    }

    await writeLeagueData(db);
    res.json({ ok:true, deleted: id });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});


// Submit a suggestion (any authed user)
app.post('/api/suggestions', requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || '').slice(0, 80);
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Suggestion text required' });

    const list = await readSuggestions();
    const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex');
    list.push({
      id,
      when: new Date().toISOString(),
      name,
      text
    });
    // keep newest first
    list.sort((a, b) => new Date(b.when) - new Date(a.when));
    await writeSuggestions(list);

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// List suggestions (commissioners only)
app.get('/api/suggestions', requireAuth, requireCommish, async (_req, res) => {
  try {
    const list = await readSuggestions();
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === /api/league: merge local announcements + live Sleeper roster ===
app.get('/api/league', requireAuth, async (_req, res) => {
  try {
    const local = await readLeagueData();                 // announcements from file
    const live  = await getSleeperLeagueBundle(SLEEPER_LEAGUE_ID); // league name + roster

    res.json({
      leagueName: live.leagueName || local.leagueName || 'MFFL',
      announcements: Array.isArray(local.announcements) ? local.announcements : [],
      roster: live.roster || []
    });
  } catch (e) {
    // Safe fallback to local only
    const local = await readLeagueData();
    res.json({
      leagueName: local.leagueName || 'MFFL',
      announcements: local.announcements || [],
      roster: local.roster || [],
      error: String(e)
    });
  }
});

// (Optional) quick debug route to see raw Sleeper user info (avatar presence, etc.)
app.get('/api/debug/sleeper-users', requireAuth, async (_req, res) => {
  const users = await sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/users`);
  res.json(users.map(u => ({
    user_id: u.user_id,
    username: u.username,
    display_name: u.display_name,
    avatar: u.avatar || null,
    team_name: u.metadata?.team_name || null
  })));
});

// ➜ NEW: Cam’s Corner API
// Read (all authed users): ordered blocks
app.get('/api/cams', requireAuth, async (_req, res) => {
  const data = await readCams();
  const byId = new Map(data.blocks.map(b => [b.id, b]));
  const items = data.order.map(id => byId.get(id)).filter(Boolean);
  res.json({ items });
});

// Create block (Cam only): text post OR image upload (field 'image')
app.post('/api/cams/blocks', requireAuth, requireCam, upload.single('image'), async (req, res) => {
  try {
    const data = await readCams();
    let block;

    if (req.file) {
      const url = `/uploads/cams/${req.file.filename}`;
      block = {
        id: (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex'),
        type: 'image',
        url,
        caption: String(req.body?.caption || '').slice(0, 200),
        span: Number(req.body?.span) === 12 ? 12 : 6
      };
    } else {
      const title = String(req.body?.title || '').trim();
      const body  = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'Body required' });
      block = {
        id: (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(12).toString('hex'),
        type: 'post',
        title: title || 'Untitled',
        body,
        when: new Date().toISOString(),
        span: Number(req.body?.span) === 12 ? 12 : 6
      };
    }

    data.blocks.push(block);
    data.order = [block.id, ...data.order.filter(id => id !== block.id)];
    await writeCams(data);
    res.json({ ok: true, block });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Delete a block (Cam only)
app.delete('/api/cams/blocks/:id', requireAuth, requireCam, async (req, res) => {
  try {
    const id = String(req.params.id);
    const data = await readCams();
    const idx = data.blocks.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const [removed] = data.blocks.splice(idx, 1);
    data.order = data.order.filter(x => x !== id);

    if (removed?.type === 'image' && removed.url) {
      const file = path.join(CAMS_UPLOAD_DIR, path.basename(removed.url));
      try { await fs.unlink(file); } catch {}
    }

    await writeCams(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Save layout (Cam only): { order:[ids], sizes:{id:6|12} }
app.put('/api/cams/layout', requireAuth, requireCam, async (req, res) => {
  try {
    const order = Array.isArray(req.body?.order) ? req.body.order.map(String) : null;
    const sizes = (req.body?.sizes && typeof req.body.sizes === 'object') ? req.body.sizes : null;
    if (!order) return res.status(400).json({ error: 'order required' });

    const data = await readCams();
    const valid = new Set(data.blocks.map(b => b.id));
    const filtered = order.filter(id => valid.has(id));
    if (!filtered.length) return res.status(400).json({ error: 'invalid order' });

    data.order = filtered;
    if (sizes) {
      for (const b of data.blocks) {
        const v = Number(sizes[b.id]);
        if (v === 6 || v === 12) b.span = v;
      }
    }

    await writeCams(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
// === Sleeper: roster list for mobile Teams tab ===
app.get('/api/sleeper/rosters', requireAuth, async (_req, res) => {
  try {
    const live = await getSleeperLeagueBundle(SLEEPER_LEAGUE_ID);
    const items = (live.roster || []).map(r => ({
      roster_id: r.roster_id,
      team: r.team,
      manager: r.manager,
      avatarThumb: r.avatarThumb || null,
      avatarFull: r.avatarFull || null,
    }));
    // Teams screen accepts either { items: [...] } or just [...]
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === NEW: roster details (starters/bench/IR) resolved to names/pos/team ===
app.get('/api/sleeper/roster/:rosterId', requireAuth, async (req, res) => {
  try {
    const rosterId = String(req.params.rosterId);
    const rosters = await sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/rosters`);
    const r = rosters.find(x => String(x.roster_id) === rosterId);
    if (!r) return res.status(404).json({ error: 'Roster not found' });

    const players = await getPlayersMap();
    const toObj = (id) => {
      const p = players[id] || {};
      return {
        id,
        name: pickName(p),
        pos: p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : ''),
        team: p.team || ''
      };
    };

    const startersIds = Array.isArray(r.starters) ? r.starters.filter(Boolean) : [];
    const allIds      = Array.isArray(r.players)  ? r.players.filter(Boolean)  : [];
    const reserveIds  = Array.isArray(r.reserve)  ? r.reserve.filter(Boolean)  : [];

    const startersSet = new Set(startersIds);
    const starters = startersIds.map(toObj);
    const bench    = allIds.filter(id => !startersSet.has(id)).map(toObj);
    const reserve  = reserveIds.map(toObj);

    res.json({ roster_id: r.roster_id, starters, bench, reserve });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// === NFL games proxy (ESPN) ===
const NFL_CACHE = new Map();
function yyyymmddFromDateObj(d, tz='America/New_York'){
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  const [y,m,dd] = f.format(d).split('-');
  return `${y}${m}${dd}`;
}

async function fetchEspnScoreboard(yyyymmdd){
  const key = `sb:${yyyymmdd}`;
  const now = Date.now();
  const hit = NFL_CACHE.get(key);
  if (hit && (now - hit.ts) < 5*60*1000) return hit.data;

  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${yyyymmdd}`;
  const resp = await fetch(url, { headers: { 'accept': 'application/json' }});
  if (!resp.ok) throw new Error(`ESPN HTTP ${resp.status}`);
  const json = await resp.json();
  NFL_CACHE.set(key, { ts: now, data: json });
  return json;
}

// ➜ helper: resolve NFL week/year from a date (defaults to "today" ET)
async function weekMetaFromDateISO(dateISO) {
  const q = (dateISO || '').replace(/-/g,'');
  const yyyymmdd = q && /^\d{8}$/.test(q) ? q : yyyymmddFromDateObj(new Date(), 'America/New_York');
  const raw = await fetchEspnScoreboard(yyyymmdd);
  const week = raw?.week?.number || null;
  const year = raw?.season?.year || new Date().getFullYear();
  return { week, year };
}

/* === NEW: Sleeper state week helper (cached) === */
const SLEEPER_STATE_CACHE = { ts: 0, data: null };
async function getSleeperCurrentWeek() {
  const now = Date.now();
  if (SLEEPER_STATE_CACHE.data && (now - SLEEPER_STATE_CACHE.ts) < 2 * 60 * 1000) {
    return SLEEPER_STATE_CACHE.data.week || null;
  }
  const state = await sleeperGet(`/state/nfl`); // { season, week, season_type, ... }
  SLEEPER_STATE_CACHE.data = state;
  SLEEPER_STATE_CACHE.ts = now;
  return state?.week ?? null;
}

// GET /api/nfl/games?date=YYYY-MM-DD (or YYYYMMDD). Defaults to today (ET).
app.get('/api/nfl/games', requireAuth, async (req,res)=>{
  try {
    const q = (req.query.date||'').replace(/-/g,'').trim();
    const yyyymmdd = q && /^\d{8}$/.test(q) ? q : yyyymmddFromDateObj(new Date(), 'America/New_York');
    const raw = await fetchEspnScoreboard(yyyymmdd);

    const games = (raw.events||[]).map(ev=>{
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const comps = comp.competitors || [];
      const the_home = comps.find(c=>c.homeAway==='home') || {};
      const away = comps.find(c=>c.homeAway==='away') || {};
      const startUTC = comp.date || ev.date;
      const startLocal = new Date(startUTC).toLocaleString('en-US', { timeZone:'America/New_York' });
      const network = (comp.broadcasts?.[0]?.names?.[0]) || (comp.broadcasts?.[0]?.shortName) || null;

      return {
        id: ev.id,
        status: (ev.status?.type?.name) || (comp.status?.type?.name) || 'STATUS_SCHEDULED',
        startUTC,
        startLocalET: startLocal,
        week: raw.week?.number || null,
        seasonType: raw.season?.type || null,
        venue: comp.venue?.fullName || ev.competitions?.[0]?.venue?.fullName || null,
        network,
        home: {
          name: the_home.team?.displayName || the_home.team?.name,
          abbrev: the_home.team?.abbreviation,
          score: the_home.score ? Number(the_home.score) : null,
          logo: the_home.team?.logo
        },
        away: {
          name: away.team?.displayName || away.team?.name,
          abbrev: away.team?.abbreviation,
          score: away.score ? Number(away.score) : null,
          logo: away.team?.logo
        }
      };
    });

    res.json({ date: yyyymmdd, count: games.length, games });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* === Weekly fantasy matchups (Sleeper)
   GET /api/sleeper/matchups
   Priority: ?week=##  ->  ?date=YYYY-MM-DD  ->  Sleeper state week
*/
app.get('/api/sleeper/matchups', requireAuth, async (req, res) => {
  try {
    let week = null;
    let source = 'unknown';

    if (req.query.week) {
      week = Number(req.query.week);
      source = 'query.week';
    } else if (req.query.date) {
      const meta = await weekMetaFromDateISO(req.query.date);
      if (meta.week) { week = meta.week; source = 'espn.fromDate'; }
    }
    if (!week) {
      week = await getSleeperCurrentWeek();
      source = 'sleeper.state';
    }
    if (!Number.isFinite(week) || week <= 0) {
      return res.status(400).json({ error: 'Could not resolve NFL week for matchups.' });
    }

    const [users, rosters, rawMatchups] = await Promise.all([
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/users`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/rosters`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/matchups/${week}`)
    ]);

    const userById   = new Map(users.map(u => [u.user_id, u]));
    const rosterById = new Map(rosters.map(r => [Number(r.roster_id), r]));

    function sideFrom(m) {
      const r = rosterById.get(Number(m.roster_id)) || {};
      const u = userById.get(r.owner_id) || {};
      const teamName = (u?.metadata?.team_name && String(u.metadata.team_name).trim())
        ? String(u.metadata.team_name).trim()
        : (u.display_name || u.username || `Team ${r.roster_id}`);
      return {
        roster_id: r.roster_id,
        team: teamName,
        manager: u.display_name || u.username || '—',
        avatarThumb: AVATAR_THUMB(u?.avatar) || null,
        points: typeof m.points === 'number' ? Math.round(m.points * 10) / 10 : 0
      };
    }

    // Group by matchup_id (fallback to roster_id if missing)
    const groups = new Map();
    for (const m of rawMatchups || []) {
      const id = m.matchup_id ?? m.roster_id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(m);
    }

    const matchups = [];
    for (const [id, arr] of groups.entries()) {
      const a = arr[0] ? sideFrom(arr[0]) : null;
      const b = arr[1] ? sideFrom(arr[1]) : null;
      if (a || b) matchups.push({ id, a, b });
    }

    res.json({ week, meta: { source, count: matchups.length }, matchups });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ===================== Sleeper Transactions =====================
   GET /api/sleeper/transactions
   Optional query: ?round=## (Sleeper uses "round" = NFL week)
   If omitted, falls back to Sleeper's current state week.
==================================================================*/
app.get('/api/sleeper/transactions', requireAuth, async (req, res) => {
  try {
    let round = req.query.round ? Number(req.query.round) : null;
    if (!round) round = await getSleeperCurrentWeek();
    if (!Number.isFinite(round) || round <= 0) {
      return res.status(400).json({ error: 'Could not resolve week/round for transactions.' });
    }

    const [users, rosters, txs, players] = await Promise.all([
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/users`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/rosters`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/transactions/${round}`),
      getPlayersMap()
    ]);

    const userById   = new Map(users.map(u => [u.user_id, u]));
    const rosterById = new Map(rosters.map(r => [Number(r.roster_id), r]));

    const teamOf = (rid) => {
      const r = rosterById.get(Number(rid)) || {};
      const u = userById.get(r.owner_id) || {};
      const teamName = (u?.metadata?.team_name && String(u.metadata.team_name).trim())
        ? String(u.metadata.team_name).trim()
        : (u.display_name || u.username || `Team ${r.roster_id}`);
      return {
        roster_id: r.roster_id,
        team: teamName,
        manager: u.display_name || u.username || '—',
        avatarThumb: AVATAR_THUMB(u?.avatar) || null,
      };
    };

    const asPlayer = (pid) => {
      const p = players[pid] || {};
      return {
        id: pid,
        name: pickName(p),
        pos: p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : ''),
        team: p.team || ''
      };
    };

    const items = (txs || []).map(t => {
      const when = new Date(t.status_updated || t.created || Date.now()).toISOString();
      const adds  = t.adds  ? Object.entries(t.adds).map(([pid, rid]) => ({ ...asPlayer(pid), to: teamOf(rid) })) : [];
      const drops = t.drops ? Object.entries(t.drops).map(([pid, rid]) => ({ ...asPlayer(pid), from: teamOf(rid) })) : [];
      const rostersInvolved = (t.roster_ids || []).map(teamOf);

      return {
        id: t.transaction_id,
        type: t.type,                 // "waiver" | "free_agent" | "trade" | "draft" | ...
        status: t.status,             // "complete" | ...
        when,
        round,
        adds,
        drops,
        rosters: rostersInvolved,
        waiver_bid: t.waiver_bid || 0,
        draft_picks: t.draft_picks || []
      };
    });

    res.json({ round, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* === Playoff bracket (Sleeper)
   GET /api/sleeper/bracket
*/
app.get('/api/sleeper/bracket', requireAuth, async (_req, res) => {
  try {
    const [league, users, rosters, winners, losers] = await Promise.all([
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/users`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/rosters`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/winners_bracket`),
      sleeperGet(`/league/${SLEEPER_LEAGUE_ID}/losers_bracket`)
    ]);

    const userById   = new Map(users.map(u => [u.user_id, u]));
    const rosterById = new Map(rosters.map(r => [Number(r.roster_id), r]));

    const toTeam = (rid) => {
      if (rid == null) return null;
      const r = rosterById.get(Number(rid)) || {};
      const u = userById.get(r.owner_id) || {};
      const teamName =
        (u?.metadata?.team_name && String(u.metadata.team_name).trim())
          ? String(u.metadata.team_name).trim()
          : (u.display_name || u.username || `Team ${r.roster_id}`);
      return {
        roster_id: r.roster_id,
        team: teamName,
        manager: u.display_name || u.username || '—',
        avatarThumb: AVATAR_THUMB(u?.avatar) || null
      };
    };

    const mapBracket = (arr) => (arr || []).map(n => ({
      r: n.r ?? n.round ?? null,
      m: n.m ?? n.matchup_id ?? null,
      t1: toTeam(n.t1),
      t2: toTeam(n.t2),
      t1_from: n.t1_from ?? null,
      t2_from: n.t2_from ?? null,
      w: n.w ?? n.winner ?? null
    }));

    res.json({
      playoff_start_week: league?.settings?.playoff_week_start || league?.playoff_start_week || null,
      winners: mapBracket(winners),
      losers: mapBracket(losers)
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log(`MFFL site on http://localhost:${PORT}`));
