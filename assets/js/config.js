// ============================================================
// CONFIGURATION SUPABASE
// ============================================================
const SUPABASE_URL = "https://mftzzejtxzxlqvqtibds.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mdHp6ZWp0eHp4bHF2cXRpYmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjM1NTcsImV4cCI6MjA5MDQzOTU1N30.pzVSuXZaEausombOaar9hTHxvHIoTjtJtFTUk7o_Ogg";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
