#!/usr/bin/env node
'use strict';

var FS = require('fs');
var Minimist = require('minimist');
var Package = require('../package.json');
var Path = require('path');
var Populator = require('../lib/populator');

var HELP = [
  '\nUsage: ' + Package.name + ' [OPTIONS] URL',
  '\nOptions:',
  '  -c, --csv   Path to the directory containing the csv files',
  '  -d, --done  Path to the directory in which to place the done files',
  '  -f, --fail  Path to the directory in which to place the failed files',
  '',
  '  --help      Show this help',
  '  --version   Print the version and exit'
].join('\n');

function showHelp() {
  console.log(HELP);
}

function ensureTrailingSlash(url) {
  if (url.substring(url.length - 1) !== '/') {
    return url + '/';
  }
  return url;
}

function checkPath(path) {
  if (!FS.existsSync(path)) {
    console.log('Directory does not exist:', Path.resolve('.', path));
    showHelp();
    process.exit(1);
  }
}

var argumentOptions = {
  boolean: ['debug', 'help', 'version'],
  string: ['csvPath', 'donePath', 'failPath'],
  alias: {
    csvPath: ['csv', 'c'],
    donePath: ['done', 'd'],
    failPath: ['fail', 'f']
  },
  default: {
    csvPath: 'csv',
    donePath: 'csvdone',
    failPath: 'csvfail',
    debug: false
  }
};

var argv = Minimist(process.argv.slice(2), argumentOptions);

if (argv.help) {
  showHelp();
  process.exit(0);
}

if (argv.version) {
  console.log('v' + Package.version);
  process.exit(0);
}

if (argv._.length !== 1) {
  console.error('Incorrect number of arguments');
  showHelp();
  process.exit(1);
}
argv.url = ensureTrailingSlash(argv._[0]);

checkPath(argv.csvPath);
checkPath(argv.donePath);
checkPath(argv.failPath);

Populator(argv);
