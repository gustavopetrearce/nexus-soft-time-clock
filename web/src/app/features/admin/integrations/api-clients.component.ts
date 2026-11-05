import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { ApiClientFormDialogComponent } from './api-client-form-dialog.component';
import { ApiClientSecretDialogComponent, ApiClientSecretDialogData } from './api-client-secret-dialog.component';
import { ApiClient, ApiClientCredentials } from './api-client.models';
import { ApiClientService } from './api-client.service';

/**
 * Integraciones (ADR-013): credenciales con las que un reloj u otro sistema registra marcaciones.
 * Rotar y revocar se confirman porque el dispositivo deja de marcar en ese mismo instante.
 */
@Component({
  selector: 'app-api-clients',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
    AppDatePipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [`td { white-space: nowrap; }`],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'apiClients.title' | transloco" [subtitle]="'apiClients.subtitle' | transloco">
      <button mat-flat-button type="button" (click)="create()"><mat-icon>add</mat-icon>{{ 'apiClients.new' | transloco }}</button>
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else if (!loading() && clients().length === 0) {
      <app-empty-state icon="vpn_key" [message]="'apiClients.empty' | transloco" [description]="'apiClients.emptyHint' | transloco" />
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-tabla">
          <div class="nx-tabla__scroll nx-scroll" nxScroll>
            <table>
              <thead>
                <tr>
                  <th scope="col">{{ 'common.name' | transloco }}</th>
                  <th scope="col">{{ 'apiClients.secret.clientId' | transloco }}</th>
                  <th scope="col">{{ 'common.status' | transloco }}</th>
                  <th scope="col" class="num">{{ 'apiClients.lastUsed' | transloco }}</th>
                  <th scope="col" class="num">{{ 'apiClients.createdAt' | transloco }}</th>
                  <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of clients(); track c.id) {
                  <tr>
                    <td><span class="nx-trunc">{{ c.name }}</span></td>
                    <td class="nx-text-code">{{ c.clientId }}</td>
                    <td><app-status-chip [status]="c.status" [label]="'apiClients.status.' + c.status | transloco" /></td>
                    <td class="num nx-text-numeric">{{ c.lastUsedAt ? (c.lastUsedAt | appDate: 'dd/MM/yyyy HH:mm') : ('apiClients.neverUsed' | transloco) }}</td>
                    <td class="num nx-text-numeric">{{ c.createdAt | appDate: 'dd/MM/yyyy' }}</td>
                    <td class="nx-col-acciones">
                      @if (c.status === 'ACTIVE') {
                        <span class="nx-acciones-fila">
                          <button mat-stroked-button type="button" [disabled]="busyId() === c.id" (click)="rotate(c)"><mat-icon>autorenew</mat-icon>{{ 'apiClients.rotate' | transloco }}</button>
                          <button mat-stroked-button type="button" [disabled]="busyId() === c.id" (click)="revoke(c)"><mat-icon>block</mat-icon>{{ 'apiClients.revoke' | transloco }}</button>
                        </span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>
    }
  `,
})
export class ApiClientsComponent {
  private readonly service = inject(ApiClientService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly clients = signal<ApiClient[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list().subscribe({
      next: (clients) => {
        this.clients.set(clients);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected create(): void {
    this.dialog
      .open<ApiClientFormDialogComponent, void, ApiClientCredentials>(ApiClientFormDialogComponent, { width: '480px' })
      .afterClosed()
      .subscribe((credentials) => {
        if (credentials) {
          this.showSecret(credentials, false);
          this.reload();
        }
      });
  }

  protected rotate(client: ApiClient): void {
    this.confirm('apiClients.rotateTitle', 'apiClients.rotateMessage', 'apiClients.rotate', client, () => {
      this.service.rotateSecret(client.id).subscribe({
        next: (credentials) => {
          this.busyId.set(null);
          this.showSecret(credentials, true);
        },
        error: (err) => this.fail(err),
      });
    });
  }

  protected revoke(client: ApiClient): void {
    this.confirm('apiClients.revokeTitle', 'apiClients.revokeMessage', 'apiClients.revoke', client, () => {
      this.service.revoke(client.id).subscribe({
        next: () => {
          this.busyId.set(null);
          this.notify.success(this.transloco.translate('apiClients.revoked', { name: client.name }));
          this.reload();
        },
        error: (err) => this.fail(err),
      });
    });
  }

  private confirm(titleKey: string, messageKey: string, confirmKey: string, client: ApiClient, action: () => void): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate(titleKey, { name: client.name }),
          message: this.transloco.translate(messageKey),
          confirmText: this.transloco.translate(confirmKey),
          color: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.busyId.set(client.id);
          action();
        }
      });
  }

  private showSecret(credentials: ApiClientCredentials, rotated: boolean): void {
    this.dialog.open<ApiClientSecretDialogComponent, ApiClientSecretDialogData>(ApiClientSecretDialogComponent, {
      data: { credentials, rotated },
      disableClose: true,
    });
  }

  /** Otra sesión pudo haberla revocado: se muestra el motivo y se refresca la lista. */
  private fail(err: unknown): void {
    this.busyId.set(null);
    this.notify.error(localizedProblem(this.transloco, err, 'errors.generic'));
    this.reload();
  }
}
