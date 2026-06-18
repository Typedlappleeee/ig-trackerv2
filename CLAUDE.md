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

## Sous-titres automatiques (Groq Whisper)

- Onglet accessible aux **owner et admin uniquement** (pas member/viewer).
- Transcription via Groq `whisper-large-v3-turbo` avec timestamps au niveau mot.
- En production web : proxy Vercel `/api/groq-transcription.js` pour contourner le blocage CORS de Groq sur les uploads multipart.
  - Vidéo depuis la banque : on envoie l'URL signée (le serveur fetch lui-même côté serveur).
  - Fichier local : encodé en base64 et envoyé au proxy (limite 25 MB).
- En Electron : IPC `groq-transcription` dans le main process (pas de CORS).
