#!/bin/bash

sudo mkdir -p /opt/<%= appName %>/
sudo mkdir -p /opt/<%= appName %>/config
sudo mkdir -p /opt/<%= appName %>/tmp
sudo mkdir -p /opt/mongodb

sudo chown ${USER} /opt/<%= appName %> -R
sudo chown ${USER} /opt/mongodb -R

sudo usermod -a -G docker ${USER}

PATH_TO_STATIC=/opt/<%= appName %>/static/
HOST=<%= host %>
PORT=<%= port %>
IS_CONTAINER_SERVER=<%= containersConfig ? "1" : "0" %>
PATH_TO_SITE_CONF=/etc/nginx/sites-available/${HOST}.conf

if [ "$IS_CONTAINER_SERVER" == "0" ]; then
sudo mkdir -p /opt/<%= appName %>/static
sudo mkdir -p /opt/<%= appName %>/static/.well-known
if [ ! -f ${PATH_TO_SITE_CONF} ]; then
cat << EOF > ${PATH_TO_SITE_CONF}
#HTTP
server {
  listen                *:80;

  server_name           ${HOST};

  error_log             /var/log/nginx/app.dev.error.log;

    # redirect non-SSL to SSL
    location / {
        rewrite     ^ https://\$server_name\$request_uri? permanent;
    }
}

#HTTPS
server {
    gzip on;
    gzip_types text/plain application/xml text/css text/javascript text/json text/xml;
    gzip_proxied no-cache no-store private expired auth;
    gzip_min_length 1000;
    client_max_body_size 2048M;
    listen 443 ssl http2;

    server_name ${HOST}; # this domain must match Common Name (CN) in the SSL certificate

    #ssl_certificate /etc/letsencrypt/live/${HOST}/fullchain.pem; # full path to SSL certificate and CA certificate concatenated together
    #ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem; # full path to SSL key

    # performance enhancement for SSL
    ssl_stapling on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 5m;

    # safety enhancement to SSL: make sure we actually use a safe cipher
    ssl_prefer_server_ciphers on;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:kEDH+AESGCM:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-DSS-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:ECDHE-RSA-RC4-SHA:ECDHE-ECDSA-RC4-SHA:RC4-SHA:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!3DES:!MD5:!PSK';

    # config to enable HSTS(HTTP Strict Transport Security) https://developer.mozilla.org/en-US/docs/Security/HTTP_Strict_Transport_Security
    # to avoid ssl stripping https://en.wikipedia.org/wiki/SSL_stripping#SSL_stripping
    add_header Strict-Transport-Security "max-age=31536000;";

    set \$cache_key \$scheme\$host\$uri\$is_args\$args;

    location /.well-known {
        root ${PATH_TO_STATIC};
    }

    # pass all requests to Meteor
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade; # allow websockets
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For \$remote_addr; # preserve client IP
    }
}
EOF

ln -s ${PATH_TO_SITE_CONF} /etc/nginx/sites-enabled/
nginx -s reload
~/certbot/certbot-auto certonly --webroot -w ${PATH_TO_STATIC} -d ${HOST}
sed -e "s/$PATH_TO_ROOT_APP_REPLACE_STRING/$DOCKER_PATH_TO_APP/g" -e "s/$PATH_TO_LOGS_DIR_REPLACE_STRING/$DOCKER_PATH_TO_LOGS/g" deploy.conf > deploy.json
cat << EOF > ${PATH_TO_SITE_CONF}
#HTTP
server {
  listen                *:80;

  server_name           ${HOST};

  error_log             /var/log/nginx/app.dev.error.log;

    # redirect non-SSL to SSL
    location / {
        rewrite     ^ https://\$server_name\$request_uri? permanent;
    }
}

#HTTPS
server {
    gzip on;
    gzip_types text/plain application/xml text/css text/javascript text/json text/xml;
    gzip_proxied no-cache no-store private expired auth;
    gzip_min_length 1000;
    client_max_body_size 2048M;
    listen 443 ssl http2;

    server_name ${HOST}; # this domain must match Common Name (CN) in the SSL certificate

    ssl_certificate /etc/letsencrypt/live/${HOST}/fullchain.pem; # full path to SSL certificate and CA certificate concatenated together
    ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem; # full path to SSL key

    # performance enhancement for SSL
    ssl_stapling on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 5m;

    # safety enhancement to SSL: make sure we actually use a safe cipher
    ssl_prefer_server_ciphers on;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:kEDH+AESGCM:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-DSS-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:ECDHE-RSA-RC4-SHA:ECDHE-ECDSA-RC4-SHA:RC4-SHA:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!3DES:!MD5:!PSK';

    # config to enable HSTS(HTTP Strict Transport Security) https://developer.mozilla.org/en-US/docs/Security/HTTP_Strict_Transport_Security
    # to avoid ssl stripping https://en.wikipedia.org/wiki/SSL_stripping#SSL_stripping
    add_header Strict-Transport-Security "max-age=31536000;";

    set \$cache_key \$scheme\$host\$uri\$is_args\$args;

    location /.well-known {
        root ${PATH_TO_STATIC};
    }

    # pass all requests to Meteor
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade; # allow websockets
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For \$remote_addr; # preserve client IP
    }
}
EOF
nginx -s reload
fi
fi