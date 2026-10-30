// Genera las salidas del design system para el portal (Angular) desde los tokens DTCG.
//   web/src/styles/tokens.css   → custom properties --nx-*: :root (claro) + body.dark (oscuro)
//   web/src/styles/_tokens.scss → los mismos tokens como variables Sass resueltas (tema claro),
//                                 para construir el tema de Angular Material.
//   mobile/lib/src/app/tokens.g.dart → constantes NxTokens + ThemeExtension NxColors (dart.mjs).
// No se edita a mano ninguna salida: se regeneran con `npm run build` (CI verifica que coincidan).
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import StyleDictionary from 'style-dictionary';
import { buildDart } from './dart.mjs';

const LIGHT = 'tokens/tokens.json';
const DARK = 'tokens/tokens.dark.json';
const OUT = '../web/src/styles/';
const HEADER = '/* Generado por design-tokens/config.mjs desde tokens.json + tokens.dark.json. No editar a mano. */\n';

const cssName = (path) => `--nx-${path.join('-')}`;

/** Sustituye cada referencia `{a.b}` por `var(--nx-a-b)`. */
const refsToVars = (value) => String(value).replace(/\{([^}]+)\}/g, (_, ref) => `var(${cssName(ref.split('.'))})`);

const fontFamily = (list) => list.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(',');

const shadow = (layers) =>
  layers.length === 0
    ? 'none'
    : layers.map((l) => [l.offsetX, l.offsetY, l.blur, l.spread, refsToVars(l.color)].join(' ')).join(',');

/** Valor CSS de un token a partir de su valor original (conserva referencias como var()). */
function cssValue(type, value) {
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) return refsToVars(value);
  switch (type) {
    case 'fontFamily':
      return Array.isArray(value) ? fontFamily(value) : value;
    case 'cubicBezier':
      return Array.isArray(value) ? `cubic-bezier(${value.join(',')})` : value;
    case 'shadow':
      return shadow(Array.isArray(value) ? value : [value]);
    default:
      return refsToVars(value);
  }
}

const TYPOGRAPHY_PROPS = {
  fontFamily: 'family',
  fontSize: 'size',
  fontWeight: 'weight',
  lineHeight: 'line-height',
  letterSpacing: 'tracking',
};

/** Valor tal como está escrito en `raw` (Style Dictionary mezcla los arreglos por índice al sobrescribir). */
const rawValue = (raw, path) => path.reduce((node, key) => node?.[key], raw)?.$value;

/** Una línea `--nx-…: …;` por token; los estilos de texto se expanden en una variable por propiedad. */
function declarations(tokens, raw) {
  const lines = [];
  for (const token of tokens) {
    const type = token.$type ?? token.type;
    const value = (raw && rawValue(raw, token.path)) ?? token.original.$value ?? token.original.value;
    if (type === 'typography') {
      for (const [prop, suffix] of Object.entries(TYPOGRAPHY_PROPS)) {
        lines.push(`  ${cssName([...token.path, suffix])}: ${cssValue('', value[prop])};`);
      }
      const transform = token.$extensions?.['nx.textTransform'];
      lines.push(`  ${cssName([...token.path, 'transform'])}: ${transform ?? 'none'};`);
    } else {
      const css = cssValue(type, value);
      lines.push(`  ${cssName(token.path)}: ${css};`);
      // Relleno compuesto «vertical horizontal» (inset de chip y celda): también por eje, como lo
      // usan las reglas de la maqueta (padding: …-y …-x).
      const axes = /^var\([^ ]+\) var\([^ ]+\)$/.test(css) ? css.split(' ') : [];
      if (axes.length === 2) {
        lines.push(`  ${cssName([...token.path, 'y'])}: ${axes[0]};`);
        lines.push(`  ${cssName([...token.path, 'x'])}: ${axes[1]};`);
      }
    }
  }
  return lines.join('\n');
}

StyleDictionary.registerFormat({
  name: 'nx/css-variables',
  format: ({ dictionary, options }) =>
    `${HEADER}${options.selector} {\n${declarations(dictionary.allTokens, options.raw)}\n}\n`,
});

/** Valor Sass resuelto (sin var()): lo usa el tema de Angular Material en tiempo de compilación. */
function sassValue(token) {
  const type = token.$type ?? token.type;
  const value = token.$value ?? token.value;
  if (type === 'fontFamily' && Array.isArray(value)) return `(${fontFamily(value)})`;
  if (type === 'cubicBezier' && Array.isArray(value)) return `cubic-bezier(${value.join(',')})`;
  if (type === 'shadow') return shadow(Array.isArray(value) ? value : [value]);
  if (typeof value === 'string' && /^"/.test(value)) return `'${value}'`;
  return value;
}

StyleDictionary.registerFormat({
  name: 'nx/scss-variables',
  format: ({ dictionary }) => {
    const lines = dictionary.allTokens
      .filter((t) => (t.$type ?? t.type) !== 'typography')
      .map((t) => `$nx-${t.path.join('-')}: ${sassValue(t)};`);
    return `${HEADER.replace('/*', '//').replace(' */', '')}${lines.join('\n')}\n`;
  },
});

const light = new StyleDictionary({
  source: [LIGHT],
  log: { verbosity: 'silent' },
  platforms: {
    css: {
      buildPath: OUT,
      files: [{ destination: 'tokens.css', format: 'nx/css-variables', options: { selector: ':root' } }],
    },
    scss: {
      buildPath: OUT,
      files: [{ destination: '_tokens.scss', format: 'nx/scss-variables' }],
    },
  },
});

const dark = new StyleDictionary({
  include: [LIGHT],
  source: [DARK],
  log: { verbosity: 'silent' },
  platforms: {
    css: {
      buildPath: OUT,
      files: [
        {
          destination: 'tokens.dark.css',
          format: 'nx/css-variables',
          filter: (token) => token.isSource,
          options: { selector: 'body.dark', raw: JSON.parse(readFileSync(DARK, 'utf8')) },
        },
      ],
    },
  },
});

await light.buildAllPlatforms();
await dark.buildAllPlatforms();

// Un solo tokens.css: el bloque oscuro va detrás del claro (mismo archivo que importa styles.scss).
const darkCss = readFileSync(`${OUT}tokens.dark.css`, 'utf8').replace(HEADER, '');
writeFileSync(`${OUT}tokens.css`, `${readFileSync(`${OUT}tokens.css`, 'utf8')}
${darkCss}`);
rmSync(`${OUT}tokens.dark.css`);

buildDart({ light: LIGHT, dark: DARK, out: '../mobile/lib/src/app/tokens.g.dart' });
