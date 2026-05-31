import { requireSession } from './_admin-shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Metodo no permitido' }));
  }

  const session = requireSession(req, res);
  if (!session) return;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: true,
    user: { username: session.username },
  }));
}
