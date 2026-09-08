import { AfterViewInit, Component, computed, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Feature } from 'ol';
import { Point, Polygon } from 'ol/geom';
import { Draw, Modify } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { FrostCard } from '../../garden/frost-card';
import { toLatLon } from '../../garden/frost-logic';
import { GardenDto, GardenStore } from '../../garden/garden-store';
import { problemDetail } from '../../shared/format';
import { createBaseMap, flyTo, LATVIA_EXTENT } from '../../map/base-map';
import { finishDrawing, handleDrawKeys, isTyping, POLYGON_DRAW_HINT, undoPoint } from '../../map/draw-keys';
import { DrawBar } from '../../map/draw-bar/draw-bar';
import { GardenApi } from '../../map/garden-map/garden-api';
import { getProps } from '../../map/garden-map/garden-object';
import { bedStyle, treeStyle } from '../../map/garden-map/garden-styles';
import { formatArea, markOutside, withOutsideHighlight, readZone, writeZone, zoneProblem, zoneStyle } from '../../map/zone';
import { straightenRotation } from '../../map/view-rotation';
import { Address, AddressSearch } from '../address-search/address-search';

type Step = 'search' | 'confirm' | 'frost' | 'draw';

export const VZD_ATTRIBUTION = 'Addresses © State Land Service of Latvia (VZD), CC BY 4.0';

const markerStyle = new Style({
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: '#2d6a3d' }),
    stroke: new Stroke({ color: '#ffffff', width: 3 }),
  }),
});

/** Lietotājs atrod adresi un uzzīmē dārza zonu, kurā jāietilpst visiem esošajiem objektiem */
@Component({
  selector: 'app-onboarding-page',
  imports: [AddressSearch, FrostCard, RouterLink, DrawBar],
  providers: [GardenApi],
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.scss',
  host: { '(document:keydown)': 'onKeyDown($event)' },
})
export class OnboardingPage implements AfterViewInit, OnDestroy {
  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private readonly gardens = inject(GardenStore);
  private readonly router = inject(Router);
  protected readonly api = inject(GardenApi);

  protected readonly changing = inject(ActivatedRoute).snapshot.queryParamMap.has('change');
  protected readonly attribution = VZD_ATTRIBUTION;
  protected readonly formatArea = formatArea;
  protected readonly step = signal<Step>('search');
  protected readonly query = signal('');
  protected readonly address = signal<Address | null>(null);
  /** Zonas laukums ir null, kamēr nekas nav uzzīmēts */
  protected readonly area = signal<number | null>(null);
  protected readonly problem = signal<string | null>(null);
  protected readonly drawn = signal(false);
  protected readonly sketching = signal(false);
  protected readonly drawHint = POLYGON_DRAW_HINT;
  protected readonly saveError = signal<string | null>(null);
  protected readonly canSave = computed(() => this.drawn() && this.problem() === null);

  protected readonly garden = signal<GardenDto | null>(null);
  /** Salnu datumiem vajag platumu un garumu, nevis LKS92 metrus */
  protected readonly point = computed<[number, number] | null>(() => {
    const a = this.address();
    return a ? toLatLon(a.east, a.north) : null;
  });
  private objects: Feature[] = [];

  private readonly zoneSource = new VectorSource();
  private readonly markerSource = new VectorSource({ attributions: VZD_ATTRIBUTION });
  private readonly objectsSource = new VectorSource();
  private readonly objectsLayer = new VectorLayer({
    source: this.objectsSource,
    style: withOutsideHighlight((feature, resolution) =>
      getProps(feature).type === 'BED' ? bedStyle(feature, resolution) : treeStyle(feature, resolution),
    ),
  });
  private readonly map = createBaseMap([
    new VectorLayer({ source: this.zoneSource, style: zoneStyle }),
    this.objectsLayer,
    new VectorLayer({ source: this.markerSource, style: markerStyle }),
  ]);
  private readonly draw = new Draw({ source: this.zoneSource, type: 'Polygon', style: zoneStyle });
  private readonly modify = new Modify({ source: this.zoneSource });

  ngAfterViewInit(): void {
    this.map.setTarget(this.mapHost().nativeElement);
    this.map.getView().fit(LATVIA_EXTENT);
    this.draw.setActive(false);
    this.modify.setActive(false);
    this.map.addInteraction(this.draw);
    this.map.addInteraction(this.modify);

    this.draw.on('drawstart', (event) => {
      this.zoneSource.clear();
      this.sketching.set(true);
      // Klausāmies ģeometriju, lai laukums atjaunojas arī tad, kad vēlāk velk stūrus
      const zone = event.feature.getGeometry() as Polygon;
      zone.on('change', () => this.evaluate(zone));
    });
    this.draw.on('drawabort', () => this.sketching.set(false));
    this.draw.on('drawend', () => {
      this.drawn.set(true);
      this.sketching.set(false);
      this.draw.setActive(false);
      this.modify.setActive(true);
      // Pagriežam karti, lai zona stāv taisni
      const zone = this.zoneSource.getFeatures()[0]?.getGeometry() as Polygon | undefined;
      if (zone) this.map.getView().animate({ rotation: straightenRotation(zone), duration: 400 });
    });

    this.api.load().subscribe(({ garden, features }) => {
      this.garden.set(garden);
      // Mainot zonu, karte pagriezta tāpat kā galvenajā skatā
      if (garden.hubGeometry) this.map.getView().setRotation(straightenRotation(readZone(garden.hubGeometry)));
      this.objects = features;
      this.objectsSource.addFeatures(features);
    });
  }

  protected onPicked(address: Address): void {
    const point: [number, number] = [address.east, address.north];
    this.address.set(address);
    this.markerSource.clear();
    this.markerSource.addFeature(new Feature(new Point(point)));
    this.step.set('confirm');
    flyTo(this.map.getView(), point);
  }

  protected backToSearch(): void {
    this.step.set('search');
  }

  protected skipAddress(): void {
    this.address.set(null);
    this.markerSource.clear();
    this.map.getView().fit(LATVIA_EXTENT);
    this.startDrawing();
  }

  /** Vispirms salnu datumi, ja dārzs jau ielādēts, pēc tam zona */
  protected confirmAddress(): void {
    if (this.garden() && this.point()) this.step.set('frost');
    else this.startDrawing();
  }

  protected startDrawing(): void {
    this.step.set('draw');
    this.redraw();
  }

  protected finishZone(): void {
    finishDrawing([this.draw]);
  }

  protected undoZonePoint(): void {
    undoPoint([this.draw]);
  }

  protected redraw(): void {
    this.draw.abortDrawing();
    this.sketching.set(false);
    this.zoneSource.clear();
    this.drawn.set(false);
    this.area.set(null);
    this.problem.set(null);
    this.saveError.set(null);
    this.objects.forEach((feature) => feature.set('outside', false, true));
    this.objectsLayer.changed();
    this.modify.setActive(false);
    this.draw.setActive(true);
  }

  private evaluate(zone: Polygon): void {
    this.area.set(zone.getArea());
    const outside = markOutside(this.objects, zone);
    this.objectsLayer.changed();
    this.problem.set(zoneProblem(zone, outside));
  }

  protected save(): void {
    const zone = this.zoneSource.getFeatures()[0]?.getGeometry() as Polygon | undefined;
    const garden = this.garden();
    if (!garden || !zone || !this.canSave()) return;
    this.saveError.set(null);
    this.gardens.saveHub(garden.id, this.address()?.code ?? null, writeZone(zone)).subscribe({
      next: () => this.router.navigate(['/']),
      error: (error) => this.saveError.set(problemDetail(error, 'Could not save the zone. Try again.')),
    });
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.step() === 'draw' && !this.drawn() && !isTyping(event)) {
      handleDrawKeys(event, [this.draw]);
    }
  }

  ngOnDestroy(): void {
    this.map.setTarget(undefined);
  }
}
