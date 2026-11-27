package com.condor.nexussoft.timeclock.scheduling.infrastructure.web;

import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.platform.web.PageResponse;
import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.scheduling.infrastructure.web.dto.AssignmentDtos.*;
import com.condor.nexussoft.timeclock.scheduling.infrastructure.web.dto.ScheduleDtos.*;
import com.condor.nexussoft.timeclock.scheduling.infrastructure.web.dto.ShiftDtos.*;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Administración de horarios, turnos y asignaciones (RF-08). Requiere {@code schedule:manage}. */
@RestController
@PreAuthorize("hasAuthority('schedule:manage')")
public class SchedulingController {

    private final SchedulingUseCase scheduling;

    public SchedulingController(SchedulingUseCase scheduling) {
        this.scheduling = scheduling;
    }

    // --- Horarios ---
    @PostMapping("/api/v1/schedules")
    @ResponseStatus(HttpStatus.CREATED)
    public ScheduleResponse createSchedule(@Valid @RequestBody ScheduleRequest r) {
        return ScheduleResponse.from(scheduling.createSchedule(tenant(),
                new SchedulingCommands.CreateScheduleCommand(r.code(), r.name(), r.timezone())));
    }

    @GetMapping("/api/v1/schedules")
    public PageResponse<ScheduleResponse> listSchedules(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        Paged<Schedule> result = scheduling.listSchedules(tenant(), page, size, search);
        return PageResponse.of(result.items().stream().map(ScheduleResponse::from).toList(),
                result.page(), result.size(), result.total());
    }

    @GetMapping("/api/v1/schedules/{id}")
    public ScheduleResponse getSchedule(@PathVariable UUID id) {
        return ScheduleResponse.from(scheduling.getSchedule(tenant(), id));
    }

    @PutMapping("/api/v1/schedules/{id}")
    public ScheduleResponse updateSchedule(@PathVariable UUID id, @Valid @RequestBody ScheduleUpdateRequest r) {
        return ScheduleResponse.from(scheduling.updateSchedule(tenant(), id,
                new SchedulingCommands.UpdateScheduleCommand(r.name(), r.timezone(), r.status())));
    }

    // --- Turnos ---
    @PostMapping("/api/v1/schedules/{scheduleId}/shifts")
    @ResponseStatus(HttpStatus.CREATED)
    public ShiftResponse createShift(@PathVariable UUID scheduleId, @Valid @RequestBody ShiftRequest r) {
        return ShiftResponse.from(scheduling.createShift(tenant(), scheduleId, r.toData(), r.toBreakRules()));
    }

    @GetMapping("/api/v1/schedules/{scheduleId}/shifts")
    public List<ShiftResponse> listShifts(@PathVariable UUID scheduleId) {
        return scheduling.listShifts(tenant(), scheduleId).stream().map(ShiftResponse::from).toList();
    }

    @PutMapping("/api/v1/shifts/{shiftId}")
    public ShiftResponse updateShift(@PathVariable UUID shiftId, @Valid @RequestBody ShiftRequest r) {
        return ShiftResponse.from(scheduling.updateShift(tenant(), shiftId, r.toData(), r.toBreakRules()));
    }

    // --- Asignaciones ---
    @PostMapping("/api/v1/shift-assignments")
    @ResponseStatus(HttpStatus.CREATED)
    public AssignmentResponse assign(@Valid @RequestBody AssignmentRequest r) {
        return AssignmentResponse.from(scheduling.assignShift(tenant(),
                new SchedulingCommands.AssignShiftCommand(r.userId(), r.shiftId(), r.workSiteId(),
                        r.validFrom(), r.validTo())));
    }

    @GetMapping("/api/v1/shift-assignments")
    public List<AssignmentResponse> listAssignments(@RequestParam UUID userId) {
        return scheduling.listAssignments(tenant(), userId).stream().map(AssignmentResponse::from).toList();
    }

    private UUID tenant() {
        return TenantContext.require();
    }
}
