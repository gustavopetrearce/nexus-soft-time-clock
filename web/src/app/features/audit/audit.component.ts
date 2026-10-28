import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { PAGE_SIZE_OPTIONS, pageSizePreference } from '../../core/ui/catalog';
import { openDrawer } from '../../core/ui/drawer';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { FiltersButtonComponent } from '../../core/ui/filters-button.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { AuditDetailDrawerComponent } from './audit-detail-drawer.component';
import { AuditEntry } from './audit.models';
import { AuditService } from './audit.service';

/**
 * P17 · Auditoría (RF-12, solo lectura): fecha y hora, usuario, acción, recurso (tipo · id) y
 * origen; la fila abre el detalle P18 en un drawer y queda seleccionada. El backend solo pagina, así
 * que actor, fechas, acción y recurso filtran la página cargada.
 */
@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    TranslocoPipe,
    AppDatePipe,
    EmptyStateComponent,
    FiltersButtonComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
  ],
  styles: [
    `
      mat-form-field { width: 100%; }
      tbody tr { cursor: pointer; }
      tbody tr.is-sel { background: var(--nx-color-action-primary-subtle); }
      .nx-fila-link { padding: var(--nx-space-0); border: 0; background: transparent; font: inherit; color: var(--nx-color-action-primary); cursor: pointer; }
      td { white-space: nowrap; }
      .nx-id { display: inline-block; vertical-align: bottom; max-width: calc(var(--nx-space-16) * 2); }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.audit' | transloco" />

    <ng-template #secundarios>
      <ng-container [formGroup]="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'audit.action' | transloco }}</mat-label>
          <mat-select formControlName="action">
            <mat-option value="">{{ 'audit.allActions' | transloco }}</mat-option>
            @for (a of actions(); track a) { <mat-option [value]="a">{{ a }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'audit.resource' | transloco }}</mat-label>
          <mat-select formControlName="resource">
            <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
            @for (r of resources(); track r) { <mat-option [value]="r">{{ r }}</mat-option> }
          </mat-select>
        </mat-form-field>
      </ng-container>
    </ng-template>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'audit.searchActor' | transloco }}</mat-label>
            <input matInput type="search" formControlName="actor" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>
          <div class="nx-flt-sec nx-flt-sec--grupo"><ng-container [ngTemplateOutlet]="secundarios" /></div>
          <app-filters-button [filters]="secundarios" />
        </div>

        @if (!loading() && entries().length === 0) {
          <app-empty-state icon="fact_check" [message]="'audit.empty' | transloco" />
        } @else if (!loading() && filtered().length === 0) {
          <app-empty-state icon="search" [message]="'common.noResults' | transloco">
            <button mat-button type="button" (click)="filters.reset()">{{ 'common.clearFilters' | transloco }}</button>
          </app-empty-state>
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'attendanceEvents.col.date' | transloco }}</th>
                    <th scope="col">{{ 'scheduling.user' | transloco }}</th>
                    <th scope="col">{{ 'audit.action' | transloco }}</th>
                    <th scope="col">{{ 'audit.resource' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'attendanceEvents.detail.source' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of filtered(); track e.id) {
                    <tr [class.is-sel]="e.id === selectedId()" (click)="open(e)">
                      <td class="nx-text-code">
                        <button type="button" class="nx-fila-link" (click)="open(e); $event.stopPropagation()"
                                [attr.aria-label]="'audit.openDetail' | transloco: { action: e.action }">
                          {{ e.createdAt | appDate: 'dd/MM/yyyy HH:mm:ss' }}
                        </button>
                      </td>
                      <td>{{ actor(e) }}</td>
                      <td class="nx-text-code">{{ e.action }}</td>
                      <td>{{ e.resourceType }} · <span class="nx-trunc nx-text-code nx-id">{{ e.resourceId }}</span></td>
                      <td class="nx-col-sec nx-text-code">{{ e.ip || '—' }}</td>
                    </tr>
                  }
                </tbody>
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
export class AuditComponent {
  private readonly service = inject(AuditService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly entries = signal<AuditEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('audit');
  protected readonly total = signal(0);

  protected readonly filters = inject(FormBuilder).nonNullable.group({ actor: '', from: '', to: '', action: '', resource: '' });
  private readonly f = toSignal(this.filters.valueChanges, { initialValue: this.filters.getRawValue() });

  protected readonly actions = computed(() => [...new Set(this.entries().map((e) => e.action))].sort());
  protected readonly resources = computed(() => [...new Set(this.entries().map((e) => e.resourceType))].sort());

  protected readonly filtered = computed(() => {
    const { actor = '', from = '', to = '', action = '', resource = '' } = this.f();
    const term = actor.trim().toLowerCase();
    return this.entries()
      .filter((e) => {
        if (term && !this.actor(e).toLowerCase().includes(term)) return false;
        const day = e.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (action && e.action !== action) return false;
        return !resource || e.resourceType === resource;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.page(), this.size()).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** El correo identifica al autor mejor que su id; sin autor, la acción fue del sistema. */
  protected actor(entry: AuditEntry): string {
    return entry.actorEmail || entry.actorUserId || this.transloco.translate('audit.system');
  }

  protected open(entry: AuditEntry): void {
    this.selectedId.set(entry.id);
    openDrawer(this.dialog, AuditDetailDrawerComponent, {
      data: entry,
      ariaLabel: this.transloco.translate('audit.detailLabel'),
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }
}
