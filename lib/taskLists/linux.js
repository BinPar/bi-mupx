var nodemiral = require('nodemiral');
var fs = require('fs');
var path = require('path');
var util = require('util');
var _ = require('underscore');

var SCRIPT_DIR = path.resolve(__dirname, '../../scripts/linux');
var TEMPLATES_DIR = path.resolve(__dirname, '../../templates/linux');

exports.setup = function (config) {
	var taskList = nodemiral.taskList('Setup (linux)');

	if (!config.containersConfig) {
		taskList.executeScript('Installing Docker', {
			script: path.resolve(SCRIPT_DIR, 'install-docker.sh')
		});
	}

	taskList.executeScript('Setting up Environment', {
		script: path.resolve(SCRIPT_DIR, 'setup-env.sh'),
		vars: {
			appName: config.appName,
			port: config.env && config.env.PORT,
			host: ((config.env && config.env.ROOT_URL) || '').split('//').pop().replace(/\//g, ''),
			containersConfig: !!config.containersConfig,
		}
	});

	if (config.setupMongo) {
		taskList.copy('Copying MongoDB configuration', {
			src: path.resolve(TEMPLATES_DIR, 'mongodb.conf'),
      dest: '/opt/mongodb/mongodb.conf',
      vars: {
        maxGBWiredTiger: config.maxGBWiredTiger
      }
		});

		taskList.executeScript('Installing MongoDB', {
			script: path.resolve(SCRIPT_DIR, 'install-mongodb.sh'),
      vars: {
        mongoVersion: config.mongoVersion,
        mongoForceUpdate: config.mongoForceUpdate
      }
		});
	}

	if (config.ssl) {
		taskList.copy('Copying SSL certificate bundle', {
			src: config.ssl.certificate,
			dest: '/opt/' + config.appName + '/config/bundle.crt'
		});

		taskList.copy('Copying SSL private key', {
			src: config.ssl.key,
			dest: '/opt/' + config.appName + '/config/private.key'
		});

		taskList.executeScript('Verifying SSL configurations', {
			script: path.resolve(SCRIPT_DIR, 'verify-ssl-configurations.sh'),
			vars: {
				appName: config.appName
			}
		});
	}

	return taskList;
};

function copyStartScriptAndDeployVerify(taskList, env, config, appName, deployCheckWaitTime, port, nDeploy) {
	taskList.copy(nDeploy + ' - Initializing start script for port: ' + port, {
		src: path.resolve(TEMPLATES_DIR, 'start.sh'),
		dest: '/opt/' + appName + '/config/start' + nDeploy && nDeploy > 1 ? nDeploy.toString() : '' + '.sh',
		vars: {
			appName: appName,
			useLocalMongo: config.setupMongo,
			port: port,
			sslConfig: config.ssl,
			dockerimage: config.dockerimage,
			noMail: config.noMail,
			mupxNodeVersion: config.mupxNodeVersion,
			linkMongo: config.linkMongo,
			mongoVersion: config.mongoVersion,
			mongoForceUpdate: config.mongoForceUpdate,
			mailName: config.mailName,
			publishNetwork: config.publishNetwork,
			afterRunCommand: config.afterRunCommand,
			mongoUrlConfig: config.env['MONGO_URL'] || 'mongodb://mongodb:27017/' + appName,
      volumes: config.volumes,
      dockerName: appName + (nDeploy && nDeploy > 1 ? nDeploy.toString() : ''),
		}
	});

	deployAndVerify(taskList, appName, port, deployCheckWaitTime, !!config.nextjs, config.mupxNodeVersion, nDeploy);
}

exports.deploy = function (bundlePath, env, config) {
	var deployCheckWaitTime = config.deployCheckWaitTime;
	var appName = config.appName;
	var taskList = nodemiral.taskList("Deploy app '" + appName + "' (linux)");

	taskList.copy('Uploading bundle', {
		src: bundlePath,
		dest: '/opt/' + appName + '/tmp/bundle.tar.gz',
		progressBar: config.enableUploadProgressBar
	});

  copyEnvVars(taskList, env, appName);
  const ports = config.env['PORT'];
  for (var i = 0; i < ports.length; i += 1) {
    var port = ports[i];
    if (port) {
      copyStartScriptAndDeployVerify(taskList, env, config, appName, deployCheckWaitTime, port, i + 1);
    }
  }
	return taskList;
};

exports.reconfig = function (env, config) {
	var appName = config.appName;
	var deployCheckWaitTime = config.deployCheckWaitTime;

	var taskList = nodemiral.taskList("Updating configurations (linux)");

  copyEnvVars(taskList, env, appName);
  const ports = config.env['PORT'];
  for (var i = 0; i < ports.length; i += 1) {
    var port = ports[i];
    if (port) {
      startAndVerify(taskList, appName, port, deployCheckWaitTime, i + 1);
    }
  }

	return taskList;
};

exports.restart = function (config) {
	var taskList = nodemiral.taskList("Restarting Application (linux)");

	var appName = config.appName;
	var deployCheckWaitTime = config.deployCheckWaitTime;

  const ports = config.env['PORT'];
  for (var i = 0; i < ports.length; i += 1) {
    var port = ports[i];
    if (port) {
      startAndVerify(taskList, appName, port, deployCheckWaitTime, i + 1);
    }
  }

	return taskList;
};

exports.stop = function (config) {
	var taskList = nodemiral.taskList("Stopping Application (linux)");

	//stopping
	taskList.executeScript('Stopping app', {
		script: path.resolve(SCRIPT_DIR, 'stop.sh'),
		vars: {
			appName: config.appName
		}
	});

	return taskList;
};

exports.start = function (config) {
	var taskList = nodemiral.taskList("Starting Application (linux)");

	var appName = config.appName;
	var port = config.env.PORT;
	var deployCheckWaitTime = config.deployCheckWaitTime;

  const ports = config.env['PORT'];
  for (var i = 0; i < ports.length; i += 1) {
    var port = ports[i];
    if (port) {
      startAndVerify(taskList, appName, port, deployCheckWaitTime, i + 1);
    }
  }

	return taskList;
};

function installStud(taskList) {
	taskList.executeScript('Installing Stud', {
		script: path.resolve(SCRIPT_DIR, 'install-stud.sh')
	});
}

function copyEnvVars(taskList, env, appName) {
	var env = _.clone(env);
	// sending PORT to the docker container is useless.
	// It'll run on PORT 80 and we can't override it
	// Changing the port is done via the start.sh script
	delete env.PORT;
	taskList.copy('Sending environment variables', {
		src: path.resolve(TEMPLATES_DIR, 'env.list'),
		dest: '/opt/' + appName + '/config/env.list',
		vars: {
			env: env || {},
			appName: appName
		}
	});
}

function startAndVerify(taskList, appName, port, deployCheckWaitTime, nDeploy) {
	taskList.execute('Starting app', {
		command: 'bash /opt/' + appName + '/config/start' + nDeploy && nDeploy > 1 ? nDeploy.toString() : '' + '.sh'
	});

	// verifying deployment
	taskList.executeScript('Verifying deployment', {
		script: path.resolve(SCRIPT_DIR, 'verify-deployment.sh'),
		vars: {
			deployCheckWaitTime: deployCheckWaitTime || 10,
			appName: appName,
			port: port
		}
	});
}

function deployAndVerify(taskList, appName, port, deployCheckWaitTime, isNextJS, mupxNodeVersion, nDeploy) {
	// deploying
	if(isNextJS) {
		taskList.executeScript(nDeploy + ' - Invoking deployment process (Node) in port: ' + port, {
			script: path.resolve(SCRIPT_DIR, 'deployNextJS.sh'),
			vars: {
        appName: appName,
        mupxNodeVersion: mupxNodeVersion,
        nDeploy: nDeploy
			}
		});
	} else {
		taskList.executeScript(nDeploy + ' - Invoking deployment process (Meteor) in port: ' + port, {
			script: path.resolve(SCRIPT_DIR, 'deploy.sh'),
			vars: {
				appName: appName,
        mupxNodeVersion: mupxNodeVersion,
        nDeploy: nDeploy
			}
		});
	}

	// verifying deployment
	taskList.executeScript('Verifying deployment', {
		script: path.resolve(SCRIPT_DIR, 'verify-deployment.sh'),
		vars: {
			deployCheckWaitTime: deployCheckWaitTime || 10,
			appName: appName,
			port: port
		}
	});
}
