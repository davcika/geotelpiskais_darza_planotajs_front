import { AfterViewInit, Component, computed, DestroyRef, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import { Router, RouterLink } from '@angular/router';
import { Collection, Feature } from 'ol';
import { click } from 'ol/events/condition';
import type { FeatureLike } from 'ol/Feature';
import { Geometry, Point, Polygon } from 'ol/geom';
import { Observable, Subscription } from 'rxjs';
import { Draw, Modify, Select, Snap, Translate } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { AuthService } from '../../auth/auth.service';
import { CatalogApi } from '../../catalog/catalog-api';
import { SoilCard } from '../../soil/soil-card';
import { TourService } from '../../tour/tour.service';
import { Menu } from '../../ui/menu/menu';
import { GardenDto, GardenStore } from '../../garden/garden-store';
import { problemDetail } from '../../shared/format';
import { GardenSwitcher } from '../../garden/garden-switcher';
import { BedSummary } from '../../dashboard/bed-summary';
import { GardenDashboard } from '../../dashboard/garden-dashboard';
import { BedPlantings } from '../../planting/bed-plantings/bed-plantings';
import { BedGrid } from '../../planting/bed-grid';
import { familyColor, formatMeters, Plant } from '../../planting/plant';
import { blockOf, Planting, PlantingStore } from '../../planting/planting-store';
import { fromExtent } from 'ol/geom/Polygon';
import { CrownWarning, crownRadiusAt, findCrownConflicts, isWoody, matureRadius, projectedCrownRadius } from '../crown';
import { bareMonths, bareWarning, combineLooks, Look, lookColor, MONTHS, plantingLook, treeLook } from '../season';
import { createBaseMap } from '../base-map';
import { screenAlignedBox, straightenRotation } from '../view-rotation';
import { finishDrawing, handleDrawKeys, BOX_DRAW_HINT, isTyping, LINE_DRAW_HINT, POLYGON_DRAW_HINT, undoPoint } from '../draw-keys';
import { DrawBar } from '../draw-bar/draw-bar';
import { TreePicker } from '../tree-picker/tree-picker';
import { MapEntry, ObjectList } from '../object-list/object-list';
import { ViewOptions } from '../view-options/view-options';
import { BedSizeDialog } from '../bed-size-dialog';
import { getUid } from 'ol/util';
import {
  createMask,
  isInsideZone,
  markOutside,
  maskStyle,
  readZone,
  withOutsideHighlight,
  writeZone,
  zoneProblem,
  zoneStyle,
} from '../zone';
import { GardenApi } from './garden-api';
import { attachMapTooltip, plantingBlockFeature } from '../bed-overlay';
import { crownRadius, DEFAULT_CROWN_RADIUS_M, DEFAULT_NAME, GardenObjectProps, getProps, ObjectType } from './garden-object';
import { bedStyle, selectedStyle, treeStyle } from './garden-styles';
import { defaultGeometry, GardenItem, ITEM_DND_MIME, ItemApi, ItemType, itemInput } from '../../item/item-api';
import { ItemPalette } from '../../item/item-palette';
import { AppIcon } from '../../ui/icon/icon';
import { onIconLoad, plantIconUrl, preloadAllIcons } from '../../ui/icons';
import { isItemFeature, itemGeometryJson, itemStyleFn, itemToFeature } from './item-styles';
import { BED_TAB_KEY, BedTab, clampDash, clampShare, readDashWidth, readMapShare, readTab, saveDashWidth, saveMapShare, saveTab, startDrag, WIDE_QUERY } from './layout-prefs';

type MapMode = 'select' | 'draw-bed' | 'draw-bed-free' | 'draw-tree' | 'edit-zone' | 'place-item' | 'draw-line';

const OUTSIDE_ZONE = 'Objects must be inside your zone';
const ITEMS_FAILED = 'Could not load garden items.';
const GRID_LOCKED = 'Clear the painted cells before changing the shape of this bed';

/** Stilus kešojam pa krāsām, jo krāsojot renderCells sauc ļoti bieži */
const cellStyles = new Map<string, Style>();
function cellStyle(color: string): Style {
  let style = cellStyles.get(color);
  if (!style) {
    style = new Style({
      fill: new Fill({ color: `${color}cc` }),
      stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.8)', width: 0.75 }),
    });
    cellStyles.set(color, style);
  }
  return style;
}

/** Vajag tikai veciem šūnu stādījumiem, lai saskaitītu aizņemto vietu */
function cellAreaOf(bed: Feature): number {
  const grid = BedGrid.of(bed);
  return grid.cellW * grid.cellH;
}

const gridStyle = new Style({ stroke: new Stroke({ color: 'rgba(60, 45, 20, 0.3)', width: 0.75 }) });

@Component({
  selector: 'app-garden-map',
  imports: [BedPlantings, GardenDashboard, GardenSwitcher, RouterLink, Menu, SoilCard, ItemPalette, AppIcon, DrawBar, TreePicker, ObjectList, ViewOptions, BedSizeDialog],
  providers: [GardenApi, PlantingStore],
  templateUrl: './garden-map.html',
  styleUrls: ['./garden-map.scss', './map-panel.scss', './map-overlays.scss'],
  host: { '(document:keydown)': 'onKeyDown($event)' },
})
export class GardenMap implements AfterViewInit, OnDestroy {
  @ViewChild('mapHost', { static: true }) mapHost!: ElementRef<HTMLDivElement>;
  protected readonly api = inject(GardenApi);
  protected readonly plantings = inject(PlantingStore);
  protected readonly auth = inject(AuthService);
  private readonly gardens = inject(GardenStore);
  private readonly router = inject(Router);
  protected readonly tour = inject(TourService);
  private readonly catalog = inject(CatalogApi);
  private readonly itemApi = inject(ItemApi);
  private readonly destroyRef = inject(DestroyRef);
  /** Tos noņem ngOnDestroy */
  private readonly olKeys: (EventsKey | EventsKey[])[] = [];
  /** Ja komponents pazūd vilkšanas vidū, klausītājus noņem ar šo */
  private stopResize?: () => void;
  /** Lai dubultklikšķis neizveido vai neizdzēš elementu divreiz */
  protected readonly itemBusy = signal(false);
  protected readonly zoneSaving = signal(false);

  // Dārza elementi kā siltumnīca, lecekts vai žogs
  protected readonly itemTypes = signal<ItemType[]>([]);
  protected readonly gardenItems = signal<GardenItem[]>([]);
  protected readonly paletteOpen = signal(false);
  /** Ko noliks nākamais klikšķis kartē */
  protected readonly placingType = signal<ItemType | null>(null);
  protected readonly selectedItem = signal<GardenItem | null>(null);
  protected readonly selectedItemType = computed(() => this.typeOf(this.selectedItem()?.typeKey));
  private readonly typeByKey = computed(() => new Map(this.itemTypes().map((t) => [t.key, t])));
  private typeOf(key: string | undefined): ItemType | undefined {
    return key ? this.typeByKey().get(key) : undefined;
  }

  /** Tikai admins redz augu pārskatīšanu izvēlnē */
  protected readonly isAdmin = signal(false);
  /** Pārlūks atceras, kura cilne bija vaļā */
  protected readonly bedTab = signal<BedTab>(readTab(BED_TAB_KEY, ['plantings', 'soil'], 'plantings'));
  protected readonly warningCount = computed(() => this.crownWarnings().length + this.bareWarnings().length);
  protected readonly viewChip = computed(() => {
    const parts: string[] = [];
    const month = this.seasonMonth();
    if (month !== null) parts.push(`Season: ${this.months[month]}`);
    if (this.yearsAhead()) parts.push(`Trees +${this.yearsAhead()}y`);
    return parts.length ? parts.join(' · ') : null;
  });

  protected readonly mode = signal<MapMode>('select');
  protected readonly selectedName = signal<string | null>(null);
  protected readonly selectedCrownRadius = signal<number | null>(null);
  /** Nav definēts, ja izvēlēta nav dobe vai tā vēl nav saglabāta */
  protected readonly selectedBedId = signal<number | undefined>(undefined);
  protected readonly bedSummaries = signal<BedSummary[]>([]);
  /** Cik procentu no augstuma aizņem karte, pārlūks to atceras */
  protected readonly mapShare = signal(readMapShare());
  /** Platā ekrānā panelis ir blakus kartei */
  protected readonly wide = signal(typeof matchMedia === 'function' && matchMedia(WIDE_QUERY).matches);
  protected readonly dashWidth = signal(readDashWidth());
  private mapResizeObserver?: ResizeObserver;
  private wideQuery?: MediaQueryList;
  private readonly onWideChange = (e: MediaQueryListEvent) => this.wide.set(e.matches);
  /** Piemēram, kāpēc objektu nevarēja pārvietot */
  protected readonly notice = signal<string | null>(null);
  /** Ja null, zonu var saglabāt */
  protected readonly zoneProblemText = signal<string | null>(null);
  private selectedFeature: Feature | null = null;
  private garden: GardenDto | null = null;
  private zone: Polygon | null = null;
  /** Lai Cancel var atjaunot veco zonu */
  private zoneBeforeEdit: Polygon | null = null;
  /** Lai objektu var nolikt atpakaļ, ja to izvelk ārpus zonas */
  private readonly geometryBeforeEdit = new Map<Feature, Geometry>();

  // Koka vainags un gadalaiku skats
  protected readonly months = MONTHS;
  /** Ar null rāda parasto skatu ar dzimtu krāsām */
  protected readonly seasonMonth = signal<number | null>(null);
  /** Ar nulli rāda saglabāto vainaga izmēru */
  protected readonly yearsAhead = signal(0);
  /** Izaugsmes slīdnis maina tikai kokus ar zināmu pieaugušo izmēru */
  protected readonly growableTrees = signal(0);
  private readonly crownDetails = signal<ObjectWarning[]>([]);
  private readonly bareDetails = signal<ObjectWarning[]>([]);
  protected readonly crownWarnings = computed(() => this.crownDetails().map((w) => w.text));
  protected readonly bareWarnings = computed(() => this.bareDetails().map((w) => w.text));
  /** Signāls vajadzīgs, jo selectedFeature pats nav reaktīvs */
  private readonly selectedRef = signal<Feature | null>(null);
  protected readonly panelWarnings = computed(() => {
    const feature = this.selectedRef();
    if (!feature) return [];
    return [...this.crownDetails(), ...this.bareDetails()].filter((w) => w.features.includes(feature)).map((w) => w.text);
  });

  protected readonly loaded = signal(false);
  private readonly bedCount = signal(0);
  protected readonly emptyGarden = computed(() => this.loaded() && this.bedCount() === 0);
  /** Kļūst true pēc pirmā punkta */
  private readonly sketching = signal(false);
  protected readonly drawing = computed(() => this.mode() !== 'select');
  protected readonly createdBedId = signal<number | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  protected readonly bedSizeOpen = signal(false);
  protected readonly listView = signal(false);
  private readonly objectEntries = signal<MapEntry[]>([]);
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly mapEntries = computed(() => [
    ...this.objectEntries(),
    ...this.itemFeatureEntries(),
  ]);
  private readonly itemFeatureEntries = signal<MapEntry[]>([]);
  protected readonly drawBar = computed<DrawBarState | null>(() => {
    const type = this.placingType();
    switch (this.mode()) {
      case 'draw-bed':
        return { mode: 'Drawing bed', instruction: BOX_DRAW_HINT, finish: null, finishDisabled: false, undo: false };
      case 'draw-bed-free':
        return { mode: 'Drawing custom bed', instruction: POLYGON_DRAW_HINT, finish: 'Finish', finishDisabled: !this.sketching(), undo: this.sketching() };
      case 'draw-line':
        return { mode: `Drawing ${type?.nameEn.toLowerCase() ?? 'line'}`, instruction: LINE_DRAW_HINT, finish: 'Finish', finishDisabled: !this.sketching(), undo: this.sketching() };
      case 'draw-tree':
        return { mode: 'Placing tree', instruction: 'Click the map where the tree stands.', finish: null, finishDisabled: false, undo: false };
      case 'place-item':
        return { mode: `Placing ${type?.nameEn.toLowerCase() ?? 'item'}`, instruction: 'Click the map to place it.', finish: null, finishDisabled: false, undo: false };
      case 'edit-zone':
        return { mode: 'Editing zone', instruction: 'Drag the corners of your zone. Drag an edge to add a corner.', finish: 'Save zone', finishDisabled: this.zoneProblemText() !== null, undo: false };
      default:
        return null;
    }
  });
  protected readonly selectedPlantId = signal<number | null>(null);
  protected readonly selectedPlantedYear = signal<number | null>(null);
  protected readonly woodyPlants = computed(() =>
    this.plantings
      .plants()
      .filter(isWoody)
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn, 'en')),
  );
  protected readonly matureHint = computed(() => {
    const plant = this.plantings.plantById().get(this.selectedPlantId() ?? -1);
    const radius = plant ? matureRadius(plant) : null;
    if (!plant || radius === null) return null;
    const years = plant.yearsToMature ? ` in ~${plant.yearsToMature} years` : '';
    const height = plant.heightM ? `, height ~${formatMeters(plant.heightM)} m` : '';
    return `Mature crown Ø ${formatMeters(radius * 2)} m${years}${height}`;
  });
  /** Pagājušā gada daudzgadīgie un ziemā augošie vēl ir redzami šogad */
  private readonly earlierPlantings = signal<Planting[]>([]);
  private readonly gardenId = signal<number | null>(null);
  private earlierLoading?: Subscription;

  private readonly bedSource = new VectorSource();
  private readonly bedLayer = new VectorLayer({ source: this.bedSource, style: withOutsideHighlight(bedStyle) });
  private readonly treeSource = new VectorSource();
  private readonly treeLayer = new VectorLayer({ source: this.treeSource, style: withOutsideHighlight(treeStyle) });
  private readonly zoneSource = new VectorSource();
  private readonly maskSource = new VectorSource();
  private readonly cellsSource = new VectorSource();
  private readonly gridSource = new VectorSource();
  private readonly itemSource = new VectorSource();
  private readonly itemLayer = new VectorLayer({ source: this.itemSource, style: itemStyleFn((k) => this.typeOf(k)) });
  private readonly itemSelectedStyle = itemStyleFn((k) => this.typeOf(k), true);

  private readonly map = createBaseMap([
    new VectorLayer({ source: this.maskSource, style: maskStyle }),
    new VectorLayer({ source: this.zoneSource, style: zoneStyle }),
    // Šūnas liekam zem dobēm, lai dobju uzraksti paliek virspusē
    new VectorLayer({ source: this.cellsSource }),
    this.bedLayer,
    new VectorLayer({ source: this.gridSource, style: gridStyle }),
    this.itemLayer,
    this.treeLayer,
  ]);

  // Draw bez avota, jo objektu pievienojam paši un tikai tad, ja tas ir zonā
  /** Taisnstūris stāv taisni pret ekrānu, stūrus pēc tam var pavilkt */
  private readonly drawBed = new Draw({
    type: 'Circle',
    geometryFunction: (coords, geometry) => {
      const [start, end] = coords as number[][];
      const ring = screenAlignedBox(start, end, this.map.getView().getRotation());
      if (!geometry) return new Polygon([ring]);
      (geometry as Polygon).setCoordinates([ring]);
      return geometry;
    },
  });
  private readonly drawBedFree = new Draw({ type: 'Polygon' });
  private readonly drawTree = new Draw({ type: 'Point' });
  /** Līnijas elementi kā žogs vai laistīšanas caurule */
  private readonly drawLine = new Draw({ type: 'LineString' });
  private readonly select = new Select({
    layers: [this.bedLayer, this.treeLayer, this.itemLayer],
    condition: click,
    style: (feature, resolution) =>
      isItemFeature(feature) ? this.itemSelectedStyle(feature, resolution) : selectedStyle(feature, resolution),
  });
  private readonly translate = new Translate({ features: this.select.getFeatures() });
  private readonly modify = new Modify({ features: this.select.getFeatures() });
  private readonly modifyZone = new Modify({ source: this.zoneSource });
  private readonly snap = new Snap({ source: this.bedSource });

  constructor() {
    // Kad ikona ielādējas, pārzīmējam slāņus, citādi tā parādītos tikai pēc kartes pabīdīšanas
    const offIcons = onIconLoad(() => {
      this.bedLayer.changed();
      this.treeLayer.changed();
      this.itemLayer.changed();
      this.cellsSource.changed();
    });
    this.destroyRef.onDestroy(offIcons);
    preloadAllIcons();
    this.catalog.isAdmin().pipe(takeUntilDestroyed()).subscribe({ next: (r) => this.isAdmin.set(r.admin), error: () => this.isAdmin.set(false) });
    this.itemApi.types().pipe(takeUntilDestroyed()).subscribe({
      next: (types) => {
        this.itemTypes.set(types);
        this.itemLayer.changed();
      },
      error: () => {
        this.itemTypes.set([]);
        this.notice.set(ITEMS_FAILED);
      },
    });
    // Dobes krāsa ir pēc pirmā auga dzimtas izvēlētajā sezonā
    effect(() => this.labelBeds());
    effect(() => {
      const gardenId = this.gardenId();
      const year = this.plantings.year();
      if (gardenId === null) return;
      this.earlierLoading?.unsubscribe();
      this.earlierLoading = this.api.plantingsOf(gardenId, year - 1).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((list) => this.earlierPlantings.set(list));
    });
  }

  /** Stils pēc tam nolasa tint un plantLabel */
  private labelBeds(): void {
    const plantById = this.plantings.plantById();
    const byObject = new Map<number, string[]>();
    const tint = new Map<number, string>();
    const month = this.seasonMonth();
    for (const planting of this.plantings.plantings()) {
      const plant = plantById.get(planting.plantId);
      if (!plant) continue;
      byObject.set(planting.objectId, [...(byObject.get(planting.objectId) ?? []), plant.nameEn]);
      if (!tint.has(planting.objectId)) tint.set(planting.objectId, familyColor(plant));
    }
    for (const bed of this.bedSource.getFeatures()) {
      const id = bed.getId() as number | undefined;
      const names = id === undefined ? undefined : byObject.get(id);
      bed.set('plantLabel', names ? [...new Set(names)].join(', ') : undefined, true);
      // Ja ir iekrāsotas šūnas, krāsu rāda tās, nevis visa dobe
      const hasCells = id !== undefined && this.plantings.hasCells(id, true);
      const color = month === null ? tint.get(id ?? -1) : id === undefined ? undefined : lookColor(this.bedLook(id, month));
      bed.set('tint', id === undefined || hasCells ? undefined : color, true);
      bed.set('hasCells', hasCells, true);
    }
    this.bedLayer.changed();
    this.renderCells();
    this.bedSummaries.set(this.summarizeBeds());
    this.bareDetails.set(month === null ? [] : this.findBareBeds());
    this.refreshTrees();
  }

  private plantingLookIn(planting: Planting, month: number): Look {
    const plant = this.plantings.plantById().get(planting.plantId);
    return plant ? plantingLook(plant, planting.sownOn, this.plantings.year(), month) : { kind: 'bare' };
  }

  /** Ņem arī pagājušo sezonu, jo daudzgadīgie un ķiploks vēl aug */
  private bedPlantings(id: number): Planting[] {
    return [...this.plantings.forObject(id), ...this.earlierPlantings().filter((p) => p.objectId === id)];
  }

  private bedLook(id: number, month: number): Look {
    return combineLooks(this.bedPlantings(id).map((p) => this.plantingLookIn(p, month)));
  }

  /** Dobes, kas kādos mēnešos stāv pilnīgi tukšas */
  private findBareBeds(): ObjectWarning[] {
    const warnings: ObjectWarning[] = [];
    for (const bed of this.bedSource.getFeatures()) {
      const id = bed.getId() as number | undefined;
      if (id === undefined || this.bedPlantings(id).length === 0) continue;
      const warning = bareWarning(bareMonths((m) => this.bedLook(id, m)));
      if (warning) warnings.push({ text: `${getProps(bed).name}: ${warning}`, features: [bed] });
    }
    return warnings.sort((a, b) => a.text.localeCompare(b.text, 'en', { numeric: true }));
  }

  /** Sagatavo kokiem visu, ko stils pēc tam nolasa, arī pārklāšanās brīdinājumus */
  private refreshTrees(): void {
    const plantById = this.plantings.plantById();
    const month = this.seasonMonth();
    const ahead = this.yearsAhead();
    const thisYear = new Date().getFullYear();
    const trees = this.treeSource.getFeatures().map((feature) => {
      const props = getProps(feature);
      const plant = props.plantId ? plantById.get(props.plantId) : undefined;
      const mature = plant ? matureRadius(plant) : null;
      const current = crownRadius(feature);
      const shown = plant ? (projectedCrownRadius(plant, current, props.plantedYear, thisYear, ahead) ?? current) : current;
      return { feature, name: props.name, plant, mature, shown, center: (feature.getGeometry() as Point).getCoordinates() };
    });

    const beds = this.bedSource.getFeatures().map((bed) => ({ feature: bed, name: getProps(bed).name, polygon: bed.getGeometry() as Polygon }));
    const { conflicts, warnings } = findCrownConflicts(trees, beds, this.zone);

    for (const tree of trees) {
      tree.feature.set('matureRadiusM', tree.mature ?? undefined, true);
      tree.feature.set('shownRadiusM', tree.shown, true);
      tree.feature.set('crownConflict', conflicts.has(tree.feature), true);
      tree.feature.set('iconUrl', plantIconUrl(tree.plant?.nameEn) ?? undefined, true);
      tree.feature.set('seasonColor', month === null ? undefined : lookColor(treeLook(tree.plant, month)), true);
    }
    this.treeLayer.changed();
    this.crownDetails.set(warnings);
    this.growableTrees.set(trees.filter((tree) => tree.mature !== null).length);
    this.refreshEntries();
  }

  /** Čipa aizvēršanas poga atgriež parasto skatu */
  protected resetView(): void {
    this.seasonMonth.set(null);
    this.yearsAhead.set(0);
  }

  protected setBedTab(tab: BedTab): void {
    this.bedTab.set(tab);
    saveTab(BED_TAB_KEY, tab);
  }

  /** Starp cilnēm pārvietojas ar bultiņām, kā pieņemts pieejamībā */
  protected tabKeys(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    next.click();
  }

  protected closePanel(): void {
    this.select.getFeatures().clear();
    this.setSelected(null);
  }

  /** Ātrā poga koka panelī, lai redzētu koku pēc desmit gadiem */
  protected toggleTenYears(): void {
    this.yearsAhead.update((ahead) => (ahead === 10 ? 0 : 10));
  }

  // Zīmēšanas josla

  private readonly draws = (): Draw[] => [this.drawBed, this.drawBedFree, this.drawTree, this.drawLine];

  protected finishDraw(): void {
    if (this.mode() === 'edit-zone') this.saveZone();
    else finishDrawing(this.draws());
  }

  protected undoDrawPoint(): void {
    undoPoint(this.draws());
  }

  protected cancelDraw(): void {
    if (this.mode() === 'edit-zone') {
      this.cancelZoneEdit();
      return;
    }
    this.draws().forEach((draw) => draw.abortDrawing());
    this.setMode('select');
  }

  // Saraksta skats

  /** Elementus šeit neliekam, tie nāk no refreshItemEntries */
  private refreshEntries(): void {
    const entries = (features: Feature[], kind: string) =>
      features
        .map((f) => ({ key: getUid(f), kind, name: getProps(f).name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    this.objectEntries.set([...entries(this.bedSource.getFeatures(), 'Bed'), ...entries(this.treeSource.getFeatures(), 'Tree')]);
  }

  private refreshItemEntries(): void {
    this.itemFeatureEntries.set(
      this.itemSource.getFeatures().map((f) => {
        const type = this.typeOf(f.get('typeKey'));
        return { key: getUid(f), kind: type?.nameEn ?? 'Item', name: (f.get('label') as string | undefined) ?? type?.nameEn ?? 'Item' };
      }),
    );
  }

  /** Darbojas kā klikšķis kartē, un karte vēl pabrauc pie objekta */
  protected selectByKey(key: string): void {
    const feature = [...this.allObjects(), ...this.itemSource.getFeatures()].find((f) => getUid(f) === key);
    if (!feature) return;
    if (this.mode() !== 'select') this.setMode('select');
    this.selectFeature(feature);
    const [minX, minY, maxX, maxY] = feature.getGeometry()!.getExtent();
    this.map.getView().animate({ center: [(minX + maxX) / 2, (minY + maxY) / 2], duration: 250 });
  }

  /** Liek dobi kartes vidū, bet ja vidus ir ārpus zonas, tad kaut kur zonas iekšā */
  protected addBedBySize(size: { width: number; length: number }): void {
    this.bedSizeOpen.set(false);
    let [x, y] = this.map.getView().getCenter() ?? [0, 0];
    if (this.zone && !this.zone.intersectsCoordinate([x, y])) [x, y] = this.zone.getInteriorPoint().getCoordinates();
    const bed = new Feature(fromExtent([x - size.width / 2, y - size.length / 2, x + size.width / 2, y + size.length / 2]));
    this.addDrawn(bed, this.newBedProps());
  }

  private newBedProps(): GardenObjectProps {
    return { type: 'BED', name: `${DEFAULT_NAME.BED}: ${this.bedSource.getFeatures().length + 1}` };
  }

  private showCreatedToast(id: number): void {
    this.createdBedId.set(id);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.createdBedId.set(null), 12000);
  }

  /** Izvēloties augu, kokam uzreiz uzliek nosaukumu un vainaga izmēru */
  protected onPlantPick(id: number): void {
    const feature = this.selectedFeature;
    if (!feature) return;
    const plant = this.plantings.plantById().get(id);
    if (!plant) {
      feature.setProperties({ plantId: undefined, plantedYear: undefined });
      this.selectedPlantId.set(null);
      this.selectedPlantedYear.set(null);
    } else {
      const year = getProps(feature).plantedYear ?? new Date().getFullYear();
      feature.setProperties({ plantId: plant.id, plantedYear: year });
      if (getProps(feature).name.startsWith(DEFAULT_NAME.TREE)) this.onNameInput(plant.nameEn);
      this.selectedPlantId.set(plant.id);
      this.selectedPlantedYear.set(year);
      this.applyGrowth(plant, year);
    }
    this.saveSelected();
    this.refreshTrees();
  }

  protected onPlantedYear(year: number): void {
    const feature = this.selectedFeature;
    const plant = this.plantings.plantById().get(this.selectedPlantId() ?? -1);
    if (!feature || !plant || !(year >= 1900 && year <= 2200)) return;
    feature.set('plantedYear', year);
    this.selectedPlantedYear.set(year);
    this.applyGrowth(plant, year);
    this.saveSelected();
    this.refreshTrees();
  }

  /** Tikai sākuma minējums, lietotājs to var pārlabot ar roku */
  private applyGrowth(plant: Plant, plantedYear: number): void {
    const radius = crownRadiusAt(plant, plantedYear, new Date().getFullYear());
    if (radius !== null) this.onCrownInput(radius);
  }

  /** Rēķināt ir dārgi, tāpēc kešojam, līdz dobe mainās */
  private readonly totalCellsCache = new WeakMap<Feature, { revision: number; count: number }>();
  private totalCells(bed: Feature): number {
    const revision = bed.getRevision() + bed.getGeometry()!.getRevision();
    const cached = this.totalCellsCache.get(bed);
    if (cached?.revision === revision) return cached.count;
    const count = BedGrid.of(bed).all().length;
    this.totalCellsCache.set(bed, { revision, count });
    return count;
  }

  private summarizeBeds(): BedSummary[] {
    const plantById = this.plantings.plantById();
    return this.bedSource
      .getFeatures()
      .filter((bed) => bed.getId() !== undefined)
      .map((bed) => {
        const id = bed.getId() as number;
        const plantings = this.plantings.forObject(id);
        const cellArea = cellAreaOf(bed);
        const plants = new Map<string, BedSummary['plants'][number]>();
        for (const planting of plantings) {
          const plant = plantById.get(planting.plantId);
          if (plant) plants.set(plant.nameEn, { name: plant.nameEn, family: plant.family, color: familyColor(plant) });
        }
        return {
          id,
          name: getProps(bed).name,
          areaM2: (bed.getGeometry() as Polygon).getArea(),
          plants: [...plants.values()],
          filledCells: plantings.reduce((sum, p) => sum + p.cells.length, 0),
          usedM2: this.plantings.usedArea(id, cellArea),
          cellAreaM2: cellArea,
          totalCells: this.totalCells(bed),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  protected summaryOf(id: number | undefined): BedSummary | undefined {
    return this.bedSummaries().find((bed) => bed.id === id);
  }

  protected openBed(id: number): void {
    this.router.navigate(['/beds', id]);
  }

  protected startResize(event: PointerEvent): void {
    const area = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const wide = this.wide();
    const move = wide
      ? (e: PointerEvent) => this.dashWidth.set(clampDash(e.clientX - area.left))
      : (e: PointerEvent) => this.mapShare.set(clampShare(((e.clientY - area.top) / area.height) * 100));
    const end = wide ? () => saveDashWidth(this.dashWidth()) : () => saveMapShare(this.mapShare());
    this.stopResize?.();
    this.stopResize = startDrag(event, move, end, () => (this.stopResize = undefined));
  }

  protected resizeByKey(event: KeyboardEvent): void {
    if (this.wide()) {
      const side = event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0;
      if (!side) return;
      event.preventDefault();
      this.dashWidth.update((w) => clampDash(w + side));
      saveDashWidth(this.dashWidth());
      return;
    }
    const step = event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0;
    if (!step) return;
    event.preventDefault();
    this.mapShare.update((share) => clampShare(share + step));
    saveMapShare(this.mapShare());
  }

  private renderCells(): void {
    const plantById = this.plantings.plantById();
    const month = this.seasonMonth();
    this.cellsSource.clear();
    for (const planting of this.plantings.plantings()) {
      const bed = this.bedSource.getFeatureById(planting.objectId) as Feature | null;
      if (!bed) continue;
      const grid = BedGrid.of(bed);
      const color = month === null ? familyColor(plantById.get(planting.plantId)) : lookColor(this.plantingLookIn(planting, month));
      const style = cellStyle(color);
      for (const cell of this.plantings.cellsOf(planting)) {
        const feature = new Feature(grid.polygon(cell));
        feature.setStyle(style);
        this.cellsSource.addFeature(feature);
      }
      // Bloks iet paralēli dobes malām, nevis kartes asīm
      const block = blockOf(planting, grid.frame);
      if (block) {
        this.cellsSource.addFeature(plantingBlockFeature(planting, plantById.get(planting.plantId), grid.frame, block, color, style));
      }
    }
  }

  /** Rāda tikai tās šūnas, kas pilnībā ietilpst dobē */
  private refreshGrid(): void {
    this.gridSource.clear();
    const bed = this.selectedBed();
    if (!bed) return;
    const grid = BedGrid.of(bed);
    for (const cell of grid.all()) {
      this.gridSource.addFeature(new Feature(grid.polygon(cell)));
    }
  }

  private selectedBed(): Feature | null {
    return this.selectedFeature && getProps(this.selectedFeature).type === 'BED' ? this.selectedFeature : null;
  }

  ngAfterViewInit(): void {
    this.map.setTarget(this.mapHost.nativeElement);
    this.detachTooltip = attachMapTooltip(this.map, (f) => (isItemFeature(f) ? (f.get('label') as string) || this.typeOf(f.get('typeKey') as string)?.nameEn : undefined));
    // Kad mainās izkārtojums vai loga izmērs, OL jāpārrēķina kartes izmērs
    if (typeof ResizeObserver !== 'undefined') {
      this.mapResizeObserver = new ResizeObserver(() => this.map.updateSize());
      this.mapResizeObserver.observe(this.mapHost.nativeElement);
    }
    // Testu vidē matchMedia nav
    if (typeof matchMedia === 'function') {
      this.wideQuery = matchMedia(WIDE_QUERY);
      this.wideQuery.addEventListener('change', this.onWideChange);
    }
    this.addInteractions();
    this.listenToEvents();
    this.setMode('select');
    this.loadGarden();
  }

  protected loadGarden(): void {
    this.api.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ garden, features }) => {
      this.garden = garden;
      this.plantings.setGarden(garden.id);
      this.gardenId.set(garden.id);
      for (const feature of features) {
        this.sourceFor(getProps(feature).type).addFeature(feature);
      }
      this.labelBeds(); // ja stādījumi ielādējās pirms objektiem
      this.loaded.set(true);
      this.loadItems(garden.id);
      if (garden.hubGeometry) {
        this.showZone(readZone(garden.hubGeometry));
        // Pagriež skatu, lai zona stāv taisni, un fit šo pagriezienu ņem vērā
        this.map.getView().setRotation(straightenRotation(this.zone!));
        this.map.getView().fit(this.zone!, { padding: [48, 48, 48, 48] });
      }
    });
  }

  private showZone(zone: Polygon): void {
    this.zone = zone;
    this.zoneSource.clear();
    this.zoneSource.addFeature(new Feature(zone));
    this.refreshMask();
  }

  private refreshMask(): void {
    this.maskSource.clear();
    this.maskSource.addFeature(createMask(this.zone!));
  }

  private sourceFor(type: ObjectType): VectorSource {
    return type === 'BED' ? this.bedSource : this.treeSource;
  }

  private allObjects(): Feature[] {
    return [...this.bedSource.getFeatures(), ...this.treeSource.getFeatures()];
  }

  protected setMode(mode: MapMode): void {
    this.mode.set(mode);
    this.notice.set(null);
    const selecting = mode === 'select';

    this.select.setActive(selecting);
    this.translate.setActive(selecting);
    this.modify.setActive(selecting);
    this.drawBed.setActive(mode === 'draw-bed');
    this.drawBedFree.setActive(mode === 'draw-bed-free');
    this.drawTree.setActive(mode === 'draw-tree');
    this.drawLine.setActive(mode === 'draw-line');
    this.modifyZone.setActive(mode === 'edit-zone');
    if (mode !== 'place-item' && mode !== 'draw-line') this.placingType.set(null);
    this.sketching.set(false);

    if (!selecting) {
      this.closePanel();
    }
  }

  /** Elementiem ir savs panelis, dobēm un kokiem cits */
  private setSelected(selected: Feature | null): void {
    const isItem = isItemFeature(selected);
    const feature = isItem ? null : selected;
    this.selectedItem.set(isItem ? (this.itemOf(selected!) ?? null) : null);
    this.selectedKey.set(selected ? getUid(selected) : null);
    this.selectedFeature = feature;
    this.selectedRef.set(feature);
    const props = feature ? getProps(feature) : null;
    this.selectedName.set(props ? props.name : null);
    this.selectedCrownRadius.set(props?.crownRadiusM ?? null);
    this.selectedPlantId.set(props?.plantId ?? null);
    this.selectedPlantedYear.set(props?.plantedYear ?? null);
    this.selectedBedId.set(props?.type === 'BED' ? (feature!.getId() as number | undefined) : undefined);
    this.refreshGrid();
  }

  private selectFeature(feature: Feature): void {
    this.select.getFeatures().clear();
    this.select.getFeatures().push(feature);
    this.setSelected(feature);
  }

  private addInteractions(): void {
    // Secība ir svarīga, jo notikumi vispirms nonāk pēdējā pievienotajā, tāpēc Snap paliek beigās
    for (const interaction of [...this.draws(), this.select, this.translate, this.modify, this.modifyZone, this.snap]) {
      this.map.addInteraction(interaction);
    }
  }

  private listenToEvents(): void {
    // Pogas Finish un Undo strādā tikai tad, kad zīmējums ir sākts
    for (const draw of this.draws()) {
      this.olKeys.push(draw.on('drawstart', () => this.sketching.set(true)));
      this.olKeys.push(draw.on(['drawend', 'drawabort'], () => this.sketching.set(false)));
    }
    // Tukšā dārza kartīte un saraksts jāatjauno, kad mainās objektu skaits
    for (const source of [this.bedSource, this.treeSource]) {
      this.olKeys.push(source.on(['addfeature', 'removefeature'], () => {
        this.bedCount.set(this.bedSource.getFeatures().length);
        this.refreshEntries();
      }));
    }
    this.olKeys.push(this.itemSource.on(['addfeature', 'removefeature', 'changefeature'], () => this.refreshItemEntries()));

    for (const draw of [this.drawBed, this.drawBedFree]) {
      this.olKeys.push(draw.on('drawend', (event) =>
        this.addDrawn(event.feature, this.newBedProps()),
      ));
    }
    this.olKeys.push(this.drawTree.on('drawend', (event) =>
      this.addDrawn(event.feature, {
        type: 'TREE',
        name: `${DEFAULT_NAME.TREE}: ${this.treeSource.getFeatures().length + 1}`,
        crownRadiusM: DEFAULT_CROWN_RADIUS_M,
      }),
    ));

    this.olKeys.push(this.select.on('select', (event) => this.setSelected(event.selected[0] ?? null)));

    // Līnijas lietotājs zīmē pats, pārējos elementus noliek ar vienu klikšķi
    this.olKeys.push(this.drawLine.on('drawend', (event) => {
      const type = this.placingType();
      this.setMode('select');
      if (type) this.createItem(type, itemGeometryJson(event.feature));
    }));
    this.olKeys.push(this.map.on('singleclick', (event) => {
      const type = this.placingType();
      if (this.mode() !== 'place-item' || !type) return;
      this.setMode('select');
      this.createItem(type, defaultGeometry(type, event.coordinate[0], event.coordinate[1], this.map.getView().getRotation()));
    }));


    this.olKeys.push(this.modify.on('modifystart', (event) => this.rememberGeometries(event.features)));
    this.olKeys.push(this.translate.on('translatestart', (event) => this.rememberGeometries(event.features)));
    this.olKeys.push(this.modify.on('modifyend', (event) => this.saveOrRevert(event.features, true)));
    this.olKeys.push(this.translate.on('translateend', (event) => this.saveOrRevert(event.features)));

    // Kamēr zonu labo, maska un pārbaude seko tai līdzi
    this.olKeys.push(this.zoneSource.on('changefeature', () => {
      if (this.mode() === 'edit-zone') {
        this.refreshMask();
        this.validateZone();
      }
    }));
  }

  private addDrawn(feature: Feature, props: GardenObjectProps): void {
    this.setMode('select');
    if (this.zone && !isInsideZone(feature.getGeometry()!, this.zone)) {
      this.notice.set(OUTSIDE_ZONE);
      return;
    }
    feature.setProperties(props);
    this.sourceFor(props.type).addFeature(feature);
    this.api.create(feature);
    // Dobe parādās sarakstā tikai tad, kad backends tai iedod id
    feature.once('change', () => {
      this.labelBeds();
      const id = feature.getId() as number | undefined;
      if (props.type !== 'BED' || id === undefined) return;
      // Jaunai dobei uzreiz piedāvā to saplānot
      this.showCreatedToast(id);
      if (this.selectedFeature === feature) this.selectedBedId.set(id);
    });
    if (props.type === 'BED') {
      this.selectFeature(feature);
    }
  }

  private rememberGeometries(features: Collection<FeatureLike>): void {
    this.geometryBeforeEdit.clear();
    features.forEach((feature) => {
      const olFeature = feature as Feature;
      this.geometryBeforeEdit.set(olFeature, olFeature.getGeometry()!.clone());
    });
  }

  /** Ja kaut viens objekts nonāca ārpus zonas, visus noliek atpakaļ un neko nesūta */
  private saveOrRevert(features: Collection<FeatureLike>, reshaped = false): void {
    features.forEach((feature) => {
      const olFeature = feature as Feature;
      const before = this.geometryBeforeEdit.get(olFeature);
      if (isItemFeature(olFeature)) {
        this.saveItemGeometry(olFeature, before);
      } else if (this.zone && before && !isInsideZone(olFeature.getGeometry()!, this.zone)) {
        olFeature.setGeometry(before);
        this.notice.set(OUTSIDE_ZONE);
      } else if (reshaped && before && this.changesGrid(olFeature, before)) {
        olFeature.setGeometry(before);
        this.notice.set(GRID_LOCKED);
      } else {
        this.api.update(olFeature);
      }
    });
    // Kad dobe mainās, režģim, šūnām un sarakstam jāseko līdzi
    this.refreshGrid();
    this.labelBeds();
  }

  protected deleteSelected(): void {
    const feature = this.select.getFeatures().item(0);
    if (!feature) return;
    if (isItemFeature(feature)) {
      this.deleteItem(feature);
      return;
    }
    const id = feature.getId() as number | undefined;
    const count = id === undefined ? 0 : this.plantings.forObject(id).length;
    if (count > 0 && !confirm(`Delete this bed and its ${count} plantings for ${this.plantings.year()}?`)) return;
    if (id !== undefined) this.plantings.forgetObject(id);

    const layer = this.select.getLayer(feature);
    layer.getSource()?.removeFeature(feature);
    this.api.delete(feature);
    this.closePanel();
    this.labelBeds();
  }

  // Zonas labošana
  protected startZoneEdit(): void {
    if (!this.zone) return;
    this.zoneBeforeEdit = this.zone.clone();
    this.setMode('edit-zone');
    this.validateZone();
  }

  /** Iezīmē objektus, kas paliktu ārpus zonas, un pasaka, vai zonu drīkst saglabāt */
  private validateZone(): void {
    const outside = markOutside(this.allObjects(), this.zone!);
    this.bedLayer.changed();
    this.treeLayer.changed();
    this.zoneProblemText.set(zoneProblem(this.zone!, outside));
  }

  protected saveZone(): void {
    if (!this.garden || this.zoneProblemText() || this.zoneSaving()) return;
    this.zoneSaving.set(true);
    this.gardens.saveHub(this.garden.id, this.garden.addressCode, writeZone(this.zone!)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (garden) => {
        this.zoneSaving.set(false);
        this.garden = garden;
        this.setMode('select');
      },
      error: (error) => {
        this.zoneSaving.set(false);
        this.zoneProblemText.set(problemDetail(error, 'Could not save the zone. Try again.'));
      },
    });
  }

  protected cancelZoneEdit(): void {
    this.showZone(this.zoneBeforeEdit!);
    this.validateZone(); // lai pazūd sarkanie izcēlumi
    this.setMode('select');
  }

  // Esc vienmēr atgriež izvēles režīmu, bet zīmējot Enter pabeidz un Backspace atsauc punktu
  protected onKeyDown(event: KeyboardEvent): void {
    if (isTyping(event) || (event.target as Element | null)?.closest?.('dialog, [role=dialog]')) return;
    if (this.mode() === 'select') {
      if (event.key === 'Delete') this.deleteSelected();
      else if (event.key === 'Escape' && this.selectedName() !== null) this.closePanel();
    } else if (this.mode() === 'edit-zone') {
      if (event.key === 'Escape') this.cancelZoneEdit();
      else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) this.saveZone();
    } else if (this.mode() === 'place-item' || this.mode() === 'draw-tree') {
      if (event.key === 'Escape') this.setMode('select');
    } else if (handleDrawKeys(event, this.draws())) {
      this.setMode('select');
    }
  }

  protected onNameInput(value: string): void {
    this.selectedFeature?.set('name', value);
    this.selectedName.set(value);
    this.refreshEntries();
  }

  /** Saglabā tikai, kad lauks zaudē fokusu vai nospiež Enter, nevis pēc katra burta */
  protected saveSelected(): void {
    if (this.selectedFeature) this.api.update(this.selectedFeature);
  }

  protected onCrownInput(value: number): void {
    if (!this.selectedFeature || !(value > 0)) return;
    this.selectedFeature.set('crownRadiusM', value);
    this.selectedCrownRadius.set(value);
    this.refreshTrees();
  }

  /** Velkot stūrus, režģis mainās un iekrāsotās šūnas aizslīdētu, bet visu dobi pārvietot var droši */
  private changesGrid(feature: Feature, before: Geometry): boolean {
    const id = feature.getId() as number | undefined;
    if (id === undefined || !this.plantings.hasCells(id)) return false;
    const extentBefore = before.getExtent();
    return feature.getGeometry()!.getExtent().some((value, i) => value !== extentBefore[i]);
  }

  // Dārza elementi

  private loadItems(gardenId: number): void {
    this.itemApi.list(gardenId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.gardenItems.set(items);
        this.itemSource.clear();
        this.itemSource.addFeatures(items.map(itemToFeature));
      },
      error: () => {
        this.gardenItems.set([]);
        this.notice.set(ITEMS_FAILED);
      },
    });
  }

  /** Līniju sāk zīmēt uzreiz, citus elementus noliek ar nākamo klikšķi kartē */
  protected startPlacing(type: ItemType): void {
    this.paletteOpen.set(false);
    this.setMode(type.shape === 'LINE' ? 'draw-line' : 'place-item');
    this.placingType.set(type);
  }

  protected onMapDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes(ITEM_DND_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  /** Elementu, kas nomests no paletes, noliek tieši tur, kur atlaida peli */
  protected onMapDrop(event: DragEvent): void {
    const key = event.dataTransfer?.getData(ITEM_DND_MIME);
    const type = this.typeOf(key);
    if (!type) return;
    event.preventDefault();
    const [x, y] = this.map.getCoordinateFromPixel(this.map.getEventPixel(event));
    this.createItem(type, defaultGeometry(type, x, y, this.map.getView().getRotation()));
  }

  private createItem(type: ItemType, geometry: string): void {
    const gardenId = this.gardenId();
    if (gardenId === null || this.itemBusy()) return;
    this.notice.set(null);
    this.busyItemCall(this.itemApi.create(gardenId, { typeKey: type.key, geometry, rotationDeg: 0, label: null }), `Could not place the ${type.nameEn.toLowerCase()}.`, (item) => {
      this.gardenItems.update((list) => [...list, item]);
      const feature = itemToFeature(item);
      this.itemSource.addFeature(feature);
      this.selectFeature(feature);
    });
  }

  /** Dubultklikšķis neko nedublē, un kļūdu parāda paziņojumā */
  private busyItemCall<T>(request: Observable<T>, failText: string, next: (value: T) => void): void {
    this.itemBusy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.itemBusy.set(false);
        next(value);
      },
      error: (error) => {
        this.itemBusy.set(false);
        this.notice.set(problemDetail(error, failText));
      },
    });
  }

  private itemOf(feature: Feature): GardenItem | undefined {
    return this.gardenItems().find((i) => i.id === feature.get('itemId'));
  }

  private itemFeatureOf(id: number): Feature | undefined {
    return this.itemSource.getFeatures().find((f) => f.get('itemId') === id);
  }

  private replaceItem(item: GardenItem): void {
    this.gardenItems.update((list) => list.map((i) => (i.id === item.id ? item : i)));
    if (this.selectedItem()?.id === item.id) this.selectedItem.set(item);
  }

  /** Zonu pārbauda serveris, un ja tas atsaka, elementu noliek atpakaļ un parāda ziņu */
  private saveItemGeometry(feature: Feature, before: Geometry | undefined): void {
    const item = this.itemOf(feature);
    if (!item) return;
    this.itemApi.update(item.id, itemInput(item, { geometry: itemGeometryJson(feature) })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => this.replaceItem(saved),
      error: (error) => {
        if (before) feature.setGeometry(before);
        this.notice.set(problemDetail(error, OUTSIDE_ZONE));
      },
    });
  }

  protected onItemLabel(input: HTMLInputElement): void {
    const item = this.selectedItem();
    if (!item) return;
    const label = input.value.trim() || null;
    // Ģeometriju ņem no kartes, jo saglabātais elements var būt novecojis
    const feature = this.itemFeatureOf(item.id);
    const geometry = feature ? itemGeometryJson(feature) : item.geometry;
    this.itemApi.update(item.id, itemInput(item, { geometry, label })).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.replaceItem(saved);
        this.itemFeatureOf(saved.id)?.set('label', saved.label);
      },
      error: (error) => {
        input.value = item.label ?? this.typeOf(item.typeKey)?.nameEn ?? '';
        this.notice.set(problemDetail(error, 'Could not save the name.'));
      },
    });
  }

  protected deleteSelectedItem(): void {
    const feature = this.select.getFeatures().item(0);
    if (feature && isItemFeature(feature)) this.deleteItem(feature);
  }

  private deleteItem(feature: Feature): void {
    if (this.itemBusy()) return;
    const id = feature.get('itemId') as number;
    this.busyItemCall(this.itemApi.delete(id), 'Could not delete the item.', () => {
      this.itemSource.removeFeature(feature);
      this.gardenItems.update((list) => list.filter((i) => i.id !== id));
      this.closePanel();
    });
  }

  protected formatMeters = formatMeters;

  private detachTooltip?: () => void;

  ngOnDestroy(): void {
    this.detachTooltip?.();
    this.earlierLoading?.unsubscribe();
    clearTimeout(this.toastTimer);
    this.stopResize?.();
    this.mapResizeObserver?.disconnect();
    this.wideQuery?.removeEventListener('change', this.onWideChange);
    this.olKeys.forEach((key) => unByKey(key));
    this.olKeys.length = 0;
    this.map.setTarget(undefined);
  }
}


type ObjectWarning = CrownWarning<Feature>;

interface DrawBarState {
  mode: string;
  instruction: string;
  finish: string | null;
  finishDisabled: boolean;
  undo: boolean;
}
