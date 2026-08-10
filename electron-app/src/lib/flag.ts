// Drapeau emoji à partir d'un code pays ISO-2 (ex "FR") OU d'un nom de pays
// (ex "France", ce que renvoie ip-api via l'agent). Renvoie '' si inconnu
// (fallback propre : on affiche juste ville/ISP, pas de drapeau cassé).

// Nom de pays (EN, tel que renvoyé par ip-api) → ISO-2. Couvre les pays de
// proxy les plus courants ; étendable au besoin.
const NAME_TO_CC: Record<string, string> = {
  france: 'FR', 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB',
  germany: 'DE', netherlands: 'NL', spain: 'ES', italy: 'IT', belgium: 'BE',
  switzerland: 'CH', canada: 'CA', poland: 'PL', portugal: 'PT', ireland: 'IE',
  sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', austria: 'AT',
  'czechia': 'CZ', 'czech republic': 'CZ', romania: 'RO', hungary: 'HU', greece: 'GR',
  bulgaria: 'BG', ukraine: 'UA', russia: 'RU', turkey: 'TR', 'united arab emirates': 'AE',
  brazil: 'BR', mexico: 'MX', argentina: 'AR', australia: 'AU', 'new zealand': 'NZ',
  japan: 'JP', 'south korea': 'KR', china: 'CN', 'hong kong': 'HK', singapore: 'SG',
  india: 'IN', indonesia: 'ID', thailand: 'TH', vietnam: 'VN', philippines: 'PH',
  malaysia: 'MY', 'south africa': 'ZA', morocco: 'MA', 'saudi arabia': 'SA',
  israel: 'IL', luxembourg: 'LU', latvia: 'LV', lithuania: 'LT', estonia: 'EE',
  slovakia: 'SK', slovenia: 'SI', croatia: 'HR', serbia: 'RS', iceland: 'IS',
}

function ccToFlag(cc: string): string {
  const s = cc.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(s)) return ''
  return String.fromCodePoint(...[...s].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65))
}

// Accepte un code ISO-2 ou un nom de pays.
export function flagEmoji(input?: string): string {
  if (!input) return ''
  const s = input.trim()
  if (/^[A-Za-z]{2}$/.test(s)) return ccToFlag(s)
  const cc = NAME_TO_CC[s.toLowerCase()]
  return cc ? ccToFlag(cc) : ''
}
