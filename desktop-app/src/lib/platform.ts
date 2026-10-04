// Détection de la cible d'exécution. En Electron (webSecurity:false) on appelle
// les API externes en direct ; sur le WEB (navigateur) le CORS l'interdit → on
// passe par les relais serverless de desktop-app/api/*. Le user-agent Electron
// contient « Electron », jamais sur un navigateur normal.
export const IS_WEB = typeof navigator !== 'undefined' && !/electron/i.test(navigator.userAgent)
