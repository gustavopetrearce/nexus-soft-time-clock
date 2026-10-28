import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../../core/ui/catalog';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { Project } from './project.models';
import { ProjectService } from './project.service';

/** P34 · Proyectos (F18): buscador en el servidor y «Nuevo proyecto»; tabla con estado y vigencia. */
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    TranslocoPipe,
    AppDatePipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [`td { white-space: nowrap; } mat-form-field { width: 100%; }`],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'projects.title' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte nx-filtros--simple">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'projects.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <div class="nx-filtros__acciones">
            <button mat-flat-button type="button" (click)="router.navigate(['/projects/new'])"><mat-icon>add</mat-icon>{{ 'projects.new' | transloco }}</button>
          </div>
        </div>

        @if (!loading() && projects().length === 0) {
          @if (searchControl.value.trim()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="searchControl.setValue('')">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="work" [message]="'projects.empty' | transloco" />
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
                    <th scope="col" class="num">{{ 'projects.startsOn' | transloco }}</th>
                    <th scope="col" class="num">{{ 'projects.endsOn' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of projects(); track p.id) {
                    <tr>
                      <td class="nx-text-code">{{ p.code }}</td>
                      <td><span class="nx-trunc">{{ p.name }}</span></td>
                      <td><app-status-chip [status]="p.status" [label]="'projects.status.' + p.status | transloco" /></td>
                      <td class="num nx-text-numeric">{{ p.startsOn ? (p.startsOn | appDate: 'dd/MM/yyyy') : '—' }}</td>
                      <td class="num nx-text-numeric">{{ p.endsOn ? (p.endsOn | appDate: 'dd/MM/yyyy') : '—' }}</td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
                          <button mat-stroked-button type="button" (click)="edit(p)"><mat-icon>edit</mat-icon>{{ 'common.edit' | transloco }}</button>
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
export class ProjectsComponent {
  private readonly service = inject(ProjectService);
  protected readonly router = inject(Router);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('projects');
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
        this.projects.set(result.content);
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

  protected edit(project: Project): void {
    void this.router.navigate(['/projects', project.id, 'edit']);
  }
}
