import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/admin_vacation_repository.dart';
import '../domain/admin_vacation_models.dart';

/// Error de la bandeja; la pantalla lo traduce al idioma activo.
enum AdminVacationsError { load, loadMore }

/// Estado de la bandeja de aprobación de vacaciones. Paginación por append
/// ("Cargar más") sobre un filtro de estado (por defecto PENDING).
class AdminVacationsState {
  const AdminVacationsState({
    this.items = const [],
    this.loading = false,
    this.loadingMore = false,
    this.saving = false,
    this.error,
    this.statusFilter = 'PENDING',
    this.page = 0,
    this.total = 0,
  });

  final List<AdminVacationRequest> items;
  final bool loading;
  final bool loadingMore;
  final bool saving;
  final AdminVacationsError? error;

  /// Filtro de estado enviado al servidor; cadena vacía = todas.
  final String statusFilter;
  final int page;
  final int total;

  bool get hasMore => items.length < total;

  AdminVacationsState copyWith({
    List<AdminVacationRequest>? items,
    bool? loading,
    bool? loadingMore,
    bool? saving,
    Object? error = _sentinel,
    String? statusFilter,
    int? page,
    int? total,
  }) =>
      AdminVacationsState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        saving: saving ?? this.saving,
        error: identical(error, _sentinel) ? this.error : error as AdminVacationsError?,
        statusFilter: statusFilter ?? this.statusFilter,
        page: page ?? this.page,
        total: total ?? this.total,
      );

  static const _sentinel = Object();
}

class AdminVacationsController extends Notifier<AdminVacationsState> {
  static const _pageSize = 20;

  @override
  AdminVacationsState build() {
    // Carga inicial diferida para no disparar la petición dentro de build().
    Future.microtask(load);
    return const AdminVacationsState(loading: true);
  }

  AdminVacationRepository get _repo => ref.read(adminVacationRepositoryProvider);

  Future<void> load() async {
    state = state.copyWith(loading: true, error: null);
    try {
      final result = await _repo.list(page: 0, size: _pageSize, status: state.statusFilter);
      state = state.copyWith(
        items: result.content,
        total: result.totalElements,
        page: 0,
        loading: false,
      );
    } catch (_) {
      state = state.copyWith(
        loading: false,
        error: AdminVacationsError.load,
      );
    }
  }

  Future<void> loadMore() async {
    if (state.loadingMore || !state.hasMore) return;
    final nextPage = state.page + 1;
    state = state.copyWith(loadingMore: true);
    try {
      final result = await _repo.list(page: nextPage, size: _pageSize, status: state.statusFilter);
      state = state.copyWith(
        items: [...state.items, ...result.content],
        total: result.totalElements,
        page: nextPage,
        loadingMore: false,
      );
    } catch (_) {
      state = state.copyWith(loadingMore: false, error: AdminVacationsError.loadMore);
    }
  }

  Future<void> setStatus(String status) async {
    if (status == state.statusFilter) return;
    state = state.copyWith(statusFilter: status);
    await load();
  }

  /// Aprueba o rechaza una solicitud y recarga la bandeja. Devuelve true si tuvo éxito.
  Future<bool> resolve(AdminVacationRequest request, {required bool approve, String? note}) async {
    state = state.copyWith(saving: true);
    try {
      await _repo.resolve(request.id, approve: approve, note: note);
      state = state.copyWith(saving: false);
      await load();
      return true;
    } catch (_) {
      state = state.copyWith(saving: false);
      return false;
    }
  }
}

final adminVacationsControllerProvider =
    NotifierProvider<AdminVacationsController, AdminVacationsState>(AdminVacationsController.new);
