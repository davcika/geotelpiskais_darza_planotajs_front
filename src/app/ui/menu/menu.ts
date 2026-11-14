import { Component, ElementRef, inject, input, signal, ViewChild } from '@angular/core';
import { focusables } from '../focus-trap';

let nextId = 0;

/** Rīkjoslas izvēlne, ko aizver Esc vai klikšķis ārpusē, kā arī klikšķis uz menu item pogas */
@Component({
  selector: 'app-menu',
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
  host: {
    '(document:pointerdown)': 'onOutside($event)',
    '(keydown)': 'onKey($event)',
  },
})
export class Menu {
  readonly label = input.required<string>();
  /** Ko rādīt šaurā ekrānā, ja nav dots, rāda label */
  readonly icon = input<string>();
  readonly tourId = input<string>();
  readonly align = input<'start' | 'end'>('start');
  readonly disabled = input(false);
  readonly triggerClass = input('');

  protected readonly open = signal(false);
  protected readonly panelId = `menu-panel-${nextId++}`;
  private readonly host = inject(ElementRef<HTMLElement>);
  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;

  toggle(): void {
    if (this.open()) this.close(false);
    else {
      this.open.set(true);
      // Panelis vēl nav uzzīmēts, tāpēc fokusējam nedaudz vēlāk
      setTimeout(() => this.focusables()[0]?.focus());
    }
  }

  close(returnFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger.nativeElement.focus();
  }

  protected onOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected onPanelClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.menu-item')) this.close();
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // Slīdņos bultiņas maina vērtību, tāpēc tos neaiztiekam
    if ((event.target as HTMLElement).matches('input[type=range]')) return;
    const items = this.focusables();
    if (!items.length) return;
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
  }

  private focusables(): HTMLElement[] {
    const root = this.panel?.nativeElement;
    if (!root) return [];
    return focusables(root, 'button:not([disabled]), a[href], input:not([disabled]), select');
  }
}
