'use strict';

var Async = require('async');
var FS = require('fs');
var Logger = require('./logger');
var Parse = require('csv-parse');
var Path = require('path');
var Populator = require('./populator');
var RowTransformer = require('./rowTransformer');

function setUpLogging(populator) {
  populator.on('processRow', Logger.info.bind(null, 'Processing row'));
  populator.on('getTrackedEntityAttributeType', Logger.info.bind(null, 'Getting tracked entity attribute type %s'));
  populator.on('getDataElementType', Logger.info.bind(null, 'Getting data element type %s'));
  populator.on('addTrackedEntity', Logger.info.bind(null, 'Adding tracked entity'));
  populator.on('addTrackedEntityResponse', function (response, request) {
    Logger.debug('Add tracked entity response', {
      request: request,
      response: response
    });
  });
  populator.on('getTrackedEntityInstanceID', Logger.info.bind(null, 'Getting tracked entity instance ID'));
  populator.on('updateTrackedEntityInstance', Logger.info.bind(null, 'Updating tracked entity instance'));
  populator.on('updateTrackedEntityInstanceResponse', function (response, request) {
    Logger.debug('Update tracked entity instance response', {
      request: request,
      response: response
    });
  });
  populator.on('enrollInProgram', Logger.info.bind(null, 'Enrolling in program'));
  populator.on('enrollInProgramResponse', function (response, request) {
    Logger.debug('Enroll in program response', {
      request: request,
      response: response
    });
  });
  populator.on('checkForDuplicateEventUsingDuplicateThreshold', Logger.info.bind(null, 'Checking for duplicate event using duplicate threshold'));
  populator.on('addEvent', Logger.info.bind(null, 'Adding event'));
  populator.on('addEventResponse', function (response, request) {
    Logger.debug('Add event response', {
      request: request,
      response: response
    });
  });
}

module.exports = function (options, callback) {
  callback = callback || function () {};

  if (!!options.debug) {
    Logger.transports.console.level = 'debug';
  }

  // Run through each file in the directory in series
  var fileQueue = FS.readdirSync(options.csvPath);
  if (fileQueue.length === 0) {
    Logger.warn('No csv files found');
    return callback();
  }
  Async.eachSeries(fileQueue, function (filename, next) {
    Logger.info('Proccessing file', filename);

    // Set up a new parser
    var parser = Parse({
      columns: true
    });

    // Set up a new row transformer
    var transformer = new RowTransformer();

    // Set up a new populator
    var filenameParts = filename.split('.');
    if (filenameParts.length !== 4) {
      Logger.error('Incorrect filename format: expected programID.stageID.entityID.csv, got', filename);
      return next(new Error('Incorrect filename format'));
    }
    var populator = new Populator({
      url: options.url,
      programID: filenameParts[0],
      stageID: filenameParts[1],
      trackedEntityID: filenameParts[2],
      duplicateThreshold: options.threshold,
      dhisVersion: options.dhisVersion
    });

    setUpLogging(populator);

    // Read the file and pipe its contents to the parser and then the populator
    var path = Path.join(options.csvPath, filename);
    var stream = FS.createReadStream(path).pipe(parser).pipe(transformer).pipe(populator);
    stream.on('error', function (err) {
      Logger.error('Processing file failed', {
        err: err.message,
        filename: filename
      });
      FS.renameSync(path, Path.join(options.failPath, filename));
      next();
    });
    stream.on('finish', function () {
      Logger.info('Finished processing file', {
        filename: filename
      });
      FS.renameSync(path, Path.join(options.donePath, filename));
      next();
    });
  }, callback);
};
