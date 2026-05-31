import crypto from 'node:crypto';

const DEFAULT_ADMIN_USER = 'Antonio';
const DEFAULT_ADMIN_PASSWORD = 'SOLAO-2026';
const DEFAULT_STATE = {
  clients: [],
  availability: [],
  selectedClientId: null,
  filters: { search: '', status: 'all' },
};

const COOKIE_NAME = 'solao_admin_session';
const STATE_ID = 'solao-admin-state';

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function adminUser() {
  return env('ADMIN_USER', DEFAULT_ADMIN_USER);
}

function adminPassword() {
  return env('ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
}

function sessionSecret() {
  return env('ADMIN_SESSION_SECRET', 'solao-admin-session-secret');
}

function supabaseUrl() {
  return env('SUPABASE_URL');
}

function supabaseServiceKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

function cookieOptions(value = '', maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map((item) => item.trim()).filter(Boolean).map((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return [pair, ''];
      return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))];
    }),
  );
}

function base64urlEncode(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function base64urlDecode(text) {
  return Buffer.from(text, 'base64url').toString('utf8');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

function createSessionToken(username, expiresAt) {
  const payload = `${username}.${expiresAt}`;
  const signature = signPayload(payload);
  return `${base64urlEncode(payload)}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  let payload;
  try {
    payload = base64urlDecode(encodedPayload);
  } catch {
    return null;
  }

  const expectedSignature = signPayload(payload);
  if (expectedSignature !== signature) return null;

  const lastDot = payload.lastIndexOf('.');
  if (lastDot === -1) return null;
  const username = payload.slice(0, lastDot);
  const expiresAt = Number(payload.slice(lastDot + 1));
  if (!username || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (username !== adminUser()) return null;
  return { username, expiresAt };
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'No autorizado' }));
    return null;
  }
  return session;
}

async function getSupabaseState() {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${url}/rest/v1/solao_admin_state?id=eq.${STATE_ID}&select=payload`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase GET error: ${response.status}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.payload || structuredClone(DEFAULT_STATE);
}

async function saveSupabaseState(payload) {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${url}/rest/v1/solao_admin_state?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      Accept: 'application/json',
    },
    body: JSON.stringify({ id: STATE_ID, payload }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase SAVE error: ${response.status} ${text}`);
  }

  return response.json();
}

function safeDefaultState() {
  return structuredClone(DEFAULT_STATE);
}

export {
  COOKIE_NAME,
  STATE_ID,
  adminPassword,
  adminUser,
  cookieOptions,
  createSessionToken,
  getSession,
  getSupabaseState,
  requireSession,
  safeDefaultState,
  saveSupabaseState,
  verifySessionToken,
};
