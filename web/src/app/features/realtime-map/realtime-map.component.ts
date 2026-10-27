import { AfterViewInit, Component, ElementRef, ViewChild, computed, inject, signal, OnDestroy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as L from 'leaflet';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { WorkSite } from '../admin/work-sites/work-site.models';
import { WorkSiteService } from '../admin/work-sites/work-site.service';
import { AttendanceEvent, RealtimeService } from './realtime.service';
import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { eventLabel, rejectionLabel } from '../attendance-events/attendance-events.models';
import { cssToken } from '../../core/ui/css-token';

/**
 * Mapa en tiempo real (RF-25, CU-11): grafica los registros de asistencia aceptados sobre
 * los centros del tenant a medida que llegan por WebSocket, y mantiene un feed en vivo.
 * Los eventos rechazados no incluyen ubicación, por lo que solo aparecen en el feed.
 */
@Component({
  selector: 'app-realtime-map',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatListModule, PageHeaderComponent, EmptyStateComponent, TranslocoPipe, AppDatePipe],
  template: `
    <app-page-header [title]="'layout.nav.map' | transloco" [subtitle]="'map.subtitle' | transloco">
      <span class="conn-badge" [class.on]="connected()">
        <mat-icon>{{ connected() ? 'sensors' : 'sensors_off' }}</mat-icon>
        {{ (connected() ? 'map.connected' : 'map.reconnecting') | transloco }}
      </span>
    </app-page-header>

    <div class="map-layout">
      <mat-card class="map-card">
        <mat-card-content>
          <div #mapEl class="map-canvas"></div>
        </mat-card-content>
      </mat-card>

      <mat-card class="feed-card">
        <mat-card-header>
          <mat-card-title>{{ 'map.recent' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="feed-stats">
            <span class="stat success"><mat-icon>check_circle</mat-icon> {{ 'map.accepted' | transloco: { n: acceptedCount() } }}</span>
            <span class="stat danger"><mat-icon>cancel</mat-icon> {{ 'map.rejected' | transloco: { n: rejectedCount() } }}</span>
          </div>
          @if (feed().length === 0) {
            <app-empty-state icon="sensors" [message]="'map.waiting' | transloco" />
          }
          <mat-list>
            @for (e of feed(); track e.attendanceId) {
              <mat-list-item>
                <mat-icon matListItemIcon [style.color]="e.type === 'ACCEPTED' ? 'var(--nx-color-status-success-fg)' : 'var(--nx-color-status-error-fg)'">
                  {{ e.type === 'ACCEPTED' ? 'check_circle' : 'cancel' }}
                </mat-icon>
                <span matListItemTitle>{{ feedTitle(e) }}</span>
                <span matListItemLine class="muted">{{ e.occurredAt | appDate: 'mediumTime' }}</span>
              </mat-list-item>
            }
          </mat-list>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .conn-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--nx-text-small-size);
        font-weight: var(--nx-font-weight-semibold);
        padding: 4px 12px;
        border-radius: var(--nx-radius-full);
        color: var(--nx-color-status-neutral-fg);
        background: var(--nx-color-status-neutral-bg);
      }
      .conn-badge.on { color: var(--nx-color-status-success-fg); background: var(--nx-color-status-success-bg); }
      .conn-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }

      .map-layout { display: flex; gap: var(--nx-space-4); flex-wrap: wrap; }
      .map-card { flex: 2 1 520px; }
      .feed-card { flex: 1 1 300px; }
      .map-canvas { height: 460px; border-radius: var(--nx-radius-md); overflow: hidden; }

      .feed-stats { display: flex; gap: var(--nx-space-3); margin-bottom: var(--nx-space-3); }
      .stat {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--nx-text-small-size);
        font-weight: var(--nx-font-weight-semibold);
        padding: 3px 10px;
        border-radius: var(--nx-radius-full);
      }
      .stat.success { color: var(--nx-color-status-success-fg); background: var(--nx-color-status-success-bg); }
      .stat.danger { color: var(--nx-color-status-error-fg); background: var(--nx-color-status-error-bg); }
      .stat mat-icon { font-size: 14px; width: 14px; height: 14px; }
    `,
  ],
})
export class RealtimeMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;

  private readonly workSiteService = inject(WorkSiteService);
  private readonly realtime = inject(RealtimeService);
  private readonly transloco = inject(TranslocoService);

  protected readonly connected = signal(false);
  protected readonly feed = signal<AttendanceEvent[]>([]);
  protected readonly acceptedCount = computed(() => this.feed().filter((e) => e.type === 'ACCEPTED').length);
  protected readonly rejectedCount = computed(() => this.feed().filter((e) => e.type === 'REJECTED').length);

  private map?: L.Map;
  private readonly siteMarkers = new Map<string, L.CircleMarker>();

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.workSiteService.list(0, 500).subscribe({
      next: (result) => this.plotSites(result.content),
      error: () => void 0,
    });

    this.realtime.connect(
      (event) => this.onEvent(event),
      (connected) => this.connected.set(connected),
    );
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
    this.map?.remove();
  }

  private plotSites(sites: WorkSite[]): void {
    if (!this.map) {
      return;
    }
    const bounds: L.LatLngExpression[] = [];
    for (const site of sites) {
      const marker = L.circleMarker([site.latitude, site.longitude], {
        radius: 8,
        color: cssToken('color-action-primary'),
        fillColor: cssToken('color-action-primary'),
        fillOpacity: 0.4,
      })
        .addTo(this.map)
        .bindTooltip(site.name);
      this.siteMarkers.set(site.id, marker);
      bounds.push([site.latitude, site.longitude]);
    }
    if (bounds.length > 0) {
      this.map.fitBounds(L.latLngBounds(bounds).pad(0.2));
    }
  }

  private onEvent(event: AttendanceEvent): void {
    this.feed.update((list) => [event, ...list].slice(0, 30));
    if (event.type !== 'ACCEPTED' || !event.workSiteId) {
      return;
    }
    const marker = this.siteMarkers.get(event.workSiteId);
    if (marker) {
      this.pulse(marker);
    }
  }

  /** Resalta brevemente el centro que recibió un registro. */
  private pulse(marker: L.CircleMarker): void {
    marker.setStyle({ color: cssToken('color-status-success-fg'), fillColor: cssToken('color-status-success-fg'), radius: 14 });
    setTimeout(() => marker.setStyle({ color: cssToken('color-action-primary'), fillColor: cssToken('color-action-primary'), radius: 8 }), 1200);
  }

  /** Título de un evento del feed: tipo de marcación si se aceptó, motivo si se rechazó. */
  protected feedTitle(e: { type: string; eventKind?: string | null; reason?: string | null }): string {
    if (e.type === 'ACCEPTED') {
      return e.eventKind ? eventLabel(e.eventKind) : this.transloco.translate('map.record');
    }
    return e.reason ? rejectionLabel(e.reason) : this.transloco.translate('map.rejection');
  }
}
