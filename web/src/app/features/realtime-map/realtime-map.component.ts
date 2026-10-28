import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as L from 'leaflet';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { WorkSite } from '../admin/work-sites/work-site.models';
import { WorkSiteService } from '../admin/work-sites/work-site.service';
import { eventLabel, rejectionLabel } from '../attendance-events/attendance-events.models';
import { AttendanceEvent, RealtimeService } from './realtime.service';

/** Ventana de los marcadores: registros aceptados de la última hora (HIFI/08 R4). */
const MARKER_WINDOW_MS = 60 * 60 * 1000;
/** Eventos que guarda la lista lateral; los contadores cuentan sobre estos (R5). */
const FEED_SIZE = 30;

/**
 * P15 · Mapa en tiempo real (RF-25, CU-11): una tarjeta con indicador en vivo, buscador, mapa con
 * un marcador por centro que cuenta los registros aceptados de la última hora, y la lista de los
 * últimos 30 eventos del canal. Los rechazados no traen ubicación: aparecen solo en la lista, con
 * su motivo. El evento del canal no incluye el nombre del colaborador, así que se busca por centro.
 */
@Component({
  selector: 'app-realtime-map',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
    AppDatePipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h2 { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-indicador mat-icon { width: var(--nx-icon-size-md); height: var(--nx-icon-size-md); font-size: var(--nx-icon-size-md); }
      .nx-chip mat-icon { width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); font-size: var(--nx-icon-size-sm); }
      .nx-mapa { display: block; z-index: 0; }
      .nx-lista { margin: var(--nx-space-0); max-height: calc(var(--nx-space-16) * 6); overflow-y: auto; }
      .nx-lista__fila { animation: nx-fade var(--nx-motion-duration-medium) var(--nx-motion-easing-enter); }
      /* Marcadores de Leaflet: el DOM lo crea la librería, fuera de la plantilla. */
      :host ::ng-deep .nx-marca-icono { background: none; border: 0; }
      :host ::ng-deep .nx-marca-icono .nx-mapa__marca { position: static; transform: translate(-50%, -50%); width: max-content; }
      :host ::ng-deep .nx-marca-icono .nx-mapa__marca.is-vacio {
        background: var(--nx-color-surface-default);
        color: var(--nx-color-text-secondary);
        border: var(--nx-border-width-default) solid var(--nx-color-border-strong);
        box-shadow: var(--nx-shadow-1);
      }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.map' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="loadSites()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    }

    <section class="nx-panel" [hidden]="error()">
      <div class="nx-panel__barra">
        <div class="nx-fila-indicadores" aria-live="polite">
          @if (connected()) {
            <span class="nx-indicador nx-indicador--success">
              <mat-icon aria-hidden="true">sync</mat-icon>
              {{ 'map.live' | transloco }} · {{ 'map.updated' | transloco }}
              <span class="nx-text-numeric">{{ lastUpdate() | appDate: 'HH:mm' }}</span>
            </span>
          } @else {
            <span class="nx-indicador nx-indicador--warning">
              <mat-icon aria-hidden="true">cloud_off</mat-icon>{{ 'map.reconnecting' | transloco }}
            </span>
          }
        </div>
      </div>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
        <mat-icon matPrefix>search</mat-icon>
        <mat-label>{{ 'map.search' | transloco }}</mat-label>
        <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
      </mat-form-field>

      <div class="nx-g-8-4">
        <div #mapEl class="nx-mapa" role="img" [attr.aria-label]="'map.mapLabel' | transloco"></div>

        <div class="nx-eventos-recientes">
          <h2 class="nx-text-heading-4">{{ 'map.recent' | transloco }}</h2>
          <div class="nx-fila-indicadores">
            <span class="nx-chip nx-chip--success"><mat-icon aria-hidden="true">check_circle</mat-icon>{{ 'map.accepted' | transloco: { n: acceptedCount() } }}</span>
            <span class="nx-chip nx-chip--error"><mat-icon aria-hidden="true">error_outline</mat-icon>{{ 'map.rejected' | transloco: { n: rejectedCount() } }}</span>
          </div>
          @if (visibleFeed().length === 0) {
            @if (feed().length === 0) {
              <app-empty-state icon="public" [message]="'map.empty' | transloco" />
            } @else {
              <app-empty-state icon="search" [message]="'common.noResults' | transloco">
                <button mat-button type="button" (click)="searchControl.setValue('')">{{ 'common.clearFilters' | transloco }}</button>
              </app-empty-state>
            }
          } @else {
            <ul class="nx-lista nx-scroll" nxScroll>
              @for (e of visibleFeed(); track e.attendanceId) {
                <li class="nx-lista__fila">
                  <div class="nx-lista__texto">
                    <span class="nx-trunc">{{ eventTitle(e) }}</span>
                    <span class="nx-lista__secundario">
                      <span class="nx-text-numeric">{{ e.occurredAt | appDate: 'HH:mm' }}</span>
                      @if (siteName(e.workSiteId); as site) { · {{ site }} }
                      @if (e.type === 'REJECTED' && e.reason) { <br />{{ reasonLabel(e.reason) }} }
                    </span>
                  </div>
                  @if (e.type === 'REJECTED') {
                    <div class="nx-lista__trail"><span class="nx-chip nx-chip--error">{{ 'attendance.status.REJECTED' | transloco }}</span></div>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </section>
  `,
})
export class RealtimeMapComponent implements AfterViewInit, OnDestroy {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  private readonly workSiteService = inject(WorkSiteService);
  private readonly realtime = inject(RealtimeService);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly connected = signal(false);
  protected readonly lastUpdate = signal<Date>(new Date());
  protected readonly feed = signal<AttendanceEvent[]>([]);
  private readonly sites = signal<WorkSite[]>([]);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly search = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  protected readonly acceptedCount = computed(() => this.feed().filter((e) => e.type === 'ACCEPTED').length);
  protected readonly rejectedCount = computed(() => this.feed().filter((e) => e.type === 'REJECTED').length);

  protected readonly visibleFeed = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.feed();
    return this.feed().filter((e) => (this.siteName(e.workSiteId) ?? '').toLowerCase().includes(term));
  });

  private map?: L.Map;
  private readonly markers = new Map<string, L.Marker>();
  /** Horas de los registros aceptados por centro, para el conteo de la última hora. */
  private readonly hits = new Map<string, number[]>();
  private pruneTimer?: ReturnType<typeof setInterval>;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.loadSites();
    this.searchControl.valueChanges.subscribe(() => this.refreshMarkers());
    this.pruneTimer = setInterval(() => this.refreshMarkers(), 60_000);

    this.realtime.connect(
      (event) => this.onEvent(event),
      (connected) => {
        this.connected.set(connected);
        if (connected) this.lastUpdate.set(new Date());
      },
    );
  }

  ngOnDestroy(): void {
    clearInterval(this.pruneTimer);
    this.realtime.disconnect();
    this.map?.remove();
  }

  protected loadSites(): void {
    this.loading.set(true);
    this.error.set(false);
    this.workSiteService.list(0, 500).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.sites.set(result.content);
        this.plotSites(result.content);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  private plotSites(sites: WorkSite[]): void {
    if (!this.map) return;
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    const bounds: L.LatLngExpression[] = [];
    for (const site of sites) {
      const marker = L.marker([site.latitude, site.longitude], { icon: this.icon(0), keyboard: false })
        .addTo(this.map)
        .bindTooltip(site.name);
      this.markers.set(site.id, marker);
      bounds.push([site.latitude, site.longitude]);
    }
    if (bounds.length > 0) {
      this.map.fitBounds(L.latLngBounds(bounds).pad(0.2));
    }
    // El mapa se crea antes de que el panel tenga su ancho final.
    setTimeout(() => this.map?.invalidateSize());
    this.refreshMarkers();
  }

  private onEvent(event: AttendanceEvent): void {
    this.lastUpdate.set(new Date());
    this.feed.update((list) => [event, ...list].slice(0, FEED_SIZE));
    if (event.type === 'ACCEPTED' && event.workSiteId) {
      const times = this.hits.get(event.workSiteId) ?? [];
      times.push(Date.parse(event.occurredAt) || Date.now());
      this.hits.set(event.workSiteId, times);
      this.refreshMarkers();
    }
  }

  /** Recalcula el número de cada marcador y oculta los centros que no coinciden con la búsqueda. */
  private refreshMarkers(): void {
    if (!this.map) return;
    const since = Date.now() - MARKER_WINDOW_MS;
    const term = this.searchControl.value.trim().toLowerCase();
    for (const site of this.sites()) {
      const marker = this.markers.get(site.id);
      if (!marker) continue;
      const recent = (this.hits.get(site.id) ?? []).filter((t) => t >= since);
      this.hits.set(site.id, recent);
      marker.setIcon(this.icon(recent.length));
      const visible = !term || site.name.toLowerCase().includes(term);
      if (visible && !this.map.hasLayer(marker)) marker.addTo(this.map);
      if (!visible && this.map.hasLayer(marker)) marker.remove();
    }
  }

  private icon(count: number): L.DivIcon {
    const empty = count === 0 ? ' is-vacio' : '';
    return L.divIcon({
      className: 'nx-marca-icono',
      html: `<span class="nx-mapa__marca nx-text-numeric${empty}">${count}</span>`,
      iconSize: [0, 0],
    });
  }

  protected siteName(id?: string): string | null {
    if (!id) return null;
    return this.sites().find((s) => s.id === id)?.name ?? null;
  }

  /** Tipo de marcación si se aceptó; «Registro rechazado» si no. */
  protected eventTitle(e: AttendanceEvent): string {
    if (e.type === 'REJECTED') return this.transloco.translate('map.rejection');
    return e.eventKind ? eventLabel(e.eventKind) : this.transloco.translate('map.record');
  }

  protected reasonLabel(reason: string): string {
    return rejectionLabel(reason);
  }
}
