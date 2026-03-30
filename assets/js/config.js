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

// SHA-256 pur JS — implémentation de référence, fonctionne partout
function sha256(ascii) {
  var rr = function(v,a){ return (v>>>a)|(v<<(32-a)); };
  var mp = Math.pow, mw = mp(2,32);
  var h=[], k=[], pc=0, ic={};
  for (var ca=2; pc<64; ca++) {
    if (!ic[ca]) {
      for (var ii=0; ii<313; ii+=ca) ic[ii]=ca;
      h[pc]=(mp(ca,.5)*mw)|0; k[pc++]=(mp(ca,1/3)*mw)|0;
    }
  }
  var hash = h.slice(0,8);
  var msg  = ascii + '\x80';
  var abl  = ascii.length * 8;
  while (msg.length % 64 !== 56) msg += '\x00';
  var words = [];
  for (var i=0; i<msg.length; i++) words[i>>2] |= msg.charCodeAt(i) << ((3-i%4)*8);
  words.push(0, abl);
  for (var j=0; j<words.length;) {
    var w = words.slice(j, j+=16);
    var oh = hash.slice();
    for (var ii=0; ii<64; ii++) {
      if (ii>=16) {
        var w15=w[ii-15], w2=w[ii-2];
        w[ii]=((rr(w15,7)^rr(w15,18)^(w15>>>3))+w[ii-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10))+w[ii-16])|0;
      }
      var t1=(hash[7]+(rr(hash[4],6)^rr(hash[4],11)^rr(hash[4],25))+((hash[4]&hash[5])^(~hash[4]&hash[6]))+k[ii]+w[ii])|0;
      var t2=((rr(hash[0],2)^rr(hash[0],13)^rr(hash[0],22))+((hash[0]&hash[1])^(hash[0]&hash[2])^(hash[1]&hash[2])))|0;
      hash = [(t1+t2)|0, hash[0], hash[1], hash[2], (hash[3]+t1)|0, hash[4], hash[5], hash[6]];
    }
    hash = hash.map(function(v,i){ return (v+oh[i])|0; });
  }
  return hash.map(function(v){ return ('00000000'+((v<0?v+mp(2,32):v).toString(16))).slice(-8); }).join('');
}
