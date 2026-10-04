# Déploiement web (Vercel)

La même app tourne en **Electron** (appels directs, `webSecurity:false`) et sur le
**web** (relais serverless dans `api/*` pour contourner le CORS). La cible est
détectée à l'exécution via `src/lib/platform.ts` (`IS_WEB`, d'après le user-agent).

## Vercel
1. Nouveau projet → **Root Directory = `desktop-app/`**, branche `desktop-app-v10`.
2. `vercel.json` fait le reste : `npm run build` → `dist/`, fonctions dans `api/`,
   rewrite SPA. Le cœur ffmpeg.wasm est copié dans `dist/ffmpeg/` par
   `scripts/copy-ffmpeg.mjs` (lancé par `npm run build`).
3. Install : Vercel fait `npm install` (installe `@supabase/supabase-js` requis par
   les fonctions `api/geelark-upload.js` et `api/meta-callback.js`).

## Variables d'environnement (Project → Settings → Environment Variables)
Front : **aucune** (URL + clé publishable Supabase sont publiques, en dur dans
`src/lib/supabase.ts`, identiques à `login.dc.html`).

Fonctions serverless — seulement pour Meta et l'upload par service role :
| Variable | Pour quoi | Obligatoire |
|---|---|---|
| `META_APP_ID` | OAuth Meta (callback) | oui (stats Meta) |
| `META_APP_SECRET` | OAuth Meta (échange de token) | oui (stats Meta) |
| `META_REDIRECT_URI` | `https://<domaine>/api/meta-callback` | oui (stats Meta) |
| `SUPABASE_SERVICE_ROLE_KEY` | `geelark-upload` mode storagePath (le mode signedUrl marche sans) | recommandé |
| `SUPABASE_URL` | garde anti-SSRF (facultatif : `*.supabase.co` est déjà autorisé) | non |

Côté app (table `app_config`/`org_config`) : `meta_app_id` + `meta_redirect_uri`
(=`https://<domaine>/api/meta-callback`) pour activer le bouton « Connecter Meta ».

## Meta
Dans l'app Meta (developers.facebook.com) → Facebook Login → Valid OAuth Redirect
URIs : ajoute `https://<domaine>/api/meta-callback`.

## Relais utilisés sur le web
`/api/geelark` (API GeeLark) · `/api/geelark-upload` (hébergement média) ·
`/api/iremotech` + WebSocket direct (Phone Farm) · `/api/rotate` (rotation d'IP) ·
`/api/groq` (légendes IA + sous-titres) · `/api/meta` (Graph insights) ·
`/api/meta-callback` (OAuth). En Electron, tous ces appels sont directs.

## Notes
- `ffmpeg.wasm` (Studio) tourne côté client → identique web/desktop (1ᵉʳ chargement ~30 Mo).
- L'app web charge sur `index.html` ; sans session Supabase → redirige vers `login.dc.html`.
- `electron-app/` n'est pas touché : c'est un déploiement séparé.
