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
