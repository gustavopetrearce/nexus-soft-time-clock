import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, ViewChild, input, output } from '@angular/core';
import * as L from 'leaflet';
import { cssToken } from './css-token';

export interface MapPosition {
  latitude: number;
  longitude: number;
}

/**
 * Mapa Leaflet (OSM) embebido directamente en la página — clic para fijar la ubicación,
 * con círculo de radio de precisión GPS. Usado en el formulario de centro de trabajo en
 * vez de un diálogo modal, para igualar el panel "Ubicación en el mapa" de los mockups.
 */
@Component({
  selector: 'app-map-inline',
  standalone: true,
  template: `<div #mapEl style="height:100%;min-height:220px;border-radius:var(--nx-radius-md);overflow:hidden"></div>`,
})
export class MapInlineComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;

  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  readonly radiusMeters = input<number>(50);
  readonly positionChange = output<MapPosition>();

  private map?: L.Map;
  private marker?: L.Marker;
  private circle?: L.Circle;
  private ready = false;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    const lat = this.latitude();
    const lng = this.longitude();
    if (lat != null && lng != null) {
      this.map.setView([lat, lng], 16);
      this.renderPoint(lat, lng);
    } else {
      this.map.setView([0, 0], 2);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => this.positionChange.emit({ latitude: e.latlng.lat, longitude: e.latlng.lng }));
    this.ready = true;
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ready || !this.map) {
      return;
    }
    const lat = this.latitude();
    const lng = this.longitude();
    if (lat != null && lng != null) {
      this.renderPoint(lat, lng);
      if (changes['latitude']?.isFirstChange() === false || changes['longitude']?.isFirstChange() === false) {
        this.map.panTo([lat, lng]);
      }
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  centerOnPoint(): void {
    const lat = this.latitude();
    const lng = this.longitude();
    if (lat != null && lng != null) {
      this.map?.setView([lat, lng], 16);
    }
  }

  private renderPoint(lat: number, lng: number): void {
    const point: L.LatLngExpression = [lat, lng];
    if (!this.marker) {
      this.marker = L.marker(point).addTo(this.map as L.Map);
    } else {
      this.marker.setLatLng(point);
    }
    const radius = this.radiusMeters();
    if (!this.circle) {
      this.circle = L.circle(point, { radius, color: cssToken('color-action-primary'), fillColor: cssToken('color-action-primary'), fillOpacity: 0.12 }).addTo(this.map as L.Map);
    } else {
      this.circle.setLatLng(point);
      this.circle.setRadius(radius);
    }
  }
}
