import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../../core/ui/catalog';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { WorkSite } from './work-site.models';
import { WorkSiteService } from './work-site.service';

/**
 * P25 · Centros de trabajo: buscador en el servidor y «Nuevo centro»; tabla con código, nombre,
 * ubicación (secundaria), estado y acciones: Geocerca y QR (P27), Desactivar/Activar sin
 * confirmación porque es reversible, y Editar (P26).
 */
@Component({
  selector: 'app-work-sites',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    TranslocoPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [`td { white-space: nowrap; } mat-form-field { width: 100%; }`],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'workSites.title' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte nx-filtros--simple">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'workSites.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <div class="nx-filtros__acciones">
            <button mat-flat-button type="button" (click)="router.navigate(['/work-sites/new'])"><mat-icon>add</mat-icon>{{ 'workSites.newShort' | transloco }}</button>
          </div>
        </div>

        @if (!loading() && sites().length === 0) {
          @if (searchControl.value.trim()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="searchControl.setValue('')">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="location_on" [message]="'workSites.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla nx-tabla--centros">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'common.code' | transloco }}</th>
                    <th scope="col">{{ 'common.name' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'workSites.location' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of sites(); track s.id) {
                    <tr>
                      <td class="nx-text-code">{{ s.code }}</td>
                      <td><span class="nx-trunc">{{ s.name }}</span></td>
                      <td class="nx-col-sec nx-text-numeric">{{ s.latitude | number: '1.6-6' : 'en-US' }}, {{ s.longitude | number: '1.6-6' : 'en-US' }}</td>
                      <td><app-status-chip [status]="s.status" [label]="'status.' + s.status | transloco" /></td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
                          <a mat-stroked-button [routerLink]="['/work-sites', s.id, 'geofence']"><mat-icon>my_location</mat-icon>{{ 'workSites.geofenceQr' | transloco }}</a>
                          <button mat-stroked-button type="button" [disabled]="busyId() === s.id" (click)="toggleStatus(s)">
                            <mat-icon>{{ s.status === 'ACTIVE' ? 'block' : 'check_circle' }}</mat-icon>
                            {{ (s.status === 'ACTIVE' ? 'common.deactivate' : 'common.activate') | transloco }}
                          </button>
                          <button mat-stroked-button type="button" (click)="edit(s)"><mat-icon>edit</mat-icon>{{ 'common.edit' | transloco }}</button>
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
export class WorkSitesComponent {
  private readonly service = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  protected readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly sites = signal<WorkSite[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('work-sites');
  protected readonly total = signal(0);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

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
    this.service.list(this.page(), this.size(), this.searchControl.value.trim() || undefined).subscribe({
      next: (result) => {
        this.sites.set(result.content);
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

  protected edit(site: WorkSite): void {
    void this.router.navigate(['/work-sites', site.id, 'edit']);
  }

  /** Reversible: sin confirmación (HIFI/08 R3), con snackbar del resultado. */
  protected toggleStatus(site: WorkSite): void {
    const next = site.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.busyId.set(site.id);
    this.service.setStatus(site.id, next).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success(this.transloco.translate(next === 'INACTIVE' ? 'workSites.deactivated' : 'workSites.activated'));
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.notify.error(this.transloco.translate('common.statusError'));
      },
    });
  }
}
