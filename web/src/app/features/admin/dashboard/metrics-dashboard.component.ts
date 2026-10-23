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
        gap: var(--sp-4);
      }
      .metric-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-1);
        padding: var(--sp-5);
      }
      .metric-card.highlight-danger { border-color: var(--danger); background: var(--danger-bg); }

      .metric-head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-4); }
      .metric-head h3 { margin: 0; font-size: var(--font-card-title); font-weight: 700; }
      .metric-icon {
        width: 38px; height: 38px; border-radius: var(--radius-md);
        display: grid; place-items: center; flex: 0 0 auto;
      }
      .metric-icon.info { color: var(--info); background: var(--info-bg); }
      .metric-icon.danger { color: var(--danger); background: var(--danger-bg); }

      .metric-split { display: flex; gap: var(--sp-5); }
      .metric-item { display: flex; flex-direction: column; gap: 6px; }
      .metric-value { font-size: 1.8rem; font-weight: 700; line-height: 1; }
      .metric-value.big { font-size: 2.4rem; margin-bottom: var(--sp-1); }
      .metric-label { font-size: var(--font-small); color: var(--text-muted); }
      .metric-sub { font-size: var(--font-small); color: var(--text-muted); margin: 0 0 var(--sp-4); }
      .danger-button { background: var(--danger) !important; color: #fff !important; }

      .section-title {
        font-size: var(--font-small);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
        margin: var(--sp-6) 0 var(--sp-3);
      }
      .quick-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: var(--sp-3);
      }
      .quick-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--sp-3);
        padding: var(--sp-4);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        color: var(--text);
        text-decoration: none;
        font-weight: 600;
        font-size: var(--font-body);
        transition: border-color 0.12s ease, background 0.12s ease;
      }
      .quick-link:hover { background: var(--surface-hover); border-color: var(--brand-border); }
      .quick-icon {
        width: 36px; height: 36px; border-radius: var(--radius-md);
        display: grid; place-items: center;
        background: var(--brand-soft); color: var(--brand);
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
