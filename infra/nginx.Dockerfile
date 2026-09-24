# =====================================================================
# Reverse proxy NGINX — imagen con la config horneada.
# Se construye en vez de bind-mount para no depender de rutas relativas
# del host (Portainer resuelve ./ desde la raíz del repo clonado).
# Contexto de build: raíz del repo.
#
# El servidor (HTTP o HTTPS) lo elige 40-tls.sh al arrancar según haya
# certificados montados en /etc/nginx/certs, así que la misma imagen sirve
# para desarrollo y para producción con TLS.
# =====================================================================
FROM nginx:1.27-alpine

COPY infra/nginx/nginx.conf        /etc/nginx/nginx.conf
COPY infra/nginx/locations.conf    /etc/nginx/locations.conf
COPY infra/nginx/server-http.conf  /etc/nginx/server-http.conf
COPY infra/nginx/server-tls.conf   /etc/nginx/server-tls.conf
COPY infra/nginx/40-tls.sh         /docker-entrypoint.d/40-tls.sh

# El default.conf de la imagen base declara su propio server en el 80 y chocaría
# con el que escribe el entrypoint en ese mismo directorio.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chmod +x /docker-entrypoint.d/40-tls.sh \
 && mkdir -p /var/www/certbot

EXPOSE 80 443
