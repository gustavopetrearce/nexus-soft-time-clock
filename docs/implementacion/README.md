# Paquete de implementación — Nexus Soft Time Clock

Tres archivos para llevar el design system y el rediseño hi-fi al código, por tu cuenta o con un asistente de IA.

| Archivo | Qué es |
|---|---|
| `tokens.json` | Todos los design tokens en formato **DTCG** (el estándar del W3C): primitivos, semánticos del tema claro, estilos de texto compuestos, sombras y el ejemplo de nivel componente. 216 tokens. |
| `tokens.dark.json` | El tema oscuro: reasigna **solo** los roles semánticos (31). Se aplica encima de `tokens.json`. |
| `BRIEF.md` | Las instrucciones para quien implementa: fuentes de verdad, orden de trabajo en 5 tandas, reglas transversales, accesibilidad, cambios de backend y riesgos abiertos. |

Se generaron el 2026-10-26 desde `sss/nexus-soft-time-clock/design-system.md` (`DS/01`–`DS/07`) y `highfi.md`. **No se editan a mano:** si un valor cambia, cambia en el design system y se regeneran.

## Cómo leer `tokens.json`

- **Nombres.** Cada ruta es el nombre del token de `DS/01` en grupos: `color.text.secondary` es `--nx-color-text-secondary` en CSS y `NxTokens.colorTextSecondary` en Dart.
- **Referencias.** Los semánticos apuntan a primitivos con llaves: `"color.action.primary": "{color.indigo.500}"`. Así el tema oscuro solo cambia la referencia.
- **Portal y app.** El `$value` es el del portal. Cuando la app usa otro valor (tipografía un paso más grande, márgenes de 16 en vez de 24), va en `$extensions["nx.surface"].app`.
- **Mayúsculas.** Los estilos `text.heading-5` y `text.heading-6` llevan `$extensions["nx.textTransform"]: "uppercase"`.
- **Breakpoints.** Están como tokens (`breakpoint.sm`, `md`, `lg`, `app-medium`), pero en CSS no se pueden usar dentro de `@media`: se copian como número en las media queries.

## Opción A · Implementarlo con una IA

1. Abre el asistente **dentro del repositorio del proyecto** (`nexus-soft-time-clock`), para que pueda leer y editar el código.
2. Dale acceso a esta carpeta y a `sss/nexus-soft-time-clock/` (copia ambas al repo o indícale la ruta).
3. Pídele algo como:

   > Lee `BRIEF.md` y ejecuta la **tanda 1** completa. Usa `tokens.json` y `tokens.dark.json` como única fuente de valores. Antes de escribir código, dime qué archivos vas a crear y cuáles vas a modificar.

4. Revisa y prueba cada tanda antes de pedir la siguiente ("ahora la tanda 2: P01 a P05"). Para cada pantalla, compárala con su página de la maqueta hi-fi en el mismo estado y ancho.

Dos avisos: pídele siempre el plan antes del código, y si propone un color, medida o componente que no esté en los tokens o en `DS/09`, recházalo. El brief ya se lo prohíbe, pero conviene vigilarlo.

## Opción B · Generar las variables con Style Dictionary

En la raíz del monorepo:

```bash
mkdir -p design-tokens/tokens
cp tokens.json tokens.dark.json design-tokens/tokens/
cd design-tokens
npm init -y
npm install -D style-dictionary@4
```

Un `design-tokens/config.mjs` mínimo para el portal:

```js
export default {
  source: ['tokens/tokens.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'nx',
      buildPath: '../web/src/styles/',
      files: [{ destination: 'tokens.css', format: 'css/variables', options: { outputReferences: true } }],
    },
  },
};
```

```bash
npx style-dictionary build --config config.mjs
```

Para el tema oscuro, una segunda configuración con `source: ['tokens/tokens.json', 'tokens/tokens.dark.json']`, salida en `body.dark` (`options.selector: 'body.dark'`) y un filtro que deje solo los tokens de `tokens.dark.json`. La salida de Flutter (`tokens.g.dart` con `ThemeExtension`) y el mapa de Sass para Angular Material necesitan formatos propios. `DS/12` describe las tres salidas, y la tanda 1 del brief pide construirlas.

> Las extensiones `nx.surface` (valores de la app) no las entiende Style Dictionary por sí solo: hay que leerlas con un transform propio para la plataforma Flutter. Si solo quieres el portal, puedes ignorarlas.

## Para ver cómo debe quedar

- **Maqueta hi-fi:** `output/nexus-soft-time-clock/maquetas/hifi/index.html`, con las 40 pantallas, sus estados, tema claro y oscuro, anchos y la redline de cada una.
- **Presentación del design system:** `output/nexus-soft-time-clock/presentacion/design-system.html`.
