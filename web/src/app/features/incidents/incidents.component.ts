import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { PAGE_SIZE_OPTIONS, pageSizePreference } from '../../core/ui/catalog';
import { openDrawer } from '../../core/ui/drawer';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { FiltersButtonComponent } from '../../core/ui/filters-button.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { incidentTypeLabel, priorityLabel } from './incident.labels';
import { Incident } from './incident.models';
import { IncidentService } from './incident.service';
import { ResolveIncidentDrawerComponent, ResolveIncidentData } from './resolve-incident-drawer.component';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'RESOLVED'] as const;

/**
 * P13 · Incidencias (RF-09, CU-08): buscador, prioridad y estado (abiertas por defecto), tabla
 * compacta y «Revisar» → drawer P14. El estado se filtra en el servidor; el backend aún no acepta
 * búsqueda ni prioridad, así que esos dos filtran la página cargada.
 */
@Component({
  selector: 'app-incidents',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    AppDatePipe,
    EmptyStateComponent,
    FiltersButtonComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      mat-form-field { width: 100%; }
      .nx-panel--listado > app-empty-state { display: block; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.incidents' | transloco" />

    <ng-template #secundarios>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'incidents.priority' | transloco }}</mat-label>
        <mat-select [formControl]="priorityFilter">
          <mat-option value="">{{ 'incidents.filter.allPriorities' | transloco }}</mat-option>
          @for (p of priorities; track p) { <mat-option [value]="p">{{ priorityLabel(p) }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ 'common.status' | transloco }}</mat-label>
        <mat-select [formControl]="statusFilter" (selectionChange)="applyServerFilter()">
          <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ 'incidents.filter.' + s | transloco }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </ng-template>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'incidents.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <div class="nx-flt-sec nx-flt-sec--grupo"><ng-container *ngTemplateOutlet="secundarios" /></div>
          <app-filters-button [filters]="secundarios" />
        </div>

        @if (!loading() && filtered().length === 0) {
          @if (hasFilters()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="check_circle" [message]="'incidents.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table mat-table [dataSource]="filtered()">
                <ng-container matColumnDef="user">
                  <th mat-header-cell *matHeaderCellDef scope="col">{{ 'incidents.collaborator' | transloco }}</th>
                  <td mat-cell *matCellDef="let i"><span class="nx-trunc">{{ i.userName || i.userId }}</span></td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef scope="col">{{ 'incidents.type' | transloco }}</th>
                  <td mat-cell *matCellDef="let i">{{ typeLabel(i.type) }}</td>
                </ng-container>
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef scope="col">{{ 'incidents.date' | transloco }}</th>
                  <td mat-cell *matCellDef="let i" class="nx-text-numeric">{{ i.incidentDate | appDate: 'dd/MM/yyyy' }}</td>
                </ng-container>
                <ng-container matColumnDef="priority">
                  <th mat-header-cell *matHeaderCellDef scope="col">{{ 'incidents.priority' | transloco }}</th>
                  <td mat-cell *matCellDef="let i"><app-status-chip [status]="i.priority" [label]="priorityLabel(i.priority)" /></td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef scope="col">{{ 'common.status' | transloco }}</th>
                  <td mat-cell *matCellDef="let i"><app-status-chip [status]="i.status" /></td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  <td mat-cell *matCellDef="let i" class="nx-col-acciones">
                    <span class="nx-acciones-fila">
                      <button mat-stroked-button type="button" (click)="review(i)">
                        <mat-icon>visibility</mat-icon>{{ 'common.review' | transloco }}
                      </button>
                    </span>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"></tr>
              </table>
            </div>
          </div>
        }

        <mat-paginator
          [length]="total()"
          [pageSize]="size()"
          [pageIndex]="page()"
          [pageSizeOptions]="pageSizeOptions"
          (page)="onPage($event)"
        />
      </section>
    }
  `,
})
export class IncidentsComponent {
  private readonly service = inject(IncidentService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly columns = ['user', 'type', 'date', 'priority', 'status', 'actions'];
  protected readonly priorities = PRIORITIES;
  protected readonly statuses = STATUSES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly incidents = signal<Incident[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('incidents');
  protected readonly total = signal(0);

  protected readonly statusFilter = new FormControl<string>('OPEN', { nonNullable: true });
  protected readonly priorityFilter = new FormControl('', { nonNullable: true });
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly priorityValue = toSignal(this.priorityFilter.valueChanges, { initialValue: '' });
  private readonly searchValue = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  private readonly statusValue = toSignal(this.statusFilter.valueChanges, { initialValue: 'OPEN' });

  protected readonly hasFilters = computed(
    () => !!this.priorityValue() || !!this.searchValue().trim() || this.statusValue() !== 'OPEN',
  );

  protected readonly filtered = computed(() => {
    const priority = this.priorityValue();
    const search = this.searchValue().trim().toLowerCase();
    return this.incidents().filter((i) => {
      if (priority && i.priority !== priority) return false;
      return !search || (i.userName ?? '').toLowerCase().includes(search);
    });
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.statusFilter.value || undefined, this.page(), this.size()).subscribe({
      next: (result) => {
        this.incidents.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected applyServerFilter(): void {
    this.page.set(0);
    this.reload();
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.priorityFilter.setValue('');
    if (this.statusFilter.value !== 'OPEN') {
      this.statusFilter.setValue('OPEN');
      this.applyServerFilter();
    }
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected review(incident: Incident): void {
    const rows = this.filtered();
    const queue = rows.slice(rows.indexOf(incident) + 1).filter((i) => i.status === 'OPEN');
    const ref = openDrawer<ResolveIncidentDrawerComponent, ResolveIncidentData>(this.dialog, ResolveIncidentDrawerComponent, {
      data: { incident, queue: incident.status === 'OPEN' ? queue : [] },
      ariaLabel: this.transloco.translate('incidents.resolveTitle'),
    });
    const drawer = ref.componentInstance;
    ref.afterClosed().subscribe(() => {
      if (drawer.resolvedAny) this.reload();
    });
  }

  protected typeLabel(type: string): string {
    return incidentTypeLabel(type);
  }

  protected priorityLabel(priority: string): string {
    return priorityLabel(priority);
  }
}
