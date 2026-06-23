# Notes — Règles métier importantes

## Système de crédits

### Coûts des actions

| Action | Coût |
|--------|------|
| Posting (1 téléphone) | 1 crédit |
| Mass Posting (par téléphone) | 2 crédits |
| Story / StoryLink (par téléphone) | 1 crédit |
| Remix (par vidéo) | 0.5 crédit |
| CloneVid (par vidéo) | 0.5 crédit |
| **Tâche automatique — quotidien** | **50 crédits/jour** |
| **Tâche automatique — par exécution** | **2 crédits × nb téléphones** |

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
