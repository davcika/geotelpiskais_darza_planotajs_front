import { Component, DestroyRef, ElementRef, effect, inject, signal, computed, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { GardenStore } from './garden/garden-store';
import { TaskStore } from './task/task-store';
import { TaskUndoSnackbar } from './task/undo-snackbar';
import { TourComponent } from './tour/tour.component';
import { TourService } from './tour/tour.service';
import { pathOf } from './shared/format';
import { focusables, trapTab } from './ui/focus-trap';

const NO_TABBAR = /^\/(login|welcome|onboarding)(\/|$)/;
const MOBILE = '(max-width: 640px)';
/** Jāsakrīt ar app.scss, drošā zona te nav ieskaitīta */
const TABBAR_PX = 60;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TourComponent, TaskUndoSnackbar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly tour = inject(TourService);
  private readonly tasks = inject(TaskStore);
  private readonly gardens = inject(GardenStore);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('moreButton');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => pathOf(e.urlAfterRedirects)),
    ),
    { initialValue: '' },
  );
  private readonly mobile = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly tabBar = computed(() => this.mobile() && !!this.auth.token() && !!this.url() && !NO_TABBAR.test(this.url()));
  protected readonly planActive = computed(() => this.url() === '/' || this.url().startsWith('/beds/'));

  constructor() {
    const media = typeof matchMedia === 'function' ? matchMedia(MOBILE) : null;
    if (media) {
      this.mobile.set(media.matches);
      const onChange = (e: MediaQueryListEvent) => this.mobile.set(e.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }
    // Atkāpe apakšā, lai josla nenosedz lapas saturu
    effect(() => {
      const on = this.tabBar();
      const root = document.documentElement;
      root.style.setProperty('--tabbar-height', on ? `${TABBAR_PX}px` : '0px');
      document.body.style.paddingBottom = on ? `calc(${TABBAR_PX}px + env(safe-area-inset-bottom, 0px))` : '';
    });
    effect(() => {
      this.url();
      this.moreOpen.set(false);
    });
    // Pēc izlogošanās nākamais lietotājs nedrīkst redzēt iepriekšējā datus
    effect(() => {
      if (this.auth.token()) return;
      untracked(() => {
        this.tasks.reset();
        this.gardens.reset();
      });
    });
    // Atverot paneli, fokuss uz pirmo vienumu
    effect(() => {
      const sheet = this.sheet()?.nativeElement;
      if (sheet) focusables(sheet)[0]?.focus();
    });
  }

  protected toggleMore(): void {
    if (this.moreOpen()) this.closeMore();
    else this.moreOpen.set(true);
  }

  /** Fokuss atgriežas uz More pogu */
  protected closeMore(): void {
    this.moreOpen.set(false);
    setTimeout(() => this.moreButton()?.nativeElement.focus());
  }

  /** Tab paliek paneļa iekšā */
  protected trapFocus(event: Event): void {
    const sheet = this.sheet()?.nativeElement;
    if (sheet) trapTab(event as KeyboardEvent, sheet);
  }

  protected startTutorial(): void {
    this.moreOpen.set(false);
    // Apmācība rāda kartes elementus, tāpēc vispirms ejam uz karti
    if (this.url() === '/') this.tour.start();
    else this.router.navigateByUrl('/').then(() => setTimeout(() => this.tour.start(), 300));
  }

  protected logout(): void {
    this.moreOpen.set(false);
    this.auth.logout();
  }
}
