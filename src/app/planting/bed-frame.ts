/** Dobes pašas koordinātas ar asīm gar garāko malu, un backend BedFrame.java rēķina tieši tāpat */
export type Pt = [number, number];

export interface BedFrame {
  /** Pagrieziena leņķis grādos, tas pats, ko dobes lapā */
  angleDeg: number;
  ring: Pt[];
  width: number;
  height: number;
  /** Kartes kontūra, lai varētu pārrēķināt blokus no cita leņķa */
  mapRing: number[][];
  readonly minX: number;
  readonly minY: number;
  readonly ox: number;
  readonly oy: number;
  readonly cos: number;
  readonly sin: number;
}

/** Garākās malas leņķis grādos, noapaļots līdz desmitdaļai */
export function bedAngleDeg(ring: number[][]): number {
  // Izmēģina katras malas leņķi un ņem mazāko aptverošo taisnstūri
  let best = 0;
  let bestArea = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i][0] - ring[i - 1][0];
    const dy = ring[i][1] - ring[i - 1][1];
    if (Math.hypot(dx, dy) < 1e-6) continue;
    const a = Math.atan2(dy, dx);
    const cos = Math.cos(a), sin = Math.sin(a);
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const [x, y] of ring) {
      const rx = x * cos + y * sin;
      const ry = -x * sin + y * cos;
      mnx = Math.min(mnx, rx); mxx = Math.max(mxx, rx);
      mny = Math.min(mny, ry); mxy = Math.max(mxy, ry);
    }
    const area = (mxx - mnx) * (mxy - mny);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      best = a;
    }
  }
  const q = Math.PI / 2;
  let a = best - q * Math.round(best / q);
  if (a <= -Math.PI / 4) a += q;
  const deg = Math.round(((a * 180) / Math.PI) * 10) / 10;
  return Math.abs(deg) < 0.05 ? 0 : deg;
}

export function bedFrameOf(mapRing: number[][], angleDeg = bedAngleDeg(mapRing)): BedFrame {
  const minX = Math.min(...mapRing.map((c) => c[0]));
  const minY = Math.min(...mapRing.map((c) => c[1]));
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = mapRing.map(([x, y]) => {
    const dx = x - minX, dy = y - minY;
    return [dx * cos + dy * sin, -dx * sin + dy * cos] as Pt;
  });
  const ox = Math.min(...rot.map((p) => p[0]));
  const oy = Math.min(...rot.map((p) => p[1]));
  const ring = rot.map(([x, y]) => [x - ox, y - oy] as Pt);
  return {
    angleDeg,
    ring,
    width: Math.max(...ring.map((p) => p[0])),
    height: Math.max(...ring.map((p) => p[1])),
    mapRing,
    minX, minY, ox, oy, cos, sin,
  };
}

export function toLocal(f: BedFrame, [x, y]: number[]): Pt {
  const dx = x - f.minX, dy = y - f.minY;
  return [dx * f.cos + dy * f.sin - f.ox, -dx * f.sin + dy * f.cos - f.oy];
}

export function toMap(f: BedFrame, [u, v]: number[]): Pt {
  const rx = u + f.ox, ry = v + f.oy;
  return [f.minX + rx * f.cos - ry * f.sin, f.minY + rx * f.sin + ry * f.cos];
}

/** Taisnstūri pārvērš slēgtā kartes kontūrā */
export function rectToMap(f: BedFrame, x: number, y: number, w: number, h: number): number[][] {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  return pts.map((p) => toMap(f, p));
}
