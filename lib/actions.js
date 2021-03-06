var nodemiral = require('nodemiral');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var uuid = require('uuid');
var format = require('util').format;
var extend = require('util')._extend;
var _ = require('underscore');
var async = require('async');
var buildApp = require('./build.js');
var buildAppNextJS = require('./buildNextJS.js');
var request = require('request');
var pkg = require('../package.json');

require('colors');

var NEXTJS_DIR_DEFAULT_EXCLUSIONS = ['node_modules', '__test__', '__tests__'];

module.exports = Actions;

function Actions(config, cwd, options) {
	this.cwd = cwd;
	this.config = config;
	this.sessionsMap = this._createSessionsMap(config);
	this.settingsFileName = options.settingsFileName;
	this.configFileName = options.configFileName;

	//get settingsFileName into env
	var setttingsJsonPath = path.resolve(this.cwd, this.settingsFileName);
	if (fs.existsSync(setttingsJsonPath)) {
		this.config.env['METEOR_SETTINGS'] = JSON.stringify(require(setttingsJsonPath));
	}
}

Actions.prototype._createSessionsMap = function (config) {
	var sessionsMap = {};

	config.servers.forEach(function (server) {
		var host = server.host;
		var auth = {username: server.username};

		if (server.pem) {
			auth.pem = fs.readFileSync(path.resolve(server.pem), 'utf8');
		} else {
			auth.password = server.password;
		}

		var nodemiralOptions = {
			ssh: server.sshOptions,
			keepAlive: true
		};

		if (!sessionsMap[server.os]) {
			sessionsMap[server.os] = {
				sessions: [],
				taskListsBuilder: require('./taskLists')(server.os)
			};
		}

		var session = nodemiral.session(host, auth, nodemiralOptions);
		session._serverConfig = server;
		sessionsMap[server.os].sessions.push(session);
	});

	return sessionsMap;
};

Actions.prototype._executePararell = function (actionName, args) {
	var self = this;
	var sessionInfoList = _.values(self.sessionsMap);
	async.map(
		sessionInfoList,
		function (sessionsInfo, callback) {
			var taskList = sessionsInfo.taskListsBuilder[actionName]
				.apply(sessionsInfo.taskListsBuilder, args);
			taskList.run(sessionsInfo.sessions, function (summaryMap) {
				callback(null, summaryMap);
			});
		},
		whenAfterCompleted
	);
};

Actions.version = function () {
  console.log('Version: '.bold + pkg.version);
  console.log('');
}

Actions.prototype.setup = function () {
	if(this.config.containersConfig === true) {
		var intVersion = parseInt(pkg.version.replace(/\./g, ''));
		if (!this.config.containerName) {
			console.error('Missing "containerName" property for setting up a container like instance'.red.bold);
			process.exit(1);
		}
		console.log('Setup of container-like server!! This may take a while... for sure...'.bold);
		var self = this;
		var serverHost = this.config.servers[0].host;
		var taskUrl = 'http://' + serverHost + ':12654/task';
		request({
			uri: taskUrl,
			method: 'POST',
			timeout: 1200000,
			json: {
				action: 'setupContainer',
				v: intVersion,
				pwd: self.config.APIPassword,
				options: {
					name: self.config.containerName,
					nodeVersion: self.config.nodeVersion,
					maxCPUQuota: self.config.maxCPUQuota,
          openToThisIPs: self.config.openToThisIPs,
          serverName: serverHost,
				}
			}
		}, function (err, res, body) {
			if(err) {
				console.log(('Error while calling: ' + taskUrl).red.bold);
				console.log('Error obj: '.red.bold, err);
				process.exit(1);
			}
			var containerResponse;
      var server = self.config.servers[0];
      if(typeof body === 'string') {
        containerResponse = JSON.parse(body);
      } else {
        containerResponse = body;
      }
			if(!server.password || !server.sshOptions || !server.sshOptions.port) {	
				if(!containerResponse) {
					console.log(('No response from task: ' + taskUrl).red.bold);
					console.log('Full response object: '.red.bold, res);
					process.exit(1);
				}
				if (containerResponse.error === 'Unauthorized!') {
					console.log(('The password for the configuration API is not valid').red.bold);
					process.exit(1);
				}
				if (containerResponse.error) {
					console.log(containerResponse.error.red.bold);
					process.exit(1);
				}
				var port = parseInt(containerResponse._port);
				if(server.sshOptions) {
					server.sshOptions.port = port;
				} else {
					server.sshOptions = { port: port };
				}
				server.password = containerResponse._password;
				var sshAgent = process.env.SSH_AUTH_SOCK;
				if (sshAgent) {
					server.sshOptions.agent = sshAgent;
				}
        self.sessionsMap['linux'].sessions[0] = nodemiral.session(serverHost, {username: server.username, password: containerResponse._password}, { ssh: server.sshOptions, keepAlive: true });
        if (containerResponse._password) {
          var configFile = path.resolve(self.cwd, self.configFileName);
          var mupContent = fs.readFileSync(configFile, {encoding: 'utf8'});
          mupContent = mupContent.replace(/\/\/{{PASSWORD}}/g, '"password":"' + containerResponse._password + '",').replace(/\/\/{{SSH_OPTIONS}}/g, '"sshOptions":{"port":' + port + '},');
          fs.writeFileSync(configFile, mupContent);
        }
      }
      if (containerResponse.openMongoURL) {
        try {
          var settingsFile = path.resolve(self.cwd, self.settingsFileName);
          var settingsContent = fs.readFileSync(settingsFile, {encoding: 'utf8'});
          if (!/"openMongoURL"/.test(settingsContent)) {
            const privateRegExp = /(.*"private".*)/;
            if (privateRegExp.test(settingsContent)) {
              settingsContent = settingsContent.replace(/(.*"private".*)/, '$1\r\n    "openMongoURL": "' + containerResponse.openMongoURL + '",');
              fs.writeFileSync(settingsFile, settingsContent);
            }
          }
        } catch (err) {
          console.log(err);
          // fs.writeFileSync(settingsFile, '{ "openMongoURL": "' + containerResponse.openMongoURL + '" }');
        }
      }
			request({
				uri: taskUrl,
				method: 'POST',
				timeout: 1200000,
				json: {
					action: 'setupNginx',
					v: intVersion,
					pwd: self.config.APIPassword,
					options: {
						name: self.config.containerName,
						port: self.config.env && self.config.env.PORT[0], // TODO: Check if more than 1 and config HAProxy load balancer (API maybe??)
						host: ((self.config.env && self.config.env.ROOT_URL) || '').split('//').pop().replace(/\//g, '')
					}
				}
			}, function (err2, res2, body2) {
				if(err2) {
					console.log(('Error while calling: ' + taskUrl).red.bold);
					console.log('Error obj: '.red.bold, err2);
					process.exit(1);
				}
				var containerResponse;
				if(typeof body2 === 'string') {
					containerResponse = JSON.parse(body2);
				} else {
					containerResponse = body2;
				}
				if(!containerResponse) {
					console.log(('No response from task: ' + taskUrl).red.bold);
					console.log('Full response object: '.red.bold, res2);
					process.exit(1);
				}
				if (containerResponse.error === 'Unauthorized!') {
					console.log(('The password for the configuration API is not valid').red.bold);
					process.exit(1);
				}
				self._executePararell("setup", [self.config]);
			});
		});
	} else {
		this._executePararell("setup", [this.config]);
	}
};

Actions.prototype.deployMeteor = function () {
	var self = this;
	var buildLocation = path.resolve('/tmp', uuid.v4());
	var bundlePath = path.resolve(buildLocation, 'bundle.tar.gz');

	// spawn inherits env vars from process.env
	// so we can simply set them like this
	process.env.BUILD_LOCATION = buildLocation;

	var deployCheckWaitTime = this.config.deployCheckWaitTime;
	var appName = this.config.appName;
	var appPath = this.config.app;
	var buildOptions = this.config.buildOptions;

	console.log('Meteor app path    : ' + this.config.app);
	console.log('Using buildOptions : ' + JSON.stringify(buildOptions));
	buildApp(appPath, buildLocation, buildOptions, function (err) {
		if (err) {
			process.exit(1);
		} else {
			var sessionsData = [];
			_.forEach(self.sessionsMap, function (sessionsInfo) {
				var taskListsBuilder = sessionsInfo.taskListsBuilder;
				_.forEach(sessionsInfo.sessions, function (session) {
					sessionsData.push({
						taskListsBuilder: taskListsBuilder,
						session: session
					});
				});
			});

			async.mapSeries(
				sessionsData,
				function (sessionData, callback) {
					var session = sessionData.session;
					var taskListsBuilder = sessionData.taskListsBuilder
					var env = _.extend({}, self.config.env, session._serverConfig.env);
					var taskList = taskListsBuilder.deploy(
						bundlePath, env, self.config);
					taskList.run(session, function (summaryMap) {
						callback(null, summaryMap);
					});
				},
				whenAfterDeployed(buildLocation)
			)
		}
	});
}

Actions.prototype.deployNextJS = function () {
	var self = this;
	var buildLocation = path.resolve('/tmp', uuid.v4());
	var bundlePath = path.resolve(buildLocation, 'bundle.tar.gz');
	try {
		fs.mkdirSync(buildLocation);
	} catch(err) {
		console.log(err);
	}
	process.env.BUILD_LOCATION = buildLocation;

	var deployCheckWaitTime = this.config.deployCheckWaitTime;
	var appName = this.config.appName;
	var appPath = this.config.app;
	var dirExclusions = this.config.dirExclusions && Object.prototype.toString.call(this.config.dirExclusions) === '[object Array]' ? NEXTJS_DIR_DEFAULT_EXCLUSIONS.concat(this.config.dirExclusions) : NEXTJS_DIR_DEFAULT_EXCLUSIONS;

	console.log('NextJS app path    : ' + this.config.app);
	buildAppNextJS(appPath, buildLocation, dirExclusions, function (err) {
		if (err) {
			console.log(err);
			process.exit(1);
		} else {
			var sessionsData = [];
			_.forEach(self.sessionsMap, function (sessionsInfo) {
				var taskListsBuilder = sessionsInfo.taskListsBuilder;
				_.forEach(sessionsInfo.sessions, function (session) {
					sessionsData.push({
						taskListsBuilder: taskListsBuilder,
						session: session
					});
				});
			});

			async.mapSeries(
				sessionsData,
				function (sessionData, callback) {
					var session = sessionData.session;
					var taskListsBuilder = sessionData.taskListsBuilder
					var env = _.extend({}, self.config.env, session._serverConfig.env);
					var taskList = taskListsBuilder.deploy(
						bundlePath, env, self.config);
					taskList.run(session, function (summaryMap) {
						callback(null, summaryMap);
					});
				},
				whenAfterDeployed(buildLocation)
			)
		}
	});
}

Actions.prototype.deploy = function () {
	if(this.config.nextjs === true) {
		this.deployNextJS();
	} else {
		this.deployMeteor();
	}
};

Actions.prototype.reconfig = function () {
	var self = this;
	var sessionInfoList = [];
	for (var os in self.sessionsMap) {
		var sessionsInfo = self.sessionsMap[os];
		sessionsInfo.sessions.forEach(function (session) {
			var env = _.extend({}, self.config.env, session._serverConfig.env);
			var taskList = sessionsInfo.taskListsBuilder.reconfig(
				env, self.config);
			sessionInfoList.push({
				taskList: taskList,
				session: session
			});
		});
	}

	async.mapSeries(
		sessionInfoList,
		function (sessionsInfo, callback) {
			sessionsInfo.taskList.run(sessionsInfo.session, function (summaryMap) {
				callback(null, summaryMap);
			});
		},
		whenAfterCompleted
	);
};

Actions.prototype.restart = function () {
	this._executePararell("restart", [this.config]);
};

Actions.prototype.stop = function () {
	this._executePararell("stop", [this.config]);
};

Actions.prototype.start = function () {
	this._executePararell("start", [this.config]);
};

Actions.prototype.logs = function () {
	var self = this;
	var tailOptions = process.argv.slice(3).join(" ");

	var sessions = [];

	for (var os in self.sessionsMap) {
		var sessionsInfo = self.sessionsMap[os];
		sessionsInfo.sessions.forEach(function (session) {
			sessions.push(session);
		});
	}

	async.map(
		sessions,
		function (session, callback) {
			var hostPrefix = '[' + session._host + '] ';
			var options = {
				onStdout: function (data) {
					process.stdout.write(hostPrefix + data.toString());
				},
				onStderr: function (data) {
					process.stderr.write(hostPrefix + data.toString());
				}
			};

			var command = 'sudo docker logs ' + tailOptions + ' ' + self.config.appName;
			session.execute(command, options, callback);
		},
		whenAfterCompleted
	);
};

Actions.init = function () {
	var destMupJson = path.resolve('mup.json');
	var destSettingsJson = path.resolve('settings.json');

	if (fs.existsSync(destMupJson) || fs.existsSync(destSettingsJson)) {
		console.error('A Project Already Exists'.bold.red);
		process.exit(1);
	}

	var exampleMupJson = path.resolve(__dirname, '../example/mup.json');
	var exampleSettingsJson = path.resolve(__dirname, '../example/settings.json');

	copyFile(exampleMupJson, destMupJson);
	copyFile(exampleSettingsJson, destSettingsJson);

	console.log('Empty Project Initialized!'.bold.green);

	function copyFile(src, dest) {
		var content = fs.readFileSync(src, 'utf8');
		fs.writeFileSync(dest, content);
	}
};

function storeLastNChars(vars, field, limit, color) {
	return function (data) {
		vars[field] += data.toString();
		if (vars[field].length > 1000) {
			vars[field] = vars[field].substring(vars[field].length - 1000);
		}
	}
}

function whenAfterDeployed(buildLocation) {
	return function (error, summaryMaps) {
		rimraf.sync(buildLocation);
		whenAfterCompleted(error, summaryMaps);
	};
}

function whenAfterCompleted(error, summaryMaps) {
	var errorCode = error || haveSummaryMapsErrors(summaryMaps) ? 1 : 0;
	process.exit(errorCode);
}

function haveSummaryMapsErrors(summaryMaps) {
	return _.some(summaryMaps, hasSummaryMapErrors);
}

function hasSummaryMapErrors(summaryMap) {
	return _.some(summaryMap, function (summary) {
		return summary.error;
	})
}
