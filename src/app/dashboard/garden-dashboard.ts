import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { colorOfFamily, formatArea } from '../planting/plant';
import { GardenAssistant } from '../assistant/garden-assistant';
import { GardenTasks } from '../task/garden-tasks';
import { CollapsibleSection } from '../ui/collapsible-section/collapsible-section';
import { BedSummary } from './bed-summary';
import { SpaceBar } from '../planting/space-bar';

/** Panelis zem kartes ar sezonas kopsavilkumu un dobēm */
@Component({
  selector: 'app-garden-dashboard',
  imports: [GardenAssistant, GardenTasks, CollapsibleSection, SpaceBar, RouterLink],
  templateUrl: './garden-dashboard.html',
  styleUrl: './garden-dashboard.scss',
})
export class GardenDashboard {
  readonly beds = input.required<BedSummary[]>();
  readonly year = input.required<number>();
  readonly selectedId = input<number | undefined>();
  readonly pick = output<number>();
  /** Tukšā dārza poga sāk zīmēt dobi kartē */
  readonly addBed = output<void>();

  protected readonly tasksSummary = signal('');
  protected readonly tasksAttention = signal(false);
  protected readonly seasonSummary = computed(() => {
    const t = this.totals();
    return t.beds ? `${t.plantedBeds}/${t.beds} beds planted` : 'No beds yet';
  });
  protected readonly bedsSummary = computed(() => String(this.beds().length));

  protected readonly area = formatArea;

  protected readonly totals = computed(() => {
    const beds = this.beds();
    const planted = beds.filter((bed) => bed.plants.length > 0);
    return {
      beds: beds.length,
      area: beds.reduce((sum, bed) => sum + bed.areaM2, 0),
      plantedBeds: planted.length,
      plantedArea: planted.reduce((sum, bed) => sum + bed.areaM2, 0),
      crops: new Set(beds.flatMap((bed) => bed.plants.map((plant) => plant.name))).size,
    };
  });

  /** Augu dzimtas pēc stādījumu skaita krāsu joslai */
  protected readonly families = computed(() => {
    const counts = new Map<string, number>();
    for (const plant of this.beds().flatMap((bed) => bed.plants)) {
      counts.set(plant.family, (counts.get(plant.family) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => ({
        family: family.charAt(0) + family.slice(1).toLowerCase(),
        color: colorOfFamily(family),
        share: count / total,
        count,
      }));
  });

  protected occupancy(bed: BedSummary): number | null {
    return bed.totalCells > 0 ? Math.round((bed.filledCells / bed.totalCells) * 100) : null;
  }
}
