#!/bin/bash
# utilities
gyp_rebuild_inside_node_modules () {
  for npmModule in ./*; do
    cd $npmModule

    isBinaryModule="no"
    # recursively rebuild npm modules inside node_modules
    check_for_binary_modules () {
      if [ -f binding.gyp ]; then
        isBinaryModule="yes"
      fi

      if [ $isBinaryModule != "yes" ]; then
        if [ -d ./node_modules ]; then
          cd ./node_modules
          for module in ./*; do
            (cd $module && check_for_binary_modules)
          done
          cd ../
        fi
      fi
    }

    check_for_binary_modules

    if [ $isBinaryModule = "yes" ]; then
      echo " > $npmModule: npm install due to binary npm modules"
      sudo rm -rf node_modules
      sudo npm install
      # always rebuild because the node version might be different.
      sudo npm rebuild
      if [ -f binding.gyp ]; then
        sudo node-gyp rebuild || :
      fi
    fi
    cd ..
  done
}

rebuild_binary_npm_modules () {
  for package in ./*; do
    if [ -d $package/node_modules ]; then
      (cd $package/node_modules && \
        gyp_rebuild_inside_node_modules)
    elif [ -d $package/main/node_module ]; then
      (cd $package/node_modules && \
        gyp_rebuild_inside_node_modules )
    fi
  done
}

revert_app (){
  if [[ -d old_app ]]; then
    sudo rm -rf app
    sudo mv old_app app
    sudo stop <%= appName %> || :
    sudo start <%= appName %> || :

    echo "Latest deployment failed! Reverted back to the previous version." 1>&2
    exit 1
  else
    echo "App did not pick up! Please check app logs." 1>&2
    exit 1
  fi
}

set -e

APP_DIR=/opt/<%=appName %>

# save the last known version
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
cd bundle/programs/server/
sudo npm install --unsafe-perm
echo "****** Rebuilding npm modules ******"
if [ -d npm ]; then
  (cd npm && rebuild_binary_npm_modules)
fi

if [ -d node_modules ]; then
  (cd node_modules && gyp_rebuild_inside_node_modules)
fi
cd $APP_DIR/current/bundle/programs/server/
if [[ -e npm/node_modules/meteor/npm-bcrypt/node_modules/bcrypt ]] ; then
  echo "******** bcrypt fix ********"
  sudo rm -rf npm/node_modules/meteor/npm-bcrypt/node_modules/bcrypt
  sudo npm install --update-binary --unsafe-perm -f bcrypt
  sudo cp -r node_modules/bcrypt npm/node_modules/meteor/npm-bcrypt/node_modules/bcrypt
fi
if [[ -e npm/node_modules/bcrypt ]] ; then
  echo "******** bcrypt fix ********"
  sudo rm -rf npm/node_modules/bcrypt
  sudo npm install --update-binary --unsafe-perm -f bcrypt
  sudo cp -r node_modules/bcrypt npm/node_modules/
fi

cd $APP_DIR
# start app
sudo bash config/start.sh
