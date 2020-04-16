var cjson = require('cjson');
var path = require('path');
var fs = require('fs');
var helpers = require('./helpers');
var format = require('util').format;
require('colors');

exports.read = function (configFileName) {
	var mupJsonPath = path.resolve(configFileName);
	// path of the mup.json file is the basedir and everything
	// will be based on that path
	var basedir = path.dirname(mupJsonPath);

	if (fs.existsSync(mupJsonPath)) {
		var mupJson = cjson.load(mupJsonPath);

		//initialize options
		mupJson.env = mupJson.env || {};
    mupJson.env['PORT'] = mupJson.env['PORT'] || 80;
    if (({}).toString.call(mupJson.env['PORT']) !== '[object Array]') {
      mupJson.env['PORT'] = [mupJson.env['PORT']];
    }

		if (typeof mupJson.setupNode === "undefined") {
			mupJson.setupNode = true;
		}
		if (typeof mupJson.setupPhantom === "undefined") {
			mupJson.setupPhantom = true;
		}
		if (typeof mupJson.appName === "undefined") {
			mupJson.appName = "meteor";
		}

		if (typeof mupJson.enableUploadProgressBar === "undefined") {
			mupJson.enableUploadProgressBar = true;
		}

		//validating servers
		if (!mupJson.servers || mupJson.servers.length == 0) {
			mupErrorLog('Server information does not exist');
		} else {
			mupJson.servers.forEach(function (server) {
				var sshAgentExists = false;
				var sshAgent = process.env.SSH_AUTH_SOCK;
				if (sshAgent) {
					sshAgentExists = fs.existsSync(sshAgent);
					server.sshOptions = server.sshOptions || {};
					server.sshOptions.agent = sshAgent;
				}

				if (!server.host) {
					mupErrorLog('Server host does not exist');
				} else if (!server.username) {
					mupErrorLog('Server username does not exist');
				} else if (!server.password && !server.pem && !sshAgentExists) {
					mupErrorLog('Server password, pem or a ssh agent does not exist');
				} else if (!mupJson.app) {
					mupErrorLog('Path to app does not exist');
				}

				server.os = server.os || "linux";

				if (server.pem) {
					server.pem =
						rewritePath(server.pem, "SSH private key file is invalid");
				}

				server.env = server.env || {};

				var defaultEndpointUrl =
					format("http://%s:%s", server.host, mupJson.env['PORT']);
				server.env['CLUSTER_ENDPOINT_URL'] =
					server.env['CLUSTER_ENDPOINT_URL'] || defaultEndpointUrl;
			});
		}

		//rewrite ~ with $HOME
		mupJson.app = rewritePath(
			mupJson.app, "There is no meteor app in the current app path.");

		if (mupJson.ssl) {
			mupJson.ssl.port = mupJson.ssl.port || 443;
			mupJson.ssl.certificate = rewritePath(
				mupJson.ssl.certificate, "SSL certificate file does not exists.");
			mupJson.ssl.key = rewritePath(
				mupJson.ssl.key, "SSL key file does not exists.");
		}

		// additional build options
		mupJson.buildOptions = mupJson.buildOptions || {};

		mupJson.nextjs = mupJson.nextjs || false;
		if(mupJson.dockerimage) { }
		else if(mupJson.nextjs) {
			mupJson.dockerimage = "mgonand/dockerimages:nextjs";
		} else if(mupJson.useMeteor6) {
			mupJson.dockerimage = "abernix/meteord:node-8.4.0-base";
		} else if(mupJson.useMeteor4) {
			mupJson.dockerimage = "mgonand/dockerimages:meteor4";
		} else {
			mupJson.dockerimage = "mgonand/dockerimages:meteor";
    }
    if (!mupJson.env['MONGO_URL'] && !mupJson.nextjs) {
      mupJson.env['MONGO_URL'] = 'mongodb://mongodb:27017/' + mupJson.appName;
    }
		mupJson.mupxNodeVersion = mupJson.mupxNodeVersion || '';
		mupJson.linkMongo = mupJson.linkMongo === undefined ? true : mupJson.linkMongo;
		mupJson.mongoVersion = mupJson.mongoVersion || '3.4';
		mupJson.mongoForceUpdate = mupJson.mongoForceUpdate || false;
		mupJson.noMail = mupJson.noMail || false;
		mupJson.mailName = mupJson.mailName || (mupJson.containersConfig ? 'smtpsrv' : 'mail');
		mupJson.containersConfig = mupJson.containersConfig || false;
		mupJson.containerName = mupJson.containerName || '';
		mupJson.publishNetwork = mupJson.publishNetwork || (mupJson.containersConfig ? '0.0.0.0' : false);
		mupJson.afterRunCommand = mupJson.afterRunCommand || '';
		mupJson.additionalDockerRunOptions = mupJson.additionalDockerRunOptions || '';

    mupJson.maxGBWiredTiger = mupJson.maxGBWiredTiger || 3;
    if (!mupJson.maxGBWiredTiger || isNaN(mupJson.maxGBWiredTiger) || mupJson.maxGBWiredTiger < 0) {
      mupErrorLog('The maxGBWiredTiger parameter should be a valid number');
    }
    mupJson.maxGBWiredTiger = Math.floor(mupJson.maxGBWiredTiger);
    if (mupJson.maxGBWiredTiger > 10 && !mupJson.allowBigWiredTigerValues) {
      mupErrorLog('You cannot set up a maxGBWiredTiger value greater than 10. To force a value greater than 10 you should setup "allowBigWiredTigerValues" property in mup.json');
    }

		if(mupJson.containersConfig === true && !mupJson.APIPassword) {
			mupErrorLog('You must provide a password for the container configuration API');
		}

		/**
		 * openToThisIPs
		 * @param ips [String]
		 * Array of IPs which can access to mongodb
		 */
		mupJson.openToThisIPs = mupJson.openToThisIPs || [];
		var IPsLength = mupJson.openToThisIPs.length;
		if (IPsLength > 0) {
			var IPsValid = true;
			for (var i = 0; i < IPsLength; i++) {
				var ip = mupJson.openToThisIPs[i];
				var blocks = ip.split('.');
				if (blocks.length !== 4) {
					IPsValid = false;
				} else {
					for (var j = 0; j < blocks.length; j++) {
						var block = parseInt(blocks[j]);
						if (isNaN(block) && (block < 1 || block > 255)) {
							IPsValid = false;
						}
					}
				}
			}
			if (!IPsValid) {
				mupErrorLog('At least one IP of the array is not valid');
			}
		}

		// maxCPUQuota: from 0.1 to 0.9
		// Is the maximum percentage of cpu that can be used from the total computation of the system
		// Default: 0.9 (90%)
		if (!mupJson.maxCPUQuota) {
			mupJson.maxCPUQuota = 0.9;
		}
		if (typeof mupJson.maxCPUQuota !== 'number') {
			mupJson.maxCPUQuota = parseFloat(mupJson.maxCPUQuota);
		}
		if (mupJson.maxCPUQuota > 0.9) {
			mupErrorLog('maxCPUQuota cannot be greater than 0.9');
		}
		if (mupJson.maxCPUQuota < 0.1) {
			mupErrorLog('maxCPUQuota cannot be lower than 0.1');
		}

		if (mupJson.volumes && mupJson.volumes.length) {
			mupJson.volumes = ['/opt/backups:/backups'].concat(mupJson.volumes);
		} else {
			mupJson.volumes = ['/opt/backups:/backups'];
		}
		mupJson.volumes = mupJson.volumes.reduce(function (v, n) {return '--volume=' + n + ' ' + v}, '');
		
		return mupJson;
	} else {
		var message =
			'configuration file ' + configFileName + ' does not exist!'.red.bold;
		console.error(message);
		helpers.printHelp();
		process.exit(1);
	}

	function rewritePath(location, errorMessage) {
		if (!location) {
			return mupErrorLog(errorMessage);
		}

		var homeLocation = process.env.HOME;
		if (/^win/.test(process.platform)) {
			homeLocation = process.env.USERPROFILE;
		}

		var location = location.replace('~', homeLocation).trim();
		if (location.indexOf(0) !== "/" || location.indexOf(0) !== "\\") {
			// if path does not start with / or \ (on windows)
			// we need to make sure, they are from the basedir
			// but not from the current dir
			location = path.resolve(basedir, location);
		} else {
			// anyway, we need to resolve path for windows compatibility
			location = path.resolve(location);
		}
		if (!fs.existsSync(location)) {
			mupErrorLog(errorMessage);
		}

		return location;
	}

	function mupErrorLog(message) {
		var errorMessage = 'Invalid configuration file ' + configFileName + ': ' + message;
		console.error(errorMessage.red.bold);
		process.exit(1);
	}
};
