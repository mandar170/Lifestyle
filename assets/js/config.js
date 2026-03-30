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
// Pour changer :
//   1. Ouvre la console du navigateur sur le site
//   2. Tape : console.log(sha256('nouveau-mot-de-passe'))
//   3. Copie le hash → remplace PRIVATE_HASH ci-dessous
// ============================================================
const PRIVATE_HASH = 'a6ab0609536b71c1f7f8ef35f0e239832e35fba617ee207674cd5f400ed7621d';

// SHA-256 pur JS — fonctionne partout (HTTP, HTTPS, tous navigateurs)
function sha256(str) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  const K = [], H = [];
  for (let c = 2, p = 0; p < 64; c++) {
    let ok = true;
    for (let i = 2; i <= Math.sqrt(c); i++) if (c % i === 0) { ok = false; break; }
    if (ok) { H[p] = (Math.pow(c, .5) * 2**32) | 0; K[p++] = (Math.pow(c, 1/3) * 2**32) | 0; }
  }
  const h = H.slice(0, 8);
  let msg = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) msg += str[i];
    else if (c < 2048) msg += String.fromCharCode((c >> 6) | 192, (c & 63) | 128);
    else msg += String.fromCharCode((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
  }
  const blen = msg.length * 8;
  msg += '\x80';
  while (msg.length % 64 !== 56) msg += '\x00';
  const W = [];
  for (let i = 0; i < msg.length; i++) W[i >> 2] = (W[i >> 2] || 0) | (msg.charCodeAt(i) << ((3 - i % 4) * 8));
  W.push(0, blen);
  for (let j = 0; j < W.length; j += 16) {
    const w = W.slice(j, j + 16);
    while (w.length < 64) {
      const w2 = w[w.length-2], w15 = w[w.length-15];
      w.push(((rr(w2,17)^rr(w2,19)^(w2>>>10)) + w[w.length-7] + (rr(w15,7)^rr(w15,18)^(w15>>>3)) + w[w.length-16]) | 0);
    }
    let [a,b,c,d,e,f,g,hh] = h.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e&f)^(~e&g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a,2)^rr(a,13)^rr(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
      hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
    h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
  }
  return h.map(v => v.toString(16).padStart(8,'0')).join('');
}

// Alias async gardé pour compatibilité
async function hashPassword(pwd) { return sha256(pwd); }
