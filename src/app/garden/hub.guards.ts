import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs';
import { GardenDto, GardenStore } from './garden-store';

/** Kurp sūtīt lietotāju, ja nav dārzu vai dārzam nav zonas */
export function gardenRedirect(router: Router, current: GardenDto | null): UrlTree | null {
  if (!current) return router.createUrlTree(['/welcome']);
  if (!current.hubGeometry) return router.createUrlTree(['/onboarding']);
  return null;
}

/** Kartei un dobes lapai vajag dārzu ar zonu */
export const hubGuard: CanActivateFn = () => {
  const router = inject(Router);
  const store = inject(GardenStore);
  return store.fetchAll().pipe(map(() => gardenRedirect(router, store.current()) ?? true));
};

/** Onboarding dārzam bez zonas vai adreses maiņai */
export const onboardingGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const store = inject(GardenStore);
  const changing = route.queryParamMap.has('change');
  return store.fetchAll().pipe(
    map(() => {
      const garden = store.current();
      if (!garden) return router.createUrlTree(['/welcome']);
      return !garden.hubGeometry || changing ? true : router.createUrlTree(['/']);
    }),
  );
};

/** Sākuma ekrāns tikai lietotājam bez dārziem */
export const welcomeGuard: CanActivateFn = () => {
  const router = inject(Router);
  const store = inject(GardenStore);
  return store.fetchAll().pipe(map((gardens) => (gardens.length ? router.createUrlTree(['/']) : true)));
};
