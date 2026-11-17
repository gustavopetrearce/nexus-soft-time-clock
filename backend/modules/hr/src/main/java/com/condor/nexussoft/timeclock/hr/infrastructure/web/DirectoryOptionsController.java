package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import com.condor.nexussoft.timeclock.hr.infrastructure.persistence.DirectoryOptionsQuery;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Selectores de colaboradores y centros para quien captura permisos, vacaciones, turnos o contratos
 * sin administrar usuarios ni centros. Antes esos formularios leían {@code /users} y
 * {@code /work-sites}, que exigen {@code user:manage}/{@code worksite:manage}: RR. HH. y supervisión
 * recibían 403 y veían el selector vacío.
 *
 * <p>Pendiente (RN-33): el supervisor ve a todos los colaboradores del tenant, no solo a los de sus
 * centros; el recorte por centro tampoco se aplica todavía en los permisos.</p>
 */
@RestController
@RequestMapping("/api/v1/options")
public class DirectoryOptionsController {

    private final DirectoryOptionsQuery options;

    public DirectoryOptionsController(DirectoryOptionsQuery options) {
        this.options = options;
    }

    @GetMapping("/employees")
    @PreAuthorize("hasAnyAuthority('user:manage','permit:manage','vacation:manage','schedule:manage','contract:manage')")
    public List<DirectoryOptionsQuery.Collaborator> employees(
            Authentication auth,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "500") int limit) {
        return options.collaborators(CurrentUser.tenantId(auth), search, limit);
    }

    @GetMapping("/work-sites")
    @PreAuthorize("hasAnyAuthority('worksite:manage','schedule:manage','contract:manage')")
    public List<DirectoryOptionsQuery.WorkSite> workSites(Authentication auth) {
        return options.workSites(CurrentUser.tenantId(auth));
    }
}
