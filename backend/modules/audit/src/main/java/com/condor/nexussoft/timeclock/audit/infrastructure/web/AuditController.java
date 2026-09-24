package com.condor.nexussoft.timeclock.audit.infrastructure.web;

import com.condor.nexussoft.timeclock.audit.domain.AuditLogEntry;
import com.condor.nexussoft.timeclock.audit.domain.port.in.AuditQueryUseCase;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.platform.web.PageResponse;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

/** Consulta de la bitácora de auditoría (RF-12). Requiere {@code audit:read}. */
@RestController
@RequestMapping("/api/v1/audit")
@PreAuthorize("hasAuthority('audit:read')")
public class AuditController {

    private final AuditQueryUseCase audit;

    public AuditController(AuditQueryUseCase audit) {
        this.audit = audit;
    }

    public record AuditResponse(UUID id, UUID actorUserId, String actorEmail, String action,
                                String resourceType, String resourceId, String ip, String userAgent,
                                String deviceInfo, String oldValues, String newValues,
                                Instant createdAt) {
        static AuditResponse from(AuditLogEntry e) {
            return new AuditResponse(e.id(), e.actorUserId(), e.actorEmail(), e.action(),
                    e.resourceType(), e.resourceId(), e.ip(), e.userAgent(), e.deviceInfo(),
                    e.oldValuesJson(), e.newValuesJson(), e.createdAt());
        }
    }

    @GetMapping
    public PageResponse<AuditResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Paged<AuditLogEntry> result = audit.list(TenantContext.require(), page, size);
        return PageResponse.of(result.items().stream().map(AuditResponse::from).toList(),
                result.page(), result.size(), result.total());
    }
}
