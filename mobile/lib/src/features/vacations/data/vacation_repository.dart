import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../domain/vacation_models.dart';

/// Vacaciones propias del colaborador: resumen por antigüedad, listado, alta de solicitud y
/// solicitud de cancelación.
class VacationRepository {
  VacationRepository(this._dio);
  final Dio _dio;

  Future<VacationSummary> summary() async {
    final res = await _dio.get<Map<String, dynamic>>('/me/vacations/summary');
    return VacationSummary.fromJson(res.data!);
  }

  Future<List<MyVacationRequest>> myRequests() async {
    final res = await _dio.get<List<dynamic>>('/me/vacations');
    return (res.data ?? const [])
        .cast<Map<String, dynamic>>()
        .map(MyVacationRequest.fromJson)
        .toList();
  }

  Future<void> request({required String startDate, required String endDate, String? reason}) async {
    await _dio.post<Map<String, dynamic>>('/vacations/requests', data: {
      'startDate': startDate,
      'endDate': endDate,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
  }

  /// Pide cancelar una solicitud propia; [reason] es obligatorio. 409 si ya no se puede.
  Future<void> requestCancellation(String id, {required String reason}) async {
    await _dio.post<Map<String, dynamic>>('/me/vacations/$id/cancellation', data: {'reason': reason});
  }
}

final vacationRepositoryProvider =
    Provider<VacationRepository>((ref) => VacationRepository(ref.read(dioProvider)));

final vacationSummaryProvider =
    FutureProvider<VacationSummary>((ref) => ref.read(vacationRepositoryProvider).summary());

final myVacationsProvider =
    FutureProvider<List<MyVacationRequest>>((ref) => ref.read(vacationRepositoryProvider).myRequests());
