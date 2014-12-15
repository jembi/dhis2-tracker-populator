#!/usr/bin/env node
'use strict';

var FS = require('fs');
var Parse = require('csv-parse');
var Path = require('path');

if (process.argv.length !== 3) {
  console.log('Incorrect number of arguments');
  console.log('\nUsage: ./bin/split.js PATH_TO_CSV_FILE');
  process.exit(1);
}

var inputPath = process.argv[2];
var outputPath = Path.basename(inputPath, '.csv');

if (FS.existsSync(outputPath)) {
  console.error('Output directory already exists:', outputPath);
  process.exit(1);
}
FS.mkdirSync(outputPath);

var parser = Parse();
var headers = null;
var filename = Path.basename(inputPath);
var count = 0;

parser.on('readable', function() {
  if (!headers) {
    headers = parser.read();
  }
  var row;
  while (!!(row = parser.read())) {
    FS.writeFileSync(Path.join(outputPath, filename + (count++)), headers.join(',') + '\n' + row.join(','));
  }
});

FS.createReadStream(inputPath).pipe(parser);
