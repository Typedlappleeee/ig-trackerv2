// DuoPlus (téléphones virtuels Android) — réservé à l'accès Blowsome.
//   POST /api/duoplus { a, org_id, … }   Authorization: Bearer <session Supabase>
//     status                 → { configured } : une clé est-elle enregistrée pour l'espace ?
//     setkey { key }         → enregistre la clé (propriétaire / admin de l'espace), vérifiée par un appel DuoPlus
//     delkey                 → retire la clé (propriétaire / admin)
//     phones                 → tous les téléphones de la clé (champs utiles seulement, jamais l'adresse/mot de passe ADB)
//     power { ids, on }      → allume (on = true) ou éteint des téléphones
//     command { id, command } → commande ADB (shell) sur UN téléphone, 10 s max côté DuoPlus (propriétaire / admin)
// La clé reste en base (sf_duoplus_keys, service-role seulement) : jamais renvoyée au navigateur.
// SQL : supabase/migrations/20261115_duoplus.sql. API : https://help.duoplus.net/docs/Introduction
import { db, roleIn, bodyOf } from './_bank.js'

const BASE = (process.env.DUOPLUS_API_BASE || 'https://openapi.duoplus.net').replace(/\/$/, '')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHONE_ID = /^[A-Za-z0-9_-]{1,40}$/
const SUPER = ['tintin.aunea@gmail.com']

export const chunk = (l, n) => { const out = []; for (let i = 0; i < l.length; i += n) out.push(l.slice(i, i + n)); return out }
// Champs renvoyés au navigateur : pas d'adresse ni de mot de passe ADB.
export const slimPhone = p => ({
  id: String(p.id), name: String(p.name ?? ''), status: Number(p.status), os: String(p.os ?? ''), area: String(p.area ?? ''),
  region: String(p.region ?? ''), ip: String(p.ip ?? ''), remark: String(p.remark ?? ''), adb: Number(p.adb_status) === 1,
  expires: Number(p.expired_at) || null, group: Array.isArray(p.group) ? p.group.map(g => String(g?.name ?? g ?? '')).filter(Boolean) : [],
})

async function duo(key, path, body) {
  let r
  try {
    r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'DuoPlus-API-Key': key, 'Content-Type': 'application/json', Lang: 'en' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(25_000) })
  } catch (e) { throw new Error(`DuoPlus injoignable (${e?.name === 'TimeoutError' ? 'délai dépassé' : e?.message || e})`) }
  let j = null
  try { j = await r.json() } catch { /* pas du JSON */ }
  if (!r.ok || !j) throw new Error(`DuoPlus : HTTP ${r.status}`)
  if (Number(j.code) !== 200) throw new Error(`DuoPlus : ${j.message || 'erreur'} (code ${j.code})`)
  return j.data
}

// Accès Blowsome : super-admin, clé perso Blowsome active, ou agence dont le propriétaire a l'add-on.
async function hasBlowsome(s, user, orgId) {
  if (SUPER.includes(String(user.email || '').toLowerCase())) return true
  const { data: prof } = await s.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle()
  if (prof?.is_super_admin) return true
  const now = new Date().toISOString()
  const owners = [user.id]
  if (orgId) { const { data: o } = await s.from('organizations').select('owner_id').eq('id', orgId).maybeSingle(); if (o?.owner_id) owners.push(o.owner_id) }
  const { data: keys } = await s.from('license_keys').select('expires_at, blowsome').in('user_id', owners).eq('is_active', true).eq('blowsome', true)
  return (keys || []).some(k => !k.expires_at || k.expires_at > now)
}

async function allPhones(key) {
  const out = []
  for (let page = 1; page <= 30; page++) {
    const d = await duo(key, '/api/v1/cloudPhone/list', { page, pagesize: 100 })
    for (const p of d?.list || []) out.push(slimPhone(p))
    if (!d || page >= Number(d.total_page || 1)) break
  }
  return out
}

export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST seulement' })
  const b = bodyOf(req)
  try {
    const s = db()
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = jwt ? await s.auth.getUser(jwt) : { data: null }
    const user = auth?.user
    if (!user) return res.status(200).json({ ok: false, error: 'Connexion requise' })
    const orgId = b.org_id && UUID.test(String(b.org_id)) ? String(b.org_id) : null
    const role = orgId ? await roleIn(s, orgId, user.id) : 'owner'
    if (!role) return res.status(200).json({ ok: false, error: 'Espace non autorisé' })
    if (!await hasBlowsome(s, user, orgId)) return res.status(200).json({ ok: false, error: 'Réservé à l’accès Blowsome' })
    const space = orgId || `u:${user.id}`
    const manager = role === 'owner' || role === 'admin'
    const a = String(b.a || '')

    if (a === 'setkey') {
      if (!manager) return res.status(200).json({ ok: false, error: 'Seuls le propriétaire et les admins de l’espace peuvent changer la clé' })
      const key = String(b.key || '').trim()
      if (!/^[\w-]{16,80}$/.test(key)) return res.status(200).json({ ok: false, error: 'Clé DuoPlus invalide' })
      const phones = await allPhones(key)                                        // vérifie la clé avant de l'enregistrer
      const { error } = await s.from('sf_duoplus_keys').upsert({ space, api_key: key, set_by: user.id, updated_at: new Date().toISOString() })
      if (error) return res.status(200).json({ ok: false, error: /relation|does not exist|schema cache/i.test(error.message) ? 'Table manquante : passe le SQL 20261115_duoplus.sql dans Supabase' : error.message })
      return res.status(200).json({ ok: true, phones })
    }
    if (a === 'delkey') {
      if (!manager) return res.status(200).json({ ok: false, error: 'Seuls le propriétaire et les admins de l’espace peuvent retirer la clé' })
      await s.from('sf_duoplus_keys').delete().eq('space', space)
      return res.status(200).json({ ok: true })
    }

    const { data: row, error: kErr } = await s.from('sf_duoplus_keys').select('api_key').eq('space', space).maybeSingle()
    if (kErr && /relation|does not exist|schema cache/i.test(kErr.message)) return res.status(200).json({ ok: false, error: 'Table manquante : passe le SQL 20261115_duoplus.sql dans Supabase', nosql: true })
    const key = row?.api_key
    if (a === 'status') return res.status(200).json({ ok: true, configured: !!key, manager })
    if (!key) return res.status(200).json({ ok: false, error: 'Aucune clé DuoPlus pour cet espace', nokey: true })

    if (a === 'phones') return res.status(200).json({ ok: true, phones: await allPhones(key) })
    if (a === 'power') {
      const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String))].filter(x => PHONE_ID.test(x)).slice(0, 200)
      if (!ids.length) return res.status(200).json({ ok: false, error: 'Aucun téléphone' })
      const on = !!b.on, success = [], fail = []
      for (const part of chunk(ids, on ? 100 : 20)) {
        const d = await duo(key, on ? '/api/v1/cloudPhone/powerOn' : '/api/v1/cloudPhone/powerOff', { image_ids: part })
        for (const x of d?.success || []) success.push(String(x?.id ?? x?.image_id ?? x))
        for (const x of d?.fail || []) fail.push({ id: String(x?.id ?? x?.image_id ?? x), error: String(x?.err ?? x?.message ?? '') })
      }
      return res.status(200).json({ ok: true, success, fail })
    }
    if (a === 'command') {
      if (!manager) return res.status(200).json({ ok: false, error: 'Commandes ADB réservées au propriétaire et aux admins de l’espace' })
      const id = String(b.id || ''), command = String(b.command || '').replace(/^\s*adb\s+shell\s+/i, '').trim()
      if (!PHONE_ID.test(id) || !command || command.length > 2000) return res.status(200).json({ ok: false, error: 'Commande invalide' })
      const d = await duo(key, '/api/v1/cloudPhone/command', { image_id: id, command })
      return res.status(200).json({ ok: !!d?.success, output: String(d?.content ?? ''), error: d?.success ? undefined : String(d?.message || 'échec') })
    }
    return res.status(400).json({ ok: false, error: `action inconnue : ${a}` })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) })
  }
}
