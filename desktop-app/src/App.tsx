import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { themeFor, type InfraKey } from '@/lib/theme'
import { useOrg, useHubData, firstNameFrom } from '@/lib/data'
import { useLicense } from '@/lib/license'
import Shell, { type PageKey } from '@/Shell'
import Home from '@/pages/Home'
import BlowsomeHome from '@/pages/BlowsomeHome'
import { BlowParc, BlowContent, BlowTools } from '@/pages/BlowsomePages'
import Phones from '@/pages/Phones'
import Bank from '@/pages/Bank'
import Proxies from '@/pages/Proxies'
import Activity from '@/pages/Activity'
import Health from '@/pages/Health'
import Recipes from '@/pages/Recipes'
import Publish from '@/pages/Publish'
import Warmup from '@/pages/Warmup'
import Studio from '@/pages/Studio'
import Insights from '@/pages/Insights'
import Connections from '@/pages/Connections'
import Automation from '@/pages/Automation'
import Flows from '@/pages/Flows'
import Settings from '@/pages/Settings'
import Placeholder, { type PlaceholderSpec } from '@/pages/Placeholder'

// Spécifications des écrans encore en placeholder (gabarit PageHead + état vide).
const SPECS: Partial<Record<PageKey, PlaceholderSpec>> = {
  cloud: { title: 'Mes appareils', sub: 'Tes appareils cloud ScaleFlow, démarrés en 3,2 s, sans quota.', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', emptyTitle: 'Bientôt disponible', emptyText: 'La gestion des appareils cloud arrive ici. Cet écran sera branché prochainement.' },
  phones: { title: 'Téléphones GeeLark', sub: 'Tes cloud phones GeeLark et leur santé.', icon: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01', emptyTitle: 'À brancher', emptyText: 'La liste des téléphones, la recherche et les actions groupées seront ajoutées ensuite.' },
  proxies: { title: 'Proxies', sub: 'Rotation d’IP et proxies attribués à tes appareils.', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M2 12h20|M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z', emptyTitle: 'À brancher', emptyText: 'La configuration des proxies et de la rotation sera ajoutée ensuite.' },
  bank: { title: 'Banque', sub: 'Tes vidéos et images prêtes à publier.', icon: 'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z', emptyTitle: 'À brancher', emptyText: 'La banque de contenu (dossiers, import, sélection) sera ajoutée ensuite.' },
  activity: { title: 'Activité', sub: 'Historique de tes publications et de tes runs.', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', emptyTitle: 'À brancher', emptyText: 'Le journal d’activité détaillé sera ajouté ensuite.' },
  flows: { title: 'Automatisation', sub: 'Tes tâches automatiques et posts programmés.', icon: 'M12 8V4H8|M4 4h16v16H4z|M9 16h6', emptyTitle: 'À brancher', emptyText: 'La création de flux et de tâches récurrentes sera ajoutée ensuite.' },
  recipes: { title: 'Mes séquences', sub: 'Tes séquences multi-étapes réutilisables.', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6', emptyTitle: 'À brancher', emptyText: 'La bibliothèque de séquences sera ajoutée ensuite.' },
  publish: { title: 'Publication', sub: 'Publier des Reels et des Stories sur tes comptes.', icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z', emptyTitle: 'À brancher', emptyText: 'Les formats de publication seront ajoutés ensuite.' },
  automation: { title: 'Automatisation', sub: 'Programmer et automatiser tes publications.', icon: 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z', emptyTitle: 'À brancher', emptyText: 'Le calendrier et les tâches automatiques seront ajoutés ensuite.' },
  warmup: { title: 'Warmup', sub: 'Chauffer tes comptes pour réduire les blocages.', icon: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z', emptyTitle: 'À brancher', emptyText: 'Le warmup des comptes sera ajouté ensuite.' },
  studio: { title: 'Studio vidéo', sub: 'Remixer et transformer tes vidéos.', icon: 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z', emptyTitle: 'À brancher', emptyText: 'Les outils vidéo (remix, spoof, sous-titres) seront ajoutés ensuite.' },
  insights: { title: 'Performances', sub: 'Tes vues, ta croissance et tes tendances.', icon: 'M3 3v18h18|M7 15l4-6 4 3 5-8', emptyTitle: 'À brancher', emptyText: 'Les graphiques de performance seront ajoutés ensuite.' },
  health: { title: 'Santé des comptes', sub: 'Le risque par compte : âge, cadence, blocages.', icon: 'M12 21s-8-4.5-8-11a5 5 0 0 1 8-3 5 5 0 0 1 8 3c0 6.5-8 11-8 11z|M9 12h2l1-2 1 4 1-2h2', emptyTitle: 'À brancher', emptyText: 'Le score de santé par compte sera ajouté ensuite.' },
  settings: { title: 'Réglages', sub: 'Ton compte, ton organisation et tes préférences.', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z', emptyTitle: 'À brancher', emptyText: 'Les réglages du compte et de l’organisation seront ajoutés ensuite.' },
}

function Loader() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0B0F' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.25)', borderTopColor: '#A78BFA', animation: 'aSpin 0.7s linear infinite' }} />
    </div>
  )
}

export default function App() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      if (!u) { location.replace('./login.dc.html'); return }
      setUser(u)
      setChecking(false)
    })
  }, [])

  if (checking || !user) return <Loader />
  return <AppInner user={user} />
}

function AppInner({ user }: { user: User }) {
  // On ouvre sur l'infra GeeLark : c'est là que sont tes données aujourd'hui.
  // ScaleFlow Cloud (auto-hébergé) reste vide tant que tu n'as pas branché tes serveurs.
  const [infra, setInfra] = useState<InfraKey>('geelark')
  const [page, setPage] = useState<PageKey>('hub')
  const org = useOrg(user)
  const license = useLicense(user, org)
  const { data, loading, reload } = useHubData(user, org, infra)
  const theme = themeFor(infra)

  // Garde-fou : si l'accès Blowsome n'est pas (ou plus) accordé, on ne reste jamais
  // sur cette infra VIP — retour GeeLark. (Même logique de porte que le web.)
  useEffect(() => {
    if (infra === 'blowsome' && !license.loading && !license.blowsome) setInfra('geelark')
  }, [infra, license.loading, license.blowsome])

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('sb-fvmkmkspfksscgqyvysl-auth-token')
    location.replace('./login.dc.html')
  }

  const userName = firstNameFrom(data?.displayName ?? null, user.email)
  const orgName = org.currentOrg?.name ?? 'Espace perso'
  const roleLabel = org.role ? org.role.charAt(0).toUpperCase() + org.role.slice(1) : ''

  const content = infra === 'blowsome'
    ? (page === 'blowParc' ? <BlowParc user={user} org={org} />
      : page === 'blowContent' ? <BlowContent user={user} org={org} />
      : page === 'blowTools' ? <BlowTools />
      : <BlowsomeHome user={user} org={org} />)
    : page === 'hub'
    ? <Home theme={theme} infra={infra} user={user} data={data} loading={loading} reload={reload} onNavigate={setPage} />
    : (page === 'cloud' || page === 'phones')
      ? <Phones theme={theme} infra={infra} user={user} org={org} onNavigate={(p) => setPage(p as PageKey)} />
      : page === 'bank'
        ? <Bank theme={theme} infra={infra} user={user} org={org} onNavigate={(p) => setPage(p as PageKey)} />
        : page === 'proxies'
        ? <Proxies theme={theme} infra={infra} user={user} org={org} />
        : page === 'activity'
        ? <Activity theme={theme} infra={infra} user={user} org={org} />
        : page === 'health'
        ? <Health theme={theme} infra={infra} user={user} org={org} onNavigate={(p) => setPage(p as PageKey)} />
        : page === 'recipes'
        ? <Recipes theme={theme} infra={infra} user={user} org={org} />
        : page === 'publish'
        ? <Publish theme={theme} infra={infra} user={user} org={org} />
        : page === 'warmup'
        ? <Warmup theme={theme} infra={infra} user={user} org={org} />
        : page === 'studio'
        ? <Studio theme={theme} infra={infra} user={user} org={org} />
        : page === 'insights'
        ? <Insights theme={theme} infra={infra} user={user} org={org} onNavigate={(p) => setPage(p as PageKey)} />
        : page === 'connections'
        ? <Connections theme={theme} infra={infra} user={user} org={org} />
        : page === 'flows'
        ? <Flows theme={theme} infra={infra} user={user} org={org} onLaunch={() => setPage('publish')} />
        : page === 'automation'
        ? <Automation theme={theme} infra={infra} user={user} org={org} />
        : page === 'settings'
        ? <Settings theme={theme} user={user} org={org} onSignOut={signOut} onNavigate={(p) => setPage(p as PageKey)} />
        : <Placeholder theme={theme} spec={SPECS[page] ?? SPECS.settings!} />

  return (
    <Shell
      theme={theme} infra={infra} setInfra={setInfra}
      page={page} setPage={setPage}
      userName={userName} orgName={orgName} role={roleLabel}
      balance={data?.balance ?? null}
      phoneCount={data?.phoneCount ?? null}
      videoCount={data?.videoCount ?? null}
      canBlowsome={license.blowsome}
      orgs={org.myOrgs.map(o => ({ id: o.org.id, name: o.org.name }))}
      currentOrgId={org.currentOrg?.id ?? null}
      onSwitchOrg={org.switchOrg}
      onSignOut={signOut}
    >
      {content}
    </Shell>
  )
}
