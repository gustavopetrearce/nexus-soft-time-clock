import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as XLSX from 'xlsx';

import { LanguageService } from '../../core/i18n/language.service';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { ROLE_CODES, roleLabel } from '../admin/roles/role.models';
import { ColumnDef, Person, defaultColumns } from './people.models';
import { PeopleService } from './people.service';

const STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED', 'INVITED'];
type Dim = 'roles' | 'status' | 'gender' | 'tenure';

/**
 * Reporte flexible de Personas: tabla ancha con selección de columnas, filtros por columna
 * (tipo Excel), indicadores (cumpleaños, aniversario, vacaciones por aprobar), exportación a
 * Excel y una gráfica configurable. Requiere {@code user:manage}.
 */
@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatCheckboxModule, MatTooltipModule, MatProgressBarModule,
    PageHeaderComponent, StatusChipComponent, EmptyStateComponent, TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'people.title' | transloco" [subtitle]="'people.subtitle' | transloco">
      <button mat-stroked-button [matMenuTriggerFor]="colMenu"><mat-icon>view_column</mat-icon> {{ 'people.columns' | transloco }}</button>
      <button mat-stroked-button (click)="reload()"><mat-icon>refresh</mat-icon></button>
      <button mat-flat-button color="primary" (click)="exportExcel()"><mat-icon>download</mat-icon> {{ 'people.exportExcel' | transloco }}</button>
    </app-page-header>

    <mat-menu #colMenu="matMenu" class="col-menu">
      <div (click)="$event.stopPropagation()" class="col-menu-body">
        @for (c of columns(); track c.key) {
          <mat-checkbox [checked]="c.visible" [disabled]="c.key === 'person'" (change)="toggleColumn(c.key)">{{ c.label | transloco }}</mat-checkbox>
        }
      </div>
    </mat-menu>

    <!-- KPIs -->
    <div class="kpis">
      <div class="kpi"><div class="k-ic brand"><mat-icon>groups</mat-icon></div><div><div class="k-n">{{ people().length }}</div><div class="k-l">{{ 'people.kpi.people' | transloco }}</div></div></div>
      <div class="kpi"><div class="k-ic pink"><mat-icon>cake</mat-icon></div><div><div class="k-n">{{ birthdays() }}</div><div class="k-l">{{ 'people.kpi.birthdays' | transloco }}</div></div></div>
      <div class="kpi"><div class="k-ic danger"><mat-icon>beach_access</mat-icon></div><div><div class="k-n">{{ vacationsPending() }}</div><div class="k-l">{{ 'people.col.vacation' | transloco }}</div></div></div>
      <div class="kpi"><div class="k-ic success"><mat-icon>celebration</mat-icon></div><div><div class="k-n">{{ anniversaries() }}</div><div class="k-l">{{ 'people.kpi.anniversaries' | transloco }}</div></div></div>
    </div>

    <!-- Gráfica -->
    <mat-card class="chart-card">
      <mat-card-content>
        <div class="chart-head">
          <h3>{{ 'people.distribution' | transloco }}</h3>
          <div class="dim-seg">
            @for (d of dims; track d.key) {
              <button [class.on]="dim() === d.key" (click)="dim.set(d.key)">{{ d.label | transloco }}</button>
            }
          </div>
        </div>
        @if (chartData().length === 0) {
          <p class="muted">{{ 'people.noChartData' | transloco }}</p>
        } @else {
          <div class="bars">
            @for (b of chartData(); track b.label) {
              <div class="bar-row">
                <span class="bar-label">{{ b.label }}</span>
                <div class="bar-track"><div class="bar-fill" [style.width.%]="b.pct"></div></div>
                <span class="bar-val">{{ b.count }}</span>
              </div>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-content>
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }
        @if (hasFilters()) {
          <div class="filter-actions"><button mat-button (click)="clearFilters()"><mat-icon>filter_alt_off</mat-icon> {{ 'common.clearFilters' | transloco }}</button>
            <span class="muted">{{ 'people.countOf' | transloco: { shown: filtered().length, total: people().length } }}</span></div>
        }

        <div class="table-wrap">
          <table mat-table [dataSource]="filtered()" class="people-table">
            <!-- ===== Columnas ===== -->
            <ng-container matColumnDef="person">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.person' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                <div class="u-cell">
                  <div class="av" [style.background]="avatarColor(p).bg" [style.color]="avatarColor(p).fg">{{ initials(p) }}</div>
                  <div class="u-txt"><div class="nm">{{ p.fullName }}</div><div class="sub">{{ p.email }}</div></div>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="employeeCode">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.employeeCode' | transloco }}</th>
              <td mat-cell *matCellDef="let p"><span class="mono">{{ p.employeeCode || '—' }}</span></td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.status' | transloco }}</th>
              <td mat-cell *matCellDef="let p"><app-status-chip [status]="p.status" /></td>
            </ng-container>
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.roles' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                @if (p.roles.length) { <span class="role-tags">@for (r of p.roles; track r) { <span class="role-tag">{{ rl(r) }}</span> }</span> } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="birthday">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.birthday' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                @if (p.isBirthdayToday) {
                  <span class="pill pink" [matTooltip]="'people.birthdayToday' | transloco"><mat-icon>cake</mat-icon> {{ 'people.today' | transloco }}</span>
                } @else if (p.birthDate) { <span class="muted">{{ fmtShort(p.birthDate) }}</span> } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="vacation">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.vacation' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                @if (p.pendingVacations > 0) {
                  <span class="pill danger" [matTooltip]="'people.vacationsTooltip' | transloco"><mat-icon>beach_access</mat-icon> {{ p.pendingVacations }}</span>
                } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="anniversary">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.anniversary' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                @if (p.isAnniversaryToday) {
                  <span class="pill success" [matTooltip]="'people.anniversaryTooltip' | transloco"><mat-icon>celebration</mat-icon> {{ years(p.yearsOfService) }}</span>
                } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="years">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.years' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ p.yearsOfService === null ? '—' : years(p.yearsOfService) }}</td>
            </ng-container>
            <ng-container matColumnDef="hireDate">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.hireDate' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ fmtDate(p.hireDate) }}</td>
            </ng-container>
            <ng-container matColumnDef="birthDate">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.birthDate' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ fmtDate(p.birthDate) }}</td>
            </ng-container>
            <ng-container matColumnDef="gender">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.gender' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ genderLabel(p.gender) }}</td>
            </ng-container>
            <ng-container matColumnDef="phone">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.phone' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ p.phone || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="address">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.address' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ p.address || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="emergency">
              <th mat-header-cell *matHeaderCellDef>{{ 'people.col.emergency' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ emergency(p) }}</td>
            </ng-container>

            <!-- ===== Fila de filtros (Excel) ===== -->
            @for (c of columns(); track c.key) {
              <ng-container [matColumnDef]="c.key + '-f'">
                <th mat-header-cell *matHeaderCellDef class="fcell">
                  @switch (c.filter) {
                    @case ('text') { <input class="col-filter" [placeholder]="'common.filter' | transloco" [value]="filters()[c.key] || ''" (input)="setFilter(c.key, $event)" /> }
                    @case ('status') {
                      <select class="col-filter" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                        <option value="">{{ 'common.all' | transloco }}</option>
                        @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                      </select>
                    }
                    @case ('roles') {
                      <select class="col-filter" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                        <option value="">{{ 'common.all' | transloco }}</option>
                        @for (r of roleCodes; track r) { <option [value]="r">{{ rl(r) }}</option> }
                      </select>
                    }
                    @case ('flag') {
                      <select class="col-filter" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                        <option value="">{{ 'common.all' | transloco }}</option>
                        <option value="yes">{{ 'people.onlyWith' | transloco }}</option>
                      </select>
                    }
                  }
                </th>
              </ng-container>
            }

            <tr mat-header-row *matHeaderRowDef="displayed()"></tr>
            <tr mat-header-row *matHeaderRowDef="filterRow()"></tr>
            <tr mat-row *matRowDef="let row; columns: displayed()"></tr>
          </table>
        </div>

        @if (!loading() && filtered().length === 0) {
          <app-empty-state icon="groups" [message]="'people.empty' | transloco" />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--nx-space-4); margin-bottom: var(--nx-space-4); }
      @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
      .kpi { display: flex; align-items: center; gap: 12px; background: var(--nx-color-surface-default); border: 1px solid var(--nx-color-border-default); border-radius: var(--nx-radius-lg); box-shadow: var(--nx-shadow-1); padding: 16px; }
      .k-ic { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; flex: none; }
      .k-ic.brand { background: var(--nx-color-action-primary-subtle); color: var(--nx-color-action-primary); }
      .k-ic.pink { background: var(--nx-color-status-neutral-bg); color: var(--nx-color-status-neutral-fg); }
      .k-ic.danger { background: var(--nx-color-status-error-bg); color: var(--nx-color-status-error-fg); }
      .k-ic.success { background: var(--nx-color-status-success-bg); color: var(--nx-color-status-success-fg); }
      .k-n { font-size: 1.4rem; font-weight: var(--nx-font-weight-bold); line-height: 1; }
      .k-l { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); margin-top: 3px; }

      .chart-card { margin-bottom: var(--nx-space-4); }
      .chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--nx-space-3); }
      .chart-head h3 { margin: 0; font-size: 1.05rem; font-weight: var(--nx-font-weight-bold); }
      .dim-seg { display: inline-flex; background: var(--nx-color-surface-subtle); border: 1px solid var(--nx-color-border-default); border-radius: 10px; padding: 3px; gap: 2px; }
      .dim-seg button { border: none; background: transparent; color: var(--nx-color-text-secondary); font: inherit; font-weight: var(--nx-font-weight-semibold); font-size: var(--nx-text-small-size); padding: 6px 12px; border-radius: 8px; cursor: pointer; }
      .dim-seg button.on { background: var(--nx-color-action-primary); color: var(--nx-color-on-action-primary); }
      .bars { display: flex; flex-direction: column; gap: 10px; }
      .bar-row { display: grid; grid-template-columns: 160px 1fr 44px; align-items: center; gap: 12px; }
      .bar-label { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bar-track { background: var(--nx-color-surface-subtle); border-radius: var(--nx-radius-full); height: 14px; overflow: hidden; }
      .bar-fill { background: var(--nx-color-action-primary); height: 100%; border-radius: var(--nx-radius-full); transition: width .3s var(--nx-motion-easing-standard); min-width: 2px; }
      .bar-val { font-weight: var(--nx-font-weight-bold); font-size: var(--nx-text-small-size); }

      .filter-actions { display: flex; align-items: center; gap: 12px; margin-bottom: var(--nx-space-2); }
      .people-table { width: max-content; min-width: 100%; }
      .u-cell { display: flex; align-items: center; gap: 12px; }
      .u-cell .av { width: 36px; height: 36px; border-radius: var(--nx-radius-full); flex: none; display: grid; place-items: center; font-weight: var(--nx-font-weight-bold); font-size: 0.76rem; }
      .u-cell .nm { font-weight: var(--nx-font-weight-semibold); line-height: 1.2; white-space: nowrap; }
      .u-cell .sub { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); white-space: nowrap; }
      .mono { font-variant-numeric: tabular-nums; color: var(--nx-color-text-secondary); font-weight: var(--nx-font-weight-semibold); }
      td.mat-mdc-cell { white-space: nowrap; }
      .role-tags { display: inline-flex; gap: 6px; }
      .role-tag { background: var(--nx-color-action-primary-subtle); border: 1px solid var(--nx-color-border-brand); color: var(--nx-color-action-primary); border-radius: var(--nx-radius-full); padding: 2px 10px; font-size: var(--nx-text-small-size); font-weight: var(--nx-font-weight-semibold); white-space: nowrap; }
      .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: var(--nx-radius-full); font-size: var(--nx-text-small-size); font-weight: var(--nx-font-weight-bold); }
      .pill mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .pill.pink { background: var(--nx-color-status-neutral-bg); color: var(--nx-color-status-neutral-fg); }
      .pill.danger { background: var(--nx-color-status-error-bg); color: var(--nx-color-status-error-fg); }
      .pill.success { background: var(--nx-color-status-success-bg); color: var(--nx-color-status-success-fg); }
      .fcell { padding-top: 6px !important; padding-bottom: 6px !important; background: var(--nx-color-surface-subtle); }
      .col-filter { width: 100%; min-width: 110px; padding: 7px 9px; border: 1px solid var(--nx-color-border-strong); border-radius: 8px; background: var(--nx-color-surface-default); color: var(--nx-color-text-primary); font: inherit; font-size: var(--nx-text-small-size); }
      .col-filter:focus { outline: none; border-color: var(--nx-color-action-primary); box-shadow: 0 0 0 3px var(--nx-color-action-primary-subtle); }
      select.col-filter { cursor: pointer; }
      .col-menu-body { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; }
    `,
  ],
})
export class PeopleComponent {
  private readonly service = inject(PeopleService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = STATUSES;
  protected readonly roleCodes = ROLE_CODES;
  protected readonly dims: { key: Dim; label: string }[] = [
    { key: 'roles', label: 'people.dim.roles' }, { key: 'status', label: 'common.status' },
    { key: 'gender', label: 'profile.gender' }, { key: 'tenure', label: 'people.col.years' },
  ];

  protected readonly people = signal<Person[]>([]);
  protected readonly columns = signal<ColumnDef[]>(defaultColumns());
  protected readonly filters = signal<Record<string, string>>({});
  protected readonly dim = signal<Dim>('roles');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly avatarPalette = [
    { bg: 'var(--nx-color-action-primary-subtle)', fg: 'var(--nx-color-action-primary)' },
    { bg: 'var(--nx-color-status-info-bg)', fg: 'var(--nx-color-status-info-fg)' },
    { bg: 'var(--nx-color-status-success-bg)', fg: 'var(--nx-color-status-success-fg)' },
    { bg: 'var(--nx-color-status-warning-bg)', fg: 'var(--nx-color-status-warning-fg)' },
    { bg: 'var(--nx-color-status-neutral-bg)', fg: 'var(--nx-color-status-neutral-fg)' },
  ];

  protected readonly displayed = computed(() => this.columns().filter((c) => c.visible).map((c) => c.key));
  protected readonly filterRow = computed(() => this.displayed().map((k) => k + '-f'));
  protected readonly hasFilters = computed(() => Object.values(this.filters()).some((v) => !!v));

  protected readonly filtered = computed(() => {
    const f = this.filters();
    const cols = this.columns();
    return this.people().filter((p) => cols.every((c) => this.match(p, c, f[c.key] ?? '')));
  });

  protected readonly birthdays = computed(() => this.people().filter((p) => p.isBirthdayToday).length);
  protected readonly anniversaries = computed(() => this.people().filter((p) => p.isAnniversaryToday).length);
  protected readonly vacationsPending = computed(() => this.people().reduce((s, p) => s + p.pendingVacations, 0));

  protected readonly chartData = computed(() => {
    this.language.lang(); // las etiquetas de las barras dependen del idioma
    const rows = this.filtered();
    const counts = new Map<string, number>();
    const add = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const p of rows) {
      switch (this.dim()) {
        case 'roles': if (p.roles.length) p.roles.forEach((r) => add(roleLabel(r))); else add(this.transloco.translate('people.noRole')); break;
        case 'status': add(this.statusLabel(p.status)); break;
        case 'gender': add(this.genderLabel(p.gender)); break;
        case 'tenure': add(this.tenureBucket(p.yearsOfService)); break;
      }
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round((count / max) * 100) }));
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list().subscribe({
      next: (people) => { this.people.set(people); this.loading.set(false); },
      error: () => { this.error.set(this.transloco.translate('people.loadError')); this.loading.set(false); },
    });
  }

  protected toggleColumn(key: string): void {
    this.columns.update((cols) => cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }

  protected setFilter(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected clearFilters(): void {
    this.filters.set({});
  }

  private match(p: Person, c: ColumnDef, val: string): boolean {
    if (!val) return true;
    switch (c.filter) {
      case 'status': return p.status === val;
      case 'roles': return p.roles.includes(val);
      case 'flag': return this.flag(p, c.key);
      case 'text': return this.textFor(p, c.key).toLowerCase().includes(val.toLowerCase());
      default: return true;
    }
  }

  private flag(p: Person, key: string): boolean {
    if (key === 'birthday') return p.isBirthdayToday;
    if (key === 'anniversary') return p.isAnniversaryToday;
    if (key === 'vacation') return p.pendingVacations > 0;
    return false;
  }

  /** Texto plano de una celda (para filtro y exportación). */
  private textFor(p: Person, key: string): string {
    switch (key) {
      case 'person': return `${p.fullName} ${p.email}`;
      case 'employeeCode': return p.employeeCode ?? '';
      case 'status': return this.statusLabel(p.status);
      case 'roles': return p.roles.map(roleLabel).join(', ');
      case 'birthday': return p.isBirthdayToday ? this.transloco.translate('people.today') : this.fmtDate(p.birthDate);
      case 'vacation': return String(p.pendingVacations);
      case 'anniversary': return p.isAnniversaryToday ? this.transloco.translate('people.today') : '';
      case 'years': return p.yearsOfService === null ? '' : String(p.yearsOfService);
      case 'hireDate': return this.fmtDate(p.hireDate);
      case 'birthDate': return this.fmtDate(p.birthDate);
      case 'gender': return this.genderLabel(p.gender);
      case 'phone': return p.phone ?? '';
      case 'address': return p.address ?? '';
      case 'emergency': return this.emergency(p);
      default: return '';
    }
  }

  protected exportExcel(): void {
    const cols = this.columns().filter((c) => c.visible);
    const header = cols.map((c) => this.transloco.translate(c.label));
    const rows = this.filtered().map((p) => cols.map((c) => this.textFor(p, c.key)));
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, this.transloco.translate('people.title'));
    XLSX.writeFile(book, `personas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ---- helpers de presentación ----
  protected initials(p: Person): string {
    return ((p.firstName?.[0] ?? '') + (p.lastName?.[0] ?? '')).toUpperCase() || (p.email?.[0] ?? '?').toUpperCase();
  }
  protected avatarColor(p: Person): { bg: string; fg: string } {
    const key = p.id || p.email;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return this.avatarPalette[h % this.avatarPalette.length];
  }
  protected rl(code: string): string { return roleLabel(code); }
  protected statusLabel(code: string): string { return this.transloco.translate(`status.${code}`); }
  protected genderLabel(code?: string): string { return code ? this.transloco.translate(`gender.${code}`) : '—'; }
  protected years(n: number): string {
    return this.transloco.translate(n === 1 ? 'people.yearOne' : 'people.yearMany', { n });
  }
  protected emergency(p: Person): string {
    const n = p.emergencyContactName, t = p.emergencyContactPhone;
    return n || t ? [n, t].filter(Boolean).join(' · ') : '—';
  }
  protected fmtDate(s?: string): string {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(this.language.intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
  }
  protected fmtShort(s?: string): string {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(this.language.intlLocale(), { day: '2-digit', month: 'short' });
  }
  private tenureBucket(y: number | null): string {
    if (y === null) return this.transloco.translate('people.tenure.none');
    if (y < 1) return this.transloco.translate('people.tenure.lt1');
    if (y <= 2) return this.transloco.translate('people.tenure.y1to2');
    if (y <= 5) return this.transloco.translate('people.tenure.y3to5');
    return this.transloco.translate('people.tenure.gt5');
  }
}
