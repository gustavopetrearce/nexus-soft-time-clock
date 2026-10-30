import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/admin_vacations/presentation/admin_vacations_screen.dart';
import '../features/attendance/presentation/attendance_history_screen.dart';
import '../features/attendance/presentation/attendance_screen.dart';
import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/change_password_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../core/i18n/l10n.dart';
import '../core/ui/nx_ui.dart';
import '../features/vacations/presentation/vacations_screen.dart';

/// Router de la app (GoRouter) con redirect basado en la sesión: mientras se restaura la
/// sesión (`unknown`) se muestra un splash; sin token válido se fuerza /login; con sesión
/// activa se evita volver a /login o /splash. Feature-first: cada feature aporta sus rutas.
final routerProvider = Provider<GoRouter>((ref) {
  // Refresca el redirect del router cuando cambia el estado de sesión. Se sigue el `status`
  // (no solo un bool): la transición unknown→unauthenticated también debe re-evaluar el
  // redirect para salir del splash hacia /login.
  final authListenable = ValueNotifier<AuthStatus>(ref.read(authControllerProvider).status);
  ref.listen(authControllerProvider, (previous, next) {
    authListenable.value = next.status;
  });
  ref.onDispose(authListenable.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: authListenable,
    redirect: (context, state) {
      final status = ref.read(authControllerProvider).status;
      final location = state.matchedLocation;

      // Restaurando sesión: mantener el splash hasta resolver.
      if (status == AuthStatus.unknown) {
        return location == '/splash' ? null : '/splash';
      }

      final authenticated = status == AuthStatus.authenticated;
      final atAuthGate = location == '/login' || location == '/splash';
      if (!authenticated) {
        return location == '/login' ? null : '/login';
      }
      if (atAuthGate) {
        return '/';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', name: 'home', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/splash', name: 'splash', builder: (context, state) => const _SplashScreen()),
      GoRoute(path: '/login', name: 'login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/attendance', name: 'attendance', builder: (context, state) => const AttendanceScreen()),
      GoRoute(
        path: '/attendance/history',
        name: 'attendanceHistory',
        builder: (context, state) => const AttendanceHistoryScreen(),
      ),
      GoRoute(path: '/profile', name: 'profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(
        path: '/profile/change-password',
        name: 'changePassword',
        builder: (context, state) => const ChangePasswordScreen(),
      ),
      GoRoute(path: '/vacations', name: 'vacations', builder: (context, state) => const VacationsScreen()),
      GoRoute(
        path: '/admin/vacations',
        name: 'adminVacations',
        builder: (context, state) => const AdminVacationsScreen(),
      ),
    ],
  );
});

/// Splash (P01): isotipo y barra de progreso mientras se valida la sesión guardada.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(NxTokens.spaceInsetPage),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const NxIsotipo(size: NxTokens.space16),
                const SizedBox(height: NxTokens.spaceGapSection),
                SizedBox(
                  width: NxTokens.space16 * 2,
                  child: ClipRRect(
                    borderRadius: const BorderRadius.all(Radius.circular(NxTokens.radiusFull)),
                    child: LinearProgressIndicator(semanticsLabel: context.l10n.commonLoading),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
