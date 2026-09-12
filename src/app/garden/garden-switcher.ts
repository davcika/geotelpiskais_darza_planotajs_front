import { Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Menu } from '../ui/menu/menu';
import { DeleteGardenDialog } from './delete-garden-dialog';
import { GardenBadge } from './garden-badge';
import { GardenFormDialog } from './garden-form-dialog';
import { GardenSettingsDialog, SettingsTab } from './garden-settings-dialog';
import { GARDEN_ICONS, GardenDto, GardenStore } from './garden-store';

type Dialog = 'new' | 'settings' | 'delete' | null;

/** Dārza pārslēdzējs rīkjoslā ar sarakstu, jaunu dārzu un iestatījumiem, maiņa pārlādē karti */
@Component({
  selector: 'app-garden-switcher',
  imports: [Menu, GardenBadge, GardenFormDialog, DeleteGardenDialog, GardenSettingsDialog],
  host: { '[style.--garden-color]': 'current()?.color ?? null' },
  styles: `
    /* Ikona krāsainā aplī izvēlnes iekšpusē */
    :host ::ng-deep .trigger > .icon { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--garden-color, transparent); }
    .item { display: flex; align-items: center; gap: 8px; width: 100%; }
    .shared { padding: 1px 6px; border-radius: 999px; background: var(--color-info-bg); color: var(--color-info-text); font-size: 0.7rem; }
    .check { margin-left: auto; color: var(--color-primary); }
  `,
  template: `
    <app-menu [label]="current()?.name ?? 'Garden'" [icon]="glyph()" tourId="garden-switcher">
      @for (g of store.gardens(); track g.id) {
        <button type="button" class="menu-item item" [attr.aria-current]="g.id === current()?.id ? 'true' : null" [attr.title]="g.role === 'EDITOR' ? 'Shared by ' + g.ownerEmail : null" (click)="switchTo(g)">
          <app-garden-badge [icon]="g.icon" [color]="g.color" [size]="22" />
          <span>{{ g.name }}</span>
          @if (g.role === 'EDITOR') {
            <span class="shared">Shared</span>
          }
          @if (g.id === current()?.id) {
            <span class="check" aria-label="current">✓</span>
          }
        </button>
      }
      <div class="menu-sep"></div>
      <button type="button" class="menu-item" (click)="dialog.set('new')">+ New garden</button>
      @if (current()) {
        <button type="button" class="menu-item" (click)="openSettings()">Garden settings…</button>
      }
    </app-menu>

    @switch (dialog()) {
      @case ('new') {
        <app-garden-form-dialog (saved)="created()" (closed)="dialog.set(null)" />
      }
      @case ('settings') {
        <app-garden-settings-dialog
          [garden]="current()!"
          [initialTab]="settingsTab()"
          (editZone)="dialog.set(null); editZone.emit()"
          (delete)="dialog.set('delete')"
          (left)="afterDelete()"
          (closed)="dialog.set(null)"
        />
      }
      @case ('delete') {
        @if (current()?.role === 'OWNER') {
        <app-delete-garden-dialog [garden]="current()!" (deleted)="afterDelete()" (closed)="dialog.set(null)" />
        }
      }
    }
  `,
})
export class GardenSwitcher {
  protected readonly store = inject(GardenStore);
  private readonly router = inject(Router);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly settingsTab = signal<SettingsTab>('general');
  protected readonly current = this.store.current;
  protected readonly glyph = computed(() => GARDEN_ICONS[this.current()?.icon ?? 'leaf']);
  /** Iestatījumi palūdz karti rediģēt zonu vai atvērt elementu sarakstu */
  readonly editZone = output<void>();

  /** Atver dārza iestatījumus no izvēlnes vai kartes pogas */
  openSettings(tab: SettingsTab = 'general'): void {
    if (!this.current()) return;
    this.settingsTab.set(tab);
    this.dialog.set('settings');
  }

  protected switchTo(garden: GardenDto): void {
    if (garden.id === this.current()?.id) return;
    this.store.select(garden.id);
    this.reload();
  }

  /** Jaunais dārzs jau ir izvēlēts, tāpēc ved uz onboarding */
  protected created(): void {
    this.dialog.set(null);
    this.router.navigate(['/onboarding']);
  }

  protected afterDelete(): void {
    this.dialog.set(null);
    this.reload();
  }

  /** Karte ielādējas no jauna, un sargi aizved, kur vajag */
  private reload(): void {
    this.router.navigateByUrl('/switch-garden', { skipLocationChange: true });
  }
}
