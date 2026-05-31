import { adminPassword, adminUser, createSessionToken, cookieOptions } from './_admin-shared.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Metodo no permitido' }));
  }

  const body = readBody(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (username !== adminUser() || password !== adminPassword()) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Usuario o contraseña incorrectos' }));
  }

  const expiresAt = Date.now() + (SESSION_TTL_SECONDS * 1000);
  const token = createSessionToken(username, expiresAt);

  res.setHeader('Set-Cookie', cookieOptions(token, SESSION_TTL_SECONDS));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: true,
    user: { username },
    expiresAt,
    token,
  }));
}
