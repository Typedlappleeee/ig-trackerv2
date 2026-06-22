// Supabase Edge Function — synchronise les dossiers Google Drive vers la banque.
//
// Crée automatiquement la structure de dossiers Drive dans la banque :
// - Un dossier racine au nom de la connexion (ex. "Mon Drive Marketing")
// - Les sous-dossiers Drive apparaissent comme "Mon Drive Marketing / NomSousDossier"
// - Les vidéos sont rangées dans le bon dossier de banque selon leur emplacement dans Drive

import { createClient } from 'npm:@supabase/supabase-js@2'

const FN_BUDGET_MS  = 230_000
const MAX_FILES_PER_RUN = 6
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

interface DriveFile {
  id:       string
  name:     string
  mimeType: string
  parentId: string   // ID du dossier Drive parent
}

// ── Auth compte de service JWT RS256 ────────────────────────────────────────
function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function getDriveAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim  = b64url(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }))
  const unsigned = `${header}.${claim}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${b64url(sig)}`
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Auth Drive échouée : ${JSON.stringify(json).slice(0, 200)}`)
  return json.access_token as string
}

// ── Explore la structure du dossier Drive ────────────────────────────────────
// Retourne :
//   videos     — fichiers vidéo avec leur parentId
//   folderNames — map folderId → nom Drive (sauf rootFolderId dont le nom = conn.name)
async function listDriveStructure(
  token: string,
  rootFolderId: string,
  recursive: boolean,
): Promise<{ videos: DriveFile[]; folderNames: Map<string, string> }> {
  const videos: DriveFile[] = []
  const folderNames = new Map<string, string>()
  folderNames.set(rootFolderId, '')   // '' = racine → bank folder = conn.name

  const queue   = [rootFolderId]
  const visited = new Set<string>()

  while (queue.length) {
    const fid = queue.shift()!
    if (visited.has(fid)) continue
    visited.add(fid)

    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q:                         `'${fid}' in parents and trashed = false`,
        fields:                    'nextPageToken, files(id, name, mimeType)',
        pageSize:                  '1000',
        supportsAllDrives:         'true',
        includeItemsFromAllDrives: 'true',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res  = await fetch(`${DRIVE_API}/files?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (json.error) throw new Error(`Drive list : ${json.error.message}`)

      for (const f of (json.files ?? []) as Array<{ id: string; name: string; mimeType: string }>) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          folderNames.set(f.id, f.name)
          if (recursive) queue.push(f.id)
        } else if (f.mimeType?.startsWith('video/')) {
          videos.push({ id: f.id, name: f.name, mimeType: f.mimeType, parentId: fid })
        }
      }
      pageToken = json.nextPageToken
    } while (pageToken)
  }
  return { videos, folderNames }
}

// Nom du dossier de banque pour un fichier Drive donné.
// Racine  → conn.name (ex. "Mon Drive Marketing")
// Sous-d. → "Mon Drive Marketing / Reels"
function bankFolderName(connName: string, parentId: string, rootId: string, folderNames: Map<string, string>): string {
  const driveName = folderNames.get(parentId) ?? ''
  return driveName === '' ? connName : `${connName} / ${driveName}`
}

async function downloadDriveFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download ${fileId} : HTTP ${res.status}`)
  return await res.arrayBuffer()
}

function extFromName(name: string): string {
  const m = name.match(/\.([a-z0-9]{2,5})$/i)
  return m ? m[1].toLowerCase() : 'mp4'
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? ''
  const saJsonRaw   = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? ''

  const gotSecret = req.headers.get('x-cron-secret') ?? ''
  const gotAuth   = req.headers.get('authorization') ?? ''
  let authorized   = (cronSecret && gotSecret === cronSecret) || gotAuth.includes(serviceKey)
  let filterUserId: string | null = null

  if (!authorized && gotAuth.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (anonKey) {
      try {
        const tmp = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: gotAuth } } })
        const { data: { user } } = await tmp.auth.getUser()
        if (user?.id) { authorized = true; filterUserId = user.id }
      } catch { /* ignore */ }
    }
  }
  if (!authorized) return new Response('Unauthorized', { status: 401, headers: CORS })

  if (!saJsonRaw) {
    return new Response(JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON manquant' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let clientEmail = '', privateKey = ''
  try {
    const sa = JSON.parse(saJsonRaw)
    clientEmail = sa.client_email
    privateKey  = sa.private_key
  } catch {
    return new Response(JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON invalide (JSON)' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const db       = createClient(supabaseUrl, serviceKey)
  const fnStart  = Date.now()
  const summary: Record<string, unknown> = { connections: 0, imported: 0, folders_created: 0, errors: [] as string[] }

  let q = db.from('drive_connections').select('*').eq('status', 'active')
  if (filterUserId) q = q.eq('user_id', filterUserId)
  const { data: conns, error: connErr } = await q
  if (connErr) {
    return new Response(JSON.stringify({ error: connErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let token = ''
  try {
    token = await getDriveAccessToken(clientEmail, privateKey)
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  let importedTotal = 0

  for (const conn of (conns ?? [])) {
    if (Date.now() - fnStart > FN_BUDGET_MS || importedTotal >= MAX_FILES_PER_RUN) break
    summary.connections = (summary.connections as number) + 1

    try {
      // ── 1. Explorer la structure Drive ──────────────────────────────────
      const { videos, folderNames } = await listDriveStructure(token, conn.folder_id, conn.recursive !== false)

      // ── 2. Créer les dossiers de banque (sentinel rows) ─────────────────
      // Collecte tous les dossiers de banque nécessaires pour cette connexion
      const neededFolders = new Set<string>()
      neededFolders.add(conn.name)  // toujours le dossier racine
      for (const [fid, fname] of folderNames) {
        if (fid === conn.folder_id) continue  // racine déjà ajoutée
        neededFolders.add(`${conn.name} / ${fname}`)
      }

      // Dossiers sentinel déjà existants pour cette connexion
      const { data: existingSentinels } = await db.from('content_bank')
        .select('folder')
        .eq('drive_connection_id', conn.id)
        .eq('notes', '__sf_drive_folder__')
      const existingFolderSet = new Set((existingSentinels ?? []).map((r: { folder: string }) => r.folder))

      let foldersCreated = 0
      for (const folderName of neededFolders) {
        if (existingFolderSet.has(folderName)) continue
        await db.from('content_bank').insert({
          user_id:             conn.user_id,
          org_id:              conn.org_id,
          title:               folderName,
          folder:              folderName,
          notes:               '__sf_drive_folder__',
          file_url:            null,
          storage_path:        null,
          thumbnail_path:      null,
          tags:                [],
          source:              'drive',
          drive_connection_id: conn.id,
        }).then(() => { foldersCreated++ }).catch(() => {})
      }
      summary.folders_created = (summary.folders_created as number) + foldersCreated

      // ── 3. Importer les vidéos manquantes ────────────────────────────────
      const { data: existing } = await db.from('content_bank')
        .select('drive_file_id')
        .eq('drive_connection_id', conn.id)
        .not('drive_file_id', 'is', null)
      const have    = new Set((existing ?? []).map((r: { drive_file_id: string }) => r.drive_file_id))
      const pending = videos.filter(f => !have.has(f.id))

      const scope = conn.org_id ? `orgs/${conn.org_id}` : `users/${conn.user_id}`

      for (const file of pending) {
        if (Date.now() - fnStart > FN_BUDGET_MS || importedTotal >= MAX_FILES_PER_RUN) break

        const folder      = bankFolderName(conn.name, file.parentId, conn.folder_id, folderNames)
        const ext         = extFromName(file.name)
        const uuid        = crypto.randomUUID()
        const storagePath = `videos/${scope}/${uuid}.${ext}`

        const bytes = await downloadDriveFile(token, file.id)
        const { error: upErr } = await db.storage.from('content').upload(storagePath, bytes, {
          contentType: file.mimeType || 'video/mp4',
          upsert: false,
        })
        if (upErr) throw new Error(`Upload ${file.name} : ${upErr.message}`)

        const { error: insErr } = await db.from('content_bank').insert({
          user_id:             conn.user_id,
          org_id:              conn.org_id,
          title:               file.name,
          storage_path:        storagePath,
          thumbnail_path:      null,
          file_url:            null,
          folder,
          tags:                [],
          notes:               '',
          source:              'drive',
          drive_file_id:       file.id,
          drive_connection_id: conn.id,
        })
        if (insErr) {
          await db.storage.from('content').remove([storagePath]).catch(() => {})
          throw new Error(`Insert ${file.name} : ${insErr.message}`)
        }
        importedTotal++
      }

      // ── 4. Mettre à jour la connexion ────────────────────────────────────
      await db.from('drive_connections').update({
        last_sync_at: new Date().toISOString(),
        last_error:   null,
        status:       'active',
        synced_count: (conn.synced_count ?? 0) + importedTotal,
        updated_at:   new Date().toISOString(),
      }).eq('id', conn.id)

    } catch (e) {
      const msg = String(e).slice(0, 400)
      ;(summary.errors as string[]).push(`${conn.name}: ${msg}`)
      await db.from('drive_connections').update({
        last_sync_at: new Date().toISOString(),
        last_error:   msg,
        status:       'error',
        updated_at:   new Date().toISOString(),
      }).eq('id', conn.id)
    }
  }

  summary.imported = importedTotal
  return new Response(JSON.stringify(summary), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
