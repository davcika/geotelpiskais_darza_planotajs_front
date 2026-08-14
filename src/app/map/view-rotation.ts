import type { Polygon } from 'ol/geom';

/** Pagriež karti tā, lai zona stāv taisni pret ekrānu, bet ne vairāk par 45°, lai ziemeļi paliek aptuveni augšā */
export function straightenRotation(zone: Polygon): number {
  const ring = zone.getCoordinates()[0] ?? [];
  let best = 0;
  let bestArea = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    if (Math.hypot(dx, dy) < 1e-6) continue;
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      best = angle;
    }
  }
  // Taisnstūris pēc 90° izskatās tāpat, tāpēc pietiek ar pagriezienu līdz 45° uz katru pusi
  const quarter = Math.PI / 2;
  let a = best - quarter * Math.round(best / quarter);
  if (a <= -Math.PI / 4) a += quarter;
  // OL griež karti pretējā virzienā, tāpēc šis leņķis malu noliek tieši horizontāli
  return Math.abs(a) < 1e-4 ? 0 : a;
}

/** Taisnstūris, kas izskatās taisns uz ekrāna arī tad, ja karte ir pagriezta */
export function screenAlignedBox(start: number[], end: number[], rotation: number): number[][] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // Pārejam uz ekrāna asīm un pēc tam atpakaļ uz karti
  const toLocal = ([x, y]: number[]) => [x * cos + y * sin, -x * sin + y * cos];
  const toMap = ([u, v]: number[]) => [u * cos - v * sin, u * sin + v * cos];
  const [u0, v0] = toLocal(start);
  const [u1, v1] = toLocal(end);
  const ring = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(toMap);
  return [...ring, ring[0]];
}
