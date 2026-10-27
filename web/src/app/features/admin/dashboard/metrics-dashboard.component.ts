import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { DashboardSummary } from './dashboard.models';
import { DashboardService } from './dashboard.service';

interface QuickLink {
  route: string;
  icon: string;
  /** Clave de traducción del texto del acceso. */
  label: string;
  permission?: string;
}

const QUICK_LINKS: readonly QuickLink[] = [
  { route: '/incidents', icon: 'report_problem', label: 'dashboard.links.newIncident', permission: 'incident:approve' },
  { route: '/reports', icon: 'bar_chart', label: 'dashboard.links.newReport', permission: 'report:export' },
  { route: '/users', icon: 'group', label: 'dashboard.links.users', permission: 'user:manage' },
  { route: '/work-sites', icon: 'place', label: 'dashboard.links.workSites', permission: 'worksite:manage' },
  { route: '/map', icon: 'public', label: 'dashboard.links.map', permission: 'dashboard:read' },
  { route: '/scheduling', icon: 'event', label: 'dashboard.links.scheduling', permission: 'schedule:manage' },
];

/**
 * Panel de indicadores (RF-24): tres tarjetas compuestas con la métrica exacta que expone el
 * backend, y accesos rápidos a las secciones que el usuario puede operar. Sin gráficas ni
 * comparativos: duplicarían las mismas cinco cifras ya visibles en las tarjetas.
 */
@Component({
  selector: 'app-metrics-dashboard',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, PageHeaderComponent, EmptyStateComponent, TranslocoPipe],
  template: `
    @if (isPlatformAdmin()) {
      <app-page-header [title]="'dashboard.platformTitle' | transloco" [subtitle]="'dashboard.platformSubtitle' | transloco" />
      <div class="card-row">
        <div class="metric-card">
          <div class="metric-head">
            <span class="metric-icon info"><mat-icon>business</mat-icon></span>
            <h3>{{ 'dashboard.companies' | transloco }}</h3>
          </div>
          <p class="metric-sub">
            {{ 'dashboard.companiesText' | transloco }}
          </p>
          <a mat-flat-button color="primary" routerLink="/companies" class="full-width">
            <mat-icon>arrow_forward</mat-icon> {{ 'dashboard.goToCompanies' | transloco }}
          </a>
        </div>
      </div>
    } @else {
    <app-page-header [title]="'dashboard.title' | transloco" [subtitle]="'dashboard.subtitle' | transloco" />

    @if (summary(); as s) {
      <div class="card-row">
        <div class="metric-card">
          <div class="metric-head">
            <span class="metric-icon info"><mat-icon>group</mat-icon></span>
            <h3>{{ 'dashboard.attendanceToday' | transloco }}</h3>
          </div>
          <div class="metric-split">
            <div class="metric-item">
              <div class="metric-value">{{ s.attendanceTodayAccepted }}</div>
              <span class="status-chip success">{{ 'dashboard.accepted' | transloco }}</span>
            </div>
            <div class="metric-item">
              <div class="metric-value">{{ s.attendanceTodayRejected }}</div>
              <span class="status-chip danger">{{ 'dashboard.rejected' | transloco }}</span>
            </div>
          </div>
        </div>

        <div class="metric-card highlight-danger">
          <div class="metric-head">
            <span class="metric-icon danger"><mat-icon>report_problem</mat-icon></span>
            <h3>{{ 'dashboard.openIncidents' | transloco }}</h3>
          </div>
          <div class="metric-value big">{{ s.openIncidents }}</div>
          <p class="metric-sub">{{ 'dashboard.needsReview' | transloco }}</p>
          @if (can('incident:approve')) {
            <a mat-flat-button routerLink="/incidents" class="full-width danger-button">
              <mat-icon>list</mat-icon> {{ 'dashboard.viewIncidents' | transloco }}
            </a>
          }
        </div>

        <div class="metric-card">
          <div class="metric-head">
            <span class="metric-icon info"><mat-icon>verified</mat-icon></span>
            <h3>{{ 'dashboard.activeOperation' | transloco }}</h3>
          </div>
          <div class="metric-split">
            <div class="metric-item">
              <div class="metric-value">{{ s.activeUsers }}</div>
              <span class="metric-label">{{ 'dashboard.activeUsers' | transloco }}</span>
            </div>
            <div class="metric-item">
              <div class="metric-value">{{ s.activeWorkSites }}</div>
              <span class="metric-label">{{ 'dashboard.activeSites' | transloco }}</span>
            </div>
          </div>
        </div>
      </div>

      @if (visibleLinks().length > 0) {
        <h3 class="section-title">{{ 'dashboard.quickLinks' | transloco }}</h3>
        <div class="quick-grid">
          @for (link of visibleLinks(); track link.route) {
            <a class="quick-link" [routerLink]="link.route">
              <span class="quick-icon"><mat-icon>{{ link.icon }}</mat-icon></span>
              <span class="quick-label">{{ link.label | transloco }}</span>
            </a>
          }
        </div>
      }
    } @else if (error()) {
      <app-empty-state icon="error_outline" [message]="error()! | transloco" />
    } @else {
      <p class="muted">{{ 'dashboard.loading' | transloco }}</p>
    }
    }
  `,
  styles: [
    `
      .card-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--nx-space-4);
      }
      .metric-card {
        background: var(--nx-color-surface-default);
        border: 1px solid var(--nx-color-border-default);
        border-radius: var(--nx-radius-lg);
        box-shadow: var(--nx-shadow-1);
        padding: var(--nx-space-6);
      }
      .metric-card.highlight-danger { border-color: var(--nx-color-status-error-fg); background: var(--nx-color-status-error-bg); }

      .metric-head { display: flex; align-items: center; gap: var(--nx-space-3); margin-bottom: var(--nx-space-4); }
      .metric-head h3 { margin: 0; font-size: var(--nx-text-heading-3-size); font-weight: var(--nx-font-weight-bold); }
      .metric-icon {
        width: 38px; height: 38px; border-radius: var(--nx-radius-md);
        display: grid; place-items: center; flex: 0 0 auto;
      }
      .metric-icon.info { color: var(--nx-color-status-info-fg); background: var(--nx-color-status-info-bg); }
      .metric-icon.danger { color: var(--nx-color-status-error-fg); background: var(--nx-color-status-error-bg); }

      .metric-split { display: flex; gap: var(--nx-space-6); }
      .metric-item { display: flex; flex-direction: column; gap: 6px; }
      .metric-value { font-size: 1.8rem; font-weight: var(--nx-font-weight-bold); line-height: 1; }
      .metric-value.big { font-size: 2.4rem; margin-bottom: var(--nx-space-1); }
      .metric-label { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); }
      .metric-sub { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); margin: 0 0 var(--nx-space-4); }
      .danger-button { background: var(--nx-color-status-error-fg) !important; color: var(--nx-color-text-inverse) !important; }

      .section-title {
        font-size: var(--nx-text-small-size);
        font-weight: var(--nx-font-weight-bold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nx-color-text-secondary);
        margin: var(--nx-space-8) 0 var(--nx-space-3);
      }
      .quick-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--nx-space-3);
      }
      .quick-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--nx-space-3);
        padding: var(--nx-space-4);
        background: var(--nx-color-surface-default);
        border: 1px solid var(--nx-color-border-default);
        border-radius: var(--nx-radius-lg);
        color: var(--nx-color-text-primary);
        text-decoration: none;
        font-weight: var(--nx-font-weight-semibold);
        font-size: var(--nx-text-body-size);
        transition: border-color 0.12s var(--nx-motion-easing-standard), background 0.12s var(--nx-motion-easing-standard);
      }
      .quick-link:hover { background: var(--nx-color-surface-hover); border-color: var(--nx-color-border-brand); }
      .quick-icon {
        width: 36px; height: 36px; border-radius: var(--nx-radius-md);
        display: grid; place-items: center;
        background: var(--nx-color-action-primary-subtle); color: var(--nx-color-action-primary);
      }
    `,
  ],
})
export class MetricsDashboardComponent {
  private readonly service = inject(DashboardService);
  private readonly store = inject(AuthStore);

  protected readonly summary = signal<DashboardSummary | null>(null);
  /** Clave de traducción del error de carga, si lo hubo. */
  protected readonly error = signal<string | null>(null);

  /** El admin de plataforma (SUPER_ADMIN, sin tenant) no tiene métricas de empresa: ve un panel global. */
  protected readonly isPlatformAdmin = computed(() => this.store.user()?.platformAdmin ?? false);

  protected readonly visibleLinks = computed(() =>
    QUICK_LINKS.filter((l) => !l.permission || this.store.hasPermission(l.permission)),
  );

  private fetched = false;

  constructor() {
    // Espera a que /me esté cargado (deep-link/reload) antes de decidir; el admin de
    // plataforma no consulta métricas tenant-scoped (evita el 500 por falta de tenant).
    effect(() => {
      const user = this.store.user();
      if (!user || this.fetched) {
        return;
      }
      this.fetched = true;
      if (user.platformAdmin) {
        return;
      }
      this.service.summary().subscribe({
        next: (s) => this.summary.set(s),
        error: () => this.error.set('dashboard.loadError'),
      });
    });
  }

  protected can(permission: string): boolean {
    return this.store.hasPermission(permission);
  }
}
