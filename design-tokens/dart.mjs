// Genera la salida del design system para la app (Flutter) desde los tokens DTCG.
//   mobile/lib/src/app/tokens.g.dart → `NxTokens` (constantes, valores de la app) y `NxColors`
//                                     (ThemeExtension con los semánticos de color y las sombras,
//                                     claro y oscuro).
// La app usa el valor de `$extensions["nx.surface"].app` cuando existe (tipografía un paso más
// grande, márgenes de 16): es la regla de DS/01 para la superficie app.
import { readFileSync, writeFileSync } from 'node:fs';

const HEADER =
  '// Generado por design-tokens/dart.mjs desde tokens.json + tokens.dark.json. No editar a mano.\n';

/** Recorre el árbol DTCG y devuelve [{ path, token }] de cada hoja con `$value`. */
function flatten(node, path = [], out = []) {
  if (node && typeof node === 'object' && '$value' in node) {
    out.push({ path, token: node });
    return out;
  }
  for (const [key, child] of Object.entries(node ?? {})) {
    if (key.startsWith('$')) continue;
    flatten(child, [...path, key], out);
  }
  return out;
}

const byPath = (list) => new Map(list.map((t) => [t.path.join('.'), t.token]));

/** Valor del token para la app: la extensión `nx.surface.app` manda sobre `$value`. */
const appValue = (token) => token.$extensions?.['nx.surface']?.app ?? token.$value;

/** Resuelve referencias `{a.b}` (de forma recursiva) contra el mapa de tokens. */
function resolve(value, tokens) {
  if (typeof value === 'string') {
    const whole = value.match(/^\{([^}]+)\}$/);
    if (whole) {
      const target = tokens.get(whole[1]);
      if (!target) throw new Error(`Referencia sin destino: ${value}`);
      return resolve(appValue(target), tokens);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, tokens)]));
  }
  return value;
}

/** `color.text.secondary` → `colorTextSecondary`; `neutral.900-a05` → `neutral900A05`. */
const camel = (parts) =>
  parts
    .flatMap((p) => p.split('-'))
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();

function dartColor(css) {
  const hex = css.match(/^#([0-9a-f]{6})$/i);
  if (hex) return `Color(0xFF${hex[1].toUpperCase()})`;
  const rgba = css.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return `Color(0x${hex2(Number(a) * 255)}${hex2(r)}${hex2(g)}${hex2(b)})`;
  }
  throw new Error(`Color no soportado: ${css}`);
}

/** Dimensión en píxeles lógicos (rem = 16 px). Las de `em` (tracking) quedan como factor. */
function dimension(value) {
  const m = String(value).match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) throw new Error(`Dimensión no soportada: ${value}`);
  const n = Number(m[1]);
  return m[2] === 'rem' ? n * 16 : n;
}

const num = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const fontWeight = (w) => `FontWeight.w${w}`;

function fontFamilyArgs(list) {
  const [first, ...fallback] = list;
  return `fontFamily: '${first}', fontFamilyFallback: [${fallback.map((f) => `'${f}'`).join(', ')}]`;
}

function textStyle(v) {
  const size = dimension(v.fontSize);
  const tracking = dimension(v.letterSpacing);
  // letterSpacing de Flutter va en píxeles: el `em` del token se multiplica por el tamaño.
  const spacing = Math.round(tracking * size * 1000) / 1000;
  return (
    `TextStyle(${fontFamilyArgs(v.fontFamily)}, fontSize: ${num(size)}, ` +
    `fontWeight: ${fontWeight(v.fontWeight)}, height: ${num(v.lineHeight)}, letterSpacing: ${num(spacing)})`
  );
}

function shadow(layers) {
  if (layers.length === 0) return '<BoxShadow>[]';
  const items = layers.map(
    (l) =>
      `BoxShadow(color: ${dartColor(l.color)}, offset: Offset(${num(dimension(l.offsetX))}, ${num(dimension(l.offsetY))}), ` +
      `blurRadius: ${num(dimension(l.blur))}, spreadRadius: ${num(dimension(l.spread))})`,
  );
  return `<BoxShadow>[\n      ${items.join(',\n      ')},\n    ]`;
}

/** Semánticos de color: referencias a primitivos, reasignables por tema. */
const isSemanticColor = ({ path, token }) =>
  path[0] === 'color' && typeof token.$value === 'string' && token.$value.startsWith('{');

export function buildDart({ light: lightFile, dark: darkFile, out }) {
  const lightRaw = JSON.parse(readFileSync(lightFile, 'utf8'));
  const darkRaw = JSON.parse(readFileSync(darkFile, 'utf8'));

  const lightList = flatten(lightRaw);
  const lightMap = byPath(lightList);
  const darkMap = new Map([...lightMap, ...byPath(flatten(darkRaw))]);

  const consts = [];
  const add = (doc, line) => {
    if (doc) consts.push(`  /// ${doc}`);
    consts.push(`  ${line}`);
  };

  for (const { path, token } of lightList) {
    const name = camel(path);
    const type = token.$type;
    const doc = token.$description;
    const value = resolve(appValue(token), lightMap);
    switch (type) {
      case 'color':
        add(doc, `static const Color ${name} = ${dartColor(value)};`);
        break;
      case 'dimension':
        add(doc, `static const double ${name} = ${num(dimension(value))};`);
        break;
      case 'number':
        add(doc, `static const double ${name} = ${num(value)};`);
        break;
      case 'fontWeight':
        add(doc, `static const FontWeight ${name} = ${fontWeight(value)};`);
        break;
      case 'fontFamily':
        add(doc, `static const String ${name} = '${value[0]}';`);
        add(null, `static const List<String> ${name}Fallback = [${value.slice(1).map((f) => `'${f}'`).join(', ')}];`);
        break;
      case 'duration':
        add(doc, `static const Duration ${name} = Duration(milliseconds: ${dimension(String(value).replace('ms', ''))});`);
        break;
      case 'cubicBezier':
        add(
          doc,
          Array.isArray(value)
            ? `static const Curve ${name} = Cubic(${value.map(num).join(', ')});`
            : `static const Curve ${name} = Curves.${value};`,
        );
        break;
      case 'typography':
        add(doc, `static const TextStyle ${name} = ${textStyle(value)};`);
        if (token.$extensions?.['nx.textTransform'] === 'uppercase') {
          add(null, `static const bool ${name}Uppercase = true;`);
        }
        break;
      case 'shadow':
        // Las sombras cambian con el tema: viven en NxColors.
        break;
      case 'string': {
        if (name === 'textNumeric' || name === 'fontFeatureTabular') {
          if (name === 'fontFeatureTabular') add(doc, `static const FontFeature ${name} = FontFeature('tnum');`);
          break;
        }
        // Rellenos compuestos «vertical horizontal» (chip, celda): uno por eje.
        const axes = String(value)
          .split(' ')
          .map((part) => resolve(part, lightMap));
        if (axes.length === 2) {
          add(doc, `static const double ${name}Y = ${num(dimension(axes[0]))};`);
          add(null, `static const double ${name}X = ${num(dimension(axes[1]))};`);
        }
        break;
      }
      default:
        throw new Error(`Tipo sin salida Dart: ${type} (${path.join('.')})`);
    }
  }

  const semantic = lightList.filter(isSemanticColor).map(({ path }) => ({
    field: camel(path.slice(1)),
    key: path.join('.'),
  }));
  const shadows = ['1', '2', '3'].map((n) => ({ field: `shadow${n}`, key: `shadow.${n}` }));

  const instance = (map) => {
    const lines = semantic.map(
      ({ field, key }) => `    ${field}: ${dartColor(resolve(map.get(key).$value, map))},`,
    );
    for (const { field, key } of shadows) {
      lines.push(`    ${field}: ${shadow(resolve(map.get(key).$value, map))},`);
    }
    return lines.join('\n');
  };

  const fields = [
    ...semantic.map(({ field }) => ({ field, type: 'Color' })),
    ...shadows.map(({ field }) => ({ field, type: 'List<BoxShadow>' })),
  ];

  const dart = `${HEADER}// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter/material.dart';

/// Tokens del design system (DS/01–DS/07) con los valores de la app. Los colores semánticos de
/// aquí son los del tema claro; en widgets se leen de [NxColors] para seguir al tema activo.
abstract final class NxTokens {
${consts.join('\n')}
}

/// Colores semánticos y sombras que cambian con el tema (claro y oscuro).
@immutable
class NxColors extends ThemeExtension<NxColors> {
  const NxColors({
${fields.map(({ field }) => `    required this.${field},`).join('\n')}
  });

${fields.map(({ field, type }) => `  final ${type} ${field};`).join('\n')}

  static const NxColors light = NxColors(
${instance(lightMap)}
  );

  static const NxColors dark = NxColors(
${instance(darkMap)}
  );

  /// Atajo: \`NxColors.of(context).textSecondary\`.
  static NxColors of(BuildContext context) => Theme.of(context).extension<NxColors>() ?? light;

  @override
  NxColors copyWith({
${fields.map(({ field, type }) => `    ${type}? ${field},`).join('\n')}
  }) =>
      NxColors(
${fields.map(({ field }) => `        ${field}: ${field} ?? this.${field},`).join('\n')}
      );

  @override
  NxColors lerp(NxColors? other, double t) {
    if (other == null) return this;
    return NxColors(
${fields
  .map(({ field, type }) =>
    type === 'Color'
      ? `      ${field}: Color.lerp(${field}, other.${field}, t)!,`
      : `      ${field}: BoxShadow.lerpList(${field}, other.${field}, t)!,`,
  )
  .join('\n')}
    );
  }
}
`;
  writeFileSync(out, dart);
}
