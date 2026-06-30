# ScaleFlow — Rapport stratégique produit & technique

*Préparé pour le fondateur — 30 juin 2026*

---

## 1. Résumé exécutif

**ScaleFlow** est un SaaS (Electron desktop + web) qui pilote des cloud phones Android **GeeLark** pour automatiser Instagram à grande échelle : posting/mass-posting de Reels, stories avec sticker-lien par compte, outils vidéo (remix/spoof anti-doublon), tâches récurrentes programmées (exécutables PC éteint via cron Supabase), reporting par compte (followers/vues/shadowban) et gestion multi-membres avec système de crédits/licences.

**Forces** : une architecture serveur déjà capable de poster sans PC allumé (edge function + pg_cron), un schéma `steps[]` jsonb extensible déjà prêt à accueillir warmup/DM/engagement, un système de crédits unifié robuste, et un pipeline vidéo (FFmpeg) gratuit pour l'unicité. Le **positionnement est juste** : layer applicatif au-dessus de GeeLark qui vend l'orchestration métier que GeeLark laisse vide.

**Fragilités** : ScaleFlow n'exploite que ~20 % des RPA GeeLark, l'automatisation Story repose sur de l'ADB UI-scraping fragile, le polling sature le rate-limit à l'échelle, et plusieurs migrations crédits/orga ne sont pas committées.

**Où aller** : (1) combler le manque n°1 du marché — **DM automation IA** ; (2) activer les capacités GeeLark déjà payées (**warmup natif, webhooks**) ; (3) devenir une **usine de contenu** (génération caption/vidéo IA) et un **cross-poster TikTok**, sans changer d'infra.

---

## 2. État de l'appli aujourd'hui

| Module | Ce qu'il fait | Maturité | Ce qui marche | Ce qui est fragile |
|---|---|---|---|---|
| **Mass Posting** (`MassPosting.tsx`) | Reels IG + vidéo TikTok multi-comptes, distribution seq/random, captions Groq, reels-trial, OCR challenge | 🟢 Production | Flow 5 étapes complet, crédits remboursés sur échec, watchdog serveur 5 min | Boot **30 s codé en dur**, upload séquentiel re-uploadé à chaque run, RPA créée 1-par-1, aucun rate-limit/backoff, deadline 6 min → faux positifs « non confirmé », OCR **absent en web**, pilotage 100 % client |
| **Scheduler edge** (`run-scheduled-posts`) | Posts/stories/tâches PC-éteint, cron 1/min, débit crédits, sync stats, auto-heal | 🟢 Production | Reprise via task_ids persistés, claim atomique, auto-heal des posts bloqués | `delay=0` jamais confirmé inline, débit crédit non transactionnel avec le claim (sentinel +999h orphelin possible), volume bridé (posts limit 2, stories 1/tick, tasks 5) → goulot à grande échelle |
| **Tasks / Séquences** (`Tasks.tsx`, 3569 l.) | Tâches récurrentes publication/story/warmup, mode séquence, usage unique | 🟡 Partiel | Legacy flat + `segments` exécutés client, débit serveur OK | **`steps` non exécutés côté client** (deux modèles `steps`/`segments` concurrents), **warmup mort** (« Bientôt disponible »), **aucun débit crédit client** (risque de gratuité), `Promise.all` sans throttle, pas de lock anti-double-run client/cron |
| **Stories** (`geelark.ts` + `geelark-story.ts`) | Image + sticker-lien par compte + texte, ADB pur, client & serveur | 🟡 Fonctionnel mais fragile | Wipe galerie, transfert image (download/base64), 2 ports fonctionnels | **ADB UI-scraping massif** (taps en coordonnées fractionnaires → casse à chaque MAJ IG), **pas de vérif réelle de publication** (faux `ok:true`), drag sticker non fiable, saisie texte serveur faible (accents perdus), ~50-70 s de `sleep` codés en dur, **logique dupliquée client/serveur** |
| **Video-tools** (`repurpose.js`, Spoof, CloneVid) | Spoof (métadonnées iPhone + GPS), remix N variantes, mix-overlay, cobalt download | 🟡 Fonctionnel | Un seul `filter_complex` multi-sorties, presets d'intensité | `maxDuration 60s`/`maxBuffer 100Mo` Vercel (OOM silencieux), **similarité % cosmétique** (pas de vrai pHash/VMAF), cobalt scraping IG **quasi-mort** sur IP datacenter, pas de file d'attente ni remboursement sur échec spoof, tables GPS/presets **dupliquées** |
| **Subtitles** (Groq Whisper) | Sous-titres burn-in, owner/admin only | 🟢 Production | `whisper-large-v3-turbo` word-level, 3 routes (bank/web/electron) | **Triple duplication** du multipart Whisper, limite 25 MB, filtergraph drawtext énorme (lent), pas de word-wrap ni RTL, sortie `.mov` mal nommée |
| **Reports & stats** (`Reports.tsx`, RapidAPI) | Dashboard « Aujourd'hui », followers/vues/shadowban, courbe 30j | 🟡 Fonctionnel | Sync journalier serveur, snapshot `account_stats_history` | **Mono-fournisseur** (instagram120) sans retry/backoff (erreur → `null` silencieux), `account_state='banned'` **jamais écrit**, pas de pagination reels (`posts_today` faux), quota non budgété, shadowban heuristique grossière (seuil 5 %), Reports affiche **tous les comptes** sans filtre groupe |
| **Crédits & Plans** (`credits.ts`, licences) | 3 plans par clés de licence, packs à la carte, codes crédit, orga | 🟡 Partiel | Débit atomique SQL `SECURITY DEFINER`, cycle `startCreditRun→settle` unifié | **Migrations manquantes non committées** (`maybe_grant_monthly_credits`, `org_owner_plan`, `get_org_credit_balance`) → octroi mensuel non garanti, **plafonds téléphones purement front** (contournables), remboursement no-op silencieux, packs sans backend/audit |
| **Bank & Org** (`Bank.tsx`, permissions) | Banque médias partagée, dossiers, tags, rôles owner/admin/member/viewer | 🟡 Partiel | Scope org/perso, signed URLs cachées, import Drive | **RLS partielle** (seul DELETE couvert ; move/upload/folder contournables, `canAccessBankFolder` **pas en RLS**), dossiers en **lignes sentinelles** (chaînes magiques fragiles), chargement tout-en-mémoire (lent à 10k+), opérations non transactionnelles |

**Synthèse maturité** : le cœur posting/scheduler/crédits est solide et en production ; les zones les plus risquées sont l'**ADB Story** (fragilité UI), la **facturation client des tâches** (gratuité possible), les **migrations crédits non committées**, et la **RLS Bank incomplète**.

---

## 3. GeeLark : ce qu'on exploite vs tout le potentiel

**Base** : `https://openapi.geelark.com/open/v1` — POST+JSON, header `traceId` UUID v4, réponse `{traceId, code, msg, data}` (succès `code:0`). **Rate limit : 200 req/min, 24 000/h par API → dépassement = lock 2 h.**

| Capacité GeeLark | Utilisée ? | Détail / Opportunité |
|---|---|---|
| `/phone/start` `/stop` `/phone/list` status | ✅ | Mais `/phone/list` paginé re-interrogé en boucle 5s → **O(N²)** ; start non batché |
| `/shell/execute` (ADB) | ✅ Massivement | Story, reply-comment, post TikTok, édition profil — **fragile** |
| `/rpa/task/instagramPubReels` | ✅ | Cœur du posting Reels |
| `/upload/getUrl` + PUT S3 | ✅ (vidéo) | **Pas pour images** (avatars/story passent par curl/base64 fragile) |
| `/task/query` | ✅ 1-par-1 | API **supporte multi-ID** — non exploité ; renvoie `ok:true` au timeout (faux succès) |
| `/rpa/task/instagramWarmup` | ❌ | **Step `warmup` mort** alors que RPA natif existe |
| DM (`Auto Send Private Messages`) | ❌ | **Manque n°1 marché** — RPA natif dispo |
| Engagement (IG like/comment, `TikTok Random Like`) | ❌ | Croissance organique, quota guard à construire |
| **Webhooks** (`Set Webhook URL`) | ❌ | **Critique scaling** — remplace le polling, économise le quota |
| Proxy detection/validation | ❌ | Pré-check avant run = crédits/minutes économisés |
| TikTok / YouTube Shorts / Threads / X / FB RPA | ❌ (TikTok partiel) | `/task/add` TikTok déjà à moitié câblé |
| Carrousel (`Publish Reels Gallery`), photo | ❌ | Meilleur reach IG 2026 |
| SMS + import contacts batch + create/clone phone | ❌ | Auto-création comptes (v2, risqué) |
| Groups/Tags CRUD | ❌ | Sync organisation phones, quick win |
| Randomisation Android 9→15 à la création | ❌ | Empreinte plus crédible |
| Billing API (balance, transactions) | ❌ | Modéliser le coût minute-phone côté ScaleFlow |
| Custom RPA Flow Builder (40+ modules) | ❌ | Déléguer des flows plutôt que maintenir l'ADB Deno |

**Verdict** : ScaleFlow utilise ~20 % du potentiel. Deux paradigmes coexistent — **RPA natif** (fiable) et **ADB brut** (fragile). La direction stratégique est de **migrer le fragile vers le natif** et d'activer warmup/DM/engagement/webhooks déjà payés.

---

## 4. Marché & concurrence

**Taille** : Social media management ~36,4 Mds $ (2026) → 171,6 Mds $ d'ici 2033 (CAGR ~24,8 %). Automation tools : 4,5 Mds $ (2024) → 12,8 Mds $ (2033).

**Deux familles de concurrents** :
1. **Schedulers API officielle** (Hootsuite ~199 $/mo, SocialPilot 500 posts/bulk, RecurPost, Postiz 23-79 $/mo, Buffer/Later) — conformes mais **limités aux comptes Business/Creator**, **incapables de mass-posting fantôme**. Ils ont ce que ScaleFlow n'a pas : calendrier visuel, **DM automation/comment-triggers**, analytics, **reporting white-label**, approbations client.
2. **Cloud phones / antidetect** (GeeLark, Multilogin, GoLogin) — vendent l'**infra brute**, pas le produit fini agence. GeeLark : 0,007 $/min, **cap 1,2 $/jour/device**, rental 29,9 $/device/mo, parallels 39,9 $/mo.

**Ce qui se vend (douleurs concrètes agences)** :
- **Pricing flat, jamais par compte** — critère d'achat n°1 (ManyChat ≈ 300 $/mo à 20 comptes « explose »).
- **DM automation/chatbot IA** : économise **70-80 % du temps DM** ; se vend contre un DM operator (400-600 $/mo).
- **Reporting white-label** : économise ~1 jour/mois ; l'agence facture, ScaleFlow invisible derrière.
- **Anti-ban / survie de comptes** (warmup) : argument « assurance capital-compte » (95 % survie GeeLark).
- **Argumentaire RH** : se positionner contre 2 000-3 000 $/mois d'account manager (25-30 comptes), pas contre les SaaS.

**Positionnement cible** : ScaleFlow est le **layer d'orchestration métier au-dessus de GeeLark** que personne ne vend clé-en-main. Le vrai concurrent fonctionnel sur le terrain « grey » n'est pas Hootsuite mais la **device farm + coût RH** qu'on remplace.

---

## 5. EXTENSION — Posting en masse (roadmap priorisée)

**P1 — Gains immédiats, fort levier**

1. **Cross-posting TikTok** (effort M) — Template RPA `tiktokPubVideo` analogue à `instagramPubReels`, réutilise phones/proxies/crédits/`recurring_tasks`. `/task/add` TikTok déjà partiellement câblé. **TAM ×2** sans nouvelle infra. ⚠️ Prérequis : spoof/remix **obligatoire** (pHash + fingerprint audio TikTok agressifs) + jitter anti-coordination (TikTok ban par cluster sur posting synchronisé).

2. **Anti-ban intégré** (effort M) — Câbler `step.type='warmup'` au RPA natif GeeLark + presets sem.1-4 (5-8 likes/session → premier post à 3-4 sem.), **jitter d'intervalle 20s-5min** (au lieu d'intervalles fixes = signature bot), **quota guard** par compte/jour (20-30 follows, 70-90 likes), **gate anti-lien <7j** (lien J1 = shadowban quasi instantané). Différenciateur anti-churn.

3. **Spoof/uniqueness auto par téléphone** (effort M) — Brancher Remix/Spoof **automatiquement** avant chaque mass-post, variante déterministe seedée sur `phoneId` (crop 2-6 %, zoom 1,02-1,08x, color jitter, micro-rotation, speed audio 0,97-1,03x) + check pHash/SSIM réel ciblant le **seuil cosinus 0,75 de Meta**. Rend le mass-posting *réellement* fonctionnel. Remplace MetaGhost (99 $/mo) intégré et gratuit.

**P2 — Fiabilité & scale**

4. **Webhooks GeeLark + batch** (effort L webhooks / S batch) — Remplacer le poll `/task/query` par callbacks ; batcher `/phone/start` + RPA en pool de concurrence + backoff sur 429. **Condition sine qua non du passage à 1000 comptes** (sinon lock 2h paralyse la flotte). Quick win immédiat : multi-ID `/task/query` + batch start.

5. **Boot readiness + confirmation fiable** (effort S/M) — Remplacer `setTimeout(30000)` par poll `/phone/status` réel ; OCR challenge au web ; confirmer `delay=0` inline côté edge. Supprime les faux « done · non confirmé ».

**P3 — Nouveaux formats & intelligence**

6. **Carrousel / photo / multi-plateforme** (effort M) — Carrousel (meilleur reach IG 2026), photo, YouTube Shorts/Threads/X (templates RPA GeeLark existants). Chaque format = un `step.type`.

7. **Scheduling intelligent + A/B testing** (effort L) — A/B variantes caption/vidéo sur sous-groupes, comparaison via `account_stats_history` déjà collecté ; best-time-to-post par compte + désync anti-cluster. Argument premium agence.

---

## 6. EXTENSION — Création de contenu en masse (pipeline IA)

ScaleFlow **distribue mais ne produit rien** (banque alimentée à la main). Objectif : usine idée → vidéo → post.

**Quick wins (S, ROI immédiat)**

1. **AI Caption/Hook par variantes** — Groq llama **déjà câblé** ; passer d'1 caption à un pool de N seedé par `phoneId`, branché sur la distribution seq/random existante. Coût quasi nul (centimes/M tokens), facturable ~1 crédit. **Tue le duplicate-content textuel** (signal de clustering).

2. **pHash/SSIM auto-QA + spoof déclenché** — Mesure perceptuelle réelle (vs % cosmétique actuel) via `videohash` ; si deux variantes > 0,75 cosinus → spoof auto. Garantie d'unicité mesurée et vendable.

**Briques faceless (M)**

3. **Step `voiceover` TTS** — OpenAI TTS (~15 $/M car ≈ 0,001 $/script) ou ElevenLabs premium. Schéma `steps[]` extensible, pas d'ADB → serveur PC-éteint. Banque gère déjà l'audio.

4. **Clipping vidéo longue → shorts** — Vizard ou **Reap** (API + MCP natif, pilotable par agent). `cobalt.js` télécharge déjà des sources, sous-titres burn-in existent. Une source → 10-20 posts.

6. **Spoof avancé : audio + EXIF cohérent device** — Jitter audio (pitch/tempo, contre HashWave que les concurrents négligent), métadonnées EXIF/QuickTime **cohérentes avec le fingerprint GeeLark** du téléphone (device connu via `/phone/list`), `setpts` (présent dans Spoof, absent de CloneVid). Critique pour TikTok.

**Différenciateurs (M/L)**

5. **UGC / avatar batch** — Creatify (50+ variantes/job, API+MCP) ou Arcads (API publique, backend Veo/Sora/Kling). Pay-as-you-go → mappe direct sur les crédits. Passe de « distributeur » à « usine end-to-end ».

7. **Pipeline « one-click faceless reel »** (L) — Chaîne hook IA → script → TTS → text-to-video (Kling 0,07 $/s / Veo via fal) → sous-titres → spoof → banque → posting. Le produit « rêve », justifie le plan premium (« remplace un content creator 500-800 $/mo »).

**APIs à intégrer** : OpenAI Batch/Claude (texte), OpenAI TTS/ElevenLabs (voix), Vizard/Reap (clipping), Creatify/Arcads (UGC), Kling/Veo via fal (text-to-video), `videohash` (QA). Toutes à l'usage → refacturables en crédits avec marge.

⚠️ **Garde-fou conformité** : label IA obligatoire (TikTok C2PA, **51 618 vidéos IA supprimées en H1, +340 % YoY**) ; les algos 2026 down-rankent les outputs template clusterisés → **variation forte** plutôt que template unique.

---

## 7. Backlog priorisé

| # | Feature | Impact | Effort | Dépend GeeLark ? | Priorité |
|---|---|---|---|---|---|
| 1 | **DM automation + chatbot IA** | ⭐⭐⭐⭐⭐ (manque n°1, 70-80 % temps DM) | M | ✅ RPA natif dispo | **P0** |
| 2 | **Warmup natif + jitter + quota guard** | ⭐⭐⭐⭐ anti-churn | M (S pour jitter/gate) | ✅ `instagramWarmup` | **P0** |
| 3 | **AI caption/variantes** | ⭐⭐⭐⭐ anti-doublon | S | ❌ | **P0** |
| 4 | **pHash/SSIM + spoof auto** | ⭐⭐⭐⭐ unicité réelle | S/M | ❌ | **P1** |
| 5 | **Webhooks GeeLark + batch** | ⭐⭐⭐ (débloque 1000 comptes) | L (S batch) | ✅ | **P1** |
| 6 | **Reporting white-label PDF** | ⭐⭐⭐⭐ standard agence | M | ❌ (données existent) | **P1** |
| 7 | **Cross-posting TikTok** | ⭐⭐⭐ TAM ×2 | M | ✅ | **P1** |
| 8 | **Boot readiness + confirm fiable** | ⭐⭐⭐ fiabilité | S/M | ✅ `/phone/status` | **P1** |
| 9 | **Validation proxy avant run** | ⭐⭐ crédits économisés | S | ✅ | **P2** |
| 10 | **Engagement ciblé (follow/like/comment)** | ⭐⭐⭐ croissance | M | ✅ | **P2** |
| 11 | **Step `voiceover` TTS** | ⭐⭐⭐ brique faceless | M | ❌ | **P2** |
| 12 | **Clipping vidéo→shorts** | ⭐⭐⭐ démultiplie banque | M | ❌ | **P2** |
| 13 | **Carrousel / photo / Shorts / Threads** | ⭐⭐ valeur/contenu | M | ✅ | **P2** |
| 14 | **Spoof avancé audio+EXIF device** | ⭐⭐⭐ anti-TikTok | M | ⚠️ (lit `/phone/list`) | **P2** |
| 15 | **UGC/avatar batch (Creatify/Arcads)** | ⭐⭐⭐ end-to-end | M/L | ❌ | **P3** |
| 16 | **Groups/Tags sync + Android random** | ⭐⭐ hygiène | S | ✅ | **P3** |
| 17 | **Scheduling intelligent + A/B** | ⭐⭐⭐ premium | L | ❌ | **P3** |
| 18 | **Pipeline faceless one-click** | ⭐⭐⭐⭐ produit rêve | L | partiel | **P3** |
| 19 | **Auto-création comptes (SMS/2FA)** | ⭐⭐⭐ onboarding | L | ✅ (risqué CGU) | **P3 / v2** |

**Dette technique bloquante à traiter en parallèle (non-feature)** :
- Committer les migrations crédits (`maybe_grant_monthly_credits`, `org_owner_plan`, `get_org_credit_balance`) — **avant** de vendre des paliers de scale.
- Débit crédit client dans `Tasks.tsx` + lock anti-double-run (gratuité actuelle possible).
- Plafonds téléphones/mass-posting côté serveur (RPC), pas seulement front.
- RLS Bank (move/upload/folder + `canAccessBankFolder`).
- Unifier `steps`/`segments` et exécuter `steps` côté client.

---

## 8. Risques

**Anti-ban (risque produit n°1)** — Instagram/TikTok 2025-2026 **ban par cluster** (device ID, IP, fingerprint, timeline de warmup identiques). Risques concrets dans ScaleFlow aujourd'hui : intervalles fixes (signature bot), posting synchronisé au même tick cron, lien dès J1, contenu dupliqué (caption + vidéo). Mitigation : jitter, staggering, gate anti-lien, warmup, spoof réel par téléphone. **Perceptual hashing** (PDQ/embeddings cosinus >0,75) rend le MD5/ré-encodage seul insuffisant — il faut des transformations *visuellement significatives*.

**Dépendance GeeLark** — Tout le produit en dépend. Rate-limit 200 req/min → lock 2h paralyse la flotte (le polling actuel sature à l'échelle). Quotas tier (Base : opens = profils×200, creates = profils×5) plafonnent les démarrages/jour. Mitigation : webhooks, throttle/backoff, tracker opens/creates consommés. Coût à modéliser en **minutes-phone** (~3 min/exécution ≈ 0,02 $), pas en abonnement par phone.

**Dépendance RapidAPI (instagram120)** — Mono-fournisseur sans retry/backoff, erreur → `null` silencieux, quota non budgété ni alerté. Un quota épuisé fait chuter le sync sans alerte. Mitigation : retry/backoff, persister le quota (en-têtes déjà lus), fournisseur de secours.

**Scaling** — Goulots : edge function 1 cron/min avec limits bas (posts 2, stories 1/tick, tasks 5) → N stories = N minutes ; `/phone/list` O(N²) ; chargement Bank tout-en-mémoire ; pilotage posting 100 % client. Mitigation : limits dynamiques selon budget temps, webhooks, batch.

**Légal / conformité** — Ces techniques contreviennent aux CGU Instagram/Meta/TikTok — **à cadrer juridiquement**. Label IA obligatoire (C2PA TikTok). Auto-création de comptes (SMS/2FA) particulièrement exposée → réserver à une v2 avec garde-fous. Packs crédits sans audit/idempotence = risque financier (à logger dans un `credit_ledger`).

---

## 9. Recommandations — 3 prochains chantiers à lancer

### Chantier 1 — DM automation IA (le levier revenu n°1)
**Quoi** : nouveau `step.type='dm'` via le RPA natif GeeLark *Auto Send Private Messages* (réponse aux nouveaux followers + mots-clés → DM avec lien), pool de variantes IA distribué (réutilise le pattern `story_texts`), exécutable serveur PC-éteint.
**Pourquoi en premier** : c'est la **seule feature qui se vend contre un coût RH chiffrable** (DM operator 400-600 $/mo, ManyChat ~300 $/mo à 20 comptes) et comble le **manque n°1 vs concurrents 2026**. Faisabilité élevée : RPA natif + pattern ADB/pool/poll déjà en place. Effort M.

### Chantier 2 — Vague anti-ban (warmup natif + jitter + quota guard + spoof réel)
**Quoi** : câbler le `step.type='warmup'` mort au RPA `instagramWarmup` natif avec presets sem.1-4 ; remplacer les intervalles fixes par un **jitter 20s-5min** ; **gate anti-lien <7j** ; **quota guard** par compte/jour ; brancher le **spoof auto seedé par `phoneId`** avec **pHash réel** (vs % cosmétique).
**Pourquoi** : protège le **capital-compte** (les bans en cascade = churn direct). Le warmup est le différenciateur que les schedulers API n'ont pas (« assurance survie 95 % »). Plusieurs sous-chantiers sont effort **S** (jitter, gate, pHash check) → quick wins dégainables en semaine 1. Le schéma `steps`/`warmup_minutes` est **déjà prêt**.

### Chantier 3 — Génération de contenu IA (caption/variantes) + dette crédits sécurisée
**Quoi** : pool de captions/hooks IA par `phoneId` (Groq déjà câblé, effort S) ; **en parallèle**, sécuriser la dette bloquante avant tout palier de scale facturé — committer les migrations crédits manquantes, ajouter le débit crédit client dans `Tasks.tsx` + lock anti-double-run, déplacer les plafonds téléphones côté serveur.
**Pourquoi** : la génération IA transforme « distributeur » en « usine de contenu » à coût marginal nul (refacturable avec marge), et **tue le duplicate-content textuel** (renforce l'anti-ban du chantier 2). La sécurisation crédits est **non négociable avant de vendre du scale** : aujourd'hui les tâches client peuvent s'exécuter gratuitement et l'octroi mensuel n'est pas garanti déployé.

**Fil conducteur des 3 chantiers** : ils exploitent des capacités **déjà payées mais non câblées** (RPA GeeLark warmup/DM, Groq, archi `steps[]`/crédits) → ROI élevé, risque technique faible. Le sous-jacent infra (webhooks, cross-posting TikTok, reporting white-label) suit en P1 une fois ces fondations posées.