/** Credencial de un sistema externo o reloj (espejo de ApiClientResponse). Nunca lleva el secreto. */
export interface ApiClient {
  id: string;
  clientId: string;
  name: string;
  status: 'ACTIVE' | 'REVOKED';
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

/** Respuesta de crear o rotar: la única vez que el secreto sale del servidor. */
export interface ApiClientCredentials {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
}

/** Cabecera fija que se configura en un reloj: `Authorization: Basic base64(client_id:client_secret)`. */
export function basicAuthorization(credentials: Pick<ApiClientCredentials, 'clientId' | 'clientSecret'>): string {
  return `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`;
}
