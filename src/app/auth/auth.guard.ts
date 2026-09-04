import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Nepieteiktu lietotāju aizved uz login lapu un atceras, kur viņš gribēja tikt */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).token()
    ? true
    : inject(Router).createUrlTree(['/login'], state.url && state.url !== '/' ? { queryParams: { returnUrl: state.url } } : {});

/** Pēc login ļauj atgriezties tikai uz savu lapu, lai nevar aizsūtīt uz svešu vietni */
export function safeReturnUrl(url: string | null | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : '/';
}
