// Documentation de l'API ScaleFlow Link v1 (servie par GET /api/v1/docs, sans clé).
const css = `body{margin:0;background:#0b0b0d;color:#e7e7ea;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 20px 80px}h1{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:19px;margin:38px 0 10px;padding-bottom:6px;border-bottom:1px solid #26262b}h3{font-size:15.5px;margin:24px 0 6px}
p,li{color:#c4c4cc}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#17171b;border:1px solid #26262b;border-radius:5px;padding:1px 5px;color:#f1f1f3}
pre{background:#121215;border:1px solid #26262b;border-radius:10px;padding:14px 16px;overflow-x:auto}pre code{background:none;border:0;padding:0}
.m{display:inline-block;min-width:46px;font:600 12px ui-monospace,monospace;padding:2px 7px;border-radius:5px;margin-right:6px;text-align:center}
.g{background:#12351f;color:#7ee2a0}.p{background:#3a2a0f;color:#f2c46b}.note{border-left:3px solid #c9a227;padding:2px 14px;margin:16px 0;color:#d9d3bf}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td,th{border:1px solid #26262b;padding:7px 10px;text-align:left;vertical-align:top}th{background:#15151a}`

export const DOCS_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API ScaleFlow Link v1</title><meta name="robots" content="noindex"><style>${css}</style></head><body><main>
<h1>API ScaleFlow Link <span style="color:#8b8b95;font-weight:400">v1</span></h1>
<p>Relie la banque de contenus ScaleFlow à un autre site : lister les dossiers, récupérer les vidéos, en envoyer.
Le même contrat sert dans les deux sens — ScaleFlow le parle, et ton site peut le parler aussi pour que ScaleFlow voie sa banque.</p>

<h2>1. Authentification</h2>
<p>Crée une clé dans ScaleFlow › <b>Paramètres › API &amp; site partenaire</b> (propriétaire / admin). Elle n'est affichée qu'une fois.
Envoie-la dans chaque requête :</p>
<pre><code>Authorization: Bearer sf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code></pre>
<p class="note">Appels <b>serveur à serveur</b> uniquement : ne mets jamais la clé dans le code d'une page web (pas de CORS).
Base : <code>https://scaleflow.company/api/v1</code>. Réponses JSON : <code>{"ok": true, …}</code> ou
<code>{"ok": false, "code": "…", "error": "…"}</code> avec le statut HTTP (401 clé invalide, 404, 409, 413 trop lourd, 422 requête invalide, 507 banque pleine).</p>

<h2>2. Routes</h2>
<h3><span class="m g">GET</span><code>/me</code></h3>
<p>Vérifie la clé. <code>{"ok":true,"api":"scaleflow-link","version":1,"space":{"type":"organization","id":"…"}}</code></p>

<h3><span class="m g">GET</span><code>/folders</code></h3>
<pre><code>{ "ok": true,
  "folders": [ { "name": "Lot octobre", "videos": 42, "images": 3, "updated_at": "2026-10-29T10:12:00Z" } ],
  "unfiled": { "videos": 5, "images": 0 } }</code></pre>

<h3><span class="m p">POST</span><code>/folders</code></h3>
<p>Corps <code>{"name": "Montage VA"}</code> → crée le dossier (sans effet s'il existe).</p>

<h3><span class="m g">GET</span><code>/files?folder=Lot%20octobre&amp;limit=50&amp;cursor=</code></h3>
<p>Médias d'un dossier, du plus récent au plus ancien (sans <code>folder</code> = médias hors dossier). <code>limit</code> ≤ 200.
Page suivante : repasse <code>cursor=next_cursor</code>. Les liens <code>url</code> / <code>thumbnail_url</code> sont valables 6 h.</p>
<pre><code>{ "ok": true, "folder": "Lot octobre",
  "files": [ { "id": "4f1c…", "title": "clip 12", "folder": "Lot octobre", "kind": "video",
               "url": "https://…/clip.mp4?token=…", "thumbnail_url": "https://…/thumb.jpg?token=…",
               "duration": 14, "created_at": "2026-10-29T10:12:00Z" } ],
  "next_cursor": "50" }</code></pre>

<h3><span class="m p">POST</span><code>/files</code> — envoyer un média depuis une URL</h3>
<pre><code>{ "url": "https://ton-stockage/clip.mp4?token=…", "folder": "Montage VA", "title": "clip 12",
  "thumbnail_url": "https://…/thumb.jpg" }</code></pre>
<p>ScaleFlow télécharge le fichier (https public, 300 Mo max) et le range dans le dossier. Réponse : <code>{"ok":true,"file":{…}}</code>.
Une URL signée Supabase/S3 valable au moins 1 h convient.</p>

<h3><span class="m p">POST</span><code>/uploads</code> puis <code>PUT</code> puis <span class="m p">POST</span><code>/files</code> — envoi direct d'un fichier</h3>
<pre><code>POST /uploads   {"filename": "clip.mp4", "content_type": "video/mp4"}
→ {"ok":true,"path":"videos/…/uuid.mp4","upload_url":"https://…","method":"PUT"}
PUT  upload_url  (corps = le fichier, en-tête Content-Type)
POST /files     {"path": "videos/…/uuid.mp4", "folder": "Montage VA", "title": "clip 12"}</code></pre>

<h2>3. Pour que ScaleFlow voie TA banque et t'envoie des fichiers</h2>
<p>Expose sur ton site les mêmes routes (même format de réponse), protégées par une clé que tu choisis
(<code>Authorization: Bearer &lt;ta-clé&gt;</code>). Dans ScaleFlow, on renseigne l'adresse de base (ex. <code>https://ton-site.com/api/scaleflow</code>) et cette clé.</p>
<table><tr><th>Route chez toi</th><th>Utilisée par ScaleFlow pour</th></tr>
<tr><td><code>GET /me</code></td><td>Tester la connexion (réponds <code>{"ok":true}</code>)</td></tr>
<tr><td><code>GET /folders</code></td><td>Afficher tes dossiers dans l'onglet « Banque partenaire »</td></tr>
<tr><td><code>GET /files?folder=…&amp;cursor=…</code></td><td>Afficher les médias d'un dossier (avec <code>url</code> téléchargeable et si possible <code>thumbnail_url</code>) et les importer dans ScaleFlow</td></tr>
<tr><td><code>POST /files</code> <code>{url, folder, title, thumbnail_url}</code></td><td>« Envoyer vers le partenaire » : télécharge <code>url</code> (lien ScaleFlow valable 24 h) et range-le dans <code>folder</code> (crée le dossier s'il n'existe pas)</td></tr></table>
<p class="note">ScaleFlow appelle ton site depuis son serveur : https obligatoire, adresse publique, réponse en moins de ~50 s par fichier.
Pour <code>POST /files</code>, télécharge le fichier puis réponds <code>{"ok":true}</code> (ou <code>{"ok":false,"error":"…"}</code>).</p>
</main></body></html>`
