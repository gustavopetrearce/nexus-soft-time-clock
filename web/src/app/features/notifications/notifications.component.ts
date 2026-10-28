import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe } from '@jsverse/transloco';

import { PAGE_SIZE_OPTIONS, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { AppNotification } from './notification.models';
import { NotificationsService } from './notifications.service';

/** Ícono por tipo de notificación; los tipos que no se reconocen usan la campana. */
const ICON_BY_TYPE: readonly [RegExp, string][] = [
  [/REJECT/, 'report_problem'],
  [/VACATION/, 'beach_access'],
  [/INCIDENT/, 'check_circle'],
];

/**
 * P33 · Notificaciones (RF-27): lista del usuario, la más reciente primero y sin acciones. Las no
 * leídas llevan el título en text-small-strong.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatPaginatorModule, TranslocoPipe, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent],
  styles: [
    `
      .nx-lista { margin: var(--nx-space-0); }
      .nx-lista__fila { align-items: flex-start; }
      .nx-lista__lead { flex: none; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.notifications' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else if (!loading() && notifications().length === 0) {
      <app-empty-state icon="notifications" [message]="'notifications.empty' | transloco" />
    } @else {
      <section class="nx-panel nx-panel--listado">
        <ul class="nx-lista">
          @for (n of notifications(); track n.id) {
            <li class="nx-lista__fila">
              <mat-icon class="nx-lista__lead" aria-hidden="true">{{ icon(n) }}</mat-icon>
              <div class="nx-lista__texto">
                <span [class.nx-text-small-strong]="n.status !== 'READ'">
                  {{ n.title }}
                  @if (n.status !== 'READ') { <span class="nx-sr-only">· {{ 'notifications.unread' | transloco }}</span> }
                </span>
                <span class="nx-lista__secundario">{{ n.body }}</span>
              </div>
            </li>
          }
        </ul>
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
export class NotificationsComponent {
  private readonly service = inject(NotificationsService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('notifications');
  protected readonly total = signal(0);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.mine(this.page(), this.size()).subscribe({
      next: (result) => {
        this.notifications.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected icon(n: AppNotification): string {
    return ICON_BY_TYPE.find(([pattern]) => pattern.test(n.type ?? ''))?.[1] ?? 'notifications';
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }
}
