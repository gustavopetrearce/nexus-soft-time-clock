# ADR-006 — QR de centro firmado con nonce y vigencia

**Estado:** Aceptado · **Fecha:** 2026-07-21 · **Confirmada por el usuario** (default D-04)

## Contexto
El QR identifica el centro para el registro (RF-14). Un QR estático es fácilmente fotografiable/reutilizable (fraude, RN-25, RN-26).

## Decisión
El QR **no** contiene un valor estático adivinable, sino un **token firmado** (HMAC-SHA256 o JWS) que incluye: `tenant_id`, `site_id`, `nonce` (aleatorio), `issued_at` y `expires_at`. El backend valida firma y vigencia y **consume el nonce** (Redis) para prevenir replay. El QR se **rota de forma programada** (Scheduler) según política del centro. Modelo elegido frente a "QR dinámico en pantalla del sitio" por no requerir hardware adicional; el diseño no lo impide a futuro.

## Consecuencias
- ➕ Resistente a copia/reutilización dentro de la ventana; replay detectable.
- ➕ No requiere pantalla/hardware en el sitio.
- ➖ Un QR impreso es válido durante su ventana de vigencia → se mitiga con vigencia corta + geocerca + antifraude + (opcional) foto/biometría. La ubicación física sigue siendo la barrera principal.
- ➖ Requiere gestión de rotación y sincronización de reloj.

## Addendum — 2026-08-24: se retira el consumo de nonce

Al admitir QR de **vigencia larga** (días/semanas/meses, para imprimir y colgar en el centro), el
nonce del token dejó de ser de un solo uso: es un valor fijo que acompaña al QR durante toda su
vida. "Consumirlo" convertía la barrera anti-replay en «un solo registro por persona y día», con lo
que el segundo evento de la jornada (INICIO_DESCANSO tras la ENTRADA) se rechazaba como
`REPLAY_DETECTED`. Acotar la clave por tipo de evento tampoco servía: RN-12 admite varios descansos
y varios cambios de sitio en el mismo día.

**Decisión:** se elimina el consumo de nonce (tabla `qr_nonce_consumed`, migración V22). El
anti-replay pasa a apoyarse en la idempotencia por `operation_uuid` (RN-51, ADR-004) y en la
secuencia coherente de la jornada (RN-12); frente a un QR fotografiado, la barrera sigue siendo la
ubicación física (geocerca) más el antifraude y el device binding, tal como ya anticipaba la
sección "Consecuencias". El nonce se conserva como traza de auditoría en
`attendance_records.qr_nonce`.
