/** Dobes kopsavilkums apakšējam panelim, ko GardenMap saskaita no kartes */
export interface BedSummary {
  id: number;
  name: string;
  areaM2: number;
  plants: { name: string; family: string; color: string }[];
  filledCells: number;
  /** Režģa šūnas dobē, vai 0, ja režģis par lielu skaitīšanai */
  totalCells: number;
  /** Sezonā aizņemtie m², aprēķins ir bed-blocks.ts */
  usedM2: number;
  cellAreaM2: number;
}
