import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/db/app_database.dart';
import '../../../core/network/session_events.dart';
import '../../../core/storage/secure_token_store.dart';
import '../../admin_vacations/application/admin_vacations_controller.dart';
import '../../attendance/application/attendance_controller.dart';
import '../../attendance/data/attendance_sync_service.dart';
import '../../attendance/data/event_type_service.dart';
import '../../profile/data/profile_repository.dart';
import '../../vacations/data/vacation_repository.dart';
import '../data/auth_repository.dart';
import '../domain/auth_models.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Motivo de un login fallido; la pantalla lo traduce.
enum AuthError { invalidCredentials }

class AuthState {
  const AuthState({required this.status, this.loading = false, this.error});

  final AuthStatus status;
  final bool loading;
  final AuthError? error;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  AuthState copyWith({AuthStatus? status, bool? loading, AuthError? error}) =>
      AuthState(
        status: status ?? this.status,
        loading: loading ?? this.loading,
        error: error,
      );
}

/// Controlador de sesión (Riverpod Notifier). Orquesta login/logout y expone el estado.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    // El interceptor de Dio señaliza aquí cuando el servidor invalida la sesión (refresh
    // fallido); reaccionamos limpiando el estado local y volviendo a login.
    ref.listen(sessionExpiredSignalProvider, (previous, next) {
      if (next > (previous ?? 0)) sessionExpired();
    });
    // Arranca en `unknown` y restaura la sesión desde el almacenamiento seguro. Sin esto,
    // cada reinicio de la app forzaría re-login aunque haya tokens válidos guardados.
    _restoreSession();
    return const AuthState(status: AuthStatus.unknown);
  }

  /// Restaura la sesión al abrir la app: si hay refresh token guardado se considera activa.
  /// La validez real se confirma en la primera petición (que ya sabe refrescar el access token).
  Future<void> _restoreSession() async {
    String? refreshToken;
    try {
      refreshToken = await ref.read(secureTokenStoreProvider).refreshToken();
    } catch (_) {
      // Si la lectura del almacenamiento seguro falla, no dejamos la app atascada en el
      // splash (`unknown`): se trata como sesión ausente y se va a login.
      refreshToken = null;
    }
    state = AuthState(
      status: refreshToken != null
          ? AuthStatus.authenticated
          : AuthStatus.unauthenticated,
    );
  }

  Future<void> login(Credentials credentials) async {
    state = state.copyWith(loading: true);
    try {
      await ref.read(authRepositoryProvider).login(credentials);
      state = const AuthState(status: AuthStatus.authenticated);
    } catch (_) {
      state = const AuthState(
        status: AuthStatus.unauthenticated,
        error: AuthError.invalidCredentials,
      );
    }
  }

  Future<void> logout() async {
    // 1. Best-effort: intentar vaciar la cola offline mientras el token aún es válido,
    //    para no perder marcaciones que sí tienen red. Offline no debe romper el logout.
    try {
      await ref.read(attendanceSyncServiceProvider).syncPending();
    } catch (_) {
      // sin red: la cola se limpia igual en el paso 3
    }
    // 2. Cierra sesión en el backend y borra los tokens locales.
    await ref.read(authRepositoryProvider).logout();
    // 3. Descarta marcaciones residuales para que no se atribuyan al próximo usuario
    //    (la cola es global del dispositivo, sin scope de usuario).
    await ref.read(appDatabaseProvider).clearAll();
    // 4. Invalida todo el estado cacheado del usuario para que el próximo login refetchee.
    _clearUserScopedState();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Sesión terminada por el servidor (refresh token inválido/expirado/reuso). A diferencia
  /// de [logout], no intenta hablar con el backend —el token ya no sirve— ni sincronizar la
  /// cola: solo limpia el estado local y vuelve a `unauthenticated` para redirigir a login.
  Future<void> sessionExpired() async {
    await ref.read(secureTokenStoreProvider).clear();
    await ref.read(appDatabaseProvider).clearAll();
    _clearUserScopedState();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Invalida los providers con datos propios del colaborador. Sin esto, Riverpod conserva
  /// en caché la respuesta del usuario anterior y la muestra al siguiente que inicie sesión.
  void _clearUserScopedState() {
    ref.invalidate(meProvider);
    ref.invalidate(myProfileProvider);
    ref.invalidate(vacationSummaryProvider);
    ref.invalidate(myVacationsProvider);
    ref.invalidate(enabledIntermediateEventTypesProvider);
    ref.invalidate(attendanceControllerProvider);
    ref.invalidate(adminVacationsControllerProvider);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
