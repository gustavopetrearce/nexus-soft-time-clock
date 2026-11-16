import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../domain/permit_models.dart';

/// Permisos propios del colaborador (solo lectura: los registra el personal desde el portal).
class PermitRepository {
  PermitRepository(this._dio);
  final Dio _dio;

  Future<List<MyPermit>> myPermits() async {
    final res = await _dio.get<List<dynamic>>('/me/permits');
    return (res.data ?? const []).cast<Map<String, dynamic>>().map(MyPermit.fromJson).toList();
  }
}

final permitRepositoryProvider = Provider<PermitRepository>((ref) => PermitRepository(ref.read(dioProvider)));

/// Datos del usuario en sesión: se invalida en logout (ver `_clearUserScopedState`).
final myPermitsProvider = FutureProvider<List<MyPermit>>((ref) => ref.read(permitRepositoryProvider).myPermits());
