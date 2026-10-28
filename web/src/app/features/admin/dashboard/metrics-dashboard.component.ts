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
import { DashboardService } from './dashboard.service';

/**
 * P12 · Panel (RF-24): cinco KPI informativos del día; «Incidencias abiertas» enlaza a P13 si el
 * usuario puede resolverlas. La tabla de sincronización de dispositivos del redline (R4) queda
 * fuera hasta que el backend exponga `devices.last_sync_at` / `pending_count`.
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
      .nx-kpi__concepto, .nx-kpi__ir { font-size: var(--nx-icon-size-lg); width: var(--nx-icon-size-lg); height: var(--nx-icon-size-lg); }
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
          <div class="nx-kpi">
            <span class="nx-kpi__label">{{ 'dashboard.acceptedToday' | transloco }}</span>
            <span class="nx-kpi__valor nx-text-numeric">{{ s.attendanceTodayAccepted | appNumber }}</span>
            <mat-icon class="nx-kpi__concepto" aria-hidden="true">verified_user</mat-icon>
          </div>
          <div class="nx-kpi">
            <span class="nx-kpi__label">{{ 'dashboard.rejectedToday' | transloco }}</span>
            <span class="nx-kpi__valor nx-text-numeric">{{ s.attendanceTodayRejected | appNumber }}</span>
            <mat-icon class="nx-kpi__concepto" aria-hidden="true">cancel</mat-icon>
          </div>
          @if (can('incident:approve')) {
            <a class="nx-kpi nx-kpi--link" routerLink="/incidents" [attr.aria-label]="'dashboard.openIncidentsLink' | transloco">
              <mat-icon class="nx-kpi__ir" aria-hidden="true">north_east</mat-icon>
              <span class="nx-kpi__label">{{ 'dashboard.openIncidents' | transloco }}</span>
              <span class="nx-kpi__valor nx-text-numeric">{{ s.openIncidents | appNumber }}</span>
            </a>
          } @else {
            <div class="nx-kpi">
              <span class="nx-kpi__label">{{ 'dashboard.openIncidents' | transloco }}</span>
              <span class="nx-kpi__valor nx-text-numeric">{{ s.openIncidents | appNumber }}</span>
              <mat-icon class="nx-kpi__concepto" aria-hidden="true">report_problem</mat-icon>
            </div>
          }
          <div class="nx-kpi">
            <span class="nx-kpi__label">{{ 'dashboard.activeUsers' | transloco }}</span>
            <span class="nx-kpi__valor nx-text-numeric">{{ s.activeUsers | appNumber }}</span>
            <mat-icon class="nx-kpi__concepto" aria-hidden="true">group</mat-icon>
          </div>
          <div class="nx-kpi">
            <span class="nx-kpi__label">{{ 'dashboard.activeSites' | transloco }}</span>
            <span class="nx-kpi__valor nx-text-numeric">{{ s.activeWorkSites | appNumber }}</span>
            <mat-icon class="nx-kpi__concepto" aria-hidden="true">domain</mat-icon>
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

  protected can(permission: string): boolean {
    return this.store.hasPermission(permission);
  }
}
