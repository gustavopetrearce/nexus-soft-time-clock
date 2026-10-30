import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Captura la posición GPS y expone señales antifraude locales (mock location, GPS off).
class LocationService {
  /// Precisión objetivo (m): en cuanto un fix la alcanza, se acepta de inmediato. Se deja
  /// margen bajo el umbral del backend (default 50 m) para reducir rechazos LOW_GPS_ACCURACY.
  static const double _targetAccuracyM = 30;

  /// Ventana TOTAL que se espera a que el fix del GPS converja. El arranque en frío
  /// (sobre todo en interiores) puede tardar; se da tiempo suficiente antes de rendirse
  /// con el mejor fix acumulado.
  static const Duration _maxWait = Duration(seconds: 15);

  /// Umbral de precisión por defecto del backend (`company_settings.default_gps_accuracy_max_m`)
  /// cuando aún no se conoce la política del centro: el indicador de P04 pasa a warning por encima.
  static const double defaultAccuracyMaxM = 50;

  Future<bool> isGpsEnabled() => Geolocator.isLocationServiceEnabled();

  /// Lectura continua para el indicador de P04. No pide permiso (eso ocurre al registrar): sin
  /// permiso solo informa que se está buscando. El plugin comparte un único stream entre
  /// suscriptores, así que convive con [current] durante un registro.
  Stream<GpsReading> watch() async* {
    if (!await Geolocator.isLocationServiceEnabled()) {
      yield const GpsReading(enabled: false);
      return;
    }
    final permission = await Geolocator.checkPermission();
    yield const GpsReading(enabled: true);
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return;
    }
    yield* Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, distanceFilter: 0),
    ).map((p) => GpsReading(enabled: true, accuracyM: p.accuracy));
  }

  /// Devuelve el mejor fix GPS disponible. La primera lectura del proveedor fusionado suele ser
  /// gruesa (red/celda) y aún no convergió; por eso se escucha el stream hasta [_maxWait] y se
  /// conserva el fix de menor `accuracy`, cortando en cuanto se alcanza [_targetAccuracyM].
  Future<Position?> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return null;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return null;
    }

    final best = await _bestFixWithin(_maxWait, _targetAccuracyM);

    // Respaldo: si el stream no entregó ninguna posición, intentar una lectura puntual.
    return best ??
        await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.best),
        );
  }

  /// Escucha el stream de posiciones y devuelve el fix de menor `accuracy` observado dentro de
  /// [maxWait] (deadline TOTAL, no por-hueco-entre-eventos), cortando antes si alguno alcanza
  /// [targetAccuracyM]. Devuelve null si no llegó ninguna posición en la ventana.
  Future<Position?> _bestFixWithin(Duration maxWait, double targetAccuracyM) {
    final completer = Completer<Position?>();
    Position? best;
    Timer? deadline;
    StreamSubscription<Position>? sub;

    void finish() {
      deadline?.cancel();
      sub?.cancel();
      if (!completer.isCompleted) {
        completer.complete(best);
      }
    }

    deadline = Timer(maxWait, finish);
    sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, distanceFilter: 0),
    ).listen(
      (pos) {
        if (best == null || pos.accuracy < best!.accuracy) {
          best = pos;
        }
        if (pos.accuracy <= targetAccuracyM) {
          finish();
        }
      },
      onError: (_) => finish(),
      cancelOnError: false,
    );

    return completer.future;
  }
}

/// Estado del GPS para el indicador: apagado, buscando (sin [accuracyM]) o con precisión en m.
class GpsReading {
  const GpsReading({required this.enabled, this.accuracyM});

  final bool enabled;
  final double? accuracyM;
}

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());

final gpsReadingProvider =
    StreamProvider.autoDispose<GpsReading>((ref) => ref.read(locationServiceProvider).watch());
