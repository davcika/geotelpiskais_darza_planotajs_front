/** Atceras pārlūkā, kā lietotājs sakārtoja kartes lapu */
import { readStored, writeStored } from '../../shared/storage';

export type BedTab = 'plantings' | 'soil';
export const BED_TAB_KEY = 'darza-planotajs.bed-tab';
export const WIDE_QUERY = '(min-width: 900px)';

const DASH_WIDTH_KEY = 'darza-planotajs.dash-width';
const DASH_MIN = 320;
const DASH_MAX = 560;
const MAP_SHARE_KEY = 'darza-planotajs.map-share';
const SHARE_MIN = 20;
const SHARE_MAX = 85;

// Privātajā režīmā glabātuves var nebūt, tad iestatījumi pazūd pēc pārlādes
const read = (key: string) => readStored(key);
const save = (key: string, value: string) => writeStored(key, value);

/** Ja saglabātā vērtība ir dīvaina, ņem noklusējumu */
function readNumber(key: string, min: number, max: number, fallback: number): number {
  const stored = Number(read(key));
  return stored >= min && stored <= max ? stored : fallback;
}

export function readTab<T extends string>(key: string, allowed: T[], fallback: T): T {
  const stored = read(key) as T | null;
  return stored && allowed.includes(stored) ? stored : fallback;
}

export function saveTab(key: string, tab: string): void {
  save(key, tab);
}

export function clampDash(width: number): number {
  return Math.round(Math.min(DASH_MAX, Math.max(DASH_MIN, width)));
}

export function readDashWidth(): number {
  return readNumber(DASH_WIDTH_KEY, DASH_MIN, DASH_MAX, 420);
}

export function saveDashWidth(width: number): void {
  save(DASH_WIDTH_KEY, String(width));
}

export function clampShare(share: number): number {
  return Math.min(SHARE_MAX, Math.max(SHARE_MIN, share));
}

export function readMapShare(): number {
  return readNumber(MAP_SHARE_KEY, SHARE_MIN, SHARE_MAX, 55);
}

export function saveMapShare(share: number): void {
  save(MAP_SHARE_KEY, String(Math.round(share)));
}

/** Atgriež funkciju, kas aptur vilkšanu bez end, ja komponents pazūd vilkšanas laikā */
export function startDrag(event: PointerEvent, move: (e: PointerEvent) => void, end: () => void, onStop: () => void): () => void {
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onStop();
  };
  const up = () => {
    stop();
    end();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  event.preventDefault();
  return stop;
}
