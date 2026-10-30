import 'package:flutter/widgets.dart';

import '../../app/tokens.g.dart';

/// Tono de estado del design system (`color.status.*`). `brand` es la variante informativa de
/// marca (`action-primary` sobre `action-primary-subtle`).
enum NxTone { success, warning, error, info, neutral, brand }

extension NxToneColors on NxTone {
  Color fg(NxColors c) => switch (this) {
        NxTone.success => c.statusSuccessFg,
        NxTone.warning => c.statusWarningFg,
        NxTone.error => c.statusErrorFg,
        NxTone.info => c.statusInfoFg,
        NxTone.neutral => c.statusNeutralFg,
        NxTone.brand => c.actionPrimary,
      };

  Color bg(NxColors c) => switch (this) {
        NxTone.success => c.statusSuccessBg,
        NxTone.warning => c.statusWarningBg,
        NxTone.error => c.statusErrorBg,
        NxTone.info => c.statusInfoBg,
        NxTone.neutral => c.statusNeutralBg,
        NxTone.brand => c.actionPrimarySubtle,
      };
}

/// Tono de `attendance_records.status` (HIFI/08): ACCEPTED → success, PENDING_REVIEW → warning,
/// REJECTED → error. Lo que aún está en la cola local («Pendiente de enviar») va en info.
NxTone attendanceStatusTone(String status) => switch (status) {
      'ACCEPTED' => NxTone.success,
      'REJECTED' => NxTone.error,
      'PENDING_REVIEW' => NxTone.warning,
      _ => NxTone.info,
    };

/// Tono de `vacation_requests.status` (HIFI/08).
NxTone vacationStatusTone(String status) => switch (status) {
      'APPROVED' => NxTone.success,
      'REJECTED' => NxTone.error,
      'CANCELLED' => NxTone.neutral,
      _ => NxTone.warning,
    };
