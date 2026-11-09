// Localisations GPS proposées (écrites dans les métadonnées mp4 par le spoof).
// Source unique partagée par Studio et Auto-contenu (réexportée par studioTools). Module pur,
// testé dans gps.test.ts.
export interface GpsCity { k: string; label: string; lat: number; lon: number }
export const GPS_CITIES: GpsCity[] = [
  { k: 'none', label: 'Aucune (par défaut)', lat: 0, lon: 0 },
  { k: 'france', label: '🇫🇷 France (aléatoire)', lat: 46.6, lon: 2.2 },
  { k: 'usa', label: '🇺🇸 USA (aléatoire)', lat: 39.8, lon: -98.6 },
  { k: 'germany', label: '🇩🇪 Allemagne (aléatoire)', lat: 51.2, lon: 10.4 },
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
// Contour simplifié de l'Allemagne [lon, lat] : « Allemagne (aléatoire) » = un point au hasard
// n'importe où dans le pays (tirage dans le rectangle, gardé s'il tombe à l'intérieur du contour).
export const GERMANY_POLY: [number, number][] = [[8.6,54.9],[9.4,54.8],[10.1,54.4],[11.1,54.4],[10.9,53.95],[11.5,54.0],[12.1,54.2],[13.1,54.4],[13.4,54.6],[14.2,53.95],[14.4,53.3],[14.1,52.8],[14.6,52.6],[14.7,52.1],[14.6,51.6],[15.0,51.1],[14.3,50.9],[13.5,50.6],[12.5,50.3],[12.1,50.3],[12.5,49.8],[13.0,49.3],[13.8,48.8],[13.45,48.57],[12.9,47.7],[12.2,47.6],[11.0,47.4],[10.2,47.3],[9.6,47.5],[8.6,47.6],[7.6,47.6],[7.6,48.1],[8.2,48.97],[7.0,49.1],[6.4,49.5],[6.1,50.1],[6.1,50.6],[6.0,50.8],[6.1,51.2],[5.9,51.8],[6.8,51.95],[7.0,52.4],[7.1,52.9],[7.2,53.3],[7.0,53.6],[8.0,53.7],[8.5,53.55],[8.9,53.9],[8.9,54.3],[8.6,54.5]]
export function inPoly(lon: number, lat: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function randomGermanyGps(): LatLon {
  for (let k = 0; k < 1000; k++) {
    const lon = 5.9 + Math.random() * 9.1, lat = 47.3 + Math.random() * 7.6
    if (inPoly(lon, lat, GERMANY_POLY)) return { lat: +lat.toFixed(4), lon: +lon.toFixed(4) }
  }
  return { lat: 51.1657, lon: 10.4515 }
}

// Résout une clé de ville en coordonnées GPS pour runSpoof (null si « none »).
// 'france' / 'usa' / 'germany' → une position aléatoire du pays (différente à chaque appel).
export function gpsFor(key: string): LatLon | null {
  if (key === 'france') return randomFranceGps()
  if (key === 'usa') return randomUsGps()
  if (key === 'germany') return randomGermanyGps()
  const c = GPS_CITIES.find(x => x.k === key)
  return !c || c.k === 'none' ? null : { lat: c.lat, lon: c.lon }
}
