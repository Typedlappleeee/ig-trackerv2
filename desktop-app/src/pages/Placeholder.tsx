import type { Theme } from '@/lib/theme'
import { Btn, Empty, Panel, PageHead } from '@/lib/ui'

// Gabarit fidèle : PageHead + panneau avec un état vide _empty. À remplir ensuite.
export interface PlaceholderSpec {
  title: string
  sub: string
  icon: string
  emptyTitle: string
  emptyText: string
  cta?: string
}

export default function Placeholder({ theme, spec, onCta }: { theme: Theme; spec: PlaceholderSpec; onCta?: () => void }) {
  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title={spec.title} sub={spec.sub} />
      <Panel theme={theme}>
        <Empty
          icon={spec.icon}
          title={spec.emptyTitle}
          text={spec.emptyText}
          action={spec.cta && onCta ? <Btn label={spec.cta} theme={theme} tone="primary" onClick={onCta} /> : undefined}
        />
      </Panel>
    </div>
  )
}
