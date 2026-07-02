# ScaleFlow — Audit complet & Proposition de refonte

> Juillet 2026 · Audit multi-agents (7 auditeurs spécialisés, ~45 000 lignes analysées)
> Périmètre : app Electron+web, API Vercel, edge functions Supabase, 40 migrations DB, API GeeLark (91 endpoints), legacy racine.
> **Aucune modification n'a été exécutée — ce document est une analyse + des propositions.**

---

## 1. Résumé exécutif

ScaleFlow est un produit **fonctionnellement riche et techniquement inventif** (automation ADB, triple filet anti-coût téléphones, fallbacks partout), mais qui a grandi **par accrétion** : 33 pages, des fichiers de 2 000-3 500 lignes, 3 systèmes de crédits divergents, 2 référentiels de design contradictoires, du code dupliqué entre client et serveur, et des **failles de sécurité critiques sur le modèle économique** (crédits) et sur les proxys serveur.

**Verdict par domaine :**

| Domaine | Note | Constat en une ligne |
|---|---|---|
| Cœur posting (Reels/Story) | ⭐⭐⭐ | Robuste par couches successives, mais fragile par design (ADB/XML) et crédits mal branchés |
| Serveur (edge + API Vercel) | ⭐⭐ | Idempotence bien pensée, mais **10 proxys sans authentification** et SSRF multiples |
| Base de données / RLS | ⭐⭐ | Isolation multi-tenant correcte, mais **RPC crédits ouvertes à tous** et dérive de schéma |
| Crédits / facturation | ⭐ | **Contournable côté client, refund public, codes lisibles** — le modèle payant n'est pas protégé |
| UX / navigation | ⭐⭐ | Beau vernis, mais 2 systèmes de gating incohérents, routes fantômes, i18n à moitié appliquée |
| Outils vidéo / banque | ⭐⭐⭐ | 3 backends FFmpeg intelligents, mais ~1 500 lignes dupliquées et 2 mutex wasm concurrents |
| Téléphones / stats / perf | ⭐⭐⭐ | Pollers bien conçus, mais rien n'est virtualisé → mur à ~200-500 téléphones |
| Electron | ⭐⭐ | `webSecurity:false`, pas d'auto-update, OCR cassé (handler manquant) |
| Exploitation API GeeLark | ⭐⭐ | **19 endpoints utilisés sur 91** — énorme potentiel produit inexploité |

---

## 2. 🔴 Failles critiques — à corriger AVANT tout le reste

Ces 8 points mettent en danger le business directement. Ordre de priorité :

### 2.1 Crédits infinis pour n'importe quel utilisateur
`refund_user_credits(p_user_id, p_amount)` est `SECURITY DEFINER` **sans aucun GRANT/REVOKE ni vérification de l'appelant** (`supabase/migrations/20260611_credits_and_heartbeat.sql:4-17`). N'importe quel porteur de la clé publique peut appeler `rpc('refund_user_credits', {p_user_id: <soi>, p_amount: 999999})` et se créditer à l'infini.
**Fix :** `REVOKE EXECUTE FROM public, anon` + réserver la fonction au `service_role`.

### 2.2 Vol de tous les codes de crédit
La policy `anyone_read_active_codes` rend **tous les codes non utilisés lisibles** par tout utilisateur authentifié (`supabase/schema.sql:682-683`), et `redeem_credit_code` accepte un `p_user_id` arbitraire. Un client peut énumérer et encaisser tous les vouchers émis.
**Fix :** supprimer la policy de lecture ; valider les codes uniquement via la RPC (qui ne SELECT jamais côté client).

### 2.3 Le posting est facturable… ou gratuit, au choix du client
Le débit des crédits pour Posting/MassPosting/Story est **entièrement côté client** (`MassPosting.tsx:589-592`) : un client modifié peut poster sans débiter, ou marquer tous ses posts « failed » pour se faire rembourser (`withCredits.ts:47-63`). Seules les tâches récurrentes serveur sont réellement enforce.
**Fix court terme :** verrouiller les RPC (2.1). **Fix structurel :** faire passer le lancement RPA par une edge function qui débite atomiquement (cf. refonte §6).

### 2.4 À l'inverse : les clients honnêtes sont SUR-facturés
`run.settle()` / `run.markFailed()` ne sont **jamais appelés** dans `MassPosting.post()` — les téléphones en échec ne sont jamais remboursés, et quand 0 téléphone ne démarre, tout le coût reste débité. Même problème dans `StoryLink.run()`.
**Fix :** brancher `markFailed()` sur chaque erreur et `settle()` dans le `finally` (effort faible).

### 2.5 Secrets réels commités dans le repo
`main.py:18-23` et `app.py` contiennent **une clé API GeeLark et des identifiants proxy SOCKS5 en clair**, trackés dans git.
**Fix :** roter la clé GeeLark + les identifiants proxy immédiatement, supprimer le legacy Python (app.py 573 Ko, main.py, templates/…), purger l'historique (BFG/git-filter-repo).

### 2.6 /api/repurpose : suppression de fichier arbitraire + injection FFmpeg
Endpoint non authentifié : (a) le `finally` supprime n'importe quel `storagePath` fourni **avec la clé service_role** (`repurpose.js:421`) → un attaquant peut détruire les fichiers de n'importe quel client ; (b) `variants[].vf` est concaténé tel quel dans `filter_complex` (`repurpose.js:348`) → contrôle du graphe de filtres FFmpeg exécuté serveur.
**Fix :** authentifier l'endpoint, vérifier la propriété du fichier, allowlister les filtres.

### 2.7 Les 10 proxys Vercel n'authentifient personne
`/api/anthropic`, `geelark`, `gx`, `ig`, `groq`, `mix-overlay`, `repurpose`, `notify`, `screenshot`, `geelark-upload` : aucun ne vérifie le JWT. Conséquences : relais de spam via ta clé Resend (`notify.js`), DoS coût FFmpeg, IDOR storage via service_role (`geelark-upload.js:59-84`), SSRF (URL arbitraire fetchée par le serveur dans 4 d'entre eux, + whitelist contournable dans `ig.js:16` — `hostname.includes()`).
**Fix :** middleware JWT Supabase commun aux 10 fonctions + validation URL par hostname exact + blocage IP privées.

### 2.8 Bearer GeeLark lisible par tous les membres de l'org
`org_config.bearer_token` en clair, policy `is_org_member` (`supabase/schema.sql:612`) : un simple **viewer** peut exfiltrer le token → contrôle total du tenant GeeLark (démarrages = coûts, publication, suppression).
**Fix :** policy `is_org_admin` + RPC de lecture scoping + chiffrement au repos.

### Autres failles hautes
- **Licence FAIL-OPEN** : toute erreur réseau/DB donne un accès complet (`license.ts:21,35,62…`) → passer en mode dégradé lecture seule.
- **SSRF edge function** : `?img=` s'exécute avant l'auth avec whitelist substring (`index.ts:136-149`) → `169.254.169.254?instagram.com` passe.
- **IDOR `trend`/`sync`** : org_id pris du body au lieu du JWT (`index.ts:294-295`) + épuisement de la clé RapidAPI mutualisée par n'importe quel client.
- **Race sur le débit journalier 50 crédits** : invocations cron chevauchantes peuvent double-débiter (`index.ts:564-591`) → UPDATE conditionnel atomique.
- **`webSecurity:false`** dans Electron (`main.ts:1962`) + proxy IPC à URL arbitraire (`main.ts:621`) → `protocol.registerFileProtocol` + allowlist.
- **Watchdog** : purge les lignes `phone_power_watch` même quand le stop a échoué (bearer non résolu) → téléphone jamais éteint (`index.ts:357-369`).

---

## 3. Audit par domaine (détail)

### 3.1 Cœur posting — le moteur du produit

**Forces** : extinction en défense-en-profondeur (auto-stop 270 s + stop immédiat + `finally` + watchdog serveur), anti-rate-limit conscient (espacement, retries, `_materialCache` qui dédoublonne les uploads), transfert média à 3 étages (GeeLark natif → curl → base64) qui traite le vrai problème Android 13+, statuts « non confirmé » distincts des faux succès.

**Problèmes clés** (hors crédits déjà vus) :
- `shellExec` ne retry **que** « phone not ready », pas les throttles GeeLark → une story = des dizaines de requêtes ADB (`clearAndType` en émet ~200 à elle seule), ×5 téléphones en parallèle = le premier throttle tue le flux. **C'est la cause racine du « ça marche sur certains tels, pas d'autres ».**
- Posting à intervalle **incompatible** avec l'auto-stop : `buildScheduleTimes` peut étaler sur 1 h mais l'auto-stop coupe à 4 min 30 et le poll s'arrête à 6 min → tout post au-delà de ~4,5 min est tué avant exécution.
- TikTok ADB ne coupe jamais les téléphones en fin de post (seul le watchdog 5 min les rattrape).
- Détection popups login/vérification **morte** : le handler IPC `run-tesseract-ocr` n'existe pas dans `main.ts` (l'appel rejette silencieusement) — desktop comme web.
- Matching XML bilingue par égalité exacte sur des listes FR/EN codées en dur + taps en % d'écran en dernier recours → casse silencieusement à chaque refonte IG.
- Duplication : 2 clients GeeLark, 2 implémentations TikTok, 3 patterns de crédits, 3 chargements de téléphones, composant `PhoneRow` mémoïsé… jamais utilisé.

**Améliorations prioritaires** : rate-limiter centralisé (token bucket ~3 req/s partagé dans `geelarkFetch`), retry élargi aux throttles, `stopAt` aligné sur l'horizon d'intervalle, extraction d'une lib pure `geelark-ui-matching` testable, découpage de `geelark.ts` (3 369 l) en modules.

### 3.2 Serveur

**Forces** : claim atomique des posts (`status='pending'` → `running`), sentinelle anti-double-exécution des tâches récurrentes, anti-faux-timeout (re-interrogation GeeLark avant de marquer failed), webhook Stripe exemplaire (HMAC + timingSafeEqual + anti-rejeu).

**Problèmes clés** (hors sécurité déjà vue) :
- Edge function **monolithe** : cron + watchdog + stories + stats + rapports + notifs + endpoints interactifs dans un seul fichier de 1 143 lignes avec un seul budget temps → un chemin lent affame les autres. Le boot d'un téléphone (jusqu'à 270 s) dépasse le budget d'invocation (230 s) → stories serveur fragiles.
- `geelark.js` et `gx.js` sont **byte-identiques** → 2 slots Vercel gaspillés sur un plafond de 12 déjà atteint.
- Stripe : erreurs de provisioning renvoyées en HTTP 200 → Stripe ne rejoue jamais → **abonnement payé mais non provisionné, silencieusement perdu**. `listUsers()` non paginé → résolution email cassée au-delà de ~50 comptes.
- `/api/groq` et `/api/anthropic` sans `maxDuration` → timeout 10 s sur les transcriptions.
- Pattern « erreurs en HTTP 200 » généralisé → monitoring aveugle.
- Duplication : `geelark-story.ts` = port de 869 lignes du client ; `resolveBearer` copié-collé 5 fois.

### 3.3 Base de données

- **Le schéma de base n'existe dans aucune migration** — il vit dans `schema.sql` + 8 dumps `schema_*.sql` divergents ; `_RUN_ALL.sql`/`_PENDING_COMBINED.sql` confirment le déploiement copier-coller. `refund_user_credits` n'existe même pas dans le schéma canonique.
- Policies RLS **cassées** : `org_members` (table inexistante, le vrai nom est `organization_members`) référencé dans 2 migrations → policies jamais créées.
- Index manquants : `scheduled_posts(status, scheduled_at)`, `post_runs(org_id)`, `account_stats_history(org_id)`, `license_keys(user_id, is_active)`.
- jsonb non validés partout, dont `perm_overrides` (qui **accorde des droits**) et `tracking_config` (qui contient la clé RapidAPI en clair).
- `phone_power_watch` : tout membre peut **supprimer** les gardes anti-coût.

### 3.4 UX / Navigation

- **2 systèmes de gating incohérents** : la sidebar filtre par plan/superadmin mais n'appelle jamais `canSeeTab(role)` ; le Hub l'appelle. Un viewer voit Publication/Scheduler/Warmup dans la sidebar alors que la matrice les lui interdit.
- **Routes fantômes** : `montage`, `repurpose`, `stats`, `scaleia` ont un case dans App.tsx mais **aucun lien** nulle part. `Autocomment.tsx` (31 Ko) n'est importé nulle part. `Remix.tsx` = wrapper 8 lignes.
- **`posting` et `massposting` sont des alias du même écran** exposés comme 2 destinations différentes ; `TikTokPosting` fait doublon avec le sélecteur de plateforme.
- **i18n : 18 pages sur 33 n'importent pas `lib/i18n`** — BankHub affiche de l'anglais aux FR, les hubs affichent du français aux EN. Le dictionnaire (1 420 clés parfaitement synchronisées FR/EN) est pourtant sain.
- **Mobile amputé du cœur métier** : la barre basse (5 items fixes, sans filtrage de rôle) n'a **aucun accès à la Publication**.
- **Design system fantôme** : `design-system/MASTER.md` décrit un produit Smart-Home vert/Plus Jakarta Sans jamais suivi (la réalité : indigo/Inter). 3 740 styles inline, `#6366F1` en dur 173 fois, `theme.ts` squelettique.
- **Parcours d'entrée surchargé** : Splash 4,2 s → Auth → Onboarding → BetaPopup → AppTour 10 étapes passives. Le parcours critique (token → téléphones → premier post) n'est pas guidé.

### 3.5 Outils vidéo / Banque

- **2 mutex wasm indépendants sur le même singleton FFmpeg** (`withFfmpegLock` vs `wasmQueue`) → 2 exec concurrents possibles = corruption mémoire. `readVideoMetadata` et `detectBeatDrop` n'ont **aucun** verrou.
- wasm 31 Mo chargé au premier export sans indicateur ; vidéo entière en mémoire onglet (crash > ~300 Mo) ; mono-thread (pas de COOP/COEP).
- **~1 500 lignes dupliquées** : picker réécrit dans Mixer, download blob ×4, thumbnail ×3, save-to-bank ×5, icônes SVG copiées ×3, job cards réinventées partout.
- Banque : **aucun suivi de quota stockage** (Spoof ×20 copies upload sans compter), signed URLs valables **6 mois**, fichiers orphelins jamais balayés, `BankPicker` sans pagination (plafond 1 000), dossiers stockés comme lignes sentinelles dans `content_bank`.
- MetadataChanger : le diff avant/après est **vide en web** (`readVideoMetadataWeb` ne renvoie pas les tags).
- Community : 2 403 lignes bien faites mais périphériques au produit ; bucket public sans limite d'upload.

### 3.6 Téléphones / Stats / Performance / Electron

- **Aucune virtualisation** des listes (Phones, Stats, Reports) → mur DOM à 500+ téléphones. Point n°1 de scalabilité UI.
- **Tempête realtime** : Stats recharge toute la flotte à chaque UPDATE de `phones`… que le poller écrit toutes les 20 s.
- Historique stats plafonné à 8 000 lignes → courbes fausses au-delà de ~100 comptes ; leaderboard en O(n×m) (4 M itérations).
- Poller : 500 UPDATE unitaires toutes les 5 min au lieu d'un upsert groupé ; `fetchPhoneStatuses` re-pagine tout `/phone/list` (10 appels) pour lire des statuts.
- RapidAPI : 2-3 appels/compte/refresh sur une **clé agence unique partagée** entre toutes les orgs + boutons « Lancer maintenant » non throttlés. (Réponse à ta question : 1 M req/mois ÷ 120-180 appels/compte/mois = **~5 500-8 300 comptes** à 2 refresh/jour.)
- Bundle : `i18n.tsx` 118 Ko dans le chunk initial ; décor (flammes, splash, popups) dans le module racine.
- Electron : **pas d'auto-update** (les clients doivent réinstaller l'exe à chaque correctif !) ; `webSecurity:false` ; fenêtre IG cachée en `contextIsolation:false` ; dérive de parité desktop/web non testée (le bug tesseract le prouve).
- Legacy racine à purger : `app.py` (573 Ko), `main.py`, `templates/`, `views_history.json`, bat/Procfile/requirements (⚠️ avec rotation des secrets d'abord). `website/` = site marketing actif, à garder.

---

## 4. Opportunités API GeeLark — 19 endpoints utilisés sur 91

⚠️ **Avertissement préalable** : le spec OpenAPI public de GeeLark ne correspond pas 1:1 aux endpoints réels (les noms qui marchent sont ceux de `geelark.ts`). Toute nouvelle intégration doit être validée par un appel de test.

### Top features classées par valeur

| # | Feature | Endpoints | Valeur | Effort | Où l'intégrer |
|---|---|---|---|---|---|
| 1 | **Proxy Hub** — pool, check santé, réassignation en masse | `/proxy/*` (5), `/phone/network*` | 🔥 Haute | Moyen | Nouvel onglet dans Phones |
| 2 | **Mur d'écrans** — grille de screenshots live de toute la flotte | `/phone/screenshot`, `/screenshot/result` | 🔥 Haute | **Faible** | Phones + diagnostic Tasks |
| 3 | **Groupes & tags synchronisés** (fix : `bulkChangeGroup` n'écrit QUE dans Supabase aujourd'hui, jamais dans GeeLark) | `/group/*`, `/tag/*`, `/phone/group/move` | 🔥 Haute | Moyen | Phones + Settings |
| 4 | **Provisioning** — créer/cloner/supprimer des téléphones depuis l'app (cloner un « golden phone » réchauffé !) | `/phone/addNew`, `/clone`, `/delete`, `/brand/list` | 🔥 Haute | Élevé | Phones |
| 5 | **Gestion d'apps en masse** — figer/rollback la version IG/TikTok du parc, installer des APK | `/phone/app/*` (5) | 🔥 Haute | Moyen | Phones + Settings |
| 6 | **`/phone/status` batch** — remplace la re-pagination de `/phone/list` (gain quota API majeur) | `/phone/status` | Moyenne | **Faible** | Refactor geelark.ts |
| 7 | **Webhooks tâches** — fini le polling `/task/query` | `/webhook/set`, `/webhook/get` | Moyenne | Moyen | Infra déjà à moitié prête (`geelark-callback.js`) |
| 8 | **Retry/détail des tâches** — bouton « Relancer » sur un RPA échoué | `/rpa/task/retry`, `/detail`, `/batchQuery` | Moyenne | **Faible** | Tasks + MassPosting |
| 9 | **DM / Outreach** — messages privés IG/TikTok/FB automatisés | `/rpa/task/*PrivateMessage` | 🔥 Haute | Élevé | Nouvelle page |
| 10 | **Posting photo IG natif** (la page Photo « Bientôt » existe déjà !) | `/rpa/task/instagramReelsImage` | Moyenne | **Faible** | PublishHub → Photo |
| 11 | **Login natif RPA** — onboarder un compte sans ADB fragile | `/rpa/task/instagramLogin`, `tiktokLogin` | Moyenne | Moyen | Phones/Warmup |
| 12 | **Anti-détection device** — GPS cohérent avec le proxy, empreinte device | `/phone/gps/*`, `/deviceId/get`, `/netType/set` | Moyenne | Moyen | Spoof (extension device) |
| 13 | **Dashboard coûts GeeLark** — solde, plan, alerte épuisement | `/pay/*` (6) | Moyenne | **Faible** | Settings/Stats |
| 14 | **Expansion Facebook** — Reels FB, posts, Messenger | `/rpa/task/facebook*` (4) | Haute (V2) | Élevé | Nouvelle plateforme |
| 15 | Material Center persistant (remplace `_materialCache` volatil) | `/material/*` (8) | Faible | Moyen | Bank |

**Quick wins GeeLark** (à faire en premier) : #2 Mur d'écrans, #6 status batch, #8 retry, #10 photo IG, #13 dashboard coûts.

---

## 5. Quick wins transverses (impact fort / effort faible)

1. Verrouiller les RPC crédits (REVOKE + auth.uid) — **1 migration SQL**
2. Supprimer la policy de lecture des `credit_codes` — **1 migration SQL**
3. Brancher `run.settle()`/`markFailed()` dans MassPosting + StoryLink — arrête la sur-facturation
4. Roter la clé GeeLark/proxy + supprimer le legacy Python
5. Fusionner `geelark.js`/`gx.js` (libère un slot Vercel)
6. Corriger `org_members` → `organization_members` dans les 2 migrations cassées
7. Valider les URL par hostname exact dans `ig.js` + edge `?img=` + retirer `hostname.includes()`
8. `maxDuration: 60` sur `groq.js`/`anthropic.js`
9. Stripe : renvoyer 5xx sur erreur de provisioning (déclenche le retry Stripe)
10. Retirer l'appel OCR mort ou implémenter le handler
11. Supprimer `Autocomment.tsx`, wrapper `Remix.tsx`, câbler ou retirer les 4 routes fantômes
12. Debounce du realtime Stats + upsert groupé du poller
13. Index composites (4 index SQL)
14. Signed URLs : 6 mois → 24 h
15. Élargir le retry `shellExec` aux codes throttle GeeLark

---

## 6. Proposition de refonte — « ScaleFlow 2.0 »

### Vision
Passer d'une « collection d'outils » à une **plateforme d'agence** : le client décrit *quoi publier, où, quand* — ScaleFlow exécute côté serveur, de façon fiable, observable et facturée juste. Trois piliers : **Fiabilité** (exécution serveur), **Simplicité** (5 espaces au lieu de 33 pages), **Confiance** (sécurité + facturation exacte).

### 6.1 Architecture cible — l'exécution passe côté serveur

**Aujourd'hui** : le client (navigateur !) orchestre l'automation — upload, start phones, RPA, polling, stop. Si l'onglet se ferme, tout casse (d'où les 4 filets de sécurité empilés). Le bearer et les crédits vivent côté client (contournables).

**Cible** : une **file de jobs en DB** (`jobs` : id, org_id, type, payload, status, attempts, scheduled_at, locked_by/locked_at) :

```
Client (React) ──crée──▶ jobs (Postgres)
                            │
              Workers edge functions séparés (pas un monolithe) :
              worker-posting · worker-story · worker-warmup · watchdog · stats-sync
                            │        (claim atomique FOR UPDATE SKIP LOCKED)
                            ▼
                     GeeLark API (rate-limiter token-bucket centralisé, 200 req/min partagé)
                            │
              Supabase Realtime ──▶ le client AFFICHE la progression (il n'exécute plus)
```

Bénéfices en cascade :
- **Crédits enforce** : le worker débite atomiquement au claim du job, rembourse au fail — plus rien côté client.
- **Bearer jamais exposé** au navigateur (résolu par le worker, chiffré au repos).
- **PC éteint = tout marche** (aujourd'hui seules les stories plates tournent côté serveur).
- **Un seul code d'automation** (fin de la duplication geelark.ts ↔ geelark-story.ts).
- **Rate-limit GeeLark centralisé** au lieu de réglages à la main dans chaque flux.
- Le retry, l'observabilité (logs par job), le « Relancer » deviennent triviaux.

Le monolithe `run-scheduled-posts` est découpé en workers dédiés avec leurs budgets propres. Les endpoints interactifs (trend/detail/sync) deviennent une fonction à part, authentifiée par JWT.

### 6.2 Architecture d'information — de 33 pages à 5 espaces

```
🏠 Accueil        — santé de la flotte, activité, alertes, raccourcis
📱 Téléphones     — flotte (virtualisée) · Proxy Hub · Groupes/tags sync · Mur d'écrans · Warmup · Provisioning
📤 Publier        — UN flow unique : contenu → plateforme (IG Reels/Story/Photo, TikTok) → comptes → quand
                    (fusionne Posting/MassPosting/TikTokPosting/StoryLink/Scheduler/Tasks)
                    + Calendrier éditorial unifié (programmé + récurrent + historique)
🎬 Studio         — UN workspace, 3 familles d'opérations :
                    Uniciser (Spoof+Repurpose+Metadata) · Habiller (Mixer+Sous-titres+TextCopy) · Composer (Remix+Montage)
                    Picker/queue/export partagés — ~1 500 lignes dupliquées supprimées
📚 Bibliothèque   — médias + captions + Drive + quotas de stockage visibles
⚙️ Réglages       — connexions, org/rôles, facturation, notifications
```

Règles : **un seul système de gating** (`canSeeTab(role, plan)` partout — sidebar, hubs, mobile) ; le mobile a accès à Publier ; i18n obligatoire (lint qui refuse les chaînes hors `t()`) ; un seul référentiel de design (`theme.ts` étendu en vrais tokens, MASTER.md supprimé).

### 6.3 Features nouvelles à fort ROI (issues de l'API GeeLark)
1. **Mur d'écrans** (screenshots live) — l'opérateur voit sa flotte
2. **Proxy Hub** avec check santé — le pain point n°1 des fermes de comptes
3. **Santé des comptes** : score par compte (ban/shadowban/challenge + vues moyennes), alertes Telegram/Discord — les briques existent (stats, notify) mais dispersées
4. **Golden phone** : cloner un téléphone réchauffé en N exemplaires
5. **Gestionnaire de versions d'apps** : figer IG sur tout le parc (fini les casses d'automation post-MAJ)
6. **DM/Outreach** (phase 2) — nouveau flux de revenu

### 6.4 Plan de migration — progressif, sans big bang (l'app est en prod)

**Phase 0 — Sécuriser (1 semaine, sans refonte)**
Les 15 quick wins du §5. Aucun changement fonctionnel visible. *Livrable : les failles critiques fermées.*

**Phase 1 — Fondations serveur (2-3 semaines)**
Table `jobs` + worker-posting (Reels d'abord) derrière un feature flag par org. Le flow client actuel reste le fallback. Crédits débités par le worker. Rate-limiter centralisé. *Livrable : posting fiable PC éteint, facturation exacte.*

**Phase 2 — Consolidation (3-4 semaines)**
Story et warmup migrent sur la file. Fusion des pages de publication en un flow unique + calendrier. Studio unifié (picker/queue partagés). Suppression des routes fantômes/code mort. i18n complété. *Livrable : les 5 espaces.*

**Phase 3 — Scale & features (continu)**
Virtualisation des listes, agrégation serveur des stats, Proxy Hub, Mur d'écrans, groupes sync, provisioning, auto-update Electron, webhooks GeeLark. *Livrable : 500+ téléphones fluides + features différenciantes.*

### 6.5 Risques de la refonte
- **Migrer l'exécution côté serveur change les timings** (budgets edge) → garder le fallback client par feature flag jusqu'à parité prouvée.
- **Fusionner les pages déroute les clients existants** → redirections des anciennes routes + tooltips « ça a bougé ici ».
- **La dérive de schéma DB rend les migrations risquées** → commencer par générer une baseline propre (`supabase db diff`) avant toute nouvelle migration.
- **Ne pas tout faire en même temps** : la phase 0 est indépendante et doit partir immédiatement ; les phases 1-3 sont séquencées pour ne jamais casser la prod.

---

## 7. Ce qui est déjà bien (à préserver dans la refonte)

- Le triple filet anti-coût téléphones (client + watchdog serveur + beacon) — à conserver tel quel dans les workers
- Le webhook Stripe (exemplaire) — ne pas y toucher
- L'idempotence du scheduler (claim atomique, sentinelle) — à généraliser à la file de jobs
- `lib/storage.ts` (cache + dédup + limiteur) — le meilleur fichier du repo, à ériger en modèle
- Les pollers singletons et la collecte IG étalée anti-détection
- L'abstraction `electronAPI`/`webAPI` (portabilité desktop/web)
- Le dictionnaire i18n (1 420 clés parfaitement synchronisées) — il ne manque que son adoption
- La chaîne de fallback méta Instagram et le transfert média à 3 étages
