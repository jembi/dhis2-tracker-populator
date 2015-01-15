'use strict';

var Async = require('async');
var Logger = require('./logger');
var Moment = require('moment');
var Request = require('request');
var TypeCache = require('./typeCache');
var URL = require('url');
var Util = require('util');
var Writable = require('stream').Writable;

function Populator(options) {
  if (typeof options.duplicateThreshold !== 'number') {
    options.duplicateThreshold = -1;
  }
  this._options = options;

  // Set up the queue
  this._queue = Async.queue(this._processRow.bind(this), 1);
  this._queue.drain = this.emit.bind(this, 'drain');

  Writable.call(this, {objectMode: true});
}

Util.inherits(Populator, Writable);

Populator.prototype._write = function(chunk, encoding, callback) {
  this._queue.push(chunk, callback);
  return false;
};

Populator.prototype._processRow = function(row, next) {
  Logger.info('Proccessing row');

  var tasks = [
    // Populate the map of tracked entity attributes to type
    Async.each.bind(null, Object.keys(row.attributes), this._getTrackedEntityAttributeType.bind(this)),
    // Populate the map of data elements to type
    Async.each.bind(null, Object.keys(row.dataElements), this._getDataElementType.bind(this)),
    // Track the entity
    this._addTrackedEntity.bind(this, row.parameters, row.attributes),
    // Enroll in the program
    this._enrollInProgram.bind(this, row.parameters),
    // Add the event
    this._addEvent.bind(this, row.parameters, row.dataElements)
  ];

  if (this._options.duplicateThreshold >= 0) {
    // Check for duplicate events
    tasks.splice(4, 0, this._checkForDuplicateEvent.bind(this, row.parameters));
  }

  Async.waterfall(tasks, next);
};

Populator.prototype._getTrackedEntityAttributeType = function(trackedEntityAttributeID, next) {
  if (!!TypeCache.trackedEntityAttributeTypes[trackedEntityAttributeID]) {
    return next();
  }
  Logger.info('Getting tracked entity attribute type for', trackedEntityAttributeID);
  Request.get({
    url: URL.resolve(this._options.url, 'api/trackedEntityAttributes/' + trackedEntityAttributeID),
    json: true
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    if (res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    TypeCache.trackedEntityAttributeTypes[trackedEntityAttributeID] = body.valueType;
    if (!TypeCache.firstUniqueTrackedEntityAttributeID && body.unique === true) {
      TypeCache.firstUniqueTrackedEntityAttributeID = trackedEntityAttributeID;
    }
    next();
  });
};

Populator.prototype._getDataElementType = function(dataElementID, next) {
  if (!!TypeCache.dataElementTypes[dataElementID]) {
    return next();
  }
  Logger.info('Getting data element type for', dataElementID);
  Request.get({
    url: URL.resolve(this._options.url, 'api/dataElements/' + dataElementID),
    json: true
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    if (!~[200, 404].indexOf(res.statusCode)) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    TypeCache.dataElementTypes[dataElementID] = body.type;
    next();
  });
};

Populator.prototype._addTrackedEntity = function(knownKeys, trackedEntityAttributes, next) {
  Logger.info('Adding tracked entity');
  var payload = {
    trackedEntity: this._options.trackedEntityID,
    orgUnit: knownKeys.orgUnit,
    attributes: []
  };
  for (var key in trackedEntityAttributes) {
    payload.attributes.push(TypeCache.createTrackedEntityAttribute(key, trackedEntityAttributes[key]));
  }
  Logger.debug('Registration payload:', payload);

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, 'api/trackedEntityInstances'),
    json: payload
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    this.emit('addTrackedEntityResponse', res, {
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: JSON.parse(request.body.toString()),
      timestamp: requestTime
    });
    if (res.statusCode !== 201) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    if (typeof body === 'string') {
      return next(new Error('Could not parse response body'));
    }
    if (body.status !== 'SUCCESS') {
      if (body.conflicts.length === 1 && /non-unique/i.test(body.conflicts[0].value)) {
        Logger.warn('Tracked entity already exists');
        return this._getTrackedEntityInstanceID(knownKeys, trackedEntityAttributes, function(err, trackedEntityInstanceID) {
          if (err) {
            return next(err);
          }
          this._updateTrackedEntityInstance(knownKeys, trackedEntityAttributes, trackedEntityInstanceID, next);
        }.bind(this));
      }
      Logger.debug('Response error:', body);
      return next(new Error('Adding tracked entity failed'));
    }
    next(null, body.reference);
  }.bind(this));
};

Populator.prototype._getTrackedEntityInstanceID = function(knownKeys, trackedEntityAttributes, next) {
  Logger.info('Getting existing tracked entity instance');
  var value = trackedEntityAttributes[TypeCache.firstUniqueTrackedEntityAttributeID];
  if (!value) {
    return next(new Error('No unique attributes found'));
  }
  if (TypeCache.trackedEntityAttributeTypes[TypeCache.firstUniqueTrackedEntityAttributeID] === 'number') {
    value = parseInt(value);
  }
  Request.get({
    url: URL.resolve(this._options.url, 'api/trackedEntityInstances'),
    qs: {
      ou: knownKeys.orgUnit,
      attribute: TypeCache.firstUniqueTrackedEntityAttributeID + ':EQ:' + value
    },
    json: true
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    return next(null, body.rows[0][0]);
  });
};

Populator.prototype._updateTrackedEntityInstance = function(knownKeys, trackedEntityAttributes, trackedEntityInstanceID, next) {
  Logger.info('Updating existing tracked entity instance');
  var payload = {
    trackedEntity: this._options.trackedEntityID,
    orgUnit: knownKeys.orgUnit,
    attributes: []
  };
  for (var key in trackedEntityAttributes) {
    payload.attributes.push(TypeCache.createTrackedEntityAttribute(key, trackedEntityAttributes[key]));
  }
  Logger.debug('Update payload:', payload);

  var requestTime = Date.now();
  var request = Request.put({
    url: URL.resolve(this._options.url, 'api/trackedEntityInstances/' + trackedEntityInstanceID),
    json: payload
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    this.emit('updateTrackedEntityInstanceResponse', res, {
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: JSON.parse(request.body.toString()),
      timestamp: requestTime
    });
    if (res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    if (body.status !== 'SUCCESS') {
      return next(new Error('Updating tracked entity failed'));
    }
    next(null, trackedEntityInstanceID);
  }.bind(this));
};

Populator.prototype._enrollInProgram = function(knownKeys, trackedEntityInstanceID, next) {
  Logger.info('Enrolling in program');
  var payload = {
    program: this._options.programID,
    trackedEntityInstance: trackedEntityInstanceID,
    dateOfEnrollment: knownKeys.programDate,
    dateOfIncident: knownKeys.programDate
  };
  Logger.debug('Enrollment payload:', payload);

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, 'api/enrollments'),
    json: payload
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    this.emit('enrollInProgramResponse', res, {
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: JSON.parse(request.body.toString()),
      timestamp: requestTime
    });
    if (res.statusCode === 409) {
      Logger.warn('Tracked entity already enrolled');
      return next(null, trackedEntityInstanceID);
    }
    if (!body) {
      return next(new Error('Invalid response body'));
    }
    if (body.status !== 'SUCCESS') {
      Logger.warn('Tracked entity already enrolled');
      return next(null, trackedEntityInstanceID);
    }
    next(null, trackedEntityInstanceID);
  }.bind(this));
};

Populator.prototype._checkForDuplicateEvent = function(knownKeys, trackedEntityInstanceID, next) {
  Logger.info('Checking for duplicate event');

  var eventDate = Moment(knownKeys.eventDate, ['YYYY-MM-DD']);
  if (!eventDate.isValid() || eventDate.parsingFlags().overflow !== -1 || eventDate.parsingFlags().charsLeftOver !== 0) {
    return next(new Error('Invalid date ' + knownKeys.eventDate));
  }

  Request.get({
    url: URL.resolve(this._options.url, 'api/events'),
    qs: {
      program: this._options.programID,
      programStage: this._options.stageID,
      trackedEntityInstance: trackedEntityInstanceID,
      orgUnit: knownKeys.orgUnit,
      startDate: eventDate.subtract(this._options.duplicateThreshold, 'days').format('YYYY-MM-DD')
    },
    json: true
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }

    if (res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }

    if (!body.events || body.events.length === 0) {
      return next(null, trackedEntityInstanceID);
    }

    next(new Error('Duplicate event'));
  });
};

Populator.prototype._addEvent = function(knownKeys, dataElements, trackedEntityInstanceID, next) {
  Logger.info('Adding event');
  var payload = {
    program: this._options.programID,
    programStage: this._options.stageID,
    trackedEntityInstance: trackedEntityInstanceID,
    orgUnit: knownKeys.orgUnit,
    storedBy: 'admin',
    eventDate: knownKeys.eventDate,
    dataValues: []
  };
  for (var key in dataElements) {
    payload.dataValues.push(TypeCache.createDataElement(key, dataElements[key]));
  }
  Logger.debug('Event payload:', payload);

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, 'api/events'),
    json: payload
  }, function(err, res, body) {
    if (err) {
      return next(err);
    }
    this.emit('addEventResponse', res, {
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: JSON.parse(request.body.toString()),
      timestamp: requestTime
    });
    if (res.statusCode > 203 || !body || body.importSummaries[0].status !== 'SUCCESS') {
      Logger.debug('Response error:', body);
      return next(new Error('Adding event failed'));
    }
    next();
  }.bind(this));
};

module.exports = Populator;
