// Localisations GPS proposées (écrites dans les métadonnées mp4 par le spoof).
// Source unique partagée par Studio et Auto-contenu (réexportée par studioTools). Module pur,
// testé dans gps.test.ts.
export interface GpsCity { k: string; label: string; lat: number; lon: number }
export const GPS_CITIES: GpsCity[] = [
  { k: 'none', label: 'Aucune (par défaut)', lat: 0, lon: 0 },
  { k: 'france', label: '🇫🇷 France (aléatoire)', lat: 46.6, lon: 2.2 },
  { k: 'usa', label: '🇺🇸 USA (aléatoire)', lat: 39.8, lon: -98.6 },
  { k: 'paris', label: 'Paris', lat: 48.8566, lon: 2.3522 },
  { k: 'lyon', label: 'Lyon', lat: 45.7640, lon: 4.8357 },
  { k: 'marseille', label: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { k: 'bordeaux', label: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  { k: 'lille', label: 'Lille', lat: 50.6292, lon: 3.0573 },
  { k: 'bruxelles', label: 'Bruxelles', lat: 50.8503, lon: 4.3517 },
  { k: 'geneve', label: 'Genève', lat: 46.2044, lon: 6.1432 },
  { k: 'montreal', label: 'Montréal', lat: 45.5017, lon: -73.5673 },
  { k: 'londres', label: 'Londres', lat: 51.5074, lon: -0.1278 },
  { k: 'newyork', label: 'New York', lat: 40.7128, lon: -74.0060 },
  { k: 'losangeles', label: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { k: 'dubai', label: 'Dubaï', lat: 25.2048, lon: 55.2708 },
]
type LatLon = { lat: number; lon: number }
// Grandes villes FR pour la localisation « France (aléatoire) » : chaque variante
// reçoit une position différente (jitter léger pour ne pas répéter la coordonnée exacte).
const FRANCE_CITIES: LatLon[] = [
  { lat: 48.8566, lon: 2.3522 },   // Paris
  { lat: 45.7640, lon: 4.8357 },   // Lyon
  { lat: 43.2965, lon: 5.3698 },   // Marseille
  { lat: 44.8378, lon: -0.5792 },  // Bordeaux
  { lat: 50.6292, lon: 3.0573 },   // Lille
  { lat: 43.6047, lon: 1.4442 },   // Toulouse
  { lat: 43.7102, lon: 7.2620 },   // Nice
  { lat: 47.2184, lon: -1.5536 },  // Nantes
  { lat: 48.5734, lon: 7.7521 },   // Strasbourg
  { lat: 43.6108, lon: 3.8767 },   // Montpellier
  { lat: 47.3220, lon: 5.0415 },   // Dijon
  { lat: 48.1173, lon: -1.6778 },  // Rennes
]
// Grandes villes US pour la localisation « USA (aléatoire) ».
const US_CITIES: LatLon[] = [
  { lat: 40.7128, lon: -74.0060 },   // New York
  { lat: 34.0522, lon: -118.2437 },  // Los Angeles
  { lat: 41.8781, lon: -87.6298 },   // Chicago
  { lat: 29.7604, lon: -95.3698 },   // Houston
  { lat: 33.4484, lon: -112.0740 },  // Phoenix
  { lat: 39.9526, lon: -75.1652 },   // Philadelphie
  { lat: 29.4241, lon: -98.4936 },   // San Antonio
  { lat: 32.7157, lon: -117.1611 },  // San Diego
  { lat: 32.7767, lon: -96.7970 },   // Dallas
  { lat: 30.2672, lon: -97.7431 },   // Austin
  { lat: 25.7617, lon: -80.1918 },   // Miami
  { lat: 33.7490, lon: -84.3880 },   // Atlanta
  { lat: 47.6062, lon: -122.3321 },  // Seattle
  { lat: 39.7392, lon: -104.9903 },  // Denver
  { lat: 42.3601, lon: -71.0589 },   // Boston
  { lat: 36.1699, lon: -115.1398 },  // Las Vegas
  { lat: 37.7749, lon: -122.4194 },  // San Francisco
  { lat: 36.1627, lon: -86.7816 },   // Nashville
  { lat: 28.5384, lon: -81.3789 },   // Orlando
  { lat: 38.9072, lon: -77.0369 },   // Washington
]
// Une ville au hasard + léger décalage ~±0.03° (≈ quelques km).
function randomCityGps(list: LatLon[]): LatLon {
  const c = list[Math.floor(Math.random() * list.length)]
  const j = () => (Math.random() - 0.5) * 0.06
  return { lat: +(c.lat + j()).toFixed(4), lon: +(c.lon + j()).toFixed(4) }
}
export const randomFranceGps = (): LatLon => randomCityGps(FRANCE_CITIES)
export const randomUsGps = (): LatLon => randomCityGps(US_CITIES)

// Résout une clé de ville en coordonnées GPS pour runSpoof (null si « none »).
// 'france' / 'usa' → une position aléatoire du pays (différente à chaque appel).
export function gpsFor(key: string): LatLon | null {
  if (key === 'france') return randomFranceGps()
  if (key === 'usa') return randomUsGps()
  const c = GPS_CITIES.find(x => x.k === key)
  return !c || c.k === 'none' ? null : { lat: c.lat, lon: c.lon }
}
