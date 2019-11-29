#!/bin/bash

APPNAME=<%= appName %>
APP_PATH=/opt/$APPNAME
BUNDLE_PATH=$APP_PATH/current
ENV_FILE=$APP_PATH/config/env.list
PORT=<%= port %>
USE_LOCAL_MONGO=<%= linkMongo? "1" : "0" %>
MONGO_URL_CONFIG=<%= mongoUrlConfig %>
LINK_MAIL=<%= noMail ? "0" : "1" %>
MAIL_NAME=<%= mailName %>
PUBLISH_NETWORK=<%= publishNetwork ? publishNetwork : "127.0.0.1" %>
DOCKERIMAGE=<%= dockerimage %>
DOCKERNAME=<%= dockerName %>
AFTER_RUN_COMMAND=<%= afterRunCommand %>
VOLUMES="<%= volumes %>"

# Remove previous version of the app, if exists
docker rm -f $DOCKERNAME

# We don't need to fail the deployment because of a docker hub downtime
set +e
docker pull $DOCKERIMAGE
set -e

if [ "$USE_LOCAL_MONGO" == "1" ]; then
  LINK_MONGO_DOCKER=--link=mongodb:mongodb
fi
if [ "$LINK_MAIL" == "1" ]; then
  LINK_MAIL_DOCKER=--link=$MAIL_NAME:mail
fi
if [ -n $MONGO_URL_CONFIG ]; then
  ENV_MONGO_URL=--env=MONGO_URL=$MONGO_URL_CONFIG
fi

docker run -d --restart=always --publish=$PUBLISH_NETWORK:$PORT:80 --volume=$BUNDLE_PATH:/bundle $VOLUMES --env-file=$ENV_FILE $LINK_MONGO_DOCKER $LINK_MAIL_DOCKER --hostname="$HOSTNAME-$DOCKERNAME" $ENV_MONGO_URL --name=$DOCKERNAME $DOCKERIMAGE

if [ ! -z "$AFTER_RUN_COMMAND" ]; then
  docker exec -it $DOCKERNAME $AFTER_RUN_COMMAND
fi