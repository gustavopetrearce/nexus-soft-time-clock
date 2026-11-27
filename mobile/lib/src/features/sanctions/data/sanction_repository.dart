import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../domain/sanction_models.dart';

/// Sanciones propias del colaborador (solo lectura: las abre el personal desde el portal).
class SanctionRepository {
  SanctionRepository(this._dio);
  final Dio _dio;

  Future<List<MySanction>> mySanctions() async {
    final res = await _dio.get<List<dynamic>>('/me/sanctions');
    return (res.data ?? const []).cast<Map<String, dynamic>>().map(MySanction.fromJson).toList();
  }
}

final sanctionRepositoryProvider = Provider<SanctionRepository>((ref) => SanctionRepository(ref.read(dioProvider)));

/// Datos del usuario en sesión: se invalida en logout (ver `_clearUserScopedState`).
final mySanctionsProvider =
    FutureProvider<List<MySanction>>((ref) => ref.read(sanctionRepositoryProvider).mySanctions());
