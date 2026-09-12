import { AfterViewInit, Component, computed, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { FrostCard } from './frost-card';
import { zoneCenterLatLon } from './frost-logic';
import { GardenItem, ItemApi, ItemType } from '../item/item-api';
import { ItemsList } from '../item/items-list';
import { GARDEN_COLORS, GARDEN_ICON_KEYS, GARDEN_ICONS, GardenDto, GardenIcon, GardenStore, InviteDto, MemberDto } from './garden-store';
import { problemDetail } from '../shared/format';

/** Vecās cilnes atstātas saderībai, tagad tās ir vispārīgajā cilnē */
export type SettingsTab = 'general' | 'location' | 'frost' | 'items' | 'people' | 'danger';
type TabId = 'general' | 'frost' | 'items' | 'people';
const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'frost', label: 'Frost dates' },
  { id: 'items', label: 'Items' },
  { id: 'people', label: 'People' },
];

/** Visi dārza iestatījumi vienā dialogā pa cilnēm, bet zonu un elementu sarakstu atver karte */
@Component({
  selector: 'app-garden-settings-dialog',
  imports: [FormsModule, FrostCard, ItemsList],
  styleUrls: ['./dialog.scss', './garden-settings-dialog.scss'],
  templateUrl: './garden-settings-dialog.html',

})
export class GardenSettingsDialog implements OnInit, AfterViewInit {
  readonly garden = input.required<GardenDto>();
  readonly initialTab = input<SettingsTab>('general');
  readonly editZone = output<void>();
  readonly delete = output<void>();
  /** Rediģētājs pameta dārzu, tad pārslēdzējs pārlādē karti */
  readonly left = output<void>();
  readonly closed = output<void>();

  private readonly store = inject(GardenStore);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** Tikai īpašnieks var dzēst dārzu */
  protected readonly isOwner = computed(() => this.garden().role === 'OWNER');
  protected readonly tabs = signal(TABS);
  private readonly itemApi = inject(ItemApi);
  protected readonly itemTypes = signal<ItemType[] | null>(null);
  protected readonly gardenItems = signal<GardenItem[] | null>(null);
  protected readonly itemsError = signal<string | null>(null);
  protected readonly members = signal<MemberDto[]>([]);
  protected readonly membersError = signal<string | null>(null);
  protected readonly invite = signal<InviteDto | null>(null);
  protected readonly inviteUrl = computed(() => (this.invite() ? `${location.origin}/invite/${this.invite()!.token}` : ''));
  protected readonly copied = signal(false);
  protected readonly peopleMessage = signal<{ text: string; error: boolean } | null>(null);
  protected readonly tab = signal<TabId>('general');
  protected readonly icons = GARDEN_ICONS;
  protected readonly iconKeys = GARDEN_ICON_KEYS;
  protected readonly colors = GARDEN_COLORS;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  protected name = '';
  protected icon: GardenIcon = 'leaf';
  protected color = GARDEN_COLORS[0];
  protected frostPoint: [number, number] | null = null;

  ngOnInit(): void {
    const g = this.garden();
    this.name = g.name;
    this.icon = g.icon;
    this.color = g.color;
    const tab = this.initialTab();
    this.tab.set(tab === 'location' || tab === 'danger' ? 'general' : tab);
    this.loadMembers();
    this.loadItems();
    // Ja datumi jau ir, rāda tos, citādi rēķina zonas centram
    this.frostPoint = g.frost?.lastFrost ? null : zoneCenterLatLon(g.hubGeometry);
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected tabKeys(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = this.tabs();
    const i = tabs.findIndex((t) => t.id === this.tab());
    const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    this.tab.set(next.id);
    setTimeout(() => document.getElementById('settings-tab-' + next.id)?.focus());
  }

  protected saveGeneral(): void {
    const name = this.name.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    this.store.update(this.garden().id, { name, icon: this.icon, color: this.color }).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set({ text: 'Saved.', error: false });
      },
      error: (err) => {
        this.busy.set(false);
        this.message.set({ text: problemDetail(err, 'Could not save the garden. Try again.'), error: true });
      },
    });
  }

  /** Elementu saraksts rādās tieši cilnē, bez atsevišķa loga */
  private loadItems(): void {
    const fail = (err: unknown) => this.itemsError.set(problemDetail(err, 'Could not load items. Try again.'));
    this.itemApi.types().subscribe({ next: (t) => this.itemTypes.set(t), error: fail });
    this.itemApi.list(this.garden().id).subscribe({ next: (l) => this.gardenItems.set(l), error: fail });
  }

  private loadMembers(): void {
    this.membersError.set(null);
    this.store.members(this.garden().id).subscribe({
      next: (list) => this.members.set(list),
      error: (err) => this.membersError.set(problemDetail(err, 'Could not load people. Try again.')),
    });
    // Rāda jau aktīvo saiti, lai katru reizi nebūtu jāveido jauna
    if (this.isOwner()) {
      this.store.currentInvite(this.garden().id).subscribe({ next: (inv) => this.invite.set(inv ?? null) });
    }
  }

  /** Jauns tokens aizstāj veco, un vecā saite vairs nestrādā */
  protected createInvite(): void {
    this.runPeople(this.store.createInvite(this.garden().id), (inv) => {
      this.invite.set(inv);
      this.copied.set(false);
    }, 'Could not create the invite link.');
  }

  protected revokeInvite(): void {
    if (!confirm('Turn off the invite link? People who already joined keep access.')) return;
    this.runPeople(this.store.revokeInvite(this.garden().id), () => {
      this.invite.set(null);
      this.peopleMessage.set({ text: 'Invite link turned off.', error: false });
    }, 'Could not turn off the link.');
  }

  protected removeMember(member: MemberDto): void {
    if (!confirm(`Remove ${member.email} from this garden?`)) return;
    this.runPeople(this.store.removeMember(this.garden().id, member.userId), () => {
      this.members.update((list) => list.filter((m) => m.userId !== member.userId));
    }, 'Could not remove this person.');
  }

  protected leave(): void {
    const me = this.members().find((m) => m.you);
    if (!me) return;
    if (!confirm(`Leave “${this.garden().name}”? You will need a new invite to get back.`)) return;
    this.runPeople(this.store.leave(this.garden().id, me.userId), () => {
      this.dialog().nativeElement.close();
      this.left.emit();
    }, 'Could not leave the garden.');
  }

  /** Kopē saiti, bet ja starpliktuve nav pieejama, iezīmē tekstu, lai lietotājs nokopē pats */
  protected copyInvite(field: HTMLInputElement): void {
    field.select();
    const done = () => this.copied.set(true);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.inviteUrl()).then(done, () => this.legacyCopy(field, done));
    } else {
      this.legacyCopy(field, done);
    }
  }

  private legacyCopy(field: HTMLInputElement, done: () => void): void {
    field.select();
    try {
      if (document.execCommand('copy')) done();
    } catch {
      // Paliek iezīmēts, lai lietotājs var nokopēt ar Ctrl+C
    }
  }

  protected expiry(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private runPeople<T>(request: Observable<T>, next: (value: T) => void, fallback: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.peopleMessage.set(null);
    request.subscribe({
      next: (value) => {
        this.busy.set(false);
        next(value);
      },
      error: (err) => {
        this.busy.set(false);
        this.peopleMessage.set({ text: problemDetail(err, fallback + ' Try again.'), error: true });
      },
    });
  }

  protected changeAddress(): void {
    this.close();
    this.router.navigate(['/onboarding'], { queryParams: { change: 1 } });
  }

  protected emitAndClose(what: 'editZone' | 'delete'): void {
    if (what === 'delete' && !this.isOwner()) return;
    this.dialog().nativeElement.close();
    this[what].emit();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
}
