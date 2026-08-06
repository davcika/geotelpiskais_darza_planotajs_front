import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { BedPage } from './bed/bed-page/bed-page';
import { LoginPage } from './auth/login-page/login-page';
import { GardenSwitchPage } from './garden/garden-switch-page';
import { hubGuard, onboardingGuard, welcomeGuard } from './garden/hub.guards';
import { GardenMap } from './map/garden-map/garden-map';
import { OnboardingPage } from './onboarding/onboarding-page/onboarding-page';
import { WelcomePage } from './onboarding/welcome-page/welcome-page';

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  { path: 'welcome', component: WelcomePage, canActivate: [authGuard, welcomeGuard] },
  { path: 'onboarding', component: OnboardingPage, canActivate: [authGuard, onboardingGuard] },
  { path: 'invite/:token', loadComponent: () => import('./garden/invite-page').then((m) => m.InvitePage), canActivate: [authGuard] },
  { path: 'switch-garden', component: GardenSwitchPage, canActivate: [authGuard] },
  { path: 'beds/:id', component: BedPage, canActivate: [authGuard, hubGuard] },
  { path: 'my-plants', loadComponent: () => import('./catalog/my-plants/my-plants').then((m) => m.MyPlants), canActivate: [authGuard] },
  { path: 'review-plants', loadComponent: () => import('./catalog/review-plants/review-plants').then((m) => m.ReviewPlants), canActivate: [authGuard] },
  { path: 'today', loadComponent: () => import('./today/today-page').then((m) => m.TodayPage), canActivate: [authGuard, hubGuard] },
  { path: '', pathMatch: 'full', component: GardenMap, canActivate: [authGuard, hubGuard] },
  { path: '', loadChildren: () => import('./catalog/catalog.routes').then((m) => m.CATALOG_ROUTES) },
  { path: '**', redirectTo: '' },
];
