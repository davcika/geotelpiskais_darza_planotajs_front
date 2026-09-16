import { transform } from 'ol/proj';
import { getCenter } from 'ol/extent';
import { LKS92 } from '../map/projection';
import { readZone } from '../map/zone';

/** Pārvērš EPSG 3059 koordinātas uz platumu un garumu WGS84 */
export function toLatLon(east: number, north: number): [number, number] {
  const [lon, lat] = transform([east, north], LKS92, 'EPSG:4326');
  return [lat, lon];
}

/** Dārza zonas centrs WGS84 vai null, ja zonas nav */
export function zoneCenterLatLon(hubGeometry: string | null): [number, number] | null {
  if (!hubGeometry) return null;
  const [east, north] = getCenter(readZone(hubGeometry).getExtent());
  return toLatLon(east, north);
}

/** Pārbauda pašu ievadītos datumus, pavasara salnai jābūt pirms rudens salnas */
export function frostProblem(last: string, first: string): string | null {
  const ok = /^\d{2}-\d{2}$/;
  if (!ok.test(last) || !ok.test(first)) return 'Pick both dates';
  if (last >= first) return 'Last spring frost must be before first autumn frost';
  return null;
}

/** Datuma lauka vērtība pārvērsta mēnesī un dienā, gads te nav svarīgs */
export const dateToMonthDay = (value: string) => (value.length >= 10 ? value.slice(5, 10) : '');
export const monthDayToDate = (mmdd: string | null | undefined) => (mmdd ? `2001-${mmdd}` : '');
