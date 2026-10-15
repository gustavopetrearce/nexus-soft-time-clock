/// Configuración de entorno. En Android emulador, 10.0.2.2 apunta al host.
/// En release se inyecta por --dart-define (API_BASE_URL).
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://nexustime.i-condor.com/api/v1',
  );
}
