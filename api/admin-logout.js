import { cookieOptions } from './_admin-shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Metodo no permitido' }));
  }

  res.setHeader('Set-Cookie', cookieOptions('', 0));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ success: true }));
}
