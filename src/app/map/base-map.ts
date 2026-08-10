import { View } from 'ol';
import type { Coordinate } from 'ol/coordinate';
import BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import { OSM } from 'ol/source';
import { LKS92 } from './projection';

/** Visas Latvijas robežas mūsu projekcijā */
export const LATVIA_EXTENT = LKS92.getExtent();

/** Cik metru uz pikseli paliek, kad pietuvina izvēlēto adresi */
const ADDRESS_RESOLUTION = 0.25;
const FLIGHT_MS = 1200;
/** Ja jālido tālāk par šo (metros), karte vispirms attālinās un tad pietuvina */
const LONG_FLIGHT_M = 5000;

/** OSM pamatkarte ar mūsu slāņiem virsū, mērķa elementu piesien vēlāk */
export function createBaseMap(layers: BaseLayer[]): OlMap {
  return new OlMap({
    layers: [new TileLayer({ source: new OSM() }), ...layers],
    view: new View({
      projection: LKS92,
      center: fromLonLat([24.1133, 56.9514], LKS92),
      resolution: 0.5,
    }),
  });
}

/** Aizlido uz punktu, bet ja lietotājs negrib animācijas, pārlec uzreiz */
export function flyTo(view: View, center: Coordinate): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    view.setCenter(center);
    view.setResolution(ADDRESS_RESOLUTION);
    return;
  }
  const from = view.getCenter() ?? center;
  const distance = Math.hypot(center[0] - from[0], center[1] - from[1]);
  view.animate({ center, duration: FLIGHT_MS });
  if (distance < LONG_FLIGHT_M) {
    view.animate({ resolution: ADDRESS_RESOLUTION, duration: FLIGHT_MS });
  } else {
    // Pa ceļam attālinās, lai abi punkti ietilpst ekrānā, un tad pietuvina
    const overview = Math.max(view.getResolution() ?? 1, distance / 1000);
    view.animate(
      { resolution: overview, duration: FLIGHT_MS / 2 },
      { resolution: ADDRESS_RESOLUTION, duration: FLIGHT_MS / 2 },
    );
  }
}
