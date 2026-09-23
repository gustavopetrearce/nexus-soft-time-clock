import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { AuditEntry } from './audit.models';
import { AuditService } from './audit.service';

/**
 * Bitácora de auditoría (RF-12): consulta paginada de solo lectura. Los registros son
 * inmutables (RN-61): la UI no ofrece editar ni borrar.
 */
@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <app-page-header title="Auditoría" subtitle="Consulta los registros de actividad del sistema" />

    <div class="split-layout">
      <div class="split-main">
        <mat-card>
          <mat-card-content>
            @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
            @if (error()) { <p class="error-text">{{ error() }}</p> }

            <div class="table-wrap">
              <table mat-table [dataSource]="entries()" style="width:100%">
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>Fecha/hora</th>
                  <td mat-cell *matCellDef="let e">{{ e.createdAt }}</td>
                </ng-container>
                <ng-container matColumnDef="actor">
                  <th mat-header-cell *matHeaderCellDef>Usuario</th>
                  <td mat-cell *matCellDef="let e">{{ actor(e) }}</td>
                </ng-container>
                <ng-container matColumnDef="action">
                  <th mat-header-cell *matHeaderCellDef>Acción</th>
                  <td mat-cell *matCellDef="let e">{{ e.action }}</td>
                </ng-container>
                <ng-container matColumnDef="resource">
                  <th mat-header-cell *matHeaderCellDef>Recurso</th>
                  <td mat-cell *matCellDef="let e">{{ e.resourceType }} · {{ e.resourceId }}</td>
                </ng-container>
                <ng-container matColumnDef="ip">
                  <th mat-header-cell *matHeaderCellDef>Origen</th>
                  <td mat-cell *matCellDef="let e">{{ e.ip || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"
                    (click)="select(row)"
                    style="cursor:pointer"
                    [style.background]="row.id === selected()?.id ? 'var(--brand-soft)' : ''"></tr>
              </table>
            </div>

            @if (!loading() && entries().length === 0) {
              <app-empty-state icon="fact_check" message="No hay registros de auditoría." />
            }

            <mat-paginator
              [length]="total()"
              [pageSize]="size()"
              [pageIndex]="page()"
              [pageSizeOptions]="[25, 50, 100]"
              (page)="onPage($event)"
            />
          </mat-card-content>
        </mat-card>
      </div>

      @if (selected(); as e) {
        <aside class="split-drawer">
          <div class="drawer-header">
            <div class="titles"><h3>{{ e.action }}</h3><p class="sub">{{ e.createdAt }}</p></div>
            <button mat-icon-button (click)="selected.set(null)" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
          </div>
          <div class="drawer-body">
            <div class="detail-grid">
              <div class="detail-row"><span class="k">Usuario</span><span class="v">{{ actor(e) }}</span></div>
              <div class="detail-row"><span class="k">Acción</span><span class="v">{{ e.action }}</span></div>
              <div class="detail-row"><span class="k">Recurso</span><span class="v">{{ e.resourceType }}</span></div>
              <div class="detail-row"><span class="k">ID del recurso</span><span class="v">{{ e.resourceId }}</span></div>
              <div class="detail-row"><span class="k">IP</span><span class="v">{{ e.ip || '—' }}</span></div>
              <div class="detail-row"><span class="k">Navegador</span><span class="v">{{ e.userAgent || '—' }}</span></div>
              <div class="detail-row"><span class="k">Dispositivo</span><span class="v">{{ e.deviceInfo || '—' }}</span></div>
              @if (e.oldValues) {
                <div class="detail-section-title">Valores anteriores</div>
                <pre class="values-block">{{ pretty(e.oldValues) }}</pre>
              }
              @if (e.newValues) {
                <div class="detail-section-title">Valores nuevos</div>
                <pre class="values-block">{{ pretty(e.newValues) }}</pre>
              }
            </div>
          </div>
        </aside>
      }
    </div>
  `,
  styles: [
    `
      .values-block {
        margin: 0;
        padding: var(--sp-3);
        background: var(--surface-2);
        border-radius: var(--radius-sm);
        font-size: var(--font-small);
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
})
export class AuditComponent {
  private readonly service = inject(AuditService);

  protected readonly columns = ['createdAt', 'actor', 'action', 'resource', 'ip'];
  protected readonly entries = signal<AuditEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<AuditEntry | null>(null);

  protected readonly page = signal(0);
  protected readonly size = signal(50);
  protected readonly total = signal(0);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list(this.page(), this.size()).subscribe({
      next: (result) => {
        this.entries.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la bitácora (¿permiso audit:read?).');
        this.loading.set(false);
      },
    });
  }

  /** El correo identifica al autor mejor que su id; sin autor, la acción fue del sistema. */
  protected actor(entry: AuditEntry): string {
    return entry.actorEmail || entry.actorUserId || 'Sistema';
  }

  /** Los valores llegan como JSON en una línea; se indentan para poder leerlos. */
  protected pretty(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  protected select(entry: AuditEntry): void {
    this.selected.set(entry);
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }
}
