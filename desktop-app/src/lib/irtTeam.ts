// Réglages iRemoTech PARTAGÉS dans l'espace (toute l'équipe voit la même chose) : groupe et marché de chaque
// iPhone, marché propre à un compte, lien CTA de chaque compte (Story CTA) et pool de textes CTA enregistrés.
// Stockés dans une ligne sentinelle de `iremotech_device_meta` (device_id `__sf_team__`, colonne jsonb
// `accounts`) : aucun SQL à passer. Le localStorage sert de cache immédiat et de repli hors ligne.
import { supabase } from './supabase'
import type { Market } from './captionMarkets'

export const TEAM_ROW = '__sf_team__'
export interface IrtTeam {
  groups: Record<string, string>        // iPhone → nom du groupe
  groupNames: string[]                  // groupes créés (même vides)
  markets: Record<string, Market>       // iPhone → marché
  acctMarkets: Record<string, Market>   // `${iPhone}::${cible}` → marché du compte (prioritaire sur celui de l'iPhone)
  links: Record<string, string>         // `${iPhone}::${cible}` → lien CTA du compte
  ctaTexts: string[]                    // pool de textes CTA enregistrés
  lastStory: Record<string, number>     // `${iPhone}::${cible}` → date (ms) de la dernière Story CTA publiée par ScaleFlow
  posted: Record<string, string[]>      // `${iPhone}::${cible}` → vidéos d'origine déjà publiées par ce compte (200 dernières)
  bankByModel: boolean                  // Banque : vue « par modèle » activée pour toute l'agence
  bankTemplate: string[]                // Banque : dossiers créés pour chaque nouvelle modèle (« Reels/Originaux »…) ; vide = défaut
}
export const emptyTeam = (): IrtTeam => ({ groups: {}, groupNames: [], markets: {}, acctMarkets: {}, links: {}, ctaTexts: [], lastStory: {}, posted: {}, bankByModel: false, bankTemplate: [] })

const isMarket = (v: unknown): v is Market => v === 'fr' || v === 'us' || v === 'de'
const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && x.trim()) out[k] = x.trim()
  return out
}
const mktMap = (v: unknown): Record<string, Market> => Object.fromEntries(Object.entries(strMap(v)).filter(([, x]) => isMarket(x))) as Record<string, Market>
/** Valeur brute (jsonb) → réglages propres. Pure. */
export function parseTeam(raw: unknown): IrtTeam {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return {
    groups: strMap(o.groups),
    groupNames: Array.isArray(o.groupNames) ? [...new Set(o.groupNames.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 100) : [],
    markets: mktMap(o.markets), acctMarkets: mktMap(o.acctMarkets), links: strMap(o.links),
    lastStory: Object.fromEntries(Object.entries((o.lastStory && typeof o.lastStory === 'object' && !Array.isArray(o.lastStory) ? o.lastStory : {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>,
    posted: Object.fromEntries(Object.entries((o.posted && typeof o.posted === 'object' && !Array.isArray(o.posted) ? o.posted : {}) as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === 'string').slice(-200)])),
    bankByModel: o.bankByModel === true,
    bankTemplate: Array.isArray(o.bankTemplate) ? [...new Set(o.bankTemplate.filter((x): x is string => typeof x === 'string').map(x => x.split('/').map(y => y.trim()).filter(Boolean).join('/')).filter(Boolean))].slice(0, 60) : [],
    ctaTexts: Array.isArray(o.ctaTexts) ? [...new Set(o.ctaTexts.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 200) : [],
  }
}

type Scope = { orgId: string | null; userId: string }
const scopeRow = (s: Scope) => s.orgId ? { scope_id: s.orgId, is_org: true } : { scope_id: s.userId, is_org: false }
const cacheKey = (s: Scope) => `sf-irt-team:${scopeRow(s).scope_id}`

export function loadTeamCache(s: Scope): IrtTeam {
  try { return parseTeam(JSON.parse(localStorage.getItem(cacheKey(s)) ?? '{}')) } catch { return emptyTeam() }
}
function cache(s: Scope, t: IrtTeam): void { try { localStorage.setItem(cacheKey(s), JSON.stringify(t)) } catch { /* noop */ } }

/** Réglages de l'espace depuis Supabase (null = indisponible → on garde le cache). */
export async function pullTeam(s: Scope): Promise<IrtTeam | null> {
  const { data, error } = await supabase.from('iremotech_device_meta').select('accounts').eq('scope_id', scopeRow(s).scope_id).eq('device_id', TEAM_ROW).maybeSingle()
  if (error) return null
  const t = parseTeam(data?.accounts)
  cache(s, t)
  return t
}

/** Modifie les réglages : relit la version la plus récente, applique `change`, enregistre. Renvoie le résultat
 *  (appliqué au cache même si l'envoi échoue). */
export async function updateTeam(s: Scope, change: (t: IrtTeam) => void): Promise<{ team: IrtTeam; shared: boolean }> {
  const fresh = (await pullTeam(s).catch(() => null)) ?? loadTeamCache(s)
  change(fresh)
  const team = parseTeam(fresh)
  cache(s, team)
  const { error } = await supabase.from('iremotech_device_meta').upsert(
    { ...scopeRow(s), device_id: TEAM_ROW, accounts: team, updated_at: new Date().toISOString() },
    { onConflict: 'scope_id,device_id' },
  )
  return { team, shared: !error }
}

/** Marché d'un compte : le sien, sinon celui de son iPhone, sinon `fallback`. Pure. */
export function teamMarketOf(t: IrtTeam, dev: string, target: string, fallback: Market): Market {
  return t.acctMarkets[`${dev}::${target}`] ?? t.markets[dev] ?? fallback
}
/** Groupes créés ou attribués, triés. Pure. */
export function teamGroups(t: IrtTeam): string[] {
  return [...new Set([...t.groupNames, ...Object.values(t.groups)])].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
}
