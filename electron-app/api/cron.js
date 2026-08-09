// Déclencheur serveur du scheduler (cron Vercel).
// Appelé toutes les minutes par Vercel (voir "crons" dans vercel.json) → POST vers
// l'edge function Supabase run-scheduled-posts. Ça fait tourner, PC ÉTEINT / app
// fermée : (1) l'exécution des posts programmés (dont proxy rotatif), (2) le
// WATCHDOG qui éteint tout téléphone dont l'heure-limite est dépassée.
//
// Avant, ce déclencheur reposait sur un pg_cron Supabase à configurer À LA MAIN
// (placeholders <PROJECT-REF>/<CRON_SECRET>). S'il n'était pas activé, plus aucun
// watchdog → des téléphones restaient allumés des heures (facturation GeeLark).
// Ici c'est livré AVEC le code : dès que le web est déployé sur Vercel, ça tourne.
//
// Auth vers l'edge function : on envoie la clé service_role (déjà en env sur Vercel
// pour repurpose/geelark-upload) — l'edge function l'accepte. CRON_SECRET est
// optionnel (envoyé en plus s'il existe).

module.exports.config = { maxDuration: 60 }

module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const cronSecret = process.env.CRON_SECRET || ''
  if (!url || (!serviceKey && !cronSecret)) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou CRON_SECRET) requis en variables d\'env Vercel' })
  }
  const headers = { 'Content-Type': 'application/json' }
  if (cronSecret) headers['x-cron-secret'] = cronSecret
  if (serviceKey) headers['Authorization'] = `Bearer ${serviceKey}`
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/functions/v1/run-scheduled-posts`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(55000),
    })
    const body = (await r.text().catch(() => '')).slice(0, 800)
    // 200 quoi qu'il arrive (le cron Vercel ne doit pas "échouer" bruyamment).
    return res.status(200).json({ ok: r.ok, status: r.status, body })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}
