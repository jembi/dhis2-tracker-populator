'use strict';

var Assert = require('assert');
var FS = require('fs');
var Parse = require('csv-parse');
var Path = require('path');

Assert.equal(process.argv.length, 3, 'Incorrect number of arguments');

var filename = process.argv[2];
var headers = null;
var count = 0;

var path = Path.basename(filename, '.csv');
FS.mkdirSync(path);

var parser = Parse();

parser.on('readable', function() {
  if (!headers) {
    headers = parser.read();
  }
  var row;
  while (row = parser.read()) {
    FS.writeFileSync(Path.join(path, filename + (count++)), headers.join(',') + '\n' + row.join(','));
  }
});

FS.createReadStream(filename).pipe(parser);
