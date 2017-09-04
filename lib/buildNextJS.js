var spawn = require('child_process').spawn;
var archiver = require('archiver');
var fs = require('fs');
var pathResolve = require('path').resolve;
var _ = require('underscore');

function bundleSources(appPath, buildLocation, dirExclusions, callback) {
  try {
    callback = _.once(callback);
    var bundlePath = pathResolve(buildLocation, 'bundle.tar.gz');
    var sourceDir = pathResolve(process.cwd(), appPath);
    console.log('Source dir: ', sourceDir);

    var output = fs.createWriteStream(bundlePath);
    var archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 6
      }
    });

    archive.pipe(output);
    output.once('close', callback);

    archive.once('error', function(err) {
      console.log("=> Archiving failed:", err.message);
      callback(err);
    });

    var filenames = fs.readdirSync(sourceDir);
    for(var i = 0; i < filenames; i++) {
      var filename = filenames[i];
      if(dirExclusions.some(function (exclusion) { return filename === exclusion; }) || filename[0] === '.') {
        continue;
      }
      var filePath = pathResolve(sourceDir, filename);
      var stats = fs.statSync(filePath);
      if(stats.isDirectory()) {
        archive.directory(filePath, false);
      } else {
        archive.file(filePath, false);
      }
    }
    archive.finalize();
  }
  catch(err) {
    callback(err);
  }
}

module.exports = bundleSources;
