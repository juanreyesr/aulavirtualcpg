import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Exportar URL y key para usos que necesitan fetch directo (ej: tracking
// que sobrevive a navegación con keepalive: true)
export const SUPABASE_URL = supabaseUrl || '';
export const SUPABASE_ANON_KEY = supabaseAnonKey || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'aulacaeduc' }
    })
  : null;

// ── SSO entre apps (Créditos Académicos ↔ Aula Virtual) ──────────────────────
// La app de origen pide a la función `sso-enlace` un código de un solo uso y lo
// manda en el hash (#sso_th=...). Aquí se canjea por una sesión PROPIA de esta app,
// para que nunca compartan el refresh token (compartirlo hacía que Supabase cerrara
// la sesión en ambas apps al detectar su reutilización).
export const SSO_PARAM = 'sso_th';

export async function pedirCodigoSSO() {
  if (!supabase) return null;
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.functions.invoke('sso-enlace', { method: 'POST', body: {} });
    if (error) throw error;
    return data?.token_hash || null;
  } catch (e) {
    console.warn('[SSO] No se pudo obtener el código:', e?.message || e);
    return null;
  }
}

export const ssoListo = (async () => {
  if (!supabase || typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const tokenHash = params.get(SSO_PARAM);
  if (!tokenHash) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) console.warn('[SSO] Código no válido o vencido:', error.message);
  } catch (e) {
    console.warn('[SSO]', e?.message || e);
  }
})();
