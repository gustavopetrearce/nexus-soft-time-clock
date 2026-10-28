import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

/**
 * Guard de autorización por permiso (RBAC en el frontend; el backend lo impone en el API).
 * Uso: `canActivate: [authGuard, requirePermission('user:manage')]`.
 *
 * Si la identidad (/me) aún no está cargada (p. ej. recarga directa sobre una ruta
 * profunda), la resuelve antes de decidir. Sin el permiso redirige a «Acceso denegado» (S02).
 */
export function requirePermission(permission: string): CanActivateFn {
  return () => {
    const store = inject(AuthStore);
    const auth = inject(AuthService);
    const router = inject(Router);

    const decide = () =>
      store.hasPermission(permission) ? true : router.createUrlTree(['/forbidden']);

    if (store.user()) {
      return decide();
    }
    if (!store.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    return auth.loadCurrentUser().pipe(
      map(() => decide()),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
  };
}
