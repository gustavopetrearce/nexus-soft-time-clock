# Integrar marcaciones desde un sistema externo

Cómo registrar marcaciones de asistencia desde otro sistema usando `client_id` y `client_secret`. La decisión de diseño está en [ADR-013](../iteracion-02-arquitectura/adr/ADR-013-credenciales-de-sistema.md).

## Relojes y dispositivos con cabecera fija

Si el dispositivo solo puede enviar una cabecera configurada una vez, no necesita pedir token. Crea la credencial ([paso 1](#1-crear-la-credencial)) y configura el reloj para enviar en cada marcación:

```
POST /api/v1/integrations/attendance
Authorization: Basic <base64 de client_id:client_secret>
Content-Type: application/json
```

Para generar el valor:

```bash
printf '%s' "$CLIENT_ID:$CLIENT_SECRET" | base64 -w0
```

El cuerpo y las respuestas son los del [paso 4](#4-registrar-una-marcación). Si la credencial no es válida o fue revocada, la respuesta es 401 con `code: INVALID_CLIENT`.

La misma cabecera sirve para [consultar un colaborador](#3-consultar-un-colaborador) con `GET /api/v1/integrations/users?employeeCode=…`. En cualquier otra ruta se ignora y la respuesta es 401.

**La credencial no caduca.** Solo deja de valer si la revocas, rotas el secreto o la empresa queda inactiva. `lastUsedAt`, con una precisión de 5 minutos, permite detectar un reloj que dejó de reportar.

Requisitos del reloj:

| Requisito | Si no se cumple |
|---|---|
| Conexión por **HTTPS** | El secreto viajaría sin cifrar en cada marcación |
| Hora sincronizada por NTP y enviada con desfase o en UTC | Más de 5 minutos adelantado da 422 y la marca no se guarda; sin desfase da 400 |
| No acumular más de 72 h sin conexión | Esas marcas se rechazan con 422 `EVENT_TIME_OUT_OF_RANGE` |
| Enviar en orden cronológico por colaborador | Una marca anterior a otra ya aceptada se rechaza con `INVALID_SEQUENCE` |
| Reutilizar `operationUuid` al reintentar | La marca se duplicaría o se rechazaría por secuencia |
| Espaciar la descarga de lotes y reintentar | Nginx limita a 20 peticiones/s por IP con ráfaga de 40 |

Usa **una credencial por reloj**: si se pierde o se roba uno, revocas la suya sin afectar a los demás. Rotar el secreto obliga a reconfigurar ese reloj.

## 1. Crear la credencial

Lo hace un administrador de la empresa (permiso `integration:manage`).

**Desde el portal:** en **Integraciones**, pulsa **Nueva credencial**. El diálogo muestra el secreto una sola vez, junto con la cabecera lista para copiar en el reloj. Esa misma pantalla permite rotar el secreto y revocar la credencial.

**Por API**, con su token de usuario:

```bash
curl -X POST "$BASE_URL/api/v1/integrations/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ERP"}'
```

```json
{ "id": "…", "clientId": "nxc_…", "clientSecret": "…", "name": "ERP" }
```

**`clientSecret` solo aparece en esta respuesta.** Guárdalo en un gestor de secretos. Quien lo tenga puede marcar por cualquier colaborador de la empresa, así que usa siempre HTTPS.

| Operación | Petición |
|---|---|
| Listar | `GET /api/v1/integrations/clients` |
| Reemplazar el secreto (el anterior deja de valer al instante) | `POST /api/v1/integrations/clients/{id}/rotate-secret` |
| Revocar (corta el acceso al instante) | `DELETE /api/v1/integrations/clients/{id}` |

## 2. Obtener el token

Para sistemas que sí pueden renovarlo. Los relojes con cabecera fija se saltan este paso.

```bash
curl -X POST "$BASE_URL/api/v1/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET"
```

También se admite HTTP Basic con `client_id:client_secret`.

```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 900 }
```

No hay refresh token: pide uno nuevo poco antes de que venza `expires_in` o al recibir un 401. El token solo sirve para la consulta de colaborador y la marcación.

| Error | Causa |
|---|---|
| 401 `invalid_client` | Credencial incorrecta o revocada, o empresa inactiva |
| 400 `unsupported_grant_type` | `grant_type` distinto de `client_credentials` |
| 400 `invalid_request` | Falta `grant_type`, o el secreto va en la URL |

## 3. Consultar un colaborador

Opcional: comprueba un código de empleado antes de marcar, por ejemplo al dar de alta a la persona en tu sistema o en el reloj. Acepta la cabecera fija o el token.

```bash
curl "$BASE_URL/api/v1/integrations/users?employeeCode=EMP-001" \
  -H "Authorization: Basic $(printf '%s' "$CLIENT_ID:$CLIENT_SECRET" | base64 -w0)"

curl "$BASE_URL/api/v1/integrations/users?employeeCode=EMP-001" \
  -H "Authorization: Bearer $TOKEN"
```

El código debe coincidir exactamente, incluidas las mayúsculas; no hay búsqueda parcial. Si el código lleva caracteres especiales, codifícalo en la URL.

```json
{
  "id": "…",
  "employeeCode": "EMP-001",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "status": "ACTIVE",
  "canRegisterAttendance": true
}
```

| Campo | Significado |
|---|---|
| `status` | Estado de la cuenta: `ACTIVE`, `INACTIVE`, `LOCKED` o `INVITED` |
| `canRegisterAttendance` | `true` si una marca suya no se rechazaría por `EMPLOYEE_INACTIVE` ni `EMPLOYEE_NOT_ENABLED`. No adelanta los rechazos de horario o secuencia |

No devuelve correo ni roles.

| HTTP | `code` | Causa |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Falta el parámetro `employeeCode` |
| 401 | — | Token ausente, caducado o inválido |
| 401 | `INVALID_CLIENT` | Cabecera fija con credencial incorrecta o revocada, o empresa inactiva |
| 403 | `API_CLIENT_REVOKED` | Token aún vigente de una credencial revocada o de una empresa inactiva |
| 404 | `NOT_FOUND` | No existe ese código en tu empresa |

## 4. Registrar una marcación

```bash
curl -X POST "$BASE_URL/api/v1/integrations/attendance" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operationUuid": "3f0c9a52-6d1b-4a7e-9c55-2b8f1f6a7d10",
    "employeeCode": "EMP-001",
    "workSiteId": "UUID-del-centro",
    "eventType": "ENTRADA",
    "eventTime": "2026-11-05T08:01:00-06:00"
  }'
```

| Campo | Regla |
|---|---|
| `operationUuid` | UUID generado por tu sistema, uno por marcación. **Reutilízalo en los reintentos** |
| `employeeCode` | Código de empleado del colaborador en Nexus |
| `workSiteId` | UUID del centro de trabajo, activo y de tu empresa. Se obtiene con `GET /api/v1/work-sites` o de la URL del centro en el portal (`/work-sites/<id>/edit`) |
| `eventType` | `ENTRADA`, `SALIDA`, `INICIO_DESCANSO`, `FIN_DESCANSO` o `CAMBIO_SITIO` |
| `eventTime` | Hora en que ocurrió, ISO-8601 **con desfase horario**. Máximo 72 h atrás y 5 min adelante |

### Respuestas

**200: la marca se evaluó y quedó guardada.** Un rechazo de negocio también es 200, así que revisa siempre `status`:

```json
{
  "recordId": "…",
  "status": "ACCEPTED",
  "rejectionReason": null,
  "serverTime": "2026-11-05T14:01:00Z",
  "distanceToSiteM": null,
  "flags": ["EXTERNAL_SOURCE"],
  "minutesLate": 0
}
```

| `rejectionReason` | Significado |
|---|---|
| `INVALID_SEQUENCE` | No encaja en la jornada (por ejemplo, `SALIDA` sin `ENTRADA`) o ya hay una marca posterior aceptada |
| `OUT_OF_SCHEDULE` | `ENTRADA` fuera de la ventana del turno |
| `EVENT_TYPE_DISABLED` | La empresa tiene desactivado ese tipo de evento |

Un rechazo es definitivo para ese `operationUuid`: reenviarlo devuelve el mismo resultado y abre una incidencia para RR.HH. solo la primera vez.

**Errores: la marca no se guardó.** Se pueden corregir y reintentar con el mismo `operationUuid`.

| HTTP | `code` | Causa |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `MALFORMED_REQUEST` | Falta un campo, formato inválido o fecha sin desfase |
| 401 | — | Token ausente, caducado o inválido |
| 401 | `INVALID_CLIENT` | Cabecera fija con credencial incorrecta o revocada, o empresa inactiva |
| 403 | `API_CLIENT_REVOKED` | Token aún vigente de una credencial revocada o de una empresa inactiva |
| 422 | `EMPLOYEE_NOT_FOUND` | No existe ese código en tu empresa |
| 422 | `EMPLOYEE_INACTIVE` | El colaborador está dado de baja o sin activar |
| 422 | `EMPLOYEE_NOT_ENABLED` | El usuario no tiene permiso para registrar asistencia |
| 422 | `WORK_SITE_NOT_FOUND` | El centro no existe, está inactivo o es de otra empresa |
| 422 | `EVENT_TIME_OUT_OF_RANGE` | `eventTime` fuera de la ventana permitida |

## Reglas para el emisor

1. **Envía en orden cronológico por colaborador.** Una marca anterior a otra ya aceptada se rechaza con `INVALID_SEQUENCE`. Con cola de envío, procesa cada colaborador en serie.
2. **Reintenta con el mismo `operationUuid`** ante timeouts o errores 5xx. Así no se duplica la marca.
3. **No reintentes en bucle los 4xx:** requieren corregir datos o la credencial.
4. **Reutiliza el token** mientras esté vigente en lugar de pedir uno por marcación.

## En el portal

Las marcas aparecen en Entradas y salidas y en Registros de asistencia, con procedencia "Sistema externo" y sin datos de GPS ni distancia. La bitácora las atribuye a `integration:<nombre de la credencial>`.
