import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/domain/auth_models.dart';
import '../config/app_config.dart';
import '../storage/device_identity_store.dart';
import '../storage/secure_token_store.dart';
import 'session_events.dart';

/// Cliente Dio con interceptores de sesión:
/// - `onRequest` adjunta el Bearer JWT (excepto en los endpoints de auth) y el identificador
///   del dispositivo, que el servidor guarda en la bitacora (RN-60) y usa para el device
///   binding (RF-28). Va tambien en el login: de un intento de acceso interesa sobre todo
///   desde que aparato se hizo.
/// - `onError` renueva el access token vencido (401) vía refresh token y reintenta la
///   petición original; si el refresh falla, señaliza el fin de sesión. La renovación se
///   serializa (single-flight) porque el refresh del backend es de uso único con detección
///   de reuso: dos `/auth/refresh` concurrentes revocarían toda la familia de tokens.
///
/// Se mantiene desacoplado de los providers de auth (hace el refresh él mismo y señaliza el
/// logout vía [sessionExpiredSignalProvider]) para no crear un ciclo con `authRepositoryProvider`.
final dioProvider = Provider<Dio>((ref) {
  final store = ref.read(secureTokenStoreProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  bool isAuthEndpoint(String path) =>
      path.contains('/auth/login') ||
      path.contains('/auth/refresh') ||
      path.contains('/auth/logout');

  // Renueva el par de tokens con el refresh token guardado. Va por el mismo `dio`: los
  // endpoints de auth no llevan Bearer ni re-entran al `onError`, así que no hay recursión.
  Future<bool> performRefresh() async {
    final refreshToken = await store.refreshToken();
    if (refreshToken == null) return false;
    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      await store.save(TokenResponse.fromJson(response.data!));
      return true;
    } on DioException {
      return false;
    }
  }

  // Refresh en curso compartido por todas las peticiones que reciban 401 a la vez.
  Future<bool>? refreshing;

  // El id del dispositivo no cambia en toda la vida de la app: leerlo del almacenamiento
  // seguro en cada peticion seria pagar un acceso al Keystore por cabecera.
  String? deviceId;

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (!isAuthEndpoint(options.path)) {
          final token = await store.accessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
        }
        try {
          deviceId ??=
              (await ref.read(deviceIdentityStoreProvider).current()).deviceId;
          options.headers['X-Device-Id'] = deviceId;
        } catch (_) {
          // Un dato de auditoria no puede tumbar la peticion que lo acompana.
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        final options = err.requestOptions;
        // Solo interceptamos 401 de endpoints protegidos; los de auth se propagan tal cual.
        if (err.response?.statusCode != 401 || isAuthEndpoint(options.path)) {
          return handler.next(err);
        }

        // Single-flight: la primera petición dispara el refresh; el resto espera el mismo Future.
        final refreshed = await (refreshing ??= performRefresh());
        refreshing = null;

        if (!refreshed) {
          // Refresh token inválido/expirado/reuso: la sesión terminó → limpiar y volver a login.
          ref.read(sessionExpiredSignalProvider.notifier).state++;
          return handler.next(err);
        }

        // Reintenta la petición original; el onRequest volverá a adjuntar el token nuevo.
        try {
          final response = await dio.fetch<dynamic>(options);
          return handler.resolve(response);
        } on DioException catch (retryError) {
          return handler.next(retryError);
        }
      },
    ),
  );

  return dio;
});
