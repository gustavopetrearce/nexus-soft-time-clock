import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { DashboardSummary } from './dashboard.models';
import { OpenIncidentsStore } from '../../incidents/open-incidents.store';
import { DashboardService } from './dashboard.service';

/**
 * P12 · Panel (RF-24): cinco KPI del día con tono y recuadro (HIFI/08 R3); «Incidencias abiertas»
 * enlaza a P13 si el usuario puede resolverlas. La tendencia contra ayer, las descripciones, las
 * barras, el cupo «de N» y la lista «Entradas y salidas recientes» (R4) esperan a que se cierre la
 * devolución de E1/06 (cálculos de los KPI): por decisión del usuario solo se muestran las cifras
 * que ya calcula el backend.
 * El admin de plataforma (sin tenant) no tiene métricas de empresa: ve el acceso a Empresas.
 */
@Component({
  selector: 'app-metrics-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    TranslocoPipe,
    AppNumberPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
  ],
  styles: [
    `
      .nx-kpi { text-decoration: none; color: inherit; }
      .nx-kpi__concepto mat-icon { font-size: var(--nx-icon-size-md); width: var(--nx-icon-size-md); height: var(--nx-icon-size-md); }
      .nx-kpi__ir { font-size: var(--nx-icon-size-sm); width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); vertical-align: middle; margin-left: var(--nx-space-1); }
      app-loading-bar { margin-bottom: var(--nx-space-gap-group); }
    `,
  ],
  template: `
    @if (isPlatformAdmin()) {
      <app-page-header [title]="'dashboard.platformTitle' | transloco" />
      <div class="nx-kpis nx-kpis--3">
        <a class="nx-kpi nx-kpi--link" routerLink="/companies" [attr.aria-label]="'dashboard.companiesLink' | transloco">
          <mat-icon class="nx-kpi__ir">north_east</mat-icon>
          <span class="nx-kpi__label">{{ 'dashboard.companies' | transloco }}</span>
          <span class="nx-encabezado__desc">{{ 'dashboard.companiesText' | transloco }}</span>
        </a>
      </div>
    } @else {
      <app-loading-bar [active]="loading()" />
      <app-page-header [title]="'dashboard.title' | transloco" />

      @if (error()) {
        <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
          <button mat-stroked-button type="button" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </app-empty-state>
      } @else {
        @if (summary(); as s) {
        <div class="nx-kpis">
          <div class="nx-kpi nx-kpi--success">
            <span class="nx-kpi__label">{{ 'dashboard.acceptedToday' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--success"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">verified_user</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ s.attendanceTodayAccepted | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--error">
            <span class="nx-kpi__label">{{ 'dashboard.rejectedToday' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--error"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">cancel</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ s.attendanceTodayRejected | appNumber }}</span></span>
          </div>
          @if (can('incident:approve')) {
            <a class="nx-kpi nx-kpi--warning nx-kpi--link" routerLink="/incidents" [attr.aria-label]="'dashboard.openIncidentsLink' | transloco">
              <span class="nx-kpi__label">{{ 'dashboard.openIncidents' | transloco }}<mat-icon class="nx-kpi__ir" aria-hidden="true">north_east</mat-icon></span>
              <span class="nx-kpi__concepto nx-kpi__concepto--warning"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">report_problem</mat-icon></span>
              <span class="nx-kpi__fila">
                <span class="nx-kpi__valor nx-text-numeric">{{ openIncidents(s) | appNumber }}</span>
                <span class="nx-chip nx-chip--warning">{{ 'dashboard.toResolve' | transloco }}</span>
              </span>
            </a>
          } @else {
            <div class="nx-kpi nx-kpi--warning">
              <span class="nx-kpi__label">{{ 'dashboard.openIncidents' | transloco }}</span>
              <span class="nx-kpi__concepto nx-kpi__concepto--warning"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">report_problem</mat-icon></span>
              <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ openIncidents(s) | appNumber }}</span></span>
            </div>
          }
          <div class="nx-kpi nx-kpi--info">
            <span class="nx-kpi__label">{{ 'dashboard.activeUsers' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--info"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">group</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ s.activeUsers | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--brand">
            <span class="nx-kpi__label">{{ 'dashboard.activeSites' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--brand"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">domain</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ s.activeWorkSites | appNumber }}</span></span>
          </div>
        </div>
        }
      }
    }
  `,
})
export class MetricsDashboardComponent {
  private readonly service = inject(DashboardService);
  private readonly store = inject(AuthStore);
  private readonly openIncidentsStore = inject(OpenIncidentsStore);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  /** El admin de plataforma (SUPER_ADMIN, sin tenant) no tiene métricas de empresa: ve un panel global. */
  protected readonly isPlatformAdmin = computed(() => this.store.user()?.platformAdmin ?? false);

  private fetched = false;

  constructor() {
    // Espera a que /me esté cargado (deep-link/reload) antes de decidir; el admin de
    // plataforma no consulta métricas tenant-scoped (evita el 500 por falta de tenant).
    effect(
      () => {
        const user = this.store.user();
        if (!user || this.fetched) {
          return;
        }
        this.fetched = true;
        if (!user.platformAdmin) {
          this.load();
        }
      },
      { allowSignalWrites: true },
    );
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.summary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Mismo dato que el menú y P13 cuando ya se conoce (el resumen va con caché de 60 s). */
  protected openIncidents(s: DashboardSummary): number {
    return this.openIncidentsStore.count() ?? s.openIncidents;
  }

  protected can(permission: string): boolean {
    return this.store.hasPermission(permission);
  }
}
