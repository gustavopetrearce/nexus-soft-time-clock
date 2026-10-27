# Brief de implementación — Design system de Nexus Soft Time Clock

> Generado el 2026-10-26 desde el laboratorio StoryBook (`sss/nexus-soft-time-clock/`). No se edita a mano: si algo cambia, cambia en el artefacto de origen y se regenera.

## Tu tarea

Implementar el **design system** y el **rediseño de alta fidelidad** de Nexus Soft Time Clock sobre el código que ya existe. No es un producto nuevo: las 40 pantallas ya están construidas (iteraciones 1 a 13). Tu trabajo es vestirlas con el sistema y corregir lo que el diseño decidió cambiar, **sin cambiar la estructura ni la navegación** salvo donde este brief lo dice.

- **Repositorio:** monorepo con `web/` (Angular 18 + Angular Material), `mobile/` (Flutter, Material 3) y `backend/` (Spring Boot, monolito modular hexagonal).
- **Superficies:** el **portal** (Angular, para supervisores y administradores, desde el escritorio) y la **app** (Flutter, para colaboradores, desde el teléfono).

## Fuentes de verdad, en este orden

1. **`tokens.json` + `tokens.dark.json`** (esta carpeta): todos los valores. **Ningún color, medida, radio, sombra o duración se escribe a mano**; si te falta un valor, no lo inventes: detente y pregunta.
2. **`design-system.md`** (`sss/nexus-soft-time-clock/`): las 35 fichas de componentes (`DS/09`), los 7 patrones (`DS/10`), accesibilidad (`DS/11`) y la cadena de herramientas (`DS/12`).
3. **`highfi.md`**: cómo se ve y se comporta cada pantalla. La sección `08 · Especificaciones para desarrollo` es el **redline por pantalla**: elemento, componente, tokens, comportamiento, campo de datos y regla.
4. **La maqueta hi-fi**: `output/nexus-soft-time-clock/maquetas/hifi/index.html`. Es la referencia visual navegable; cada página tiene selector de estado, de ancho y de tema, y su redline en "Ver anotaciones".
5. **`storybook.md`**: reglas de negocio (`E1/07`), modelo de datos (`E1/10`) y requerimientos no funcionales (`E1/08`).

Si dos fuentes se contradicen, manda la de número menor, y avisa.

## Orden de trabajo (5 tandas, `HIFI/09`)

### Tanda 1 · Base
1. **Tokens.** Crea `design-tokens/` en la raíz con Style Dictionary v4 (lee DTCG de forma nativa). Copia `tokens.json` y `tokens.dark.json` a `design-tokens/tokens/`. Genera:
   - `web/src/styles/tokens.css`: custom properties con prefijo `--nx-`, `:root` para el claro y `body.dark` para el oscuro (lo activa `ThemeService`, que ya existe).
   - `web/src/styles/_tokens.scss`: el mapa para `mat.define-theme`, en lugar de `mat.$blue-palette` y `mat.$azure-palette` (`web/src/styles.scss:14-23`).
   - `mobile/lib/src/app/tokens.g.dart`: constantes `NxTokens.*` y un `ThemeExtension`, en lugar de `ColorScheme.fromSeed` (`mobile/lib/src/app/theme.dart:7`).
   - Un paso en `.github/workflows/ci.yml` que regenere y falle si las salidas no coinciden con el repositorio.
2. **Migración de nombres.** Reemplaza las variables actuales de `styles.scss` según la tabla "Mapa de migración" de `DS/01` (`--brand` → `--nx-color-action-primary`, `--sp-5` → `--nx-space-6`, etc.). `--pink` y `--pink-bg` se eliminan.
3. **Desviaciones a corregir** (anotadas en `DS/02`–`DS/07`): superficies, estados y navegación fuera de escala en `styles.scss`; sombras de negro puro; radios, tamaños y pesos sueltos en `mobile/lib`; transiciones con `ease` y animación de `width` en el sidenav; la variante rellena de Material Icons (pasa a **Outlined**; relleno solo en estados activos); el voseo en los textos (pasa a *tú*).
4. **Librería base.** Construye una vez los componentes de `DS/09` sobre Angular Material y Material 3, con sus 7 estados, y reutilízalos. No crees componentes que no estén en el catálogo.
5. **Shell del portal.** La navegación lateral arranca **cerrada** en todos los tamaños y se abre **encima del contenido con velo** desde el botón de menú; se cierra con la X, el velo, Esc o al elegir un ítem. Hoy es `<mat-sidenav mode="side" opened>` (`web/src/app/layout/main-layout.component.ts:120`): pasa a `mode="over"` sin `opened`.
6. **Barras de desplazamiento** delgadas y ocultas hasta que se desplaza; se ocultan `motion.delay.hide` después de detenerse (`DS/09`, reglas comunes).

### Tanda 2 · App, núcleo del registro: P01–P05
### Tanda 3 · App, resto: P07–P10, P31, P32
### Tanda 4 · Portal, operación y análisis: P11–P19, P33, P38, S02, S03
### Tanda 5 · Portal, organización y planificación: P20–P30, P34–P37, S01

Para cada pantalla: abre su página en la maqueta y su tabla en `HIFI/08`, implementa **todos sus estados** de `HIFI/05` (carga, vacío, sin resultados, error, éxito y los propios) con los textos exactos, y verifica los cortes de `HIFI/07`.

## Reglas transversales (`HIFI/08`, reglas comunes)

- **Validación:** formato y obligatorios al salir del campo y al enviar; reglas del servidor al enviar. El botón principal nunca se deshabilita antes del primer intento; al enviar pasa a carga y bloquea el doble envío.
- **Carga:** barra de progreso arriba del contenido, sin mover el layout. No hay skeletons.
- **Confirmación:** solo para rotar QR, dar de baja a un usuario y reducir el cupo (diálogo S01, botón en tono error).
- **Errores del servidor:** 409 → aviso con el mensaje de `HIFI/05` sin perder lo escrito; 422 → error en el campo; sin red en el portal → S03, en la app → cola local; 401 → renovar sesión una vez y, si falla, al login.
- **Catálogos del portal:** paginación de **20** (opciones 10, 20, 50), siempre con "Filas por página". Búsqueda **en el servidor mientras se escribe, con espera de 400 ms**, volviendo a la página 1. Título fuera; dentro de una tarjeta: barra (chip y acciones), filtros, tabla y paginación.
- **Formatos:** es-MX, hora 24 h `hh:mm`, fecha `dd/mm/aaaa`, miles con coma, cifras con `text.numeric` (cifras tabulares). La hora mostrada es siempre la del servidor.
- **Foco:** al abrir un formulario, drawer o diálogo va al primer campo (en S01, a Cancelar) y vuelve a quien lo abrió al cerrar. Sin aviso al salir con cambios sin guardar.

## Accesibilidad (`DS/11`, obligatoria)

WCAG 2.1 AA: contraste 4.5:1 en texto y 3:1 en componentes (todas las parejas de color del sistema ya lo cumplen; no combines colores fuera de ellas). Foco visible con `color.focus-ring` (en la navegación, `color.nav.focus-ring`). Áreas táctiles de **48 en la app y 40 en el portal**. Texto mínimo 14/16 de lectura y 11/12 auxiliar, ampliable al 200 %. El resultado del registro se anuncia al lector de pantalla. `prefers-reduced-motion` y `disableAnimations`: desplazamientos y escalas instantáneos, fundidos en `fast`, progreso conservado.

## Cambios de backend que el diseño necesita

- **RN-29 (registro en revisión).** `RegisterAttendanceService` deja el registro en `PENDING_REVIEW` (hoy siempre `ACCEPTED`, línea 274) cuando no hay motivo de rechazo pero sí una bandera antifraude aceptada por política. `IncidentEventListener` abre una incidencia `FRAUDE` de prioridad `HIGH` ligada al registro. Al resolverla, el registro pasa a `ACCEPTED` o `REJECTED` y el colaborador recibe una notificación push y en la app.
- **Sincronización de dispositivos (P12).** `devices.last_sync_at` y `devices.pending_count` están en el modelo de datos pero no en las migraciones: hace falta una migración nueva y que la app los reporte al sincronizar.
- **Búsqueda y paginación** unificadas en los catálogos (ver reglas transversales).

## Riesgos abiertos (no los resuelvas por tu cuenta)

- El **logotipo** es provisional (el reloj índigo). Úsalo como recurso intercambiable: si cambia, solo cambia el archivo.
- Las **rutas `/admin`**: la documentación usa el prefijo y el código no. No cambies rutas.
- La **retención** de fotos y datos biométricos no está definida (D-07). No implementes políticas de borrado.

## Cuándo está terminada una pantalla

Cumple los cuatro criterios de `HIFI/09`: todos sus estados, solo tokens y componentes de `DS/09`, accesibilidad de `DS/11`, y responsive según `HIFI/07` con su redline de `HIFI/08` completo. Además, las reglas de arquitectura (ArchUnit) siguen pasando en CI.
