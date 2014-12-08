'use strict';

var Assert = require('assert');
var Async = require('async');
var FS = require('fs');
var Parse = require('csv-parse');
var Path = require('path');
var Request = require('request');
var Transform = require('stream-transform');
var URL = require('url');
var Winston = require('winston');

var logger = new Winston.Logger({
  transports: [
    new Winston.transports.Console({level: 'info', colorize: true}),
    new Winston.transports.File({level: 'error', filename: 'error.log'})
  ]
});

var trackedEntityAttributeTypes = {};
var dataElementTypes = {};
// ID of a unique attribute to look up existing tracked entity instances
var firstUniqueTrackedEntityAttributeID = null;

function createTrackedEntityAttribute(key, value) {
  var attribute = {
    attribute: key,
    value: value
  };
  if (trackedEntityAttributeTypes[key] === 'number') {
    attribute.value = parseInt(attribute.value);
  }
  return attribute;
}

function createDataElement(key, value) {
  var dataElement = {
    dataElement: key,
    value: value
  };
  if (dataElementTypes[key] === 'int') {
    dataElement.value = parseInt(dataElement.value);
  }
  return dataElement;
}

module.exports = function(options, callback) {
  callback = callback || function(){};
  if (!!options.debug) {
    logger.transports.console.level = 'debug';
  }

  function getTrackedEntityAttributeType(trackedEntityAttributeID, next) {
    if (!!trackedEntityAttributeTypes[trackedEntityAttributeID]) {
      return next();
    }
    logger.info('Getting tracked entity attribute type for', trackedEntityAttributeID);
    Request.get({
      url: URL.resolve(options.url, 'api/trackedEntityAttributes/' + trackedEntityAttributeID),
      json: true
    }, function(err, res, body) {
      if (err) {
        return next(err);
      }
      if (res.statusCode !== 200) {
        return next(new Error('Unexpected status code ' + res.statusCode));
      }
      trackedEntityAttributeTypes[trackedEntityAttributeID] = body.valueType;
      if (!firstUniqueTrackedEntityAttributeID && body.unique === true) {
        firstUniqueTrackedEntityAttributeID = trackedEntityAttributeID;
      }
      next();
    });
  }

  function getDataElementType(dataElementID, next) {
    if (!!dataElementTypes[dataElementID]) {
      return next();
    }
    logger.info('Getting data element type for', dataElementID);
    Request.get({
      url: URL.resolve(options.url, 'api/dataElements/' + dataElementID),
      json: true
    }, function(err, res, body) {
      if (err) {
        return next(err);
      }
      if (!~[200, 404].indexOf(res.statusCode)) {
        return next(new Error('Unexpected status code ' + res.statusCode));
      }
      dataElementTypes[dataElementID] = body.type;
      next();
    });
  }

  function addTrackedEntity(trackedEntityID, knownKeys, trackedEntityAttributes, next) {
    logger.info('Adding tracked entity');
    var payload = {
      trackedEntity: trackedEntityID,
      orgUnit: knownKeys.orgUnit,
      attributes: []
    };
    for (var key in trackedEntityAttributes) {
      payload.attributes.push(createTrackedEntityAttribute(key, trackedEntityAttributes[key]));
    }
    logger.debug('Registration payload:', payload);

    Request.post({
      url: URL.resolve(options.url, 'api/trackedEntityInstances'),
      json: payload
    }, function(err, res, body) {
      if (err) {
        return next(err);
      }
      if (res.statusCode !== 201) {
        return next(new Error('Unexpected status code ' + res.statusCode));
      }
      if (!body) {
        return next(new Error('Invalid response body'));
      }
      if (body.status !== 'SUCCESS') {
        if (body.conflicts.length === 1 && /non-unique/i.test(body.conflicts[0].value)) {
          logger.warn('Tracked entity already exists');
          var value = trackedEntityAttributes[firstUniqueTrackedEntityAttributeID];
          if (!value) {
            return next(new Error('No unique attributes found'));
          }
          if (trackedEntityAttributeTypes[firstUniqueTrackedEntityAttributeID] === 'number') {
            value = parseInt(value);
          }
          Request.get({
            url: URL.resolve(options.url, 'api/trackedEntityInstances?ou=' + knownKeys.orgUnit +
                '&attribute=' + firstUniqueTrackedEntityAttributeID + ':EQ:' + value),
            json: true
          }, function(err, res, body) {
            if (err) {
              return next(err);
            }
            return next(null, body.rows[0][0]);
          });
          return;
        }
        logger.debug('Response error:', body);
        return next(new Error('Adding tracked entity failed'));
      }
      next(null, body.reference);
    });
  }

  function enrollInProgram(programID, knownKeys, trackedEntityInstanceID, next) {
    logger.info('Enrolling in program');
    var payload = {
      program: programID,
      trackedEntityInstance: trackedEntityInstanceID,
      dateOfEnrollment: knownKeys.programDate,
      dateOfIncident: knownKeys.programDate
    };
    logger.debug('Enrollment payload:', payload);

    Request.post({
      url: URL.resolve(options.url, 'api/enrollments'),
      json: payload
    }, function(err, res, body) {
      if (err) {
        return next(err);
      }
      if (res.statusCode === 409) {
        logger.warn('Tracked entity already enrolled');
        return next(null, trackedEntityInstanceID);
      }
      if (!body) {
        return next(new Error('Invalid response body'));
      }
      if (body.status !== 'SUCCESS') {
        logger.warn('Tracked entity already enrolled');
        return next(null, trackedEntityInstanceID);
      }
      next(null, trackedEntityInstanceID);
    });
  }

  function addEvent(programID, stageID, knownKeys, dataElements, trackedEntityInstanceID, next) {
    logger.info('Adding event');
    var payload = {
      program: programID,
      programStage: stageID,
      trackedEntityInstance: trackedEntityInstanceID,
      orgUnit: knownKeys.orgUnit,
      storedBy: 'admin',
      eventDate: knownKeys.eventDate,
      dataValues: []
    };
    for (var key in dataElements) {
      payload.dataValues.push(createDataElement(key, dataElements[key]));
    }
    logger.debug('Event payload:', payload);

    Request.post({
      url: URL.resolve(options.url, 'api/events'),
      json: payload
    }, function(err, res, body) {
      if (err) {
        return next(err);
      }
      if (res.statusCode > 203 || body && body.importSummaries[0].status !== 'SUCCESS') {
        logger.debug('Response error:', body);
        return next(new Error('Adding event failed'));
      }
      next();
    });
  }

  // Run through each file in the directory in series
  var fileQueue = FS.readdirSync(options.csvPath);
  if (fileQueue.length === 0) {
    logger.warn('No csv files found');
    return callback();
  }
  Async.eachSeries(fileQueue, function(filename, done) {
    logger.info('Proccessing file', filename);

    // Set up a new parser
    var parser = Parse({
      columns: true
    });

    // Set up a new transformer
    var filenameParts = filename.split('.');
    if (filenameParts.length !== 4) {
      logger.error('Incorrect filename format: expected programID.stageID.entityID.csv, got', filename);
      return done(new Error('Incorrect filename format'));
    }
    var transformer = Transform(function(row, next) {
      logger.info('Proccessing row');
      var knownKeys = {};
      var trackedEntityAttributes = {};
      var dataElements = {};
      for (var key in row) {
        var value = row[key];
        if (value === 'NULL') {
          value = '';
        }
        var keyParts = key.split('|');
        // Known keys e.g. orgUnit
        if (keyParts.length === 1) {
          knownKeys[key] = value;
          continue;
        }
        // Tracked entity attributes
        if (keyParts[0] === 'A') {
          trackedEntityAttributes[keyParts[1]] = value;
          continue;
        }
        // Data elements
        if (keyParts[0] === 'DE') {
          dataElements[keyParts[1]] = value;
          continue;
        }
      }
      Async.waterfall([
        // Populate the map of tracked entity attributes to type
        Async.each.bind(null, Object.keys(trackedEntityAttributes), getTrackedEntityAttributeType),
        // Populate the map of data elements to type
        Async.each.bind(null, Object.keys(dataElements), getDataElementType),
        // Track the entity
        addTrackedEntity.bind(null, filenameParts[2], knownKeys, trackedEntityAttributes),
        // Enroll in the program
        enrollInProgram.bind(null, filenameParts[0], knownKeys),
        // Add the event
        addEvent.bind(null, filenameParts[0], filenameParts[1], knownKeys, dataElements)
      ], next);
    }, {parallel: 1});

    // Read the file and pipe its contents to the parser and then the transformer
    var path = Path.join(options.csvPath, filename);
    var stream = FS.createReadStream(path).pipe(parser).pipe(transformer);
    stream.on('error', function(err) {
      logger.error('Processing file failed', {err: err.message, filename: filename});
      FS.renameSync(path, Path.join(options.failPath, filename));
      done();
    });
    stream.on('finish', function() {
      logger.info('Finished processing file', {filename: filename});
      FS.renameSync(path, Path.join(options.donePath, filename));
      done();
    });
  }, callback);
};
