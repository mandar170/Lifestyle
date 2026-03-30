// ============================================================
// CONFIGURATION SUPABASE
// ============================================================
const SUPABASE_URL = "https://mftzzejtxzxlqvqtibds.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdHp6ZWp0eHp4bHF2cXRpYmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjM1NTcsImV4cCI6MjA5MDQzOTU1N30.pzVSuXZaEausombOaar9hTHxvHIoTjtJtFTUk7o_Ogg";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// MOT DE PASSE SECTION PRIVÉE
// Mot de passe actuel : lifestyle2026
//
// Pour changer de mot de passe :
//   1. Ouvre la console du navigateur sur le site
//   2. Tape : await hashPassword('nouveau-mot-de-passe')
//   3. Copie le hash affiché et remplace PRIVATE_HASH ci-dessous
// ============================================================
const PRIVATE_HASH = 'a6ab0609536b71c1f7f8ef35f0e239832e35fba617ee207674cd5f400ed7621d';

async function hashPassword(pwd) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  console.log('Hash :', hash);
  return hash;
}
