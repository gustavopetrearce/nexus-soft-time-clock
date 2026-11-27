import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../domain/permit_models.dart';

/// Permisos propios del colaborador. Los registra el personal desde el portal; el colaborador solo
/// puede solicitar una incapacidad, que queda pendiente hasta que el personal la resuelve.
class PermitRepository {
  PermitRepository(this._dio);
  final Dio _dio;

  Future<List<MyPermit>> myPermits() async {
    final res = await _dio.get<List<dynamic>>('/me/permits');
    return (res.data ?? const []).cast<Map<String, dynamic>>().map(MyPermit.fromJson).toList();
  }

  /// Solicita una incapacidad (`yyyy-MM-dd`). [notes] (motivo exacto) es obligatorio; 409 si se
  /// traslapa con otra falta o solicitud.
  Future<MyPermit> requestIncapacity({required String startDate, required String endDate, required String notes}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/me/permits/incapacity',
      data: {'startDate': startDate, 'endDate': endDate, 'notes': notes},
    );
    return MyPermit.fromJson(res.data ?? const {});
  }
}

final permitRepositoryProvider = Provider<PermitRepository>((ref) => PermitRepository(ref.read(dioProvider)));

/// Datos del usuario en sesión: se invalida en logout (ver `_clearUserScopedState`).
final myPermitsProvider = FutureProvider<List<MyPermit>>((ref) => ref.read(permitRepositoryProvider).myPermits());
