import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../../core/ui/catalog';
import { openDrawer } from '../../../core/ui/drawer';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { AssignShiftData, AssignShiftDrawerComponent } from './assign-shift-drawer.component';
import { Schedule } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

/**
 * P28 · Horarios y turnos (RF-08): buscador en el servidor, «Asignar turno» (drawer P30) y «Nuevo
 * horario»; tabla con código, nombre, zona horaria y estado. Los turnos de cada horario se editan
 * en su formulario (P29).
 */
@Component({
  selector: 'app-scheduling',
  standalone: true,
  imports: [
    ReactiveFormsModule,
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
    <app-page-header [title]="'layout.nav.scheduling' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte nx-filtros--simple">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'scheduling.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <div class="nx-filtros__acciones">
            <button mat-stroked-button type="button" (click)="openAssign()">{{ 'scheduling.assignShift' | transloco }}</button>
            <button mat-flat-button type="button" (click)="router.navigate(['/scheduling/new'])"><mat-icon>add</mat-icon>{{ 'scheduling.new' | transloco }}</button>
          </div>
        </div>

        @if (!loading() && schedules().length === 0) {
          @if (searchControl.value.trim()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="searchControl.setValue('')">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="event" [message]="'scheduling.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'common.code' | transloco }}</th>
                    <th scope="col">{{ 'common.name' | transloco }}</th>
                    <th scope="col">{{ 'companies.form.timezone' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of schedules(); track s.id) {
                    <tr>
                      <td class="nx-text-code">{{ s.code }}</td>
                      <td><span class="nx-trunc">{{ s.name }}</span></td>
                      <td>{{ s.timezone || '—' }}</td>
                      <td><app-status-chip [status]="s.status" [label]="'status.' + s.status | transloco" /></td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
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
export class SchedulingComponent {
  private readonly service = inject(SchedulingService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly router = inject(Router);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly schedules = signal<Schedule[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('schedules');
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
    this.service.listSchedules(this.page(), this.size(), this.searchControl.value.trim() || undefined).subscribe({
      next: (result) => {
        this.schedules.set(result.content);
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

  protected edit(schedule: Schedule): void {
    void this.router.navigate(['/scheduling', schedule.id, 'edit']);
  }

  /** Los turnos se eligen de todos los horarios activos, no solo de la página visible. */
  protected openAssign(): void {
    this.service.listSchedules(0, 200).subscribe({
      next: (result) =>
        openDrawer<AssignShiftDrawerComponent, AssignShiftData>(this.dialog, AssignShiftDrawerComponent, {
          data: { schedules: result.content.filter((s) => s.status === 'ACTIVE') },
          ariaLabel: this.transloco.translate('scheduling.assignShift'),
        }),
      error: () => this.error.set(true),
    });
  }
}
