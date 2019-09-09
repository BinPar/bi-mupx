#!/bin/bash
set -e

APP_DIR=/opt/<%=appName %>
MUPX_NODE_VERSION=<%=mupxNodeVersion %>

if [ -n "$MUPX_NODE_VERSION" ]; then
  NODE_VERSION=${MUPX_NODE_VERSION}
else
  LINK_NODE8=http://nodejs.org/dist/latest-v8.x/
  NODE_VERSION=$(curl -s $LINK_NODE8 | grep -o '<a .*href=.*>' | sed -e 's/<a /\<a /g' | sed -e 's/<a .*href=['"'"'"]//' -e 's/["'"'"'].*$//' -e '/^$/ d' | grep 'linux' | grep "x64" | grep ".tar.gz" | sed -e 's/node-//g' -e 's/-linux-x64.tar.gz//g')
fi
if [ $NODE_VERSION != $(node -v) ]; then
  cd /tmp
  if [ -n "$MUPX_NODE_VERSION" ]; then
    NODE_DIST=node-v${NODE_VERSION}-linux-x64
    LINK_NODE8=http://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.gz
    DOWNLOAD_NODE8=${NODE_DIST}.tar.gz
  else
    LINK_NODE8=http://nodejs.org/dist/latest-v8.x/
    DOWNLOAD_NODE8=$(curl -s $LINK_NODE8 | grep -o '<a .*href=.*>' | sed -e 's/<a /\<a /g' | sed -e 's/<a .*href=['"'"'"]//' -e 's/["'"'"'].*$//' -e '/^$/ d' | grep 'linux' | grep "x64" | grep ".tar.gz")
    LINK_NODE8=$LINK_NODE8$DOWNLOAD_NODE8
  fi
  sudo curl -O -L $LINK_NODE8
  sudo tar xvzf $DOWNLOAD_NODE8
  DIR_NODE8=$(echo $DOWNLOAD_NODE8 | sed -e 's/.tar.gz//')
  sudo rm -rf /opt/nodejs8
  sudo mv $DIR_NODE8 /opt/nodejs8
  sudo ln -sf /opt/nodejs8/bin/node /usr/bin/node
  sudo ln -sf /opt/nodejs8/bin/npm /usr/bin/npm
  sudo rm -rf $DOWNLOAD_NODE8
else
  echo "NO actualizar!"
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
sudo npm install --no-optional
echo "****** BUILD NEXT ******"
sudo npm run build

cd $APP_DIR
# start app
sudo bash config/start<%=nDeploy %>.sh
