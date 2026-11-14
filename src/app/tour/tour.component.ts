import { focusables, trapTab } from '../ui/focus-trap';
import {
  afterNextRender, Component, computed, effect, ElementRef, HostListener, inject,
  Injector, OnDestroy, signal, viewChild,
} from '@angular/core';
import { findAnchor, TourService } from './tour.service';
import { CardPosition, computePlacement, Rect } from './tour-logic';

const PAD = 6; // atstarpe ap izcelto elementu

@Component({
  selector: 'app-tour',
  templateUrl: './tour.component.html',
  styleUrl: './tour.component.scss',
})
export class TourComponent implements OnDestroy {
  protected readonly tour = inject(TourService);
  private readonly injector = inject(Injector);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly step = computed(() => this.tour.steps[this.tour.index()]);
  protected readonly spot = signal<Rect | null>(null);
  protected readonly pos = signal<CardPosition>({ placement: 'center', top: 0, left: 0 });
  private raf = 0;
  private lastFocus: HTMLElement | null = null;

  private readonly onViewportChange = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.measure());
  };

  constructor() {
    effect(() => {
      const active = this.tour.active();
      const step = this.step();
      if (!active) { this.detach(); return; }
      this.attach();
      const el = step.anchor ? findAnchor(step.anchor) : null;
      if (el) {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      }
      afterNextRender(() => { this.measure(); this.card()?.nativeElement.focus(); }, { injector: this.injector });
      // Pēc ritināšanas animācijas nomērām vēlreiz
      setTimeout(() => this.measure(), 350);
    });
  }

  private attached = false;
  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.lastFocus = document.activeElement as HTMLElement | null;
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('scroll', this.onViewportChange, true);
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('scroll', this.onViewportChange, true);
    this.lastFocus?.focus?.();
  }

  ngOnDestroy(): void { this.detach(); cancelAnimationFrame(this.raf); }

  private measure(): void {
    if (!this.tour.active()) return;
    const step = this.step();
    const el = step.anchor ? findAnchor(step.anchor) : null;
    let rect: Rect | null = null;
    if (el) {
      const r = el.getBoundingClientRect();
      // Apgriežam pēc ekrāna, lai liela karte neiziet ārā
      const top = Math.max(r.top - PAD, 0), left = Math.max(r.left - PAD, 0);
      const bottom = Math.min(r.bottom + PAD, window.innerHeight), right = Math.min(r.right + PAD, window.innerWidth);
      rect = { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
    }
    this.spot.set(rect);
    const c = this.card()?.nativeElement;
    const size = c ? { width: c.offsetWidth, height: c.offsetHeight } : { width: 320, height: 180 };
    this.pos.set(computePlacement(rect, size, { width: window.innerWidth, height: window.innerHeight }));
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (e.key === 'Escape') { e.preventDefault(); this.tour.skip(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.tour.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.tour.back(); }
    else if (e.key === 'Tab') this.trapFocus(e);
  }

  /** Tab staigā tikai pa kartītes pogām */
  private trapFocus(e: KeyboardEvent): void {
    const c = this.card()?.nativeElement;
    if (!c) return;
    const items = focusables(c, 'button:not([disabled])');
    if (!items.length) { e.preventDefault(); c.focus(); return; }
    trapTab(e, c, items);
  }
}
