# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ScaleFlow** (dir `electron-app/`) — an Electron + React + Supabase app to mass‑post on Instagram / TikTok / Threads via **GeeLark** cloud phones (RPA automation over ADB). The **same codebase ships two ways**: a desktop Electron app and a web build (Vercel). A legacy Python FastAPI dashboard (`main.py`, `app.py`, `templates/`) is the old "IG Tracker" and is unrelated to ScaleFlow.

Almost all work happens in `electron-app/`.

## Commands

All from `electron-app/`:

```bash
npm run dev          # Electron + Vite dev (desktop)
npm run dev:web      # web dev server (vite.config.web.ts)
npm run build:web    # web production build → dist/ (deployed to Vercel)
npm run build:win    # desktop installer (tsc --noEmit + vite build + electron-builder)
npm test             # vitest run
npx vitest run src/lib/schedulerService.test.ts   # a single test file
```

- **`build:web` is the fast check** for most changes (typechecks via Vite/esbuild). Run it before committing.
- If `node_modules` is missing (container reset) and `npm install` fails with a **403 on `ffmpeg-static`** (it downloads a binary from GitHub releases, blocked by egress policy), install with `npm install --ignore-scripts` — the web build doesn't need the ffmpeg binary.
- No lint script; TypeScript strictness is the gate.

## Desktop vs Web — the key architectural split

The single most important thing to understand: **the same React code runs in Electron and in a browser.** Native capabilities are accessed through `window.electronAPI`.

- **Desktop**: `window.electronAPI` is the real IPC bridge (`electron/main.ts` handlers).
- **Web**: `src/main.tsx` injects `window.electronAPI = buildWebAPI()` (`src/lib/webAPI.ts`) — a polyfill mirroring each IPC method, and sets `window.__IS_WEB = true`.

So code calls `window.electronAPI.foo(...)` uniformly; the web polyfill reimplements it (often by calling a Vercel serverless function in `electron-app/api/*.js` to bypass browser CORS). When adding a native capability you must implement it in **both** `electron/main.ts` and `webAPI.ts`.

### GeeLark API access & the CORS/serverless pattern

GeeLark OpenAPI base: `https://openapi.geelark.com/open/v1`, auth `Authorization: Bearer <token>`. All GeeLark logic lives in **`src/lib/geelark.ts`** (large; the RPA/story/warmup/upload primitives). Calls route through `geelarkFetch`:

- Desktop → `window.electronAPI.geelarkRequest` (Electron `net.fetch`, no CORS).
- Web → `POST /api/geelark` (serverless relay in `electron-app/api/geelark.js`).

The `electron-app/api/*.js` files are **Vercel serverless proxies** (plain JS — the project's Vercel TS compile was flaky). They exist to do server‑side what the browser can't: e.g. `geelark-upload.js` downloads a media URL and PUTs it to GeeLark's presigned OSS (browser is CORS‑blocked on that PUT). Other proxies: `rotate.js` (proxy IP rotation), `groq*.js`, `ig.js`, `notify.js`, `screenshot.js`. None verify JWT — treat as an SSRF/abuse surface (see `AUDIT-COMPLET-JUILLET2026.md`).

**Media upload for RPA**: GeeLark RPA templates require a GeeLark‑hosted URL, not an external one. Flow: `/upload/getUrl` → PUT bytes → use returned `resourceUrl`. **Videos must be uploaded as `fileType: 'mp4'`** regardless of source extension (the Insta/TikTok/Threads RPA templates reject `.mov`/`.webm`); **images keep their real extension** (Threads `threadsImage` encodes it in the resourceUrl). GeeLark hosted media expires after **~30 days**. `uploadVideoGeelark` in `webAPI.ts` and `electron/main.ts` implement this; `api/geelark-upload.js` is the web server‑side path.

## Posting execution model (client‑driven, with resume)

Direct/immediate posting runs **entirely client‑side** (boot phones → wait → create RPA task per phone → poll `/task/query`). Key pages: `MassPosting.tsx`, `StoryLink.tsx`, `CrossPosting.tsx` (Threads/cross‑platform), `Warmup.tsx`, `TikTokPosting.tsx`.

- **In‑memory + persisted run state**: `src/lib/massPostingStore.ts` (singleton, survives React unmounts) persists the run to `localStorage` (`sf-mass-run`) so a **refresh resumes it**. Resume re‑polls in‑flight tasks (read‑only, never re‑posts a phone that already has a `taskId`) **and** re‑launches phones that never started (reusing the persisted GeeLark token — no re‑upload, no re‑debit). Resume window is 24h.
- **Global "en cours" registry**: `src/lib/activeRuns.ts` — a `localStorage`-persisted store (`sf-active-runs`) of all running posts across pages, with per‑phone detail (`phones[]`, `setRunPhase`). Rendered by the floating `ActivePostingsWidget` and History's `ActiveRunsSection`. Runs relaunched after a refresh are **orphaned** and either adopted by a resume flow or auto‑closed after a 30s grace period (`reconcileOrphans`). Also powers the same‑proxy conflict alert (`proxyConflicts`). **When cancelling a run, call `endRun` immediately** or the entry lingers "running" and triggers a false same‑proxy alert on the next launch.
- **Concurrency matters**: GeeLark rate‑limits ~200 req/min. A story ≈ 40 ADB calls; posting all phones at once saturates and fails intermittently. Story concurrency defaults to a cap (5) unless the user overrides.
- **Proxy rotation**: single proxy ⇒ serial by physics; concurrency = number of configured rotation URLs. Rotate the IP *before* booting a phone so it starts on the fresh IP.

## Server‑side scheduling (PC off)

Scheduled posts and recurring tasks run in the Supabase Edge Function **`supabase/functions/run-scheduled-posts/index.ts`** (Deno, cron‑ticked). It ports the client posting/story automation server‑side (`geelark-story.ts` is a Deno port of `postInstagramStory` using ImageScript, not Canvas). Stories are processed **one phone per invocation** to fit the serverless budget, re‑queued `pending` between phones. See the credit/scheduling rules below.

## Data & auth

- **Supabase** (`src/lib/supabase.ts`) is the DB/auth/storage backend. Migrations in `supabase/migrations/`; the various `electron-app/schema*.sql` are snapshots. Key tables: `phones`, `content_bank`, `caption_bank`, `scheduled_posts`, `recurring_tasks`, `post_runs`, org/license tables.
- **Orgs & permissions**: `src/lib/orgContext.tsx` + `permissions.ts`. Queries are org‑scoped (`org_id`) or personal (`user_id` + `org_id is null`). Roles: owner/admin/member/viewer (e.g. Subtitles is owner/admin‑only).
- **Credits**: `src/lib/credits.ts` (`CREDIT_COSTS`), `withCredits.ts` — debit‑upfront lifecycle (`startCreditRun` → `settle` refunds failed phones). Superadmin is `tintin.aunea@gmail.com`.
- **i18n**: `src/lib/i18n.tsx` (`useT`), FR/EN.

## Conventions

- Serverless proxies under `api/` are intentionally **plain JS**, return `{ ok, ... }` and generally HTTP 200 even on logical failure (error in the body).
- 16+ digit GeeLark IDs are wrapped as strings in proxy JSON to avoid float precision loss.
- Secrets: Groq key only via `VITE_DEFAULT_GROQ_KEY`; RapidAPI key only as a Supabase secret — never hardcode.
- Story flow is fragile on Android 13+/16 (MediaStore indexing, locale changes restart Instagram). Avoid `cmd locale set-app-locales` on the posting path (documented in `geelark.ts`).

---

# Règles métier importantes

## Système de crédits

### Coûts des actions

| Action | Coût |
|--------|------|
| Posting (par téléphone) | 2 crédits |
| Mass Posting (par téléphone) | 2 crédits |
| Story / StoryLink (par téléphone) | 1 crédit |
| Remix (par vidéo) | gratuit |
| Spoof / CloneVid (par vidéo) | gratuit |
| **Tâche automatique — quotidien** | **50 crédits/jour** |
| **Tâche automatique — par exécution** | **2 crédits × nb téléphones** |

> Règle : poster une vidéo coûte 2 crédits (single, mass **ou** programmé — même
> tarif pour éviter le bypass). Une story coûte 1 crédit. Les outils vidéo
> (remix, spoof) sont gratuits.

### Tâches automatiques (recurring_tasks) — règles de facturation

- **50 crédits/jour** par tâche active, débités chaque nuit à **minuit UTC**.
- **Premier jour** : les 50 crédits journaliers sont débités au moment du **premier posting** (pas à minuit), car la tâche vient juste d'être activée.
- **Chaque exécution** : `nb_téléphones × 2` crédits supplémentaires (même logique que Mass Posting).
- Si les crédits sont insuffisants (débit journalier OU débit par exécution), la tâche est **mise en pause automatiquement**.
- La colonne `recurring_tasks.credits_charged_date` (type `date`) enregistre la dernière date UTC de débit journalier pour éviter le double débit.

### Implémentation

- **`supabase/functions/run-scheduled-posts/index.ts`**
  - Étape `0-daily` : à minuit UTC (heure=0), débite 50 crédits pour chaque tâche active non encore débitée aujourd'hui.
  - Étape `1bis` : au moment de lancer un post depuis une tâche, débite les crédits par téléphone × 2. Si premier jour (credits_charged_date = null), ajoute aussi les 50 crédits journaliers.
- **`supabase/migrations/20260618b_task_credits.sql`** : ajoute la colonne `credits_charged_date` à `recurring_tasks`.
- **`electron-app/src/lib/credits.ts`** : constantes `task_daily` (50) et `task_per_run` (2) dans `CREDIT_COSTS`.

## Tâches automatiques — type Publication vs Story

- À la création d'une tâche (`recurring_tasks`), choix du **type** : `publication` (Reels, défaut) ou `story`.
- **Publication** : flow identique à Mass Posting (upload vidéos → start téléphones → boot 30s → RPA `instagramPubReels` → poll `/task/query`).
- **Story** : flow identique à l'onglet Story — pour chaque compte, image (rotation séquentielle/aléatoire) + **lien sticker propre au compte** + texte sticker optionnel (pool distribué). Utilise `postInstagramStory` (pas d'upload GeeLark ni de RPA Reels). Le lien par compte est stocké dans `phones[].link` et pré-rempli depuis l'onglet Story (localStorage `sf-story-link-<phoneId>`).
- Colonnes ajoutées par **`supabase/migrations/20260619_task_story.sql`** : `task_type` (text, défaut `publication`) et `story_texts` (jsonb, pool de textes).
- Implémentation : `electron-app/src/pages/Tasks.tsx` — `runTaskNow` branche sur le flow Story si `task_type === 'story'` ; le formulaire `CreateTaskModal` adapte ses champs (images, liens par compte, pool de textes).

## Tâches automatiques — sous-tâches / séquences

- Colonne `recurring_tasks.steps` (jsonb, défaut `[]`) ajoutée par **`supabase/migrations/20260619b_task_steps.sql`**.
- Chaque step : `{ id, type: 'publication'|'story'|'warmup', videos?/images?, caption?, story_texts?, phone_links?, mode?, delay_minutes?, delay_after_minutes?, reels_trial?, auto_remove_videos?, warmup_minutes? }`.
- **Mode de distribution** (`mode`: `seq`|`random`) et **usage unique** (`auto_remove_videos`) sont configurables **par step** dans le `StepEditor`. L'usage unique retire les médias utilisés de la pool du step et met la tâche en pause si une pool est vidée.
- Quand `steps = []`, la tâche utilise les colonnes plates legacy (`task_type`, `videos`, `caption`…) — rétrocompatible.
- Le modal `CreateTaskModal` place **Nom** + **Téléphones** en haut, puis le toggle « Mode séquence ».

## Exécution serveur des Stories (PC éteint)

- **`supabase/functions/run-scheduled-posts/geelark-story.ts`** : port Deno de `postInstagramStory` (automation ADB + sticker lien). Téléchargement image direct (pas de CORS), compression via **ImageScript** (`encodeJPEG`, pas de Canvas).
- L'edge function `index.ts` (étape 8) traite les stories **par téléphone, un seul par invocation** (boot ~30-60s + automation ~2 min tiennent dans le budget serverless). La progression est dans `scheduled_posts.result.story_progress.done` ; le post repasse en `pending` entre chaque téléphone pour reprendre au tick suivant du cron.
- Auto-heal : une story `running` bloquée > 15 min est **remise en `pending`** (reprise), pas marquée échouée (sauf > 6 h).
- **Limite** : seules les stories « plates » (`task_type='story'`, pas de `steps`) tournent côté serveur. Les séquences multi-étapes incluant story/warmup restent côté client.

## Sous-titres automatiques (Groq Whisper)

- Onglet accessible aux **owner et admin uniquement** (pas member/viewer).
- Transcription via Groq `whisper-large-v3-turbo` avec timestamps au niveau mot.
- En production web : proxy Vercel `/api/groq-transcription.js` pour contourner le blocage CORS de Groq sur les uploads multipart.
  - Vidéo depuis la banque : on envoie l'URL signée (le serveur fetch lui-même côté serveur).
  - Fichier local : encodé en base64 et envoyé au proxy (limite 25 MB).
- En Electron : IPC `groq-transcription` dans le main process (pas de CORS).
