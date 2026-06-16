# 🔍 Audit complet ScaleFlow — Juin 2026

> 8 audits parallèles : tous les onglets + architecture transversale + parcours produit.
> Classement : **P0** = critique (perte d'argent/données, bug majeur) · **P1** = important · **P2** = polish.

---

## 🚨 P0 — À corriger immédiatement (argent & données)

### Crédits — l'utilisateur PERD de l'argent
| Où | Problème | Fix |
|---|---|---|
| `Posting.tsx:296-317` | Crédits débités puis upload échoue → **aucun remboursement** | Helper `withCredits(cost, fn)` unique avec refund au prorata |
| `MassPosting.tsx:436-478` | Débit upfront tous phones, échecs/Stop → crédits perdus | Idem — rembourser les échecs en fin de run |
| `MassPosting.tsx:494` | `/phone/start` retourne 0 démarré → on continue quand même (crédits + tâches perdus) | Abort + refund si 0 started |
| `StoryLink.tsx:292-332` | Débit avant run, Stop/échecs → pas de refund | Idem |
| `MassRemix.tsx:458` + `VideoRepurpose.tsx:227` | Crédits débités, échecs FFmpeg/timeout/annulation → perdus | Idem |
| `Posting.tsx:259` vs `MassPosting.tsx:382` | `schedulePost` simple ne débite RIEN (incohérence facturation) | Aligner les deux flux |
| `lib/credits.ts:79-170` | 4 `catch` vides dans la facturation — un échec de débit passe inaperçu | Logger + toast |

### Bugs d'exécution majeurs
| Où | Problème | Fix |
|---|---|---|
| `Scheduler.tsx:451` | **`setTimeout` > 24,8 jours = fire immédiat** (JS int32) — un post programmé à J+25 part instantanément | Chaîner des timeouts ≤24h + revérifier `scheduled_at` |
| `MassPosting.tsx:676-681` | Stats finales fausses : statuts `error` écrasés en `done` + closure stale → "N/N réussis" toujours | Lire `getMassPostingState()` + ne pas écraser les erreurs |
| `MassRemix.tsx:449-466` | `outputFolder` stale au 1er lancement → fichiers perdus en temp | Variable locale `const folder = f ?? outputFolder` |
| `Montage.tsx:559-584` | **Export ignore transitions, vitesse, filtres, textes** — tout ce que l'UI promet | Passer les options au payload FFmpeg ou griser avec "preview only" |
| `Posting.tsx:410` | Crash pendant run → cloud phones GeeLark restent allumés (**facturation continue**) | Arrêt d'urgence dans le catch (existe déjà dans MassPosting) |
| `Phones.tsx:736` | Closure périmée `phoneLimit` dans la sync → limite de plan non appliquée | Ajouter aux deps du useCallback |
| Transversal | **Double polling IG** : `igStatsPoller` + boucle locale Phones.tsx → rate-limit Instagram | Supprimer la boucle locale |

### Données & sécurité
| Où | Problème | Fix |
|---|---|---|
| `Bank.tsx:605` + `CaptionBank.tsx:276` + `Licences.tsx:178` + Community | **Suppressions définitives sans confirmation** (vidéo, caption, licence, topic, message) | Modal de confirmation partout |
| `Community.tsx:1002` | `is_admin` auto-déclaré côté client → badge ADMIN usurpable | Vérifier côté DB (trigger/policy) |
| `Community.tsx:1114` | `deleteTopic` détruit les messages AVANT le check de droits | `ON DELETE CASCADE` + delete unique |
| `Settings.tsx:424` | **Utilisateur solo ne peut pas sauvegarder ses clés API** (`canEditOrgConnexions` faux en solo) | `if (currentOrg && !canEdit) throw` |
| `Settings.tsx:363` | Secrets (bearer, clés API, sessionid) renvoyés en clair au client à chaque load | Champs write-only `••••` |
| `Settings.tsx:1608` | Mauvaise licence affichée (pas de filtre `user_id`) | `.eq('user_id', userId)` |
| `CaptionBank.tsx:40` | Modal fermé avant confirmation du save → texte perdu si échec | Fermer seulement après succès |
| `TextCopy.tsx:117` | Insert bank non vérifié → vidéo uploadée mais invisible | Vérifier `{ error }` |

### UX bloquante
| Où | Problème | Fix |
|---|---|---|
| `Layout.tsx:77-107` | **`massposting` absent de la sidebar** (accessible que via Hub) | Ajouter à la section Instagram |
| `Phones.tsx` | **Aucune bulk action** dans une app multi-comptes | Checkboxes + barre d'actions flottante |
| `CaptionBank.tsx:523` | **Pas de bouton "Copier"** — la fonction cœur d'une banque de captions | Clic = copier + toast |
| `Warmup.tsx:846-1087` | Banner "fonctionnalité buguée" mais boutons **toujours actifs** | `disabled` tant que le flag est actif |
| `AiTools.tsx:655` | Cartes verrouillées (clé manquante) restent cliquables | Bloquer onClick + tooltip |
| `Mixer.tsx:334` | `fetch('/api/mix-overlay')` sans fallback Electron → bouton principal cassé en desktop | Router via electronAPI |

### Performance critique
| Où | Problème | Fix |
|---|---|---|
| `Phones.tsx:643` | Countdown 1s → **re-render full page chaque seconde** | Composant feuille isolé + `React.memo(PhoneRow)` |
| `Layout.tsx:471` | `SidebarNavItem` défini DANS Layout → démontage/remontage de toute la nav à chaque render | Extraire le composant |
| `Bank.tsx:1179` | Grille non virtualisée + 1 signed URL par thumbnail + `<video preload>` par carte | react-window + cache URLs + lazy |

---

## ⚠️ P1 — Important (la marche vers le "pro")

### Fiabilité des runs
- **Annulation réelle partout** : Stop ne tue jamais les process FFmpeg ni les jobs en cours (MassRemix, CloneVid, Mixer, Warmup MassEdit). Il faut un IPC `killFfmpeg` + check abort entre chaque étape.
- **Progression réelle** : partout des spinners muets ou des % hardcodés (CloneVid : 5→25→30→90 fake). FFmpeg émet `-progress` — le remonter.
- **Retry sélectif** : "Relancer les 3 échecs" au lieu de tout relancer (et tout repayer) — MassPosting, MassRemix, Posting.
- **Timers fantômes** MassPosting : les setTimeout 5min survivent au Stop et écrasent les statuts.
- **Tâches "probablement faites"** marquées `done` après 6 min sans réponse → posts dupliqués au relancement. Statut `unknown` + bouton Vérifier.
- **Scheduler** : timers dupliqués à chaque update realtime ; double-exécuteur App+page ; pas d'édition de date d'un post pending.
- **ScheduleModal** : bug "+30min" qui ajoute +90min (`Math.ceil` au lieu de `Math.floor`) ; pas de coût en crédits affiché avant confirmation.
- **Warmup** : `Promise.all` sans limite de concurrence (100 phones = 100 automations simultanées) ; estimation de durée fausse (suppose séquentiel) ; photo de profil locale silencieusement ignorée.
- **StoryLink** : URLs signées expirées persistées en localStorage ; aperçu re-shufflé à chaque frappe ≠ tirage réel.

### Gestion d'erreurs (le chantier n°1 transversal)
- `useToast` existe mais utilisé dans 4 pages sur 25. Partout ailleurs : `alert()` natifs, `setError` muets, ou rien.
- ~20 catch silencieux, dont la facturation.
- Hub : les 5 requêtes KPI ignorent les erreurs → affiche 0 (faux) sans message.
- Phones : save/unlink/session en échec = silence total.
- Support : `sendReply` avale les erreurs, le message disparaît.
- **Fix structurant** : helper `reportError(e)` + toast systématique + état d'erreur avec retry.

### Données & scoping
- **Hub non scopé org** : les KPI mélangent solo+org → chiffres faux en mode organisation.
- Bank : updates optimistes sans vérifier `error` Supabase → désync silencieuse.
- `loadItems`/`BankPicker` : pagination incohérente, >1000 items tronqués.

### i18n (chaos visible)
- Pages 0% traduites : BankHub, Remix, ScaleIA, Mixer, TextCopy, Autocomment.
- FR/EN mélangés dans la même page : AiTools, Warmup, Licences, Phones (`relativeTime` anglais avec locale fr-FR).
- `useLang` importé mais inutilisé dans plusieurs pages.

### Design system (cohérence)
- `theme.ts` importé par presque personne : `#6366F1` hardcodé 129×, 4 verts différents, 3 rouges.
- Posting (tokens CSS) vs MassPosting (couleurs en dur, constantes mal nommées `GOLD`=indigo, `SERIF`=Inter) — les 2 modes du même onglet n'ont pas le même look.
- 10 implémentations de Modal copy-collées (sans Escape ni focus-trap), 10 ProgressBar, ~72 toggles inline.
- **Fix** : composants partagés `<Modal>`, `<ProgressBar>`, `<Toggle>`, `<ConfirmDialog>` + migration des couleurs vers theme.ts.

### Features pro manquantes (top demandes)
1. **Cmd+K command palette** — navigation 15 pages + recherche phones + actions rapides
2. **Notifications persistantes et cliquables** (aujourd'hui : RAM only, tout perdu au redémarrage)
3. **Bandeau santé sur le Hub** : phones offline, comptes en challenge (détection existe déjà!), token expiré, crédits bas, taux d'échec
4. **Checklist premiers pas** persistante (Token → Phone → Vidéo → 1er post)
5. **Templates/duplication de campagne** — refaire la même config quotidienne en 2 clics
6. **Tri colonnes + export CSV** sur Phones
7. **Historique de générations IA** + streaming des réponses (aujourd'hui spinner muet 20s)
8. **Vue calendrier** dans le Scheduler + récurrence
9. **Préviews avant lancement** : TextCopy (canvas overlay), Mixer (position texte), StoryLink (story + sticker)
10. **Upload inline** dans le folder picker de MassPosting (friction n°1 du flux principal)

---

## 📋 P2 — Polish (vague suivante)

- Splash 4,2s subi à CHAQUE lancement → skippable, réservé au 1er run
- Switch d'org redirige vers Community au lieu de Hub
- Sidebar : regrouper Montage/Remix/Repurpose/Mixer en "Studio vidéo" à onglets (14 → 9 entrées)
- BankHub : double header (~180px perdus), remontage complet au switch d'onglet
- Accessibilité : ~10 pages sans aucun aria-label, modals sans Escape, focus states inégaux
- Emojis comme icônes UI malgré la règle "no emoji" (Warmup, StoryLink, MassRemix, AiTools, PostingOptions)
- `Math.random()` pour générer les clés de licence → `crypto.getRandomValues`
- Fuites mémoire blob URLs (TextCopy, CloneVid, Community)
- KPI Hub non cliquables, sans tendance, période 7j fixe
- Code mort : `PhoneCard` 180 lignes inutilisées, `pollError` jamais set, stats sidebar voidées

---

## 🗺️ Plan d'attaque recommandé

**Sprint 1 — Stop the bleeding (P0 argent/données)**
1. `withCredits()` unique avec refund — 4 flux alignés
2. Confirmations de suppression partout (`<ConfirmDialog>` partagé)
3. Bug setTimeout 25 jours + stats finales MassPosting + outputFolder MassRemix
4. Arrêt d'urgence phones dans Posting + abort si 0 démarré
5. Fix sauvegarde clés API en solo + massposting dans la sidebar

**Sprint 2 — Fiabilité visible**
6. Toasts généralisés + reportError + états d'erreur avec retry
7. Annulation réelle FFmpeg + progression réelle
8. Notifications persistantes cliquables
9. Re-renders : SidebarNavItem, countdown Phones, memo PhoneRow

**Sprint 3 — Le niveau au-dessus**
10. Cmd+K palette + bandeau santé Hub + checklist premiers pas
11. Bulk actions Phones + tri + export CSV
12. Templates de campagne + retry sélectif
13. Composants partagés (Modal, ProgressBar, Toggle) + migration theme.ts
14. i18n complet + virtualisation Bank
