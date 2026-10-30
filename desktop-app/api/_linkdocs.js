// Documentation de l'API ScaleFlow Link v1 (servie par GET /api/v1/docs, sans clé).
// Les backticks et ${ des exemples de code sont échappés (gabarit JS).
const css = `body{margin:0;background:#0b0b0d;color:#e7e7ea;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif}
main{max-width:900px;margin:0 auto;padding:40px 20px 80px}h1{font-size:30px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:20px;margin:42px 0 10px;padding-bottom:6px;border-bottom:1px solid #26262b}h3{font-size:15.5px;margin:24px 0 6px}
p,li{color:#c4c4cc}a{color:#c4bbfb}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#17171b;border:1px solid #26262b;border-radius:5px;padding:1px 5px;color:#f1f1f3}
pre{background:#121215;border:1px solid #26262b;border-radius:10px;padding:14px 16px;overflow-x:auto;line-height:1.5}pre code{background:none;border:0;padding:0;font-size:12.5px}
.m{display:inline-block;min-width:46px;font:600 12px ui-monospace,monospace;padding:2px 7px;border-radius:5px;margin-right:6px;text-align:center}
.g{background:#12351f;color:#7ee2a0}.p{background:#3a2a0f;color:#f2c46b}.note{border-left:3px solid #c9a227;padding:2px 14px;margin:16px 0;color:#d9d3bf}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;margin:10px 0}td,th{border:1px solid #26262b;padding:7px 10px;text-align:left;vertical-align:top}th{background:#15151a}
.flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0}.flow span{padding:8px 12px;border-radius:10px;background:#141418;border:1px solid #2a2a31;font-size:13.5px}.flow b{color:#8b8b95;font-weight:400}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;margin:14px 0 0}nav a{text-decoration:none}`

export const DOCS_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API ScaleFlow Link v1</title><meta name="robots" content="noindex"><style>${css}</style></head><body><main>
<h1>API ScaleFlow Link <span style="color:#8b8b95;font-weight:400">v1</span></h1>
<p>Relie la banque de contenus ScaleFlow à un autre site (ex. le site du staff) : chacun voit la banque de l'autre — séparément —,
récupère ses vidéos et lui en envoie, directement dans le dossier voulu.</p>
<div class="flow"><span>ScaleFlow — montage</span><b>⇄</b><span>API ScaleFlow Link</span><b>⇄</b><span>Site du staff — Drive VA / Posting VA</span></div>
<nav><a href="#toi">1. Mise en place</a><a href="#auth">2. Authentification</a><a href="#routes">3. Routes ScaleFlow</a><a href="#outils">3b. Outils (spoof, remix)</a><a href="#partenaire">4. Routes à ajouter sur ton site</a><a href="#code">5. Code d'exemple</a><a href="#limites">6. Erreurs &amp; limites</a></nav>

<h2 id="toi">1. Mise en place (propriétaire ScaleFlow, 5 min)</h2>
<ol>
<li>Supabase → SQL Editor : colle et exécute <code>supabase/migrations/20261029_scaleflow_link.sql</code> (une seule fois).</li>
<li>ScaleFlow → <b>Réglages › Intégrations › API ScaleFlow</b> → <b>Créer une clé</b> (ex. « Site staff »). Copie-la : elle n'est affichée qu'une fois.</li>
<li>Envoie à ton dev, par un canal privé : l'adresse <code>https://scaleflow.company/api/v1</code>, la clé, et ce document.</li>
<li>Ton dev ajoute sur son site les 4 routes de la <a href="#partenaire">section 4</a> — un seul fichier à copier depuis la <a href="#code">section 5</a> (version serveur Vercel, ou version Supabase si son site n'a pas de serveur) — et te donne : l'adresse de base (ex. <code>https://site-du-staff.com/api/scaleflow</code> ou <code>https://&lt;projet&gt;.supabase.co/functions/v1/scaleflow</code>) et SA clé.</li>
<li>ScaleFlow → <b>Site partenaire</b> : colle son adresse et sa clé → <b>Enregistrer</b> → <b>Tester</b>.</li>
<li>C'est relié : <b>Banque › « Banque Staff »</b> pour voir et importer ses vidéos ; sélectionne des médias › <b>« Envoyer vers Staff »</b> pour les copier dans le dossier de ton choix chez lui.</li>
<li><b>Montages envoyés directement</b> : dans le <b>Studio vidéo</b> et l'<b>Auto-contenu</b>, règle <b>« Envoyer direct vers : Staff › dossier »</b>. Chaque montage terminé part chez lui dès qu'il est prêt (une copie reste dans ta banque). Le journal affiche « 📤 envoyé chez Staff › dossier (1,8 s) ».</li>
</ol>
<p class="note">Clé perdue ou partagée par erreur : <b>Révoquer</b> dans les Réglages, puis en créer une autre. Un membre « lecteur » de l'organisation voit la banque du partenaire mais ne peut ni envoyer ni importer.</p>

<h2 id="auth">2. Authentification</h2>
<p>Chaque requête vers ScaleFlow porte la clé :</p>
<pre><code>Authorization: Bearer sf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code></pre>
<p class="note">Appels <b>serveur à serveur</b> uniquement : ne mets jamais la clé dans le code d'une page web (pas de CORS).
Base : <code>https://scaleflow.company/api/v1</code>. Réponses JSON : <code>{"ok": true, …}</code> ou
<code>{"ok": false, "code": "…", "error": "…"}</code> avec le statut HTTP.</p>

<h2 id="routes">3. Routes de l'API ScaleFlow</h2>
<h3><span class="m g">GET</span><code>/me</code></h3>
<p>Vérifie la clé. <code>{"ok":true,"api":"scaleflow-link","version":1,"space":{"type":"organization","id":"…"}}</code></p>
<h3><span class="m g">GET</span><code>/folders</code></h3>
<pre><code>{ "ok": true,
  "folders": [ { "name": "Lot octobre", "videos": 42, "images": 3, "updated_at": "2026-10-29T10:12:00Z" } ],
  "unfiled": { "videos": 5, "images": 0 } }</code></pre>
<h3><span class="m p">POST</span><code>/folders</code></h3>
<p>Corps <code>{"name": "Montage VA"}</code> → crée le dossier (sans effet s'il existe déjà).</p>
<h3><span class="m g">GET</span><code>/files?folder=Lot%20octobre&amp;limit=50&amp;cursor=</code></h3>
<p>Médias d'un dossier, du plus récent au plus ancien (sans <code>folder</code> = médias hors dossier ; <code>&amp;unused=1</code> = seulement les jamais utilisées). <code>limit</code> ≤ 200.
Page suivante : repasse <code>cursor=next_cursor</code>. Les liens <code>url</code> / <code>thumbnail_url</code> sont valables 6 h.</p>
<pre><code>{ "ok": true, "folder": "Lot octobre",
  "files": [ { "id": "4f1c…", "title": "clip 12", "folder": "Lot octobre", "kind": "video",
               "url": "https://…/clip.mp4?token=…", "thumbnail_url": "https://…/thumb.jpg?token=…",
               "duration": 14, "created_at": "2026-10-29T10:12:00Z", "used_count": 0 } ],
  "next_cursor": "50" }</code></pre>
<h3><span class="m p">POST</span><code>/files</code> — envoyer un média depuis une URL</h3>
<pre><code>{ "url": "https://ton-stockage/clip.mp4?token=…", "folder": "Montage VA", "title": "clip 12",
  "thumbnail_url": "https://…/thumb.jpg" }</code></pre>
<p>ScaleFlow télécharge le fichier (https public, 300 Mo max) et le range dans le dossier. Réponse : <code>{"ok":true,"file":{…}}</code>.
Une URL signée Supabase / S3 valable au moins 1 h convient. Non idempotent : n'envoie pas deux fois la même requête.</p>
<h3>Gérer un média : utilisée, déplacer, supprimer</h3>
<table><tr><th>Route</th><th>Effet</th></tr>
<tr><td><span class="m p">POST</span><code>/files/&lt;id&gt;/used</code></td><td>Marque la vidéo comme utilisée (+1 à <code>used_count</code>). Elle sort du filtre « Jamais publiées » de ScaleFlow et de <code>?unused=1</code>.</td></tr>
<tr><td><span class="m g">GET</span><code>/files?folder=…&amp;unused=1</code></td><td>Seulement les vidéos <b>jamais utilisées</b> du dossier (pratique pour ne jamais redonner la même).</td></tr>
<tr><td><span class="m p">PATCH</span><code>/files/&lt;id&gt;</code> <code>{"folder": "…", "title": "…"}</code></td><td>Déplace et/ou renomme la vidéo.</td></tr>
<tr><td><span class="m p">DELETE</span><code>/files/&lt;id&gt;</code></td><td>Met la vidéo à la <b>corbeille</b> de ScaleFlow : elle disparaît de l'API tout de suite, le propriétaire peut la restaurer pendant 7 jours, puis elle est effacée.</td></tr></table>
<p class="note">Chaque média renvoyé contient aussi <code>used_count</code> (0 = jamais utilisée). Une clé ne peut agir que sur les médias de son espace (404 sinon).</p>
<h3>Flux conseillé pour un CRM (un dossier par modèle)</h3>
<ol>
<li>Un dossier ScaleFlow par modèle (même nom des deux côtés, ou crée-le avec <code>POST /folders</code> quand tu ajoutes une modèle).</li>
<li>Récupère les nouvelles vidéos : <code>GET /files?folder=&lt;modèle&gt;&amp;unused=1</code> (toutes les quelques minutes), télécharge <code>url</code>.</li>
<li>Après publication par un VA : <code>POST /files/&lt;id&gt;/used</code> ; et si tu ne veux plus la garder chez ScaleFlow : <code>DELETE /files/&lt;id&gt;</code>.</li>
</ol>
<h3><span class="m p">POST</span><code>/uploads</code> puis <code>PUT</code> puis <span class="m p">POST</span><code>/files</code> — envoi direct d'un fichier</h3>
<pre><code>POST /uploads   {"filename": "clip.mp4", "content_type": "video/mp4"}
→ {"ok":true,"path":"videos/…/uuid.mp4","upload_url":"https://…","method":"PUT"}
PUT  upload_url  (corps = le fichier, en-tête Content-Type)
POST /files     {"path": "videos/…/uuid.mp4", "folder": "Montage VA", "title": "clip 12"}</code></pre>

<h3 id="outils"><span class="m p">POST</span><code>/tools/spoof</code> · <code>/tools/remix</code> — outils du Studio, faits par le serveur</h3>
<p>Les mêmes outils que dans l'app, avec les mêmes réglages, mais exécutés sur le serveur ScaleFlow. Le résultat est rangé dans la banque
(dossier <code>folder</code>) et renvoyé avec son lien.</p>
<table><tr><th>Outil</th><th>Pour</th><th>Ce qu'il fait</th></tr>
<tr><td><code>spoof</code></td><td>vidéo et photo</td><td>Rend le fichier unique : léger zoom/recadrage, métadonnées d'origine effacées (CapCut, titre…), appareil et GPS réécrits (vidéo : métadonnées mp4 ; photo : EXIF).</td></tr>
<tr><td><code>remix</code></td><td>vidéo</td><td>Vraies variations : recadrage, luminosité/contraste/saturation, teinte, micro-vitesse, micro-coupe ; miroir avec <code>"toggles": {"mirror": true}</code> (aussi <code>color</code>, <code>speed</code>, <code>crop</code>).</td></tr></table>
<pre><code>POST /api/v1/tools/spoof
{ "file_id": "4f1c…",              // ou "url": "https://…/clip.mp4"
  "intensity": "normal",           // subtle | normal | strong
  "device": "iphone15pro",         // appareil réécrit dans la vidéo (voir GET /tools)
  "gps": "paris",                  // none | france | usa | paris | … | {"lat": 48.85, "lon": 2.35}
  "folder": "Spoofées",            // dossier de ScaleFlow où ranger le résultat
  "title": "clip 12 v1",           // optionnel
  "seed": 1234 }                   // optionnel : même seed = mêmes réglages
→ { "ok": true, "tool": "spoof",
    "file": { "id": "…", "title": "clip 12 v1", "folder": "Spoofées", "kind": "video", "url": "https://…", "thumbnail_url": "https://…" },
    "settings": { "seed": 1234, "intensity": "normal", "device": "iphone15pro", "gps": "paris" }, "ms": 14200 }</code></pre>
<p><span class="m g">GET</span><code>/tools</code> renvoie la liste des outils, intensités, appareils (<code>iphone15pro</code>, <code>iphone14</code>, <code>s23</code>, <code>pixel8</code>…) et localisations disponibles.</p>
<p class="note"><b>1 variante par appel</b> : pour en faire plusieurs, lance les appels <b>en parallèle</b> (chacun tourne sur sa propre machine) — 5 variantes prennent le temps d'une seule.
Durée : ≈ 10 à 20 s pour un Reel de 30 s en 1080p. Limites : fichier source ≤ 150 Mo, traitement ≤ ~50 s (vidéos jusqu'à ~2 min) ; au-delà : erreur <code>504 timeout</code>.</p>
<pre><code>// 5 variantes uniques d'une même vidéo = 5 appels EN MÊME TEMPS (≈ durée d'un seul)
const SF = 'https://scaleflow.company/api/v1'
const H = { Authorization: \`Bearer \${process.env.SCALEFLOW_KEY}\`, 'Content-Type': 'application/json' }
const results = await Promise.all([1, 2, 3, 4, 5].map(i =&gt;
  fetch(\`\${SF}/tools/spoof\`, { method: 'POST', headers: H,
    body: JSON.stringify({ file_id: videoId, device: 'iphone15pro', gps: 'france', folder: 'Variantes', title: \`clip v\${i}\` }) })
    .then(r =&gt; r.json())))
// results[i].file.url → lien de téléchargement de chaque variante (6 h)</code></pre>

<h2 id="partenaire">4. Routes à ajouter sur ton site (pour que ScaleFlow voie ta banque)</h2>
<p>Expose les mêmes routes, au même format, protégées par une clé que tu choisis (<code>Authorization: Bearer &lt;ta-clé&gt;</code>).
Dans ScaleFlow, le propriétaire renseigne ton adresse de base et cette clé.</p>
<table><tr><th>Route chez toi</th><th>Utilisée par ScaleFlow pour</th></tr>
<tr><td><code>GET /me</code></td><td>Tester la connexion — réponds <code>{"ok":true}</code></td></tr>
<tr><td><code>GET /folders</code></td><td>Afficher tes dossiers dans « Banque Staff »</td></tr>
<tr><td><code>GET /files?folder=…&amp;cursor=…</code></td><td>Afficher les médias d'un dossier (<code>url</code> téléchargeable, <code>thumbnail_url</code> si possible) et les importer dans ScaleFlow</td></tr>
<tr><td><code>POST /files</code> <code>{url, folder, title, thumbnail_url}</code></td><td>« Envoyer vers Staff » : télécharge <code>url</code> (lien ScaleFlow valable 24 h) et range-le dans <code>folder</code> (crée le dossier s'il n'existe pas)</td></tr></table>
<p class="note">ScaleFlow appelle ton site depuis son serveur : https obligatoire, adresse publique, réponse en moins de ~50 s par fichier.
Les envois partent <b>en parallèle</b> (jusqu'à 12 fichiers en même temps) : ton site doit accepter plusieurs requêtes simultanées.</p>
<h3>Pour un envoi en ~2 secondes</h3>
<ul>
<li>Héberge ton site dans la même région que ton stockage (ex. Supabase + Vercel en Europe) : la copie serveur à serveur d'une vidéo de 30 Mo prend alors 1 à 2 s.</li>
<li>Transfère en flux (<i>streaming</i>) : envoie le corps de la réponse <code>fetch(url)</code> directement à ton stockage au lieu de tout charger en mémoire.</li>
<li>Option « instantané » : réponds <code>{"ok":true}</code> tout de suite et termine le téléchargement en arrière-plan (<code>waitUntil</code> de <code>@vercel/functions</code>). ScaleFlow affiche alors « envoyé » en moins d'une seconde ; prévois un journal d'erreurs de ton côté.</li>
</ul>

<h2 id="code">5. Code d'exemple</h2>
<h3>Les 4 routes, côté site du staff (Vercel + Supabase)</h3>
<p>À adapter : nom de ta table, de ton bucket et de tes colonnes. Variables d'environnement : <code>SUPABASE_URL</code>,
<code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>SCALEFLOW_LINK_KEY</code> (la clé que tu colles dans ScaleFlow).</p>
<pre><code>// api/scaleflow/[...route].js — fonction Vercel (Node 18+, ESM) sur le site du staff.
// Adresse à mettre dans ScaleFlow : https://site-du-staff.com/api/scaleflow
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = process.env.SCALEFLOW_LINK_KEY      // clé que TU inventes et colles dans ScaleFlow
const TABLE = 'bank', BUCKET = 'videos'          // ← adapte aux noms de ta base
// Colonnes supposées dans TABLE : id, title, folder, path (chemin dans BUCKET), created_at

export default async function handler(req, res) {
  if (!KEY || req.headers.authorization !== \`Bearer \${KEY}\`) return res.status(401).json({ ok: false, error: 'clé invalide' })
  const route = [].concat(req.query.route || []).join('/')
  try {
    // 1) Test de connexion
    if (req.method === 'GET' &amp;&amp; route === 'me') return res.json({ ok: true })

    // 2) Dossiers + nombre de vidéos
    if (req.method === 'GET' &amp;&amp; route === 'folders') {
      const { data, error } = await db.from(TABLE).select('folder')
      if (error) throw error
      const count = {}
      let unfiled = 0
      for (const r of data) r.folder ? (count[r.folder] = (count[r.folder] || 0) + 1) : unfiled++
      return res.json({ ok: true, folders: Object.entries(count).map(([name, videos]) =&gt; ({ name, videos })), unfiled: { videos: unfiled } })
    }

    // 3) Médias d'un dossier (sans ?folder= : médias hors dossier), 50 par page
    if (req.method === 'GET' &amp;&amp; route === 'files') {
      const off = Number(req.query.cursor || 0), lim = Math.min(Number(req.query.limit || 50), 200)
      let q = db.from(TABLE).select('id, title, folder, path, created_at').order('created_at', { ascending: false }).range(off, off + lim)
      q = req.query.folder ? q.eq('folder', req.query.folder) : q.is('folder', null)
      const { data, error } = await q
      if (error) throw error
      const page = data.slice(0, lim)
      const files = await Promise.all(page.map(async r =&gt; {
        const { data: s } = await db.storage.from(BUCKET).createSignedUrl(r.path, 6 * 3600)
        return { id: r.id, title: r.title, folder: r.folder, kind: /\\.(jpe?g|png|webp)$/i.test(r.path) ? 'image' : 'video',
                 url: s?.signedUrl ?? null, thumbnail_url: null, created_at: r.created_at }
      }))
      return res.json({ ok: true, files, next_cursor: data.length &gt; lim ? String(off + lim) : null })
    }

    // 4) Réception d'un envoi de ScaleFlow : télécharger l'URL et ranger dans le dossier
    if (req.method === 'POST' &amp;&amp; route === 'files') {
      const { url, folder, title } = req.body || {}
      // N'accepter que les liens de stockage Supabase (évite qu'on te fasse télécharger n'importe quoi)
      if (!/^https:\\/\\/[a-z0-9-]+\\.supabase\\.co\\//.test(String(url))) throw new Error('URL refusée')
      const r = await fetch(url)
      if (!r.ok) throw new Error(\`téléchargement échoué (\${r.status})\`)
      const type = r.headers.get('content-type') || 'video/mp4'
      const ext = type.startsWith('image/') ? 'jpg' : 'mp4'
      const path = \`scaleflow/\${crypto.randomUUID()}.\${ext}\`
      const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await r.arrayBuffer()), { contentType: type })
      if (up.error) throw up.error
      const ins = await db.from(TABLE).insert({ title: title || 'ScaleFlow', folder: folder || null, path })
      if (ins.error) throw ins.error
      return res.json({ ok: true })
    }
    return res.status(404).json({ ok: false, error: 'route inconnue' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}</code></pre>
<h3>Ton site n'a pas de serveur (juste Supabase) ? Version Edge Function, à coller dans Supabase</h3>
<p>Même chose, sans Vercel ni serveur : une fonction déployée directement depuis le tableau de bord Supabase de ton site
(sites faits avec Lovable, Bolt, etc.). Les variables <code>SUPABASE_URL</code> et <code>SUPABASE_SERVICE_ROLE_KEY</code> sont fournies automatiquement.</p>
<pre><code>// Edge Function « scaleflow » — dans le projet Supabase du site staff (aucun serveur nécessaire).
// 1. Supabase → Edge Functions → Deploy a new function → nom : scaleflow → colle ce code → Deploy.
// 2. Dans les réglages de la fonction : DÉSACTIVE « Enforce JWT verification »
//    (ScaleFlow envoie ta clé à toi, pas un jeton de connexion Supabase).
// 3. Edge Functions → Secrets : ajoute SCALEFLOW_LINK_KEY = une clé longue que tu inventes.
// 4. Dans ScaleFlow (Site partenaire) : adresse https://&lt;ton-projet&gt;.supabase.co/functions/v1/scaleflow + cette clé.
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const KEY = Deno.env.get('SCALEFLOW_LINK_KEY')
const TABLE = 'bank', BUCKET = 'videos'          // ← adapte aux noms de ta base
// Colonnes supposées dans TABLE : id, title, folder, path (chemin dans BUCKET), created_at
const json = (body: unknown, status = 200) =&gt; new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async req =&gt; {
  if (!KEY || req.headers.get('authorization') !== \`Bearer \${KEY}\`) return json({ ok: false, error: 'clé invalide' }, 401)
  const u = new URL(req.url)
  const route = u.pathname.replace(/^.*\\/scaleflow\\/?/, '')
  try {
    if (req.method === 'GET' &amp;&amp; route === 'me') return json({ ok: true })

    if (req.method === 'GET' &amp;&amp; route === 'folders') {
      const { data, error } = await db.from(TABLE).select('folder')
      if (error) throw error
      const count: Record&lt;string, number&gt; = {}
      let unfiled = 0
      for (const r of data) r.folder ? (count[r.folder] = (count[r.folder] || 0) + 1) : unfiled++
      return json({ ok: true, folders: Object.entries(count).map(([name, videos]) =&gt; ({ name, videos })), unfiled: { videos: unfiled } })
    }

    if (req.method === 'GET' &amp;&amp; route === 'files') {
      const off = Number(u.searchParams.get('cursor') || 0), lim = Math.min(Number(u.searchParams.get('limit') || 50), 200)
      let q = db.from(TABLE).select('id, title, folder, path, created_at').order('created_at', { ascending: false }).range(off, off + lim)
      const folder = u.searchParams.get('folder')
      q = folder ? q.eq('folder', folder) : q.is('folder', null)
      const { data, error } = await q
      if (error) throw error
      const page = data.slice(0, lim)
      const files = await Promise.all(page.map(async r =&gt; {
        const { data: s } = await db.storage.from(BUCKET).createSignedUrl(r.path, 6 * 3600)
        return { id: r.id, title: r.title, folder: r.folder, kind: /\\.(jpe?g|png|webp)$/i.test(r.path) ? 'image' : 'video',
                 url: s?.signedUrl ?? null, thumbnail_url: null, created_at: r.created_at }
      }))
      return json({ ok: true, files, next_cursor: data.length &gt; lim ? String(off + lim) : null })
    }

    if (req.method === 'POST' &amp;&amp; route === 'files') {
      const { url, folder, title } = await req.json()
      if (!/^https:\\/\\/[a-z0-9-]+\\.supabase\\.co\\//.test(String(url))) throw new Error('URL refusée')
      const r = await fetch(url)
      if (!r.ok) throw new Error(\`téléchargement échoué (\${r.status})\`)
      const type = r.headers.get('content-type') || 'video/mp4'
      const path = \`scaleflow/\${crypto.randomUUID()}.\${type.startsWith('image/') ? 'jpg' : 'mp4'}\`
      const up = await db.storage.from(BUCKET).upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: type })
      if (up.error) throw up.error
      const ins = await db.from(TABLE).insert({ title: title || 'ScaleFlow', folder: folder || null, path })
      if (ins.error) throw ins.error
      return json({ ok: true })
    }
    return json({ ok: false, error: 'route inconnue' }, 404)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500)
  }
})</code></pre>
<h3>Utiliser l'API ScaleFlow depuis ton serveur</h3>
<pre><code>// Sur le serveur du site staff : utiliser l'API ScaleFlow (clé donnée par le propriétaire ScaleFlow)
const SF = 'https://scaleflow.company/api/v1'
const H = { Authorization: \`Bearer \${process.env.SCALEFLOW_KEY}\` }

// Voir sa banque : dossiers, puis les vidéos d'un dossier (liens de téléchargement valables 6 h)
const { folders } = await (await fetch(\`\${SF}/folders\`, { headers: H })).json()
const { files, next_cursor } = await (await fetch(\`\${SF}/files?folder=\${encodeURIComponent('Montage')}\`, { headers: H })).json()

// Lui envoyer une vidéo dans SON dossier « Retours VA » (depuis un lien signé de ton stockage)
const { data: s } = await db.storage.from('videos').createSignedUrl(path, 3600)
await fetch(\`\${SF}/files\`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: s.signedUrl, folder: 'Retours VA', title: 'clip 12' }),
})</code></pre>

<h2 id="limites">6. Erreurs &amp; limites</h2>
<table><tr><th>Statut</th><th>code</th><th>Quand</th></tr>
<tr><td>401</td><td><code>unauthorized</code></td><td>Clé absente, fausse ou révoquée</td></tr>
<tr><td>404</td><td><code>not_found</code>, <code>file_not_found</code></td><td>Route inconnue, ou média absent de ta banque (déjà supprimé, autre espace)</td></tr>
<tr><td>409</td><td><code>not_uploaded</code></td><td><code>POST /files</code> avec un <code>path</code> pas encore envoyé (fais le PUT d'abord)</td></tr>
<tr><td>413</td><td><code>too_large</code></td><td>Fichier de plus de 300 Mo</td></tr>
<tr><td>422</td><td><code>invalid_url</code>, <code>invalid_file</code>, <code>invalid_path</code>, <code>invalid_device</code>, <code>invalid_gps</code>…</td><td>Requête invalide (URL non https ou interne, type de fichier, chemin)</td></tr>
<tr><td>502</td><td><code>fetch_failed</code></td><td>Le téléchargement de l'URL fournie a échoué</td></tr>
<tr><td>504</td><td><code>timeout</code></td><td>Outil : vidéo trop longue pour un traitement serveur (~50 s max)</td></tr>
<tr><td>507</td><td><code>bank_full</code></td><td>Banque ScaleFlow pleine (limite de l'abonnement)</td></tr></table>
<ul>
<li>Types acceptés : vidéos (mp4, mov, m4v, webm, mkv, avi, 3gp) et images (jpg, png, webp, heic, gif).</li>
<li>Liens de téléchargement : 6 h (lecture via l'API), 24 h (envois vers ton site).</li>
<li>La clé ne donne accès qu'à la banque de l'espace qui l'a créée (organisation ou compte perso), jamais aux autres.</li>
</ul>
</main></body></html>`
