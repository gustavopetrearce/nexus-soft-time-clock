import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/network/dio_provider.dart';
import '../domain/break_type.dart';

/// Categorías de descanso de la empresa, cacheadas para poder elegirlas sin conexión.
///
/// Si la empresa las define, el servidor exige una al iniciar un descanso: sin la caché, un
/// descanso fichado sin red se enviaría sin categoría y acabaría rechazado al sincronizar.
class BreakTypeService {
  BreakTypeService(this._dio, this._prefs);

  /// Datos del usuario en sesión: el logout la borra (ver [clearCache]).
  static const cacheKey = 'attendance.breakTypes';

  final Dio _dio;
  final SharedPreferences _prefs;

  /// Categorías habilitadas, en el orden que fijó la empresa. Sin red, las de la última consulta.
  Future<List<BreakType>> enabled() async {
    List<BreakType> all;
    try {
      final res = await _dio.get<List<dynamic>>('/attendance/break-types');
      all = (res.data ?? const []).cast<Map<String, dynamic>>().map(BreakType.fromJson).toList();
      await _prefs.setString(cacheKey, jsonEncode(all.map((b) => b.toJson()).toList()));
    } on DioException {
      all = _cached();
    }
    return all.where((b) => b.enabled).toList();
  }

  Future<void> clearCache() => _prefs.remove(cacheKey);

  List<BreakType> _cached() {
    final raw = _prefs.getString(cacheKey);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(BreakType.fromJson)
          .toList();
    } catch (_) {
      return const [];
    }
  }
}

final breakTypeServiceProvider = Provider<BreakTypeService>(
  (ref) => BreakTypeService(ref.read(dioProvider), ref.read(sharedPreferencesProvider)),
);
