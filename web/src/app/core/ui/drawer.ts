import { ComponentType } from '@angular/cdk/portal';
import { DestroyRef, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Drawer (DS/09 n.º 28, Estructura F): capa lateral derecha sobre MatDialog, que ya aporta velo,
 * Esc, trampa de foco y devolución del foco al cerrar. El ancho por breakpoint y la entrada
 * deslizante viven en `.nx-drawer-panel` (_material-overrides.scss).
 */
export function openDrawer<T, D = unknown, R = unknown>(
  dialog: MatDialog,
  component: ComponentType<T>,
  config: MatDialogConfig<D> = {},
): MatDialogRef<T, R> {
  return dialog.open<T, D, R>(component, {
    position: { top: '0', right: '0' },
    height: '100%',
    maxWidth: '100vw',
    maxHeight: '100vh',
    enterAnimationDuration: 0,
    panelClass: 'nx-drawer-panel',
    ...config,
  });
}

/** Estado del drawer de alta o edición que codifica la URL del catálogo. */
export interface DrawerRoute {
  mode: 'new' | 'edit';
  /** Id del registro en `:id/edit`; nulo al crear. */
  id: string | null;
}

/**
 * Sincroniza un drawer con las rutas de `drawerChildRoutes` (drawer-routes.ts). Se llama en el
 * constructor del catálogo: al entrar (o navegar) a `new` o `:id/edit` abre el drawer con `open`; al cerrarlo
 * vuelve a la ruta del catálogo sin dejar entrada en el historial, y si la URL deja de pedirlo
 * (atrás del navegador) lo cierra. `closed` recibe el resultado, p. ej. para recargar el listado.
 */
export function routedDrawer<T, R>(options: {
  open: (state: DrawerRoute) => MatDialogRef<T, R>;
  closed?: (result: R | undefined) => void;
}): void {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const injector = inject(Injector);
  let ref: MatDialogRef<T, R> | null = null;

  const read = (): DrawerRoute | null => {
    const child = route.firstChild?.snapshot;
    const mode = child?.data['drawer'] as DrawerRoute['mode'] | undefined;
    return mode ? { mode, id: child?.paramMap.get('id') ?? null } : null;
  };

  const sync = (): void => {
    const state = read();
    if (state && !ref) {
      const opened = options.open(state);
      ref = opened;
      opened.afterClosed().subscribe((result) => {
        if (ref === opened) ref = null;
        options.closed?.(result);
        if (read()) void router.navigate(['./'], { relativeTo: route, replaceUrl: true });
      });
    } else if (!state && ref) {
      ref.close();
    }
  };

  router.events
    .pipe(
      filter((e) => e instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe(sync);
  // La primera vez (deep-link) se abre tras el primer render del catálogo.
  afterNextRender(sync, { injector });
}
