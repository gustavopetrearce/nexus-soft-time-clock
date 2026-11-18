import { Injectable, inject, signal } from '@angular/core';

import { IncidentService } from './incident.service';

/**
 * Contador de incidencias abiertas (`incidents.status = OPEN`) que comparten el menú lateral, el
 * KPI de P12 y el chip de P13 (BRIEF: «es el mismo dato del KPI de abiertas»). Se lee del total
 * del listado filtrado por OPEN, que exige `incident:approve`, el mismo permiso del ítem del menú.
 * `null` mientras no se conoce (o sin permiso): entonces no se pinta el contador.
 */
@Injectable({ providedIn: 'root' })
export class OpenIncidentsStore {
  private readonly service = inject(IncidentService);

  readonly count = signal<number | null>(null);

  refresh(): void {
    this.service.list('OPEN', 0, 1).subscribe({
      next: (page) => this.count.set(page.totalElements),
      error: () => void 0,
    });
  }

  /** Para quien ya cargó el listado de abiertas y conoce el total sin otra petición. */
  set(total: number): void {
    this.count.set(total);
  }

  clear(): void {
    this.count.set(null);
  }
}
