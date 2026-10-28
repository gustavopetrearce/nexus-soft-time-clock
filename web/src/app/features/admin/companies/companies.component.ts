import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../../core/ui/catalog';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { CapacityDialogComponent } from './capacity-dialog.component';
import { Company, TenantCapacity } from './company.models';
import { CompanyService } from './company.service';

/**
 * P22 · Empresas (RF-13): buscador en el servidor (400 ms) y «Nueva empresa» en la misma fila; tabla
 * con código, nombre, estado y cupo usados/límite. «Editar» lleva a P23 (el estado se cambia ahí) y
 * «Cupo» abre el diálogo P24.
 */
@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
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
  styles: [`td { white-space: nowrap; } mat-form-field { width: 100%; }`],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'companies.title' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte nx-filtros--simple">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'companies.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <div class="nx-filtros__acciones">
            <button mat-flat-button type="button" (click)="router.navigate(['/companies/new'])"><mat-icon>add</mat-icon>{{ 'companies.new' | transloco }}</button>
          </div>
        </div>

        @if (!loading() && companies().length === 0) {
          @if (searchControl.value.trim()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="searchControl.setValue('')">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="domain" [message]="'companies.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'common.code' | transloco }}</th>
                    <th scope="col">{{ 'common.name' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="num">{{ 'companies.capacity' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of companies(); track c.id) {
                    <tr>
                      <td class="nx-text-code">{{ c.code }}</td>
                      <td><span class="nx-trunc">{{ c.name }}</span></td>
                      <td><app-status-chip [status]="c.status" [label]="'companies.status.' + c.status | transloco" /></td>
                      <td class="num nx-text-numeric">
                        @if (capacityOf(c.id); as cap) {
                          <span [matTooltip]="capacityTooltip(cap)">{{ cap.used | appNumber }} / {{ cap.limit | appNumber }}</span>
                        } @else { — }
                      </td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
                          <button mat-stroked-button type="button" (click)="edit(c)"><mat-icon>edit</mat-icon>{{ 'common.edit' | transloco }}</button>
                          @if (canManageCapacity()) {
                            <button mat-stroked-button type="button" (click)="openCapacity(c)"><mat-icon>group</mat-icon>{{ 'companies.capacityAction' | transloco }}</button>
                          }
                        </span>
                      </td>
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
export class CompaniesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CompanyService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly router = inject(Router);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly companies = signal<Company[]>([]);
  /** Cupo por empresa de la página visible, resuelto en una sola petición (RF-29). */
  protected readonly capacities = signal<Record<string, TenantCapacity>>({});
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('companies');
  protected readonly total = signal(0);

  protected readonly searchControl = this.fb.nonNullable.control('');

  constructor() {
    debouncedSearch(this.searchControl.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(0);
        this.reload();
      });
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    const search = this.searchControl.value.trim() || undefined;
    this.service.list(this.page(), this.size(), search).subscribe({
      next: (result) => {
        this.companies.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
        this.loadCapacities(result.content.map((c) => c.id));
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /**
   * El cupo no viaja en el listado de empresas, así que se pide aparte para toda la página. Si
   * falla, la columna queda en —: es información complementaria y no debe tumbar el listado.
   */
  private loadCapacities(ids: string[]): void {
    this.capacities.set({});
    if (!ids.length || !this.canManageCapacity()) {
      return;
    }
    this.service.getCapacities(ids).subscribe({
      next: (list) => this.capacities.set(Object.fromEntries(list.map((c) => [c.companyId, c]))),
      error: () => void 0,
    });
  }

  protected canManageCapacity(): boolean {
    return this.auth.hasPermission('company:capacity');
  }

  protected capacityOf(companyId: string): TenantCapacity | undefined {
    return this.capacities()[companyId];
  }

  protected capacityTooltip(cap: TenantCapacity): string {
    const params = { base: cap.baseLimit, blocks: cap.extraBlocks, size: cap.blockSize, available: cap.available };
    return this.transloco.translate(cap.available === 0 ? 'companies.capacityTooltipFull' : 'companies.capacityTooltip', params);
  }

  protected openCapacity(company: Company): void {
    this.dialog
      .open(CapacityDialogComponent, { data: { company, capacity: this.capacityOf(company.id) } })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) {
          this.loadCapacities(this.companies().map((c) => c.id));
        }
      });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected edit(company: Company): void {
    void this.router.navigate(['/companies', company.id, 'edit']);
  }
}
