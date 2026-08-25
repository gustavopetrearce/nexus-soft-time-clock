# 10 — Supuestos y decisiones abiertas

## 10.1 Supuestos asumidos (razonables por defecto; ajustables)

| # | Supuesto | Valor por defecto propuesto |
|---|---|---|
| S-01 | Estrategia multi-tenant | **Discriminador por columna `tenant_id`** con aislamiento a nivel de aplicación (Hibernate filter / RLS opcional). Simple de operar y escalar; se puede migrar a schema-per-tenant si un cliente lo exige. |
| S-02 | Geocerca inicial | **Circular** (centro + radio). Poligonal queda modelada pero se implementa después. |
| S-03 | Precisión GPS máxima por defecto | 50 m (configurable por centro). |
| S-04 | Tolerancia de retardo por defecto | 10 min (configurable por turno). |
| S-05 | TTL de tokens | accessToken 15 min, refreshToken 30 días rotatorio (configurable). |
| S-06 | Vigencia del QR de centro | ~~QR dinámico con `nonce` + ventana corta (p.ej. 60–120 s)~~ **Superado** por el addendum de [ADR-006](../iteracion-02-arquitectura/adr/ADR-006-qr-firmado.md): se admiten vigencias largas (días/semanas/meses) para el cartel impreso del centro, y el `nonce` deja de consumirse. La barrera principal pasa a ser la ubicación física (geocerca) más antifraude y device binding. |
| S-07 | Política antifraude por defecto | Mock location y GPS spoofing → **rechazo**; root/jailbreak → **marcar** para revisión (configurable por tenant). |
| S-08 | Almacenamiento de evidencias | MinIO (S3-compatible), objetos cifrados, URLs firmadas de vida corta. |
| S-09 | Idioma base | Español (i18n habilitado para agregar más). |
| S-10 | Zona horaria | Almacenamiento en **UTC**; presentación/cálculo con la zona del centro/tenant. |
| S-11 | Identidad de login | Email + contraseña por defecto; el "identificador de empresa" puede derivarse del email/subdominio (a confirmar). |

## 10.2 Decisiones abiertas (a confirmar con el negocio)

| # | Pregunta | Impacto | Propuesta |
|---|---|---|---|
| D-01 | ¿El aislamiento multi-tenant debe ser por **columna** (más simple/escalable) o **schema/DB por tenant** (mayor aislamiento, más costo operativo)? | Alto — diseño de BD y despliegue | Columna `tenant_id` (S-01) salvo requisito regulatorio. |
| D-02 | ¿La biometría y la foto son **opcionales globales** o **obligatorias por centro/política**? | Medio — flujo de registro | Configurable por centro (default opcional). |
| D-03 | ¿Cómo se **identifica la empresa** en el login (subdominio, código, dominio de email)? | Medio — auth y onboarding | Dominio de email → tenant, con fallback a código. |
| D-04 | ¿El QR es **por centro** (semi-estático rotado) o **dinámico** mostrado en pantalla del centro? Esto define el modelo anti-replay. | Alto — antifraude | QR por centro firmado + rotación; evaluar QR dinámico si hay pantalla en sitio. |
| D-05 | ¿Se requiere **reconocimiento facial server-side** o basta la **biometría local** del dispositivo? | Alto — privacidad/costo | Biometría local en fase inicial; facial server-side fuera de alcance. |
| D-06 | ¿Qué **canales de notificación** en fase inicial: push, email, ambos? | Bajo | Push (FCM) + email transaccional. |
| D-07 | ¿Hay requisitos de **cumplimiento** específicos (LFPDPPP/GDPR, retención de datos biométricos)? | Alto — legal | Confirmar antes de tratar datos biométricos (RNF-22). |
| D-08 | ¿Nivel de **detalle geográfico** requerido en el mapa en tiempo real (por empleado vs por centro)? | Medio — privacidad/UX | Por centro/agregado por defecto; por empleado según permiso. |

> Estas decisiones **no bloquean** el avance de las Iteraciones 2-4: los defaults propuestos permiten diseñar arquitectura, dominio y BD. Se marcarán como ADRs (Iteración 2) y se ajustarán al confirmarse.
