// Catalogue de templates RPA (façon store GeeLark) — partagé entre la page
// Automatisation et (au besoin) Cloud Phones. Titres/descriptions en français.
// Ce sont des templates « vitrine » : les vrais flux seront exportés ensuite.

export type TplPlatform = 'instagram' | 'tiktok' | 'youtube'
export interface RpaTemplate {
  title: string
  desc: string
  author: string
  id: string
  platforms: TplPlatform[]
}

export const TPL_RECOMMENDED_ID = '500000000000000016'

export const RPA_TEMPLATES: RpaTemplate[] = [
  { title: 'Publier une vidéo Reels sur Instagram', desc: 'Publie des Reels en un clic sur Instagram pour gagner en efficacité.', author: 'Ted', id: '500000000000000016', platforms: ['instagram'] },
  { title: 'Publier un carrousel photo sur Instagram', desc: 'Publie des carrousels photo Instagram en quelques clics.', author: 'Carlos', id: '6231190517779904823', platforms: ['instagram'] },
  { title: 'Commenter le dernier post Instagram', desc: 'Recherche des comptes et commente leur dernier post Instagram.', author: 'sird****@gmail.com', id: '567852161145246224', platforms: ['instagram'] },
  { title: 'Passer en compte professionnel Instagram (Créateur)', desc: 'Convertit automatiquement un compte perso en compte professionnel (mode créateur de contenu).', author: 'Carlos', id: '622396849117986917', platforms: ['instagram'] },
  { title: 'Modifier le profil Instagram', desc: 'Modifie en masse : avatar, pseudo, nom, bio et liens.', author: 'Ted', id: '500000000000000043', platforms: ['instagram'] },
  { title: 'Warmup de compte Instagram (IA)', desc: 'Simule un utilisateur réel qui navigue et like pour gagner en engagement et en abonnés.', author: 'Ted', id: '500000000000000020', platforms: ['instagram'] },
  { title: 'Confidentialité du compte Instagram', desc: 'Bascule les comptes Instagram entre public et privé facilement.', author: 'Mandarin', id: '500000000000000049', platforms: ['instagram'] },
  { title: 'Connexion automatique Instagram', desc: 'Connexion rapide à un compte Instagram pour une gestion et une publication efficaces.', author: 'Mandarin', id: '500000000000000034', platforms: ['instagram'] },
  { title: 'Abonnement en masse Instagram', desc: 'Recherche des comptes et s’abonne à plusieurs comptes en masse.', author: 'Mandarin', id: '500000000000000053', platforms: ['instagram'] },
  { title: 'Publier une galerie de Reels Instagram', desc: 'Publie une galerie de Reels en un clic pour gagner en efficacité.', author: 'Ted', id: '500000000000000031', platforms: ['instagram'] },
  { title: 'Envoyer des messages privés Instagram', desc: 'Recherche des comptes et envoie des messages privés en masse.', author: 'Ted', id: '500000000000000022', platforms: ['instagram'] },
  { title: 'Publier sur TikTok / Reels / YouTube Shorts', desc: 'Publie une vidéo sur TikTok, Instagram Reels et YouTube Shorts en même temps pour un maximum d’engagement.', author: 'Ted', id: '500000000000000017', platforms: ['tiktok', 'instagram', 'youtube'] },
  { title: 'Connexion automatique Instagram (2FA)', desc: 'Simule une connexion d’utilisateur réel avec authentification automatique et validation par 2FA.', author: 'Carlos tec', id: '603260376578003125', platforms: ['instagram'] },
  { title: 'Statistiques d’engagement Instagram', desc: 'Collecte automatique des 7 derniers jours : vues, interactions et abonnés. Nécessite un compte professionnel.', author: 'Carlos', id: '617907879776622023', platforms: ['instagram'] },
  { title: 'Connexion Instagram 2FA 2.0', desc: 'Simule une connexion d’utilisateur réel avec authentification automatique et validation via 2FA.', author: 'Carlos', id: '6271538163152323368', platforms: ['instagram'] },
  { title: 'Publier un Short sur YouTube', desc: 'Publie la 1ʳᵉ vidéo de la galerie en YouTube Short, avec légende.', author: 'ScaleFlow', id: '500000000000000090', platforms: ['youtube'] },
]

export function InstagramLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" cx="0.3" cy="1" r="1.1">
          <stop offset="0" stopColor="#FED576" /><stop offset="0.25" stopColor="#F47133" />
          <stop offset="0.5" stopColor="#BC3081" /><stop offset="0.8" stopColor="#4C63D2" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#ig-grad)" />
      <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.6" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="16.4" cy="7.6" r="1.05" fill="#fff" />
    </svg>
  )
}
export function TikTokLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#010101" />
      <path d="M15.9 6.2c.35 1.55 1.28 2.63 2.85 2.86v2.02c-1.05.06-1.98-.24-2.9-.83v3.86c0 3.06-2.6 5.05-5.32 4.07-2-.72-2.7-3.2-1.5-4.94.72-1.05 2-1.52 3.4-1.32v2.1c-.28-.05-.55-.08-.82-.03-.9.16-1.36 1.05-1 1.86.36.82 1.5 1.02 2.16.37.3-.3.42-.66.42-1.08V6.2h2.71z" fill="#fff" />
    </svg>
  )
}
export function YouTubeLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="#FF0000" />
      <path d="M10 8.6l5.2 3.4L10 15.4z" fill="#fff" />
    </svg>
  )
}
export function PlatformLogo({ platform, size }: { platform: TplPlatform; size?: number }) {
  if (platform === 'tiktok') return <TikTokLogo size={size} />
  if (platform === 'youtube') return <YouTubeLogo size={size} />
  return <InstagramLogo size={size} />
}
