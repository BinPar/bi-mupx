#!/bin/bash
set -e

APP_DIR=/opt/<%=appName %>

cd $APP_DIR

# setup the new version
# sudo mkdir current
if [[ -d current ]]; then
   cd current
   sudo rm -rf *.tar.gz
   cd ..
else
   sudo mkdir current
fi
sudo cp tmp/bundle.tar.gz current/
cd current/
sudo tar xzf bundle.tar.gz
sudo npm install --production --unsafe-perm
echo "****** BUILD NEXT ******"
sudo npm run build

cd $APP_DIR
# start app
sudo bash config/start.sh
