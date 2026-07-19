# mandar170 — hub personnel

App de suivi personnel (nutrition, sport, budget, journal) en HTML/CSS/JS
vanilla, sans framework ni build step. Déployée sur Netlify, backend
Supabase (Postgres + Auth).

## Structure

- `personal.html` — coquille (dock de nav + iframe), point d'entrée, gère le
  login (Supabase Auth, session partagée avec les pages iframées car même
  origine).
- `nutrition.html`, `lifestyle.html`, `budget.html` — une page par module,
  chargées dans l'iframe de `personal.html`.
- `assets/js/` — un fichier JS par page/module (`nutrition.js`,
  `lifestyle.js`, `budget.js`, ...) + `config.js` (client Supabase partagé),
  `pwa.js` (enregistrement du service worker), `dock.js` (nav).
- `assets/css/main.css` — feuille de style unique pour toute l'app.
- `sw.js` + `manifest.json` — PWA (cache app-shell, installable).
- `supabase/migrations/` — schéma versionné (voir le README du dossier).

## Cache-busting

Chaque `<script>` et le `<link>` vers `main.css` portent un `?v=N` — à
incrémenter à chaque changement du fichier correspondant. Le service worker
cache tout le contenu same-origin de façon cache-first (sauf navigations,
en network-first) ; sans le `?v=N`, un changement ne sera jamais visible
pour un utilisateur ayant déjà l'app en cache/installée. Toujours vérifier
qu'un fichier modifié a bien vu son `?v=` incrémenté avant de commit.

## Base de données

App single-user. **Important sur le modèle de sécurité actuel :** toutes les
pages de données (`nutrition`, `budget`, `lifestyle`) interrogent Supabase
avec la clé **`anon` publique** (`assets/js/config.js`) et ne propagent pas
de jeton authentifié aux requêtes. L'écran de login (`personal.js`,
`signInWithPassword`) est donc surtout un garde-fou côté UI, pas côté base.

En conséquence, RLS est activé sur toutes les tables mais avec une policy
**permissive** `allow_all` (`to public using (true)`) : la clé anon a un accès
complet, comme historiquement. Verrouiller réellement la base (policies
`to authenticated`) **casserait l'app** tant que les requêtes ne portent pas
le JWT du user connecté — c'est un chantier à part entière (faire passer le
client authentifié à toutes les pages iframées, puis vérifier sur l'app
réelle) et non un simple changement de policy. Voir la migration
`20260719140000_restore_permissive_access_revert_rls_lockdown.sql`.

## Déploiement

Push sur `main` → `.github/workflows/deploy.yml` déploie sur Netlify. Un job
`check` (voir même fichier) fait un `node --check` sur tout `assets/js/`
avant le déploiement, pour attraper les erreurs de syntaxe évidentes — ce
n'est pas une suite de tests, juste un garde-fou minimal (aucun test
automatisé n'existe aujourd'hui).
