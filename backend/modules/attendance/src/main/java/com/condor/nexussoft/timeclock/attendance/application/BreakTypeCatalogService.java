package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakTypeCatalogUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakTypePort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class BreakTypeCatalogService implements BreakTypeCatalogUseCase {

    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,30}");

    private final BreakTypePort breakTypes;

    public BreakTypeCatalogService(BreakTypePort breakTypes) {
        this.breakTypes = breakTypes;
    }

    @Override
    @Transactional(readOnly = true)
    public List<BreakType> list(UUID tenantId) {
        return breakTypes.findByTenant(tenantId);
    }

    @Override
    @Transactional
    public BreakType create(UUID tenantId, BreakTypeDraft draft) {
        String code = normalizeCode(draft.code());
        requireUniqueCode(tenantId, code, null);
        return breakTypes.save(new BreakType(UUID.randomUUID(), tenantId, code, requireLabel(draft.label()),
                draft.enabled(), draft.paid(), draft.maxMinutes(), draft.sortOrder()));
    }

    @Override
    @Transactional
    public BreakType update(UUID tenantId, UUID id, BreakTypeDraft draft) {
        breakTypes.findById(tenantId, id).orElseThrow(() -> new ResourceNotFoundException("Tipo de descanso", id));
        String code = normalizeCode(draft.code());
        requireUniqueCode(tenantId, code, id);
        return breakTypes.save(new BreakType(id, tenantId, code, requireLabel(draft.label()),
                draft.enabled(), draft.paid(), draft.maxMinutes(), draft.sortOrder()));
    }

    @Override
    @Transactional
    public boolean delete(UUID tenantId, UUID id) {
        BreakType existing = breakTypes.findById(tenantId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Tipo de descanso", id));
        if (breakTypes.isInUse(tenantId, id)) {
            // Las marcas antiguas siguen apuntando a ella: se retira de la app, pero el histórico
            // conserva su etiqueta.
            breakTypes.save(new BreakType(existing.id(), tenantId, existing.code(), existing.label(),
                    false, existing.paid(), existing.maxMinutes(), existing.sortOrder()));
            return false;
        }
        breakTypes.delete(tenantId, id);
        return true;
    }

    private static String normalizeCode(String raw) {
        String code = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(code).matches()) {
            throw new DomainException("INVALID_CODE",
                    "El código solo admite letras mayúsculas, números y guion bajo (máx. 30).");
        }
        return code;
    }

    private static String requireLabel(String label) {
        if (label == null || label.isBlank()) {
            throw new DomainException("LABEL_REQUIRED", "La etiqueta del tipo de descanso es obligatoria.");
        }
        return label.trim();
    }

    private void requireUniqueCode(UUID tenantId, String code, UUID excludingId) {
        if (breakTypes.existsCode(tenantId, code, excludingId)) {
            throw new DomainException("DUPLICATE_CODE", "Ya existe un tipo de descanso con el código " + code);
        }
    }
}
