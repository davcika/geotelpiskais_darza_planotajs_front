import { Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';

/** Kataloga maršruti, app.routes.ts tos pievieno ar vienu rindu */
export const CATALOG_ROUTES: Routes = [
  { path: 'plants', loadComponent: () => import('./overview/plant-overview').then((m) => m.PlantOverview), canActivate: [authGuard] },
];
