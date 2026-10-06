import booleanWithin from '@turf/boolean-within';
import { Feature } from 'ol';
import GeoJSON from 'ol/format/GeoJSON';
import { Polygon } from 'ol/geom';
import { getProps } from '../map/garden-map/garden-object';
import { BedFrame, bedFrameOf, rectToMap, toLocal } from './bed-frame';

/** Šūna kā kolonna un rinda dobes rāmī */
export type Cell = [number, number];

/** Tādas pašas robežas kā datubāzē un backend pieprasījumā */
export const MAX_DIVISIONS = 100;
/** Bez lietotāja dalījuma šūnas ir ap 30 cm, tāpat kā BedGrid.java */
const DEFAULT_CELL_M = 0.3;
/** Vairāk šūnu nerāda, jo tas ir lēni un nesalasāmi */
const MAX_GRID_CELLS = 2500;

const geoJson = new GeoJSON();

export const cellKey = ([col, row]: Cell) => `${col},${row}`;

export function defaultDivisions(lengthM: number): number {
  return Math.min(MAX_DIVISIONS, Math.max(1, Math.round(lengthM / DEFAULT_CELL_M)));
}

/** Dobes rāmis sadalīts šūnās, der tikai tās, kas pilnībā ir dobē, tāpat kā BedGrid.java */
export class BedGrid {
  readonly cellW: number;
  readonly cellH: number;
  readonly frame: BedFrame;

  constructor(
    readonly geometry: Polygon,
    readonly cols: number,
    readonly rows: number,
  ) {
    this.frame = bedFrameOf(geometry.getCoordinates()[0]);
    this.cellW = this.frame.width / cols;
    this.cellH = this.frame.height / rows;
  }

  static of(bed: Feature): BedGrid {
    const geometry = bed.getGeometry() as Polygon;
    const frame = bedFrameOf(geometry.getCoordinates()[0]);
    const { gridCols, gridRows } = getProps(bed);
    return new BedGrid(geometry, gridCols ?? defaultDivisions(frame.width), gridRows ?? defaultDivisions(frame.height));
  }

  polygon([col, row]: Cell): Polygon {
    return new Polygon([rectToMap(this.frame, col * this.cellW, row * this.cellH, this.cellW, this.cellH)]);
  }

  at([x, y]: number[]): Cell {
    const [u, v] = toLocal(this.frame, [x, y]);
    return [Math.floor(u / this.cellW), Math.floor(v / this.cellH)];
  }

  fits(cell: Cell): boolean {
    const [col, row] = cell;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return booleanWithin(
      geoJson.writeGeometryObject(this.polygon(cell)) as GeoJSON.Polygon,
      geoJson.writeGeometryObject(this.geometry) as GeoJSON.Polygon,
    );
  }

  /** Dobē ietilpstošās šūnas, tukšs, ja to ir par daudz */
  all(): Cell[] {
    if (this.cols * this.rows > MAX_GRID_CELLS) return [];
    const cells: Cell[] = [];
    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        if (this.fits([col, row])) cells.push([col, row]);
      }
    }
    return cells;
  }
}
