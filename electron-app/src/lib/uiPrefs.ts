/**
 * Préférences UI persistées — petites valeurs de confort partagées entre pages.
 */

// Dernier groupe de téléphones choisi : appliqué automatiquement sur chaque
// page avec un filtre de groupe (Publication, Story, Warmup, modals…).
const LS_GROUP = 'sf-last-phone-group'

export function loadLastGroup(): string {
  return localStorage.getItem(LS_GROUP) ?? 'Tous'
}

export function saveLastGroup(g: string) {
  localStorage.setItem(LS_GROUP, g)
}
