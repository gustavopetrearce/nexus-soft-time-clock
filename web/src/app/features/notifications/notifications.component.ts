import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { AppNotification } from './notification.models';
import { NotificationsService } from './notifications.service';

/** Centro de notificaciones del usuario (RF-27). Listado; las preferencias se abordan luego. */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatPaginatorModule, MatProgressBarModule, PageHeaderComponent, EmptyStateComponent, TranslocoPipe],
  template: `
    <app-page-header [title]="'layout.nav.notifications' | transloco" [subtitle]="'notifications.subtitle' | transloco" />
    <mat-card>
      <mat-card-content>
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        @if (!loading() && notifications().length === 0) {
          <app-empty-state icon="notifications_none" [message]="'notifications.empty' | transloco" />
        }

        <div class="list">
          @for (n of notifications(); track n.id) {
            <div class="item" [class.unread]="n.status !== 'READ'">
              <mat-icon class="item-icon">{{ n.status === 'READ' ? 'mark_email_read' : 'mark_email_unread' }}</mat-icon>
              <div class="item-body">
                <div class="item-title">{{ n.title }}</div>
                <div class="item-text muted">{{ n.body }}</div>
              </div>
              <span class="item-channel">{{ n.channel }}</span>
            </div>
          }
        </div>

        <mat-paginator
          [length]="total()"
          [pageSize]="size()"
          [pageIndex]="page()"
          [pageSizeOptions]="[10, 20, 50]"
          (page)="onPage($event)"
        />
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .list { display: flex; flex-direction: column; }
      .item {
        display: flex;
        align-items: flex-start;
        gap: var(--nx-space-3);
        padding: var(--nx-space-4) 0;
        border-bottom: 1px solid var(--nx-color-border-default);
      }
      .item:last-child { border-bottom: none; }
      .item-icon { color: var(--nx-color-text-disabled); flex: 0 0 auto; margin-top: 2px; }
      .item.unread .item-icon { color: var(--nx-color-action-primary); }
      .item-body { flex: 1 1 auto; min-width: 0; }
      .item-title { font-weight: var(--nx-font-weight-semibold); font-size: var(--nx-text-body-size); }
      .item.unread .item-title { font-weight: var(--nx-font-weight-bold); }
      .item-text { font-size: var(--nx-text-body-size); margin-top: 2px; }
      .item-channel {
        flex: 0 0 auto;
        font-size: var(--nx-text-caption-size);
        font-weight: var(--nx-font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nx-color-text-secondary);
        background: var(--nx-color-surface-subtle);
        padding: 3px 8px;
        border-radius: var(--nx-radius-full);
      }
    `,
  ],
})
export class NotificationsComponent {
  private readonly service = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = signal(20);
  protected readonly total = signal(0);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.mine(this.page(), this.size()).subscribe({
      next: (result) => {
        this.notifications.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('notifications.loadError'));
        this.loading.set(false);
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }
}
