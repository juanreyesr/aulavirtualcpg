// SSO entre Créditos Académicos (caeducgt.org) y Aula Virtual (aulavirtualcpg.org).
//
// Antes cada app le pasaba a la otra SU PROPIA sesión (access_token + refresh_token)
// por la URL. Las dos quedaban compartiendo el mismo refresh token: cuando una lo
// renovaba, el de la otra quedaba "ya usado" y Supabase, al detectar reutilización,
// revocaba la sesión completa → el usuario aparecía con la sesión cerrada en ambas.
//
// Ahora la app de origen pide aquí un código de un solo uso (token_hash de un enlace
// mágico generado sin enviar correo) y la app de destino lo canjea con verifyOtp,
// obteniendo una sesión NUEVA e independiente. Ninguna app toca la sesión de la otra.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGENES = new Set([
  'https://caeducgt.org', 'https://www.caeducgt.org',
  'https://aulavirtualcpg.org', 'https://www.aulavirtualcpg.org',
]);

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.has(origin) ? origin : 'https://aulavirtualcpg.org',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const headers = { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers });

  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return responder({ error: 'No autorizado' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Solo un usuario con sesión válida puede pedir un código, y solo para sí mismo.
  const { data: { user }, error: errUsuario } = await admin.auth.getUser(jwt);
  if (errUsuario || !user?.email) return responder({ error: 'Sesión no válida' }, 401);

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[sso-enlace] generateLink', error?.message);
    return responder({ error: 'No se pudo generar el acceso' }, 500);
  }
  return responder({ token_hash: tokenHash });
});
