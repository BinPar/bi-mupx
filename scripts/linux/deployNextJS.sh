#!/bin/bash
set -e

APP_DIR=/opt/<%=appName %>

if [[ -d /opt/nodejs8 ]]; then
   ln -sf /opt/nodejs8/bin/node /usr/bin/node
   ln -sf /opt/nodejs8/bin/npm /usr/bin/npm
else
   cd /tmp
   LINK_NODE8=http://nodejs.org/dist/latest-v8.x/
   DOWNLOAD_NODE8=$(curl -s $LINK_NODE8 | grep -o '<a .*href=.*>' | sed -e 's/<a /\<a /g' | sed -e 's/<a .*href=['"'"'"]//' -e 's/["'"'"'].*$//' -e '/^$/ d' | grep 'linux' | grep "x64" | grep ".tar.gz")
   LINK_NODE8=$LINK_NODE8$DOWNLOAD_NODE8
   curl -O -L $LINK_NODE8
   tar xvzf $DOWNLOAD_NODE8
   DIR_NODE8=$(echo $DOWNLOAD_NODE8 | sed -e 's/.tar.gz//')
   rm -rf /opt/nodejs8
   mv $DIR_NODE8 /opt/nodejs8
   ln -sf /opt/nodejs8/bin/node /usr/bin/node
   ln -sf /opt/nodejs8/bin/npm /usr/bin/npm
   rm -rf $DOWNLOAD_NODE8
fi

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
