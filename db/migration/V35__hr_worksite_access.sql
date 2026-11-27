-- =====================================================================
-- V35 — RR. HH. administra centros de trabajo y sus QR.
--
-- HR_ADMIN recibe:
--   worksite:manage → alta, edición y estado de centros de trabajo
--   geofence:manage → geocerca, QR firmado por centro y QR de empresa
-- La página de geocerca/QR carga el centro con worksite:manage, así que
-- se conceden juntos. Aplica al rol plantilla y a los ya instanciados.
-- Los permisos viajan en el JWT: el usuario debe volver a iniciar sesión.
-- =====================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN ('worksite:manage', 'geofence:manage')
WHERE r.code = 'HR_ADMIN'
ON CONFLICT DO NOTHING;
