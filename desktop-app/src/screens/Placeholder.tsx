import { PageHead, Panel, Empty, Btn, ICONS } from '../ui'

export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <PageHead title={title} sub="Écran à venir — le gabarit v10 est posé, le contenu arrive dans la prochaine passe." />
      <Panel pad={0}>
        <Empty icon={ICONS.bolt} title={`${title} — en construction`} text="Cet écran reprend les mêmes fabriques (_panel, _kpi, _btn, _chip). Il sera composé dans la suite du chantier v10." action={<Btn label="Retour à l'accueil" tone="ghost" sm onClick={() => (window as any).__go?.('hub')} />} />
      </Panel>
    </div>
  )
}
