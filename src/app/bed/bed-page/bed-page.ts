import { AppIcon } from '../../ui/icon/icon';
import { itemIconUrl, plantIconUrl } from '../../ui/icons';
import { Component, computed, DestroyRef, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlantPicker } from '../../planting/plant-picker';
import { defaultGeometry, GardenItem, ITEM_DND_MIME, ItemApi, ItemEffects, ItemType } from '../../item/item-api';
import { affectsSeason } from '../../item/item-effects';
import { ItemPalette } from '../../item/item-palette';
import { problemDetail } from '../../shared/format';
import { readStored, writeStored } from '../../shared/storage';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Feature } from 'ol';
import { GardenApi } from '../../map/garden-map/garden-api';
import { getProps } from '../../map/garden-map/garden-object';
import {
  Block,
  blockDescription,
  blockFit,
  blockForPlant,
  blockInside,
  BASE_M,
  canPlace,
  cellOf,
  firstFreeBlock,
  GRID_MINOR_M,
  LARGE_PLANT_M,
  plantCenters,
  Pt,
  snap,
  SNAP_M,
  spacingOf,
  tryPlace,
} from '../../planting/bed-blocks';
import { BedGrid, Cell, cellKey, MAX_DIVISIONS } from '../../planting/bed-grid';
import { rectToMap, toMap } from '../../planting/bed-frame';
import {
  blockFields,
  boxOfPts,
  cellLines,
  Handle,
  localFootprint,
  resized,
  sameBlock,
  translateInFrame,
} from '../../planting/bed-geometry';
import { BedPlantings } from '../../planting/bed-plantings/bed-plantings';
import { familyColor, formatArea, formatMeters, Plant } from '../../planting/plant';
import { blockOf, Planting, PlantingInput, PlantingStore, toInput } from '../../planting/planting-store';
import { SpaceBar } from '../../planting/space-bar';
import { CollapsibleSection } from '../../ui/collapsible-section/collapsible-section';
import { SoilCard } from '../../soil/soil-card';

/** Režģa šūna SVG metros no dobes kreisā augšējā stūra */
interface CellView {
  cell: Cell;
  key: string;
  x: number;
  y: number;
  color: string | null;
  label: string;
  /** Pieder stādījumam, ko tagad krāso */
  mine: boolean;
}

/** Bloks zīmēšanai SVG, kur y iet uz leju */
interface BlockView {
  planting: Planting;
  plant: Plant | undefined;
  block: Block;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string | null;
  iconUrl: string | null;
  cols: number;
  rows: number;
  fits: number;
  count: number;
  /** Augu centri, lieliem augiem vēl aplis ar to aizņemto vietu */
  points: Pt[];
  /** Šūnu līnijas blokā, katrā šūnā viens augs */
  gridPath: string;
  iconSize: number;
  circleR: number | null;
  label: string;
  /** Īss uzraksts, ja ietilpst blokā */
  shortLabel: string | null;
  labelSize: number;
  /** Velkot iziet ārpus dobes vai pārklājas, tāpēc netiks saglabāts */
  invalid: boolean;
  /** Teksts ekrāna lasītājam */
  description: string;
}

interface Drag {
  id: number;
  handle: Handle;
  start: Pt;
  orig: Block;
  current: Block;
  /** Vai current ir dobē un nepārklājas */
  valid: boolean;
}

/** Vairāk ikonu nezīmē, jo tas ir lēni, bet skaits uzrakstā paliek pareizs */
const MAX_ICONS = 400;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Rokturu trāpīšanas laukums pikseļos pelei un skārienam */
const HIT_PX_FINE = 24;
const HIT_PX_COARSE = 44;
/** Roktura un uzraksta burtu izmērs ekrāna pikseļos */
const HANDLE_PX = 11;
const LABEL_PX = 12;
/** Malu rokturus rāda tikai pietiekami lielam blokam */
const EDGE_HANDLES_MIN_PX = 56;
const OUTSIDE_MSG = 'Outside the bed — not saved.';
const OVERLAP_MSG = 'Overlaps another block — not saved.';
/** Bultiņu virzieni dobes koordinātās, kur y iet uz ziemeļiem */
const ARROWS: Record<string, Pt> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

type Layer = 'plants' | 'protection';
const LAYER_KEY = 'darza-planotajs.bed-layer';

/** Sesijā atcerētais slānis, citādi augi */
function readLayer(): Layer {
  return readStored(LAYER_KEY, 'session') === 'protection' ? 'protection' : 'plants';
}

/** Dobes lapa ar augu blokiem un stādījumiem, dati kopīgi ar karti, tāpēc izmaiņas redzamas abās vietās */
@Component({
  selector: 'app-bed-page',
  imports: [AppIcon, BedPlantings, CollapsibleSection, RouterLink, SoilCard, SpaceBar, ItemPalette, PlantPicker],
  providers: [GardenApi, PlantingStore],
  templateUrl: './bed-page.html',
  styleUrls: ['./bed-page.scss', './bed-toolbar.scss'],
  host: { '(window:pointerup)': 'paintAdds = null' },
})
export class BedPage implements OnDestroy {
  protected readonly api = inject(GardenApi);
  protected readonly itemIcon = itemIconUrl;
  protected readonly plantings = inject(PlantingStore);
  protected readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  protected readonly maxDivisions = MAX_DIVISIONS;
  protected readonly Math = Math;
  protected readonly handles = HANDLES;
  protected readonly familyColor = familyColor;

  private readonly itemApi = inject(ItemApi);
  private readonly destroyRef = inject(DestroyRef);
  /** Dārza elementi un to ietekme uz stādījumiem */
  protected readonly itemTypes = signal<ItemType[]>([]);
  protected readonly items = signal<GardenItem[]>([]);
  protected readonly effects = signal<ItemEffects>({});
  private readonly gardenId = signal<number | null>(null);
  protected readonly protectionTypes = computed(() => this.itemTypes().filter(affectsSeason));
  /** Aizsardzības elementi virs dobes, punkta elements kļūst par kvadrātu un visu apgriež pēc dobes kontūras */
  protected readonly itemRects = computed(() => {
    const grid = this.grid();
    if (!grid) return [];
    const bf = grid.frame;
    const byKey = new Map(this.itemTypes().map((t) => [t.key, t]));
    const moving = this.itemDrag();
    return this.items().flatMap((src) => {
      const type = byKey.get(src.typeKey);
      if (!type || !affectsSeason(type)) return [];
      const item = moving?.id === src.id ? { ...src, geometry: moving.geometry } : src;
      const local = localFootprint(item.geometry, type, bf);
      if (!local.length) return [];
      const box = boxOfPts(local);
      if (box.maxX <= 0 || box.minX >= bf.width || box.maxY <= 0 || box.minY >= bf.height) return [];
      // Uzrakstu liek redzamajā daļā
      const x = Math.max(0, box.minX), w = Math.min(bf.width, box.maxX) - x;
      const top = Math.min(bf.height, box.maxY), h = top - Math.max(0, box.minY);
      return [{
        item, type, x, y: bf.height - top, w, h,
        points: local.map(([u, v]) => `${u},${bf.height - v}`).join(' '),
        name: item.label ?? type.nameEn,
      }];
    });
  });

  /** Velkamais elements, saglabā tikai atlaižot */
  protected readonly itemDrag = signal<{ id: number; geometry: string } | null>(null);

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  /** Pagrieztā grupa, caur kuru pārrēķina rādītāja vietu */
  private readonly content = viewChild<ElementRef<SVGGElement>>('content');
  private bedFeature: Feature | null = null;
  protected readonly grid = signal<BedGrid | null>(null);
  protected readonly name = signal('');
  protected readonly notFound = signal(false);
  protected readonly loadFailed = signal(false);
  /** Pirmā šūna izlemj, vai krāsošana pievieno vai notīra */
  protected paintAdds: boolean | null = null;

  /** Aktīvais slānis, ko atceras sesijā */
  protected readonly layer = signal<Layer>(readLayer());
  protected readonly selectedId = signal<number | null>(null);
  protected readonly selectedItemId = signal<number | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** Augs, ko velk no saraksta, un kur rādīt peldošo ikonu */
  protected readonly ghost = signal<{ plant: Plant; x: number; y: number; invalid: string | null } | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** Ekrāna lasītājam paziņo pēdējo bloka izmaiņu */
  protected readonly announcement = signal('');
  /** Cik ekrāna pikseļu ir vienā metrā */
  private readonly pxPerM = signal(0);
  /** Metri vienā pikselī, kamēr SVG nav izmērīts, pieņem 800 px platu skatu */
  protected readonly mPerPx = computed(() => {
    const px = this.pxPerM();
    const f = this.frame();
    return px ? 1 / px : f ? f.viewW / 800 : 0.01;
  });
  private readonly coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private resizeObserver?: ResizeObserver;
  /** Tastatūras izmaiņas, kas vēl gaida saglabāšanu */
  private readonly keySaves = new Map<number, { timer: ReturnType<typeof setTimeout>; input: PlantingInput }>();
  /** Vilkšanas klausītāji, ko noņem, aizejot no lapas */
  private readonly drags = new Set<AbortController>();

  /** Rēķina tikai, kad mainās režģis, jo turf ir lēns */
  private readonly fitting = computed(() => this.grid()?.all() ?? []);

  /** Dobi zīmē tās pašas rāmī, lai garākā mala būtu taisni pret ekrānu, un SVG y ir apgriezts */
  protected readonly frame = computed(() => {
    const grid = this.grid();
    if (!grid) return null;
    const bf = grid.frame;
    const { width, height } = bf;
    const pad = Math.max(width, height) * 0.01;
    return {
      bed: bf,
      rot: bf.angleDeg,
      viewBox: `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`,
      viewW: width + 2 * pad,
      viewH: height + 2 * pad,
      width,
      height,
      outline: bf.ring.map(([x, y]) => `${x},${height - y}`).join(' '),
      /** Kontūra ar y uz augšu bloku pārbaudēm */
      ring: bf.ring,
      areaM2: grid.geometry.getArea(),
      area: formatArea(grid.geometry.getArea()),
      size: `${formatMeters(width)} × ${formatMeters(height)} m`,
      /** Roktura izmērs metros */
      handle: Math.max(width, height) / 40,
    };
  });

  /** Režģi rāda tikai veciem šūnu stādījumiem */
  protected readonly hasLegacyCells = computed(
    () => !!this.plantings.painting() || this.plantings.forObject(this.id).some((p) => p.cells.length > 0),
  );

  protected readonly usedM2 = computed(() => {
    const grid = this.grid();
    return grid ? this.plantings.usedArea(this.id, grid.cellW * grid.cellH) : 0;
  });

  protected readonly cells = computed((): CellView[] => {
    const grid = this.grid();
    if (!grid || !this.hasLegacyCells()) return [];
    const plantById = this.plantings.plantById();
    const paintingId = this.plantings.painting()?.plantingId;
    const owner = new Map<string, { color: string; label: string; mine: boolean }>();
    for (const planting of this.plantings.forObject(this.id)) {
      const plant = plantById.get(planting.plantId);
      for (const cell of this.plantings.cellsOf(planting)) {
        owner.set(cellKey(cell), {
          color: familyColor(plant),
          label: plant?.nameEn.slice(0, 2) ?? '',
          mine: planting.id === paintingId,
        });
      }
    }
    // Nekrāsojot rāda tikai aizņemtās šūnas, lai tukšs režģis netraucē blokiem
    const painting = paintingId !== undefined;
    return this.fitting()
      .map((cell) => {
        const key = cellKey(cell);
        const taken = owner.get(key);
        return {
          cell,
          key,
          x: cell[0] * grid.cellW,
          y: (grid.rows - cell[1] - 1) * grid.cellH,
          color: taken?.color ?? null,
          label: taken?.label ?? '',
          mine: taken?.mine ?? false,
        };
      })
      .filter((c) => painting || c.color);
  });

  protected readonly blocks = computed((): BlockView[] => {
    const f = this.frame();
    if (!f) return [];
    const drag = this.drag();
    const plantById = this.plantings.plantById();
    return this.plantings.forObject(this.id).flatMap((planting) => {
      const block = drag?.id === planting.id ? drag.current : blockOf(planting, f.bed);
      if (!block) return [];
      const plant = plantById.get(planting.plantId);
      const fit = blockFit(plant, block);
      // Augu skaits vienmēr ir kolonnas reiz rindas
      const count = fit.total;
      const [sx, sy] = spacingOf(plant);
      const points = plantCenters(block, fit.cols, fit.rows)
        .slice(0, MAX_ICONS)
        .map(([x, y]) => [x, f.height - y] as Pt);
      const y = f.height - block.y - block.h;
      const gridPath = fit.total > MAX_ICONS ? '' : cellLines(block.x, y, block.w, block.h, fit.cols, fit.rows);
      const name = plant?.nameEn ?? 'Plant';
      const mpp = this.mPerPx();
      // Uzraksts nedrīkst būt par lielu blokam, garu tekstu saīsina
      const labelSize = Math.min(LABEL_PX * mpp, block.h * 0.22);
      const maxChars = Math.floor((block.w * 0.9) / (labelSize * 0.6));
      const full = `${name} · ${count}`;
      const shortLabel = labelSize < 7 * mpp || maxChars < 3 ? null
        : full.length <= maxChars ? full
        : name.length <= maxChars ? name
        : name.slice(0, maxChars - 1) + '…';
      const cell = Math.min(block.w / fit.cols, block.h / fit.rows);
      const invalid = drag?.id === planting.id && !drag.valid;
      return [
        {
          planting,
          plant,
          block,
          x: block.x,
          y,
          w: block.w,
          h: block.h,
          color: familyColor(plant),
          icon: plant?.icon ?? null,
          iconUrl: plantIconUrl(plant?.nameEn),
          cols: fit.cols,
          rows: fit.rows,
          fits: fit.total,
          count,
          points,
          gridPath,
          iconSize: Math.max(0, Math.min(cell * 0.6, ((block.h - (shortLabel ? labelSize * 1.4 : 0)) / fit.rows) * 0.7)),
          circleR: Math.max(sx, sy) >= LARGE_PLANT_M ? Math.min(sx, sy) / 2 : null,
          label: `${name} – ${fit.cols} × ${fit.rows} = ${count} plants`,
          shortLabel,
          labelSize,
          invalid,
          description: blockDescription(name, fit.cols, fit.rows, count, block),
        },
      ];
    });
  });

  /** Smalkais režģis tukšai dobei, lielai dobei retāks */
  protected readonly baseGrid = computed(() => {
    const f = this.frame();
    if (!f) return '';
    let step = GRID_MINOR_M;
    while (Math.max(f.width, f.height) / step > 200) step *= 5;
    const parts: string[] = [];
    for (let x = step; x < f.width - 1e-6; x += step) parts.push(`M${x.toFixed(3)} 0V${f.height.toFixed(3)}`);
    for (let y = step; y < f.height - 1e-6; y += step) parts.push(`M0 ${(f.height - y).toFixed(3)}H${f.width.toFixed(3)}`);
    return parts.join('');
  });

  protected readonly selected = computed(() => this.blocks().find((b) => b.planting.id === this.selectedId()) ?? null);

  protected readonly locked = computed(() => this.plantings.hasCells(this.id));

  /** Roktura neredzamais trāpīšanas laukums metros */
  protected readonly hitM = computed(() => (this.coarse ? HIT_PX_COARSE : HIT_PX_FINE) * this.mPerPx());
  /** Redzamā roktura izmērs metros */
  protected readonly handleM = computed(() => HANDLE_PX * this.mPerPx());

  /** Mazam blokam rāda tikai stūru rokturus, lai tie nepārklājas */
  protected handlesFor(view: BlockView): Handle[] {
    const minPx = Math.min(view.w, view.h) / this.mPerPx();
    return minPx >= EDGE_HANDLES_MIN_PX ? HANDLES : HANDLES.filter((h) => h.length === 2);
  }

  constructor() {
    // Seko SVG izmēram, lai rokturi būtu pikseļos, nevis metros
    effect((onCleanup) => {
      const el = this.svg()?.nativeElement;
      const f = this.frame();
      if (!el || !f || typeof ResizeObserver === 'undefined') return;
      const measure = () => {
        const r = el.getBoundingClientRect();
        this.pxPerM.set(Math.min(r.width / f.viewW, r.height / f.viewH) || 0);
      };
      this.resizeObserver = new ResizeObserver(measure);
      this.resizeObserver.observe(el);
      measure();
      onCleanup(() => this.resizeObserver?.disconnect());
    });
    this.itemApi.types().subscribe({ next: (t) => this.itemTypes.set(t), error: () => undefined });
    // Ietekmi pārlādē, kad mainās stādījumi vai elementi
    effect((onCleanup) => {
      const id = this.gardenId();
      const year = this.plantings.year();
      this.plantings.plantings();
      this.items();
      if (id === null) return;
      const sub = this.itemApi.effects(id, year).subscribe({ next: (e) => this.effects.set(e), error: () => this.effects.set({}) });
      onCleanup(() => sub.unsubscribe());
    });
    this.load();
  }

  /** Ielādē dārzu un dobi, arī atkārtojot pēc kļūdas */
  protected load(): void {
    this.loadFailed.set(false);
    // Kļūda atnāk kā tukša plūsma, tāpēc beigas bez vērtības arī nozīmē neveiksmi
    let loaded = false;
    this.api.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ garden, features }) => {
        loaded = true;
        this.onLoaded(garden.id, features);
      },
      error: () => this.loadFailed.set(true),
      complete: () => {
        if (!loaded) this.loadFailed.set(true);
      },
    });
  }

  private onLoaded(gardenId: number, features: Feature[]): void {
    this.plantings.setGarden(gardenId);
    this.gardenId.set(gardenId);
    this.itemApi.list(gardenId).subscribe({ next: (items) => this.items.set(items), error: () => undefined });
    const bed = features.find((f) => f.getId() === this.id && getProps(f).type === 'BED');
    if (!bed) {
      this.notFound.set(true);
      return;
    }
    this.bedFeature = bed;
    this.name.set(getProps(bed).name);
    this.grid.set(BedGrid.of(bed));
  }

  /** Pieliek vilkšanas klausītājus, ko noņem ar atgrieztā kontroliera abort */
  private listenDrag(
    move: (e: PointerEvent) => void,
    up: (e: PointerEvent) => void,
    cancel: (e: PointerEvent) => void = up,
  ): AbortController {
    const ctrl = new AbortController();
    this.drags.add(ctrl);
    ctrl.signal.addEventListener('abort', () => this.drags.delete(ctrl));
    const opts = { signal: ctrl.signal };
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerup', up, opts);
    window.addEventListener('pointercancel', cancel, opts);
    return ctrl;
  }

  // Augu saraksts un ievilkšana

  /** Sāk vilkt augu no saraksta */
  protected startPaletteDrag(plant: Plant, event: PointerEvent): void {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      moved = true;
      this.ghost.set({ plant, x: e.clientX, y: e.clientY, invalid: this.dropProblem(plant, e) });
    };
    const end = (e: PointerEvent) => {
      ctrl.abort();
      this.ghost.set(null);
      if (moved && e.type === 'pointerup') this.dropPlant(plant, e);
    };
    const ctrl = this.listenDrag(move, end);
  }

  /** Iemesls, kāpēc te nevar nomest, null nozīmē var, tukšs nozīmē ārpus plāna */
  private dropProblem(plant: Plant, event: PointerEvent): string | null {
    const rect = this.svg()?.nativeElement.getBoundingClientRect();
    if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return '';
    const point = this.toLocal(event);
    if (!point) return '';
    return this.problemOf(this.dropBlock(plant, point), this.otherBlocks(null));
  }

  /** Nometot liek 2 × 2 bloku, ja der, citādi 1 × 1 */
  private dropBlock(plant: Plant, point: Pt): Block {
    const f = this.frame();
    const big = blockForPlant(plant, point, 2, 2);
    if (f && canPlace(big, f.ring, this.otherBlocks(null))) return big;
    return blockForPlant(plant, point, 1, 1);
  }

  private dropPlant(plant: Plant, event: PointerEvent): void {
    const problem = this.dropProblem(plant, event);
    if (problem === '') return;
    if (problem) {
      this.notice.set(`${plant.nameEn}: ${problem} Drop it on a free spot inside the bed.`);
      return;
    }
    const point = this.toLocal(event);
    if (point) this.createBlock(plant, this.dropBlock(plant, point));
  }

  /** Null, ja bloks der, citādi paziņojuma teksts */
  private problemOf(block: Block, others: Block[]): string | null {
    const f = this.frame();
    if (!f) return OUTSIDE_MSG;
    if (canPlace(block, f.ring, others)) return null;
    return blockInside(block, f.ring) ? OVERLAP_MSG : OUTSIDE_MSG;
  }

  /** Pārslēdzot slāni, izvēle paliek tikai aktīvajā */
  protected setLayer(layer: Layer): void {
    if (this.layer() === layer) return;
    this.layer.set(layer);
    if (layer === 'plants') this.selectedItemId.set(null);
    else this.selectedId.set(null);
    writeStored(LAYER_KEY, layer, 'session');
  }

  /** Klikšķis uz auga ieliek to pirmajā brīvajā vietā */
  protected placeAnywhere(plant: Plant): void {
    const f = this.frame();
    if (!f) return;
    const block = firstFreeBlock(plant, f.bed, this.otherBlocks(null));
    if (block) {
      this.setLayer('plants');
      this.createBlock(plant, block);
    }
    else this.notice.set(`No free space for ${plant.nameEn} in this bed.`);
  }

  private createBlock(plant: Plant, block: Block): void {
    const f = this.frame()!;
    if (!canPlace(block, f.ring, this.otherBlocks(null))) {
      this.notice.set(`${plant.nameEn} does not fit there — drop it on a free spot inside the bed.`);
      return;
    }
    this.notice.set(null);
    this.announcement.set(`${plant.nameEn} placed at ${this.cm(block.x)} cm, ${this.cm(block.y)} cm.`);
    this.plantings.addBlock(this.id, plant, block, f.rot);
  }

  // Aizsardzības elementi virs dobes

  protected onItemDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes(ITEM_DND_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  protected onItemDrop(event: DragEvent): void {
    const type = this.itemTypes().find((t) => t.key === event.dataTransfer?.getData(ITEM_DND_MIME));
    const point = this.toLocal(event);
    if (!type || !point) return;
    event.preventDefault();
    this.placeItem(type, point);
  }

  /** Klikšķis paletē ieliek elementu dobes centrā */
  protected placeItemCenter(type: ItemType): void {
    const f = this.frame();
    if (f) this.placeItem(type, [f.width / 2, f.height / 2]);
  }

  private placeItem(type: ItemType, local: Pt): void {
    const grid = this.grid();
    const gardenId = this.gardenId();
    if (!grid || gardenId === null) return;
    const [mx, my] = toMap(grid.frame, local);
    // Laukuma elements iet paralēli dobei, nevis ziemeļiem
    const w = type.defaultWM ?? 1, h = type.defaultHM ?? 1;
    const geometry = type.shape === 'AREA'
      ? JSON.stringify({ type: 'Polygon', coordinates: [rectToMap(grid.frame, local[0] - w / 2, local[1] - h / 2, w, h)] })
      : defaultGeometry(type, mx, my);
    this.itemApi.create(gardenId, { typeKey: type.key, geometry, rotationDeg: 0, label: null })
      .subscribe({
        next: (item) => {
          this.notice.set(null);
          this.setLayer('protection');
          this.selectedItemId.set(item.id);
          this.items.update((list) => [...list, item]);
        },
        error: (error) => this.notice.set(problemDetail(error, `Could not place the ${type.nameEn.toLowerCase()}. Try again.`)),
      });
  }

  /** Velk elementu dobes robežās un saglabā, kad atlaiž */
  protected startItemDrag(item: GardenItem, type: ItemType, event: PointerEvent): void {
    if (event.button !== 0 || this.plantings.painting() || this.layer() !== 'protection') return;
    this.selectedItemId.set(item.id);
    const grid = this.grid();
    const local0 = this.toLocal(event);
    if (!grid || !local0) return;
    event.preventDefault();
    event.stopPropagation();
    const bf = grid.frame;
    const b = boxOfPts(localFootprint(item.geometry, type, bf));
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    let last = { dx: 0, dy: 0 };
    const move = (e: PointerEvent) => {
      const p = this.toLocal(e);
      if (!p) return;
      // Pārbīde paliek dobes robežās
      const du = clamp(snap(p[0] - local0[0]), -b.minX, bf.width - b.maxX);
      const dv = clamp(snap(p[1] - local0[1]), -b.minY, bf.height - b.maxY);
      last = { dx: du, dy: dv };
      this.itemDrag.set({ id: item.id, geometry: translateInFrame(item.geometry, bf, du, dv) });
    };
    const up = () => {
      ctrl.abort();
      const moved = this.itemDrag();
      this.itemDrag.set(null);
      if (!moved || (last.dx === 0 && last.dy === 0)) return;
      this.saveItemGeometry(item, moved.geometry);
    };
    const ctrl = this.listenDrag(move, up);
  }

  private saveItemGeometry(item: GardenItem, geometry: string): void {
    this.items.update((list) => list.map((i) => (i.id === item.id ? { ...i, geometry } : i)));
    this.itemApi.update(item.id, { typeKey: item.typeKey, geometry, rotationDeg: item.rotationDeg, label: item.label }).subscribe({
      next: (saved) => this.items.update((list) => list.map((i) => (i.id === saved.id ? saved : i))),
      error: (error) => {
        this.items.update((list) => list.map((i) => (i.id === item.id ? item : i)));
        this.notice.set(problemDetail(error, 'Could not move the item. Try again.'));
      },
    });
  }

  /** Bultiņas pārbīda elementu par 5 cm, Delete dzēš un Esc atceļ izvēli */
  protected onItemKey(item: GardenItem, type: ItemType, name: string, event: KeyboardEvent): void {
    if (this.layer() !== 'protection') return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeItem(item, name);
      return;
    }
    if (event.key === 'Escape') {
      this.selectedItemId.set(null);
      return;
    }
    const d = ARROWS[event.key];
    const grid = this.grid();
    if (!d || !grid) return;
    event.preventDefault();
    const bf = grid.frame;
    const b = boxOfPts(localFootprint(item.geometry, type, bf));
    const du = d[0] * SNAP_M, dv = d[1] * SNAP_M;
    if (b.minX + du < -1e-9 || b.maxX + du > bf.width + 1e-9 || b.minY + dv < -1e-9 || b.maxY + dv > bf.height + 1e-9) return;
    this.saveItemGeometry(item, translateInFrame(item.geometry, bf, du, dv));
    this.announcement.set(`${name} moved.`);
  }

  protected removeItem(item: GardenItem, name: string): void {
    if (!confirm(`Remove ${name}?`)) return;
    this.itemApi.delete(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        if (this.selectedItemId() === item.id) this.selectedItemId.set(null);
      },
      error: (error) => this.notice.set(problemDetail(error, 'Could not remove the item. Try again.')),
    });
  }

  // Bloka pārvietošana un izmēra maiņa

  protected startBlockDrag(view: BlockView, handle: Handle, event: PointerEvent): void {
    if (event.button !== 0 || this.plantings.painting() || this.layer() !== 'plants') return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedId.set(view.planting.id);
    const start = this.toLocal(event);
    if (!start) return;
    const others = this.otherBlocks(view.planting.id);
    this.drag.set({ id: view.planting.id, handle, start, orig: view.block, current: view.block, valid: true });
    // Notikumi nāk arī ārpus SVG, bet atjauno ne biežāk kā reizi kadrā
    const target = event.target as Element;
    try { target.setPointerCapture?.(event.pointerId); } catch { /* nav atbalsta */ }
    let pending: PointerEvent | null = null;
    let frameReq = 0;
    const flush = () => {
      frameReq = 0;
      if (pending) this.onDragMove(pending, others);
      pending = null;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      pending = e;
      if (!frameReq) frameReq = requestAnimationFrame(flush);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      ctrl.abort();
      try { target.releasePointerCapture?.(event.pointerId); } catch { /* jau atbrīvots */ }
      if (frameReq) cancelAnimationFrame(frameReq);
      if (e.type === 'pointerup') {
        pending = e;
        flush();
      }
      this.finishDrag(others, e.type === 'pointercancel');
    };
    const ctrl = this.listenDrag(move, up);
    ctrl.signal.addEventListener('abort', () => {
      if (frameReq) cancelAnimationFrame(frameReq);
      frameReq = 0;
    });
  }

  /** Bloks seko rādītājam arī ārpus dobes, tikai pievelkas pa 5 cm un atzīmē, vai der */
  private onDragMove(event: PointerEvent, others: Block[]): void {
    const drag = this.drag();
    const point = this.toLocal(event);
    if (!drag || !point) return;
    const planting = this.plantings.plantings().find((p) => p.id === drag.id);
    const cell = cellOf(planting ? this.plantings.plantById().get(planting.plantId) : undefined);
    const next = resized(drag.orig, drag.handle, point[0] - drag.start[0], point[1] - drag.start[1], cell);
    if (sameBlock(next, drag.current)) return;
    const problem = this.problemOf(next, others);
    this.drag.set({ ...drag, current: next, valid: !problem });
    this.notice.set(problem);
  }

  private finishDrag(others: Block[], cancelled = false): void {
    const drag = this.drag();
    this.drag.set(null);
    if (!drag) return;
    if (!drag.valid || cancelled) {
      // Sliktā vietā atgriež pēdējo saglabāto stāvokli
      this.notice.set(cancelled ? null : `${this.problemOf(drag.current, others)} Moved back to its last position.`);
      this.announcement.set('Not saved — block moved back.');
      return;
    }
    this.notice.set(null);
    if (sameBlock(drag.orig, drag.current)) return;
    const planting = this.plantings.plantings().find((p) => p.id === drag.id);
    if (!planting) return;
    const count = this.autoCount(planting, drag.current);
    this.commit(planting, drag.current, count);
    this.announce(planting, drag.current, count, drag.handle === 'move' ? 'Moved' : 'Resized');
  }

  /** Katrā šūnā ir viens augs */
  private autoCount(planting: Planting, block: Block): number {
    return blockFit(this.plantings.plantById().get(planting.plantId), block).total;
  }

  private cellFor(planting: Planting): Pt {
    return cellOf(this.plantings.plantById().get(planting.plantId));
  }

  // Tastatūra un forma

  /** Bultiņas pārbīda par 5 cm, ar Shift maina izmēru, Delete dzēš un Esc atceļ izvēli */
  protected onBlockKey(view: BlockView, event: KeyboardEvent): void {
    const f = this.frame();
    if (!f || this.layer() !== 'plants') return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeBlock(view);
      return;
    }
    if (event.key === 'Escape') {
      this.selectedId.set(null);
      return;
    }
    const d = ARROWS[event.key];
    if (!d) return;
    event.preventDefault();
    const b = view.block;
    const cell = this.cellFor(view.planting);
    // Ar Shift kustas labā vai augšējā mala par vienu auga šūnu
    const wanted = event.shiftKey
      ? { ...b, w: b.w + d[0] * cell[0], h: b.h + d[1] * cell[1] }
      : { ...b, x: b.x + d[0] * BASE_M, y: b.y + d[1] * BASE_M };
    const next = tryPlace(b, wanted, f.ring, this.otherBlocks(view.planting.id), f.width, f.height, cell);
    if (next === b) return;
    this.selectedId.set(view.planting.id);
    // Parāda uzreiz, bet saglabā mazliet vēlāk, lai katrs taustiņš nesūta pieprasījumu
    const count = this.autoCount(view.planting, next);
    const input = { ...toInput(view.planting), ...blockFields(next, f.rot), plantCount: count };
    this.plantings.plantings.update((list) => list.map((p) => (p.id === view.planting.id ? { ...p, ...input } : p)));
    const id = view.planting.id;
    clearTimeout(this.keySaves.get(id)?.timer);
    this.keySaves.set(id, { input, timer: setTimeout(() => this.flushKeySave(id), 400) });
    this.announce(view.planting, next, count, event.shiftKey ? 'Resized' : 'Moved');
  }

    private flushKeySave(id: number): void {
    const pending = this.keySaves.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.keySaves.delete(id);
    this.plantings.update(id, pending.input);
  }

  /** Formas lauki centimetros no dobes dienvidrietumu stūra */
  protected onFormInput(view: BlockView, field: 'x' | 'y' | 'w' | 'h', valueCm: number): void {
    if (!Number.isFinite(valueCm)) return;
    this.placeFromForm(view, { ...view.block, [field]: valueCm / 100 }, field === 'x' || field === 'y' ? 'Moved' : 'Resized',
      'That size or position does not fit — blocks must stay inside the bed and not overlap.');
  }

  /** Maina izmēru veselās šūnās, apakšējais kreisais stūris paliek uz vietas */
  protected onCellsInput(view: BlockView, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return;
    const cell = this.cellFor(view.planting);
    this.placeFromForm(view, { ...view.block, w: cols * cell[0], h: rows * cell[1] }, 'Resized',
      'That many plants do not fit here — blocks must stay inside the bed and not overlap.');
  }

  /** Ja bloks der, saglabā uzreiz, citādi paziņo un atstāj veco */
  private placeFromForm(view: BlockView, wanted: Block, verb: string, failMsg: string): void {
    const f = this.frame();
    if (!f) return;
    const next = tryPlace(view.block, wanted, f.ring, this.otherBlocks(view.planting.id), f.width, f.height, this.cellFor(view.planting));
    if (next === view.block) {
      this.notice.set(failMsg);
      return;
    }
    this.notice.set(null);
    const count = this.autoCount(view.planting, next);
    this.commit(view.planting, next, count);
    this.announce(view.planting, next, count, verb);
  }

  /** Dzēš uzreiz, bet 5 sekundes var atsaukt */
  protected removeBlock(view: BlockView): void {
    this.selectedId.set(null);
    this.plantings.removeWithUndo(view.planting.id, view.plant?.nameEn ?? 'Planting');
  }

  private announce(planting: Planting, block: Block, count: number, verb: string): void {
    const plant = this.plantings.plantById().get(planting.plantId);
    const fit = blockFit(plant, block);
    this.announcement.set(`${verb}: ${blockDescription(plant?.nameEn ?? 'Plant', fit.cols, fit.rows, count, block)}.`);
  }

  private commit(planting: Planting, block: Block, count: number): void {
    this.plantings.patch(planting.id, { ...toInput(planting), ...blockFields(block, this.frame()?.rot ?? 0), plantCount: count });
  }

  private otherBlocks(exceptId: number | null): Block[] {
    const bed = this.frame()?.bed;
    return this.plantings
      .forObject(this.id)
      .filter((p) => p.id !== exceptId)
      .flatMap((p) => blockOf(p, bed) ?? []);
  }

  /** Ekrāna punktu pārvērš dobes metros, y uz ziemeļiem */
  private toLocal(event: { clientX: number; clientY: number }): Pt | null {
    const el = this.content()?.nativeElement ?? this.svg()?.nativeElement;
    const f = this.frame();
    const ctm = el?.getScreenCTM();
    if (!ctm || !f) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [p.x, f.height - p.y];
  }

  protected handlePos(view: BlockView, handle: Handle): Pt {
    const x = handle.includes('w') ? view.x : handle.includes('e') ? view.x + view.w : view.x + view.w / 2;
    const y = handle.includes('n') ? view.y : handle.includes('s') ? view.y + view.h : view.y + view.h / 2;
    return [x, y];
  }

  protected cellW(view: BlockView): number {
    return cellOf(view.plant)[0];
  }

  protected cellH(view: BlockView): number {
    return cellOf(view.plant)[1];
  }

  protected cm(m: number): number {
    return Math.round(m * 100);
  }

  // Vecais šūnu režģis

  protected onCellDown(view: CellView, event: PointerEvent): void {
    const painting = this.plantings.painting();
    if (!painting) return;
    event.preventDefault();
    // Atlaiž rādītāju, lai skārienekrānā velkot citas šūnas arī saņem notikumus
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.paintAdds = !painting.cells.has(view.key);
    this.paint(view);
  }

  protected onCellEnter(view: CellView): void {
    if (this.paintAdds !== null) this.paint(view);
  }

  private paint(view: CellView): void {
    const painting = this.plantings.painting();
    if (!painting || this.plantings.takenCells(this.id, painting.plantingId).has(view.key)) return;
    this.plantings.paintCell(view.cell, this.paintAdds!);
  }

  protected onGridInput(cols: number, rows: number): void {
    const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_DIVISIONS;
    if (!this.bedFeature || !valid(cols) || !valid(rows) || this.locked()) return;
    this.bedFeature.setProperties({ gridCols: cols, gridRows: rows });
    this.api.update(this.bedFeature);
    this.grid.set(BedGrid.of(this.bedFeature));
  }

  /** Aizejot krāsošanas laikā, melnrakstu saglabā, nevis pazaudē */
  ngOnDestroy(): void {
    if (this.plantings.painting()) this.plantings.finishPaint();
    for (const id of [...this.keySaves.keys()]) this.flushKeySave(id);
    for (const ctrl of [...this.drags]) ctrl.abort();
    this.ghost.set(null);
    this.resizeObserver?.disconnect();
  }

  protected onNameChange(value: string): void {
    if (!this.bedFeature || !value.trim()) return;
    this.bedFeature.set('name', value.trim());
    this.name.set(value.trim());
    this.api.update(this.bedFeature);
  }
}
