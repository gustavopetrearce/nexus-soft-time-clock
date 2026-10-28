import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as XLSX from 'xlsx';

import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { PAGE_SIZE_OPTIONS, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { ROLE_CODES, roleLabel } from '../admin/roles/role.models';
import { ColumnDef, Person, defaultColumns } from './people.models';
import { PeopleService } from './people.service';

const STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED', 'INVITED'];

/**
 * P38 · Personas: cuatro indicadores de hoy (personas, cumpleaños, vacaciones por aprobar,
 * aniversarios) y una tabla ancha con fila de filtros. «Columnas» elige las visibles en la tabla y
 * en el Excel (Colaborador siempre visible); «Actualizar» vuelve a pedir los datos. Requiere
 * {@code user:manage}.
 */
@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatTooltipModule,
    TranslocoPipe,
    AppNumberPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      .nx-kpis { margin-bottom: var(--nx-space-gap-section); }
      .nx-kpi__concepto { width: var(--nx-icon-size-lg); height: var(--nx-icon-size-lg); font-size: var(--nx-icon-size-lg); }
      .columnas { display: flex; flex-direction: column; padding: var(--nx-space-2) var(--nx-space-3); }
      .exportar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      .nx-fila-filtros th { padding-block: var(--nx-space-1); }
      input.nx-mini, select.nx-mini { width: 100%; min-width: calc(var(--nx-space-16) + var(--nx-space-8)); background: var(--nx-color-surface-default); font-family: inherit; text-transform: none; letter-spacing: var(--nx-font-tracking-normal); }
      input.nx-mini::placeholder { color: var(--nx-color-text-placeholder); }
      td { white-space: nowrap; }
      .nx-chip mat-icon { width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); font-size: var(--nx-icon-size-sm); }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'people.title' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <div class="nx-kpis nx-kpis--4">
        <div class="nx-kpi">
          <span class="nx-kpi__label">{{ 'people.kpi.people' | transloco }}</span>
          <span class="nx-kpi__valor nx-text-numeric">{{ people().length | appNumber }}</span>
          <mat-icon class="nx-kpi__concepto" aria-hidden="true">group</mat-icon>
        </div>
        <div class="nx-kpi">
          <span class="nx-kpi__label">{{ 'people.kpi.birthdays' | transloco }}</span>
          <span class="nx-kpi__valor nx-text-numeric">{{ birthdays() | appNumber }}</span>
          <mat-icon class="nx-kpi__concepto" aria-hidden="true">cake</mat-icon>
        </div>
        <div class="nx-kpi">
          <span class="nx-kpi__label">{{ 'people.col.vacation' | transloco }}</span>
          <span class="nx-kpi__valor nx-text-numeric">{{ vacationsPending() | appNumber }}</span>
          <mat-icon class="nx-kpi__concepto" aria-hidden="true">beach_access</mat-icon>
        </div>
        <div class="nx-kpi">
          <span class="nx-kpi__label">{{ 'people.kpi.anniversaries' | transloco }}</span>
          <span class="nx-kpi__valor nx-text-numeric">{{ anniversaries() | appNumber }}</span>
          <mat-icon class="nx-kpi__concepto" aria-hidden="true">celebration</mat-icon>
        </div>
      </div>

      <section class="nx-panel nx-panel--listado">
        <div class="nx-panel__barra">
          <div class="nx-panel__acciones">
            @if (hasFilters()) {
              <button mat-button type="button" (click)="clearFilters()"><mat-icon>filter_alt_off</mat-icon>{{ 'common.clearFilters' | transloco }}</button>
            }
            <button mat-stroked-button type="button" [matMenuTriggerFor]="colMenu"><mat-icon>view_column</mat-icon>{{ 'people.columns' | transloco }}</button>
            <button mat-stroked-button type="button" (click)="reload()"><mat-icon>refresh</mat-icon>{{ 'people.refresh' | transloco }}</button>
            <button mat-flat-button type="button" class="exportar" (click)="exportExcel()"
                    [disabled]="filtered().length === 0 || exporting()" [attr.aria-busy]="exporting()">
              @if (exporting()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>download</mat-icon> }
              {{ 'people.exportExcel' | transloco }}
            </button>
          </div>
        </div>

        <mat-menu #colMenu="matMenu" xPosition="before" [attr.aria-label]="'people.visibleColumns' | transloco">
          <div class="columnas" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
            @for (c of columns(); track c.key) {
              <mat-checkbox [checked]="c.visible" [disabled]="c.key === 'person'" (change)="toggleColumn(c.key)">{{ c.label | transloco }}</mat-checkbox>
            }
          </div>
        </mat-menu>

        @if (!loading() && people().length === 0) {
          <app-empty-state icon="group" [message]="'people.empty' | transloco" />
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    @for (c of visibleColumns(); track c.key) {
                      <th scope="col" [class.num]="c.key === 'vacation'">{{ c.label | transloco }}</th>
                    }
                  </tr>
                  <tr class="nx-fila-filtros">
                    @for (c of visibleColumns(); track c.key) {
                      <th>
                        @switch (c.filter) {
                          @case ('text') {
                            <input class="nx-campo__caja nx-mini" [placeholder]="'common.filter' | transloco" [attr.aria-label]="c.label | transloco"
                                   [value]="filters()[c.key] || ''" (input)="setFilter(c.key, $event)" />
                          }
                          @case ('status') {
                            <select class="nx-campo__caja nx-mini" [attr.aria-label]="c.label | transloco" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                              <option value="">{{ 'common.all' | transloco }}</option>
                              @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                            </select>
                          }
                          @case ('roles') {
                            <select class="nx-campo__caja nx-mini" [attr.aria-label]="c.label | transloco" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                              <option value="">{{ 'common.all' | transloco }}</option>
                              @for (r of roleCodes; track r) { <option [value]="r">{{ rl(r) }}</option> }
                            </select>
                          }
                          @case ('flag') {
                            <select class="nx-campo__caja nx-mini" [attr.aria-label]="c.label | transloco" [value]="filters()[c.key] || ''" (change)="setFilter(c.key, $event)">
                              <option value="">{{ 'common.all' | transloco }}</option>
                              <option value="yes">{{ 'people.onlyWith' | transloco }}</option>
                            </select>
                          }
                        }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (p of paged(); track p.id) {
                    <tr>
                      @for (c of visibleColumns(); track c.key) {
                        @switch (c.key) {
                          @case ('person') {
                            <td><span class="nx-trunc">{{ p.fullName }}</span><span class="nx-trunc nx-text-small nx-sec">{{ p.email }}</span></td>
                          }
                          @case ('employeeCode') { <td class="nx-text-code">{{ p.employeeCode || '—' }}</td> }
                          @case ('status') { <td><app-status-chip [status]="p.status" [label]="statusLabel(p.status)" /></td> }
                          @case ('roles') {
                            <td>
                              @for (r of p.roles; track r) { <span class="nx-chip nx-chip--info">{{ rl(r) }}</span> } @empty { — }
                            </td>
                          }
                          @case ('birthday') {
                            <td>
                              @if (p.isBirthdayToday) {
                                <span class="nx-chip nx-chip--info" [matTooltip]="'people.birthdayToday' | transloco"><mat-icon aria-hidden="true">cake</mat-icon>{{ 'people.today' | transloco }}</span>
                              } @else {
                                <span class="nx-text-numeric">{{ fmtShort(p.birthDate) }}</span>
                              }
                            </td>
                          }
                          @case ('vacation') {
                            <td class="num nx-text-numeric">
                              @if (p.pendingVacations > 0) {
                                <span class="nx-chip nx-chip--warning" [matTooltip]="'people.vacationsTooltip' | transloco">{{ p.pendingVacations | appNumber }}</span>
                              } @else { — }
                            </td>
                          }
                          @case ('anniversary') {
                            <td>
                              @if (p.isAnniversaryToday) {
                                <span class="nx-chip nx-chip--success" [matTooltip]="'people.anniversaryTooltip' | transloco"><mat-icon aria-hidden="true">celebration</mat-icon>{{ years(p.yearsOfService) }}</span>
                              } @else { — }
                            </td>
                          }
                          @case ('years') { <td>{{ p.yearsOfService === null ? '—' : years(p.yearsOfService) }}</td> }
                          @case ('hireDate') { <td class="nx-text-numeric">{{ fmtDate(p.hireDate) }}</td> }
                          @case ('birthDate') { <td class="nx-text-numeric">{{ fmtDate(p.birthDate) }}</td> }
                          @case ('gender') { <td>{{ genderLabel(p.gender) }}</td> }
                          @case ('phone') { <td class="nx-text-numeric">{{ p.phone || '—' }}</td> }
                          @case ('address') { <td><span class="nx-trunc">{{ p.address || '—' }}</span></td> }
                          @case ('emergency') { <td>{{ emergency(p) }}</td> }
                        }
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (!loading() && filtered().length === 0) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          }

          <mat-paginator
            [length]="filtered().length"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="pageSizeOptions"
            (page)="onPage($event)"
          />
        }
      </section>
    }
  `,
})
export class PeopleComponent {
  private readonly service = inject(PeopleService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = STATUSES;
  protected readonly roleCodes = ROLE_CODES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly people = signal<Person[]>([]);
  protected readonly columns = signal<ColumnDef[]>(defaultColumns());
  protected readonly filters = signal<Record<string, string>>({});
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = pageSizePreference('people');

  protected readonly visibleColumns = computed(() => this.columns().filter((c) => c.visible));
  protected readonly hasFilters = computed(() => Object.values(this.filters()).some((v) => !!v));

  protected readonly filtered = computed(() => {
    const f = this.filters();
    const cols = this.columns();
    return this.people().filter((p) => cols.every((c) => this.match(p, c, f[c.key] ?? '')));
  });

  protected readonly paged = computed(() => {
    const size = this.pageSize();
    const rows = this.filtered();
    const start = this.pageIndex() * size < rows.length ? this.pageIndex() * size : 0;
    return rows.slice(start, start + size);
  });

  protected readonly birthdays = computed(() => this.people().filter((p) => p.isBirthdayToday).length);
  protected readonly anniversaries = computed(() => this.people().filter((p) => p.isAnniversaryToday).length);
  protected readonly vacationsPending = computed(() => this.people().reduce((s, p) => s + p.pendingVacations, 0));

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list().subscribe({
      next: (people) => {
        this.people.set(people);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected toggleColumn(key: string): void {
    this.columns.update((cols) => cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }

  protected setFilter(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.pageIndex.set(0);
  }

  protected clearFilters(): void {
    this.filters.set({});
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
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
    if (this.filtered().length === 0) return;
    this.exporting.set(true);
    setTimeout(() => {
      try {
        const cols = this.visibleColumns();
        const header = cols.map((c) => this.transloco.translate(c.label));
        const rows = this.filtered().map((p) => cols.map((c) => this.textFor(p, c.key)));
        const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, this.transloco.translate('people.title'));
        XLSX.writeFile(book, `personas-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } finally {
        this.exporting.set(false);
      }
    });
  }

  // ---- helpers de presentación ----
  protected rl(code: string): string { return roleLabel(code); }
  protected statusLabel(code: string): string { return this.transloco.translate(`status.${code}`); }
  protected genderLabel(code?: string): string { return code ? this.transloco.translate(`gender.${code}`) : '—'; }
  protected years(n: number | null): string {
    return this.transloco.translate(n === 1 ? 'people.yearOne' : 'people.yearMany', { n });
  }
  protected emergency(p: Person): string {
    const n = p.emergencyContactName, t = p.emergencyContactPhone;
    return n || t ? [n, t].filter(Boolean).join(' · ') : '—';
  }
  /** dd/mm/aaaa (formato es-MX del redline). */
  protected fmtDate(s?: string): string {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(this.language.intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  protected fmtShort(s?: string): string {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(this.language.intlLocale(), { day: '2-digit', month: '2-digit' });
  }
}
