import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/admin_vacation_repository.dart';
import '../domain/admin_vacation_models.dart';

/// Error de la bandeja; la pantalla lo traduce al idioma activo.
enum AdminVacationsError { load, loadMore }

/// Resultado de resolver una solicitud. `alreadyResolved` es el 409 de una transición no válida
/// (otra persona la resolvió antes): la hoja lo avisa sin perder la nota escrita.
enum ResolveOutcome { resolved, alreadyResolved, failed }

/// Pestañas de la bandeja: solicitudes por decidir o cancelaciones pedidas por el colaborador.
enum AdminVacationsTab { pending, cancellations }

/// Estado de la bandeja de aprobación de vacaciones. Paginación por append ("Cargar más") sobre
/// lo que queda por decidir (P10 R1): solicitudes PENDING o cancelaciones pedidas.
class AdminVacationsState {
  const AdminVacationsState({
    this.items = const [],
    this.loading = false,
    this.loadingMore = false,
    this.saving = false,
    this.error,
    this.statusFilter = 'PENDING',
    this.tab = AdminVacationsTab.pending,
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
  final AdminVacationsTab tab;
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
    AdminVacationsTab? tab,
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
        tab: tab ?? this.tab,
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

  bool get _cancellations => state.tab == AdminVacationsTab.cancellations;

  Future<PagedVacations> _fetch(int page) => _repo.list(
        page: page,
        size: _pageSize,
        // Las cancelaciones pedidas pueden estar sobre una pendiente o una aprobada.
        status: _cancellations ? null : state.statusFilter,
        cancellationPending: _cancellations,
      );

  Future<void> selectTab(AdminVacationsTab tab) async {
    if (tab == state.tab) return;
    state = state.copyWith(tab: tab, items: const [], total: 0, page: 0);
    await load();
  }

  Future<void> load() async {
    state = state.copyWith(loading: true, error: null);
    try {
      final result = await _fetch(0);
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
      final result = await _fetch(nextPage);
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

  /// Aprueba o rechaza una solicitud y recarga la bandeja.
  Future<ResolveOutcome> resolve(AdminVacationRequest request, {required bool approve, String? note}) =>
      _run(() => _repo.resolve(request.id, approve: approve, note: note));

  /// Acepta o deniega la cancelación que pidió el colaborador y recarga la bandeja.
  Future<ResolveOutcome> resolveCancellation(AdminVacationRequest request, {required bool accept, String? note}) =>
      _run(() => _repo.resolveCancellation(request.id, accept: accept, note: note));

  Future<ResolveOutcome> _run(Future<void> Function() call) async {
    state = state.copyWith(saving: true);
    try {
      await call();
      state = state.copyWith(saving: false);
      await load();
      return ResolveOutcome.resolved;
    } catch (e) {
      state = state.copyWith(saving: false);
      if (e is DioException && e.response?.statusCode == 409) {
        // Ya no está pendiente: se recarga para que salga de la bandeja.
        await load();
        return ResolveOutcome.alreadyResolved;
      }
      return ResolveOutcome.failed;
    }
  }
}

final adminVacationsControllerProvider =
    NotifierProvider<AdminVacationsController, AdminVacationsState>(AdminVacationsController.new);
