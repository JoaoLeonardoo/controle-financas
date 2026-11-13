import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example).',
  )
}

// Link do e-mail de troca de senha volta com "type=recovery" na URL. O cliente limpa a URL
// ao iniciar, então guardamos um aviso antes (o AuthContext lê isso).
try {
  if (window.location.hash.includes('type=recovery')) sessionStorage.setItem('recovery', '1')
} catch { /* sem sessionStorage */ }

// A chave "anon" é pública por design: quem protege os dados é o Row Level Security
// configurado no banco (supabase/schema.sql). Nunca use a "service_role" aqui.
export const supabase = createClient(url, anonKey)
