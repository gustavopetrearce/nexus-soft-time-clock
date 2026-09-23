package com.condor.nexussoft.timeclock.platform.web;

import jakarta.servlet.http.HttpServletRequest;

import java.util.regex.Pattern;

/**
 * Datos de origen de la petición que la auditoría necesita registrar (RN-60).
 *
 * <p>Vive en platform porque los pide tanto el login (que los guarda con el refresh token) como
 * el filtro que alimenta {@code AuditContext}; tenerlo en un sitio evita que cada llamador
 * reinvente el desenredo de {@code X-Forwarded-For}.
 */
public final class HttpRequestMetadata {

    /** Cabecera con la que el cliente móvil identifica su dispositivo (device binding, RF-28). */
    public static final String DEVICE_HEADER = "X-Device-Id";

    private static final int USER_AGENT_MAX = 400;
    private static final int DEVICE_MAX = 200;

    /**
     * La bitácora guarda la IP en una columna {@code inet}, y el valor llega de una cabecera que
     * el cliente controla: un {@code X-Forwarded-For} con basura haría fallar el cast y con él
     * el commit de la operación de negocio. Solo se acepta lo que parece una dirección.
     */
    private static final Pattern DIRECCION = Pattern.compile("[0-9a-fA-F.:]{3,45}");

    private HttpRequestMetadata() {
    }

    /**
     * IP real del cliente. Detrás de NGINX {@code getRemoteAddr()} devuelve la del proxy, así que
     * manda el primer salto de {@code X-Forwarded-For}, que es el cliente original.
     */
    public static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String primerSalto = forwarded.split(",")[0].trim();
            if (DIRECCION.matcher(primerSalto).matches()) {
                return primerSalto;
            }
        }
        String remota = request.getRemoteAddr();
        return remota != null && DIRECCION.matcher(remota).matches() ? remota : null;
    }

    /** User-agent recortado al ancho de la columna: un cliente puede mandar uno enorme. */
    public static String userAgent(HttpServletRequest request) {
        return truncate(request.getHeader("User-Agent"), USER_AGENT_MAX);
    }

    /** Dispositivo declarado por el cliente, si lo declara; el portal web no envía ninguno. */
    public static String device(HttpServletRequest request) {
        return truncate(request.getHeader(DEVICE_HEADER), DEVICE_MAX);
    }

    private static String truncate(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
