import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, merge } from 'rxjs';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../core/ui/catalog';
import { openDrawer } from '../../core/ui/drawer';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { NotificationService } from '../../core/ui/notification.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { SanctionDialogComponent } from './sanction-dialog.component';
import { exportSanctionsToCsv, exportSanctionsToExcel, exportSanctionsToPdf } from './sanction-export.util';
import {
  SANCTION_REASONS,
  SANCTION_STATUSES,
  SANCTION_TYPES,
  Sanction,
  SanctionFilters,
  SanctionReason,
  SanctionStatus,
  SanctionType,
  sanctionStatusTone,
} from './sanction.models';
import { SanctionService } from './sanction.service';
import { SanctionVoidDialogComponent } from './sanction-void-dialog.component';

type ExportKind = 'excel' | 'pdf' | 'csv';

/**
 * Sanciones (portal, V39): amonestaciones, actas administrativas y suspensiones que RR. HH., los
 * supervisores o el administrador ({@code sanction:manage}) abren a un colaborador. Nacen vigentes y
 * se pueden anular con motivo. Filtros en el servidor: búsqueda (400 ms), tipo, motivo, estado y
 * fecha de los hechos; exportación con los mismos filtros.
 */
@Component({
  selector: 'app-sanctions',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      mat-form-field { width: 100%; }
      td { white-space: nowrap; }
      td.desc { white-space: normal; min-width: calc(var(--nx-space-16) * 3); max-width: calc(var(--nx-space-16) * 5); }
      .sub { display: block; }
      .exportar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.sanctions' | transloco">
      <button mat-stroked-button type="button" class="exportar" [matMenuTriggerFor]="formatos"
              [disabled]="total() === 0 || exporting()" [attr.aria-busy]="exporting()">
        @if (exporting()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>download</mat-icon> }
        {{ 'common.export' | transloco }}
      </button>
      <mat-menu #formatos="matMenu" xPosition="before">
        <button mat-menu-item type="button" (click)="export('excel')"><mat-icon>download</mat-icon><span>Excel</span></button>
        <button mat-menu-item type="button" (click)="export('pdf')"><mat-icon>download</mat-icon><span>PDF</span></button>
        <button mat-menu-item type="button" (click)="export('csv')"><mat-icon>download</mat-icon><span>CSV</span></button>
      </mat-menu>
      <button mat-flat-button type="button" (click)="openCreate()"><mat-icon>add</mat-icon>{{ 'sanctions.newSanction' | transloco }}</button>
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'sanctions.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'sanctions.type' | transloco }}</mat-label>
            <mat-select formControlName="type">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (t of types; track t) { <mat-option [value]="t">{{ 'sanctions.types.' + t | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'sanctions.reason' | transloco }}</mat-label>
            <mat-select formControlName="reason">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (r of reasons; track r) { <mat-option [value]="r">{{ 'sanctions.reasons.' + r | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'sanctions.status.' + s | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>
        </div>

        @if (conflict()) {
          <app-alert tone="error">{{ 'sanctions.alreadyVoided' | transloco }}</app-alert>
        }

        @if (!loading() && sanctions().length === 0) {
          @if (hasFilters()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="gavel" [message]="'sanctions.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'sanctions.collaborator' | transloco }}</th>
                    <th scope="col" class="num">{{ 'sanctions.incidentDate' | transloco }}</th>
                    <th scope="col">{{ 'sanctions.type' | transloco }}</th>
                    <th scope="col">{{ 'sanctions.reason' | transloco }}</th>
                    <th scope="col">{{ 'sanctions.description' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'sanctions.issuedBy' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of sanctions(); track s.id) {
                    <tr>
                      <td>
                        <span class="nx-trunc">{{ s.userName || s.userId }}</span>
                        @if (s.employeeCode) { <span class="sub nx-sec nx-text-small">{{ s.employeeCode }}</span> }
                      </td>
                      <td class="num nx-text-numeric">{{ s.incidentDate | appDate: 'dd/MM/yyyy' }}</td>
                      <td>
                        {{ 'sanctions.types.' + s.type | transloco }}
                        @if (s.type === 'SUSPENSION') {
                          <span class="sub nx-sec nx-text-small nx-text-numeric">
                            {{ s.suspensionStart | appDate: 'dd/MM/yyyy' }} – {{ s.suspensionEnd | appDate: 'dd/MM/yyyy' }}
                            ({{ 'sanctions.daysCount' | transloco: { n: s.suspensionDays } }})
                          </span>
                        }
                      </td>
                      <td>{{ 'sanctions.reasons.' + s.reason | transloco }}</td>
                      <td class="desc nx-text-small">{{ s.description }}</td>
                      <td>
                        <app-status-chip [status]="tone(s.status)" [label]="'sanctions.status.' + s.status | transloco"
                          [matTooltip]="s.status === 'VOIDED' ? (s.voidedByName || '') + (s.voidReason ? ' — ' + s.voidReason : '') : ''" />
                      </td>
                      <td class="nx-col-sec"><span class="nx-trunc">{{ s.issuedByName || '—' }}</span></td>
                      <td class="nx-col-acciones">
                        @if (s.status === 'ACTIVE') {
                          <button mat-button type="button" [disabled]="savingId() === s.id" (click)="voidSanction(s)">
                            {{ 'sanctions.voidAction' | transloco }}
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <mat-paginator [length]="total()" [pageSize]="size()" [pageIndex]="page()" [pageSizeOptions]="pageSizeOptions" (page)="onPage($event)" />
      </section>
    }
  `,
})
export class SanctionsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SanctionService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = SANCTION_TYPES;
  protected readonly reasons = SANCTION_REASONS;
  protected readonly statuses = SANCTION_STATUSES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly tone = sanctionStatusTone;

  protected readonly sanctions = signal<Sanction[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly savingId = signal<string | null>(null);
  protected readonly conflict = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('sanctions');
  protected readonly total = signal(0);

  protected readonly filters = this.fb.nonNullable.group({
    search: [''],
    type: ['' as SanctionType | ''],
    reason: ['' as SanctionReason | ''],
    status: ['' as SanctionStatus | ''],
    from: [''],
    to: [''],
  });

  constructor() {
    const c = this.filters.controls;
    merge(
      debouncedSearch(c.search.valueChanges),
      c.type.valueChanges,
      c.reason.valueChanges,
      c.status.valueChanges,
      merge(c.from.valueChanges, c.to.valueChanges).pipe(debounceTime(400)),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilter());
    this.reload();
  }

  protected hasFilters(): boolean {
    return Object.values(this.filters.getRawValue()).some((v) => !!String(v).trim());
  }

  private currentFilters(): SanctionFilters {
    const f = this.filters.getRawValue();
    return { ...f, search: f.search.trim() || undefined };
  }

  protected openCreate(): void {
    openDrawer(this.dialog, SanctionDialogComponent, { ariaLabel: this.transloco.translate('sanctions.dialog.title') })
      .afterClosed()
      .subscribe((created) => {
        if (created) this.reload();
      });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.page(), this.size(), this.currentFilters()).subscribe({
      next: (result) => {
        this.sanctions.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected applyFilter(): void {
    this.page.set(0);
    this.conflict.set(false);
    this.reload();
  }

  protected clearFilters(): void {
    this.filters.reset({}, { emitEvent: false });
    this.applyFilter();
  }

  protected voidSanction(s: Sanction): void {
    this.dialog
      .open<SanctionVoidDialogComponent, Sanction, string>(SanctionVoidDialogComponent, { data: s, width: '480px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((reason) => {
        if (!reason) return;
        this.savingId.set(s.id);
        this.conflict.set(false);
        this.service.void(s.id, reason).subscribe({
          next: () => {
            this.savingId.set(null);
            this.notify.success(this.transloco.translate('sanctions.voided'));
            this.reload();
          },
          error: (err: unknown) => {
            this.savingId.set(null);
            if (err instanceof HttpErrorResponse && err.status === 409) {
              this.conflict.set(true);
              this.reload();
            } else {
              this.notify.error(this.transloco.translate('sanctions.actionError'));
            }
          },
        });
      });
  }

  protected export(kind: ExportKind): void {
    this.exporting.set(true);
    this.service.report(this.currentFilters()).subscribe({
      next: (rows) => {
        try {
          if (rows.length === 0) return;
          if (kind === 'excel') exportSanctionsToExcel(rows);
          else if (kind === 'pdf') exportSanctionsToPdf(rows);
          else exportSanctionsToCsv(rows);
        } finally {
          this.exporting.set(false);
        }
      },
      error: () => {
        this.exporting.set(false);
        this.notify.error(this.transloco.translate('sanctions.actionError'));
      },
    });
  }
}
