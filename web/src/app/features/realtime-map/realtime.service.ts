import { Injectable, inject } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

import { environment } from '../../../environments/environment';
import { AuthStore } from '../../core/auth/auth.store';

export interface AttendanceEvent {
  type: 'ACCEPTED' | 'REJECTED';
  attendanceId: string;
  userId: string;
  workSiteId?: string;
  eventKind?: string;
  occurredAt: string;
  reason?: string;
}

/**
 * Cliente STOMP sobre SockJS para el tiempo real (ADR-011). Se suscribe al destino por
 * tenant `/topic/tenant/{tenantId}/attendance` y entrega los eventos de asistencia (RF-25).
 *
 * El servidor autentica la trama CONNECT y acota la suscripción al tenant del token, así que
 * el access token viaja en `connectHeaders` y se relee en cada intento: es de vida corta
 * (~15 min) y un reconecte con el token de hace media hora se rechazaría para siempre.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly store = inject(AuthStore);
  private client?: Client;

  connect(onEvent: (event: AttendanceEvent) => void, onStatus?: (connected: boolean) => void): void {
    const tenantId = this.store.user()?.tenantId;
    if (!tenantId) {
      return;
    }
    const url = window.location.origin + environment.wsUrl;

    this.client = new Client({
      webSocketFactory: () => new SockJS(url) as WebSocket,
      beforeConnect: () => {
        const token = this.store.accessToken();
        if (this.client) {
          this.client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
        }
      },
      reconnectDelay: 5000,
      onConnect: () => {
        onStatus?.(true);
        this.client?.subscribe(`/topic/tenant/${tenantId}/attendance`, (message: IMessage) => {
          try {
            onEvent(JSON.parse(message.body) as AttendanceEvent);
          } catch {
            /* payload no-JSON: ignorar */
          }
        });
      },
      onWebSocketClose: () => onStatus?.(false),
      // El servidor cierra la sesión con una trama ERROR cuando el token falta, caducó o el
      // destino no es del tenant: sin esto el mapa se quedaba "conectando" sin decir nada.
      onStompError: () => onStatus?.(false),
    });
    this.client.activate();
  }

  disconnect(): void {
    void this.client?.deactivate();
    this.client = undefined;
  }
}
