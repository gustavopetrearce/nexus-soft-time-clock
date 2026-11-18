import { Route } from '@angular/router';

/**
 * Rutas hijas sin componente para un catálogo con alta y edición en drawer (HIFI/08, reglas comunes):
 * `/x/new` y `/x/:id/edit` siguen existiendo (deep-links, enlaces viejos) pero ya no son páginas;
 * el catálogo se queda montado y abre el drawer encima. Ver `routedDrawer` (drawer.ts). Vive
 * aparte para que las rutas no arrastren MatDialog al bundle inicial.
 */
export function drawerChildRoutes(): Route[] {
  return [
    { path: '', children: [] },
    { path: 'new', data: { drawer: 'new' }, children: [] },
    { path: ':id/edit', data: { drawer: 'edit' }, children: [] },
  ];
}
