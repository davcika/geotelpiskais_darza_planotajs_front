import { AppIcon } from '../../ui/icon/icon';
import { plantIconUrl } from '../../ui/icons';
import { ItemBadge } from '../../item/item-badge';
import type { ItemEffect, ItemEffects } from '../../item/item-api';
import { shiftedHint } from '../../item/item-view';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Polygon } from 'ol/geom';
import { map, Observable, of } from 'rxjs';
import { GardenApi } from '../../map/garden-map/garden-api';
import { familyColor, formatDate, isInSowWindow, Plant, sowingHint } from '../plant';
import { bedShapeOf, BedShape, firstFreeBlock } from '../bed-blocks';
import { blockOf, Planting, PlantingStore, toInput } from '../planting-store';
import { PacketPhotos } from '../../photo/packet-photos';
import { SpaceBar } from '../space-bar';
import { PlantPicker } from '../plant-picker';
import { PlantingUndoSnackbar } from '../undo-snackbar';
import { BedCompanions } from '../../companion/bed-companions';
import { CompanionStore, neighboursOf } from '../../companion/companions';

/** Stādījuma labošanas forma */
interface Draft {
  id: number;
  plant: Plant | null;
  sownOn: string;
  variety: string;
  note: string;
}

let nextUid = 0;

/** Dobes stādījumi sezonā, jauns augs nonāk pirmajā brīvajā vietā tāpat kā plānotājā */
@Component({
  selector: 'app-bed-plantings',
  imports: [AppIcon, PacketPhotos, SpaceBar, ItemBadge, PlantPicker, PlantingUndoSnackbar, BedCompanions],
  templateUrl: './bed-plantings.html',
  styleUrl: './bed-plantings.scss',
})
export class BedPlantings {
  protected readonly store = inject(PlantingStore);
  private readonly gardenApi = inject(GardenApi, { optional: true });
  /** Nav, kamēr jaunā dobe vēl saglabājas */
  readonly objectId = input<number | undefined>();
  /** Ja kontūra nav padota, to ielādē pie pirmās pievienošanas */
  readonly geometry = input<Polygon | undefined>();
  /** Krāsot var tikai dobes lapā un tikai vecos šūnu stādījumus */
  readonly paintable = input(false);
  /** Bez dobes laukuma vietas joslu nerāda */
  readonly areaM2 = input<number | undefined>();
  readonly cellAreaM2 = input(0);
  /** Elementu ietekmi padod tikai dobes lapa, karte ne */
  readonly effects = input<ItemEffects>({});
  /** Ja vecāks jau rāda virsrakstu, šeit tas paliek tikai ekrāna lasītājam */
  readonly showTitle = input(true);
  protected effectOf(planting: { id: number }): ItemEffect | undefined {
    return this.effects()[String(planting.id)];
  }
  protected readonly shiftedHint = shiftedHint;

  protected readonly usedM2 = computed(() => {
    const id = this.objectId();
    return id === undefined ? 0 : this.store.usedArea(id, this.cellAreaM2());
  });

  protected readonly familyColor = familyColor;
  protected hasIcon(p: Plant): boolean { return !!plantIconUrl(p.nameEn); }
  protected readonly sowingHint = sowingHint;
  protected readonly formatDate = formatDate;
  protected readonly draft = signal<Draft | null>(null);
  protected readonly picking = signal(false);
  protected readonly notice = signal<string | null>(null);
  /** Unikāli id, jo komponente lapā var būt vairākas reizes */
  protected readonly uid = `bp${++nextUid}`;
  private cachedShape: { id: number; shape: BedShape } | null = null;

  protected readonly plantings = computed(() => {
    const id = this.objectId();
    return id === undefined ? [] : this.store.forObject(id);
  });

  private readonly companions = inject(CompanionStore);
  /** Sezonas augi dobē kaimiņu pārbaudei */
  protected readonly plantIds = computed(() => [...new Set(this.plantings().map((p) => p.plantId))]);

  private neighbourNames(planting: Planting, relation: 'GOOD' | 'BAD'): string {
    return neighboursOf(planting.plantId, this.plantIds(), this.companions.pairs(), relation)
      .map((id) => this.store.plantById().get(id)?.nameEn ?? 'Plant')
      .join(', ');
  }
  protected badNames(planting: Planting): string { return this.neighbourNames(planting, 'BAD'); }
  protected goodNames(planting: Planting): string { return this.neighbourNames(planting, 'GOOD'); }

  protected readonly outsideWindow = computed(() => {
    const draft = this.draft();
    return !!draft?.plant && !!draft.sownOn && !isInSowWindow(draft.plant, draft.sownOn);
  });

  protected plant(planting: Planting): Plant | undefined {
    return this.store.plantById().get(planting.plantId);
  }

  protected shiftYear(delta: number): void {
    this.draft.set(null);
    this.picking.set(false);
    this.store.year.update((year) => year + delta);
  }

  protected startAdd(): void {
    this.notice.set(null);
    this.draft.set(null);
    this.picking.set(true);
  }

  protected startEdit(planting: Planting): void {
    this.picking.set(false);
    this.draft.set({
      id: planting.id,
      plant: this.plant(planting) ?? null,
      sownOn: planting.sownOn,
      variety: planting.variety ?? '',
      note: planting.note ?? '',
    });
  }

  /** Izvēlēto augu ieliek pirmajā brīvajā vietā kā dobes lapā */
  protected choose(plant: Plant): void {
    const objectId = this.objectId();
    if (objectId === undefined) return;
    this.shape(objectId).subscribe((shape) => {
      if (!shape) {
        this.notice.set('Could not read the bed shape. Open the bed planner to place plants.');
        return;
      }
      const others = this.store.forObject(objectId).flatMap((p) => blockOf(p, shape) ?? []);
      const block = firstFreeBlock(plant, shape, others);
      if (!block) {
        this.notice.set(`No free space for ${plant.nameEn} in this bed. Make room in the bed planner.`);
        return;
      }
      this.notice.set(`${plant.nameEn} added. Stretch its block in the bed planner to add more plants.`);
      this.picking.set(false);
      this.store.addBlock(objectId, plant, block, shape.angleDeg);
    });
  }

  protected remove(planting: Planting): void {
    this.store.removeWithUndo(planting.id, this.plant(planting)?.nameEn ?? 'Planting');
  }

  private shape(objectId: number): Observable<BedShape | null> {
    const given = this.geometry();
    if (given) return of(bedShapeOf(given.getCoordinates()[0]));
    if (this.cachedShape?.id === objectId) return of(this.cachedShape.shape);
    if (!this.gardenApi) return of(null);
    return this.gardenApi.load().pipe(
      map(({ features }) => {
        const geometry = features.find((f) => f.getId() === objectId)?.getGeometry();
        if (!(geometry instanceof Polygon)) return null;
        const shape = bedShapeOf(geometry.getCoordinates()[0]);
        this.cachedShape = { id: objectId, shape };
        return shape;
      }),
    );
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((draft) => (draft ? { ...draft, ...change } : draft));
  }

  protected save(): void {
    const draft = this.draft();
    if (!draft?.plant || !draft.sownOn) return;
    const existing = this.store.plantings().find((p) => p.id === draft.id);
    if (!existing) return;
    this.store.update(draft.id, {
      ...toInput(existing),
      sownOn: draft.sownOn,
      variety: draft.variety.trim() || null,
      note: draft.note.trim() || null,
    });
    this.draft.set(null);
  }
}
