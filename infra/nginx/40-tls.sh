#!/bin/sh
# =====================================================================
# Elige el servidor HTTP o el HTTPS según haya certificados montados.
#
# Se ejecuta desde /docker-entrypoint.d/, que la imagen oficial de NGINX
# recorre antes de arrancar: así el contenedor sirve TLS sin reconstruir la
# imagen, basta con montar los certificados y reiniciar.
#
# Deliberadamente NO falla si faltan: el stack tiene que poder levantarse en
# desarrollo, y detrás de un proxy que ya termina TLS los certificados aquí
# sobran. Lo que sí hace es decir por log en cuál de los dos modos arrancó,
# para que nadie crea que tiene HTTPS cuando no lo tiene.
# =====================================================================
set -e

CERT="${TLS_CERT_FILE:-/etc/nginx/certs/fullchain.pem}"
KEY="${TLS_KEY_FILE:-/etc/nginx/certs/privkey.pem}"
DESTINO=/etc/nginx/conf.d/server.conf

if [ -r "$CERT" ] && [ -r "$KEY" ]; then
    # El separador es "|" porque las rutas llevan barras.
    sed -e "s|__TLS_CERT__|$CERT|g" -e "s|__TLS_KEY__|$KEY|g" \
        /etc/nginx/server-tls.conf > "$DESTINO"
    echo "[nginx] TLS activado: $CERT — el puerto 80 redirige a HTTPS"
else
    cp /etc/nginx/server-http.conf "$DESTINO"
    echo "[nginx] Sin certificados legibles en $CERT: se sirve HTTP en el 80."
    echo "[nginx] Monta los certificados (o pon TLS en el proxy de delante) antes de exponerlo a internet."
fi
