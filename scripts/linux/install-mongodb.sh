#!/bin/bash

set -e
# we use this data directory for the backward compatibility
# older mup uses mongodb from apt-get and they used this data directory
sudo mkdir -p /var/lib/mongodb

MONGO_DB_VERSION=<%=mongoVersion %>
MONGO_FORCE_UPDATE=<%=mongoForceUpdate? "1" : "0" %>
IS_MONGO_RUNNING=$(sudo docker ps | grep mongodb)
if [ -n "$IS_MONGO_RUNNING" -a $MONGO_FORCE_UPDATE != 1 ]; then
  echo mongo running!
else
  echo mongo not running!
  sudo docker pull mongo:$MONGO_DB_VERSION
  set +e
  sudo docker rm -f mongodb
  set -e

  sudo docker run \
    -d \
    --restart=always \
    --publish=0.0.0.0:27017:27017 \
    --volume=/var/lib/mongodb:/data/db \
    --volume=/opt/mongodb/mongodb.conf:/mongodb.conf \
    --name=mongodb \
    mongo:$MONGO_DB_VERSION mongod -f /mongodb.conf
fi