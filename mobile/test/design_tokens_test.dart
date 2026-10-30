import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus_time_clock/src/app/theme.dart';
import 'package:nexus_time_clock/src/app/tokens.g.dart';
import 'package:nexus_time_clock/src/core/ui/nx_tone.dart';

/// Resuelve `{a.b}` contra el árbol DTCG hasta llegar a un valor literal.
String _resolve(Map<String, dynamic> tree, String value) {
  final ref = RegExp(r'^\{(.+)\}$').firstMatch(value);
  if (ref == null) return value;
  dynamic node = tree;
  for (final key in ref.group(1)!.split('.')) {
    node = (node as Map<String, dynamic>)[key];
  }
  return _resolve(tree, (node as Map<String, dynamic>)[r'$value'] as String);
}

Color _hex(String css) => Color(int.parse('FF${css.substring(1)}', radix: 16));

void main() {
  final light = jsonDecode(File('../design-tokens/tokens/tokens.json').readAsStringSync()) as Map<String, dynamic>;
  final dark = jsonDecode(File('../design-tokens/tokens/tokens.dark.json').readAsStringSync()) as Map<String, dynamic>;

  String semantic(Map<String, dynamic> source, List<String> path) {
    dynamic node = source;
    for (final key in path) {
      node = (node as Map<String, dynamic>)[key];
    }
    return _resolve(light, (node as Map<String, dynamic>)[r'$value'] as String);
  }

  test('tokens.g.dart está al día con tokens.json y tokens.dark.json', () {
    expect(NxColors.light.textPrimary, _hex(semantic(light, ['color', 'text', 'primary'])));
    expect(NxColors.light.actionPrimary, _hex(semantic(light, ['color', 'action', 'primary'])));
    expect(NxColors.light.surfaceBrand, _hex(semantic(light, ['color', 'surface', 'brand'])));
    expect(NxColors.dark.actionPrimary, _hex(semantic(dark, ['color', 'action', 'primary'])));
    expect(NxColors.dark.bgApp, _hex(semantic(dark, ['color', 'bg', 'app'])));
    expect(NxColors.dark.statusErrorFg, _hex(semantic(dark, ['color', 'status', 'error-fg'])));
  });

  test('la app toma los valores de nx.surface.app', () {
    expect(NxTokens.spaceInsetPage, 16);
    expect(NxTokens.spaceInsetCard, 20);
    expect(NxTokens.textHeading2.fontSize, 20);
    expect(NxTokens.textBody.fontSize, 16);
    expect(NxTokens.textHeading6Uppercase, isTrue);
  });

  test('el tema usa los semánticos del modo correspondiente', () {
    final l = buildLightTheme();
    final d = buildDarkTheme();
    expect(l.colorScheme.primary, NxColors.light.actionPrimary);
    expect(d.colorScheme.primary, NxColors.dark.actionPrimary);
    expect(d.scaffoldBackgroundColor, NxColors.dark.bgApp);
    expect(l.extension<NxColors>(), same(NxColors.light));
  });

  test('tonos de estado (HIFI/08)', () {
    expect(attendanceStatusTone('ACCEPTED'), NxTone.success);
    expect(attendanceStatusTone('PENDING_REVIEW'), NxTone.warning);
    expect(attendanceStatusTone('REJECTED'), NxTone.error);
    expect(attendanceStatusTone('LOCAL_PENDING'), NxTone.info);
    expect(vacationStatusTone('APPROVED'), NxTone.success);
    expect(vacationStatusTone('PENDING'), NxTone.warning);
    expect(vacationStatusTone('CANCELLED'), NxTone.neutral);
  });
}
