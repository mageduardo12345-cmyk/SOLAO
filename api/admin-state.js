import { getSupabaseState, requireSession, safeDefaultState, saveSupabaseState } from './_admin-shared.js';

function sanitizeState(raw) {
  const fallback = safeDefaultState();
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    clients: Array.isArray(data.clients) ? data.clients : fallback.clients,
    availability: Array.isArray(data.availability) ? data.availability : fallback.availability,
    selectedClientId: typeof data.selectedClientId === 'string' ? data.selectedClientId : null,
    filters: {
      search: typeof data.filters?.search === 'string' ? data.filters.search : '',
      status: typeof data.filters?.status === 'string' ? data.filters.status : 'all',
    },
  };
}

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
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    try {
      const state = sanitizeState(await getSupabaseState());
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true, data: state }));
    } catch (error) {
      console.error('admin-state GET error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        error: 'No se pudo leer la base de datos. Revisa las variables de entorno de Supabase.',
      }));
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = sanitizeState(readBody(req));
      await saveSupabaseState(payload);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true, data: payload }));
    } catch (error) {
      console.error('admin-state POST error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        success: false,
        error: 'No se pudo guardar en la nube. Revisa Supabase y vuelve a intentar.',
      }));
    }
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ success: false, error: 'Metodo no permitido' }));
}
