'use strict';

var Async = require('async');
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
  this._cache = new TypeCache();

  // Set up the queue
  this._queue = Async.queue(this._processRow.bind(this), 1);
  this._queue.drain = this.emit.bind(this, 'drain');

  Writable.call(this, {
    objectMode: true
  });
}

// Only adds the dhis version to DHIS URL if it is specified. This ensures backwards compatibility.
// Needed as DHIS v2.29 api has breaking changes so we need to use the older apis
function createDhisUrl(dhisVersion, dhisPath) {
  if (dhisVersion) {
    return 'api/' + dhisVersion + '/' + dhisPath
  }
  return 'api/' + dhisPath
}

Util.inherits(Populator, Writable);

Populator.prototype._write = function (chunk, encoding, callback) {
  this._queue.push(chunk, callback);
  return false;
};

Populator.prototype._processRow = function (row, next) {
  this.emit('processRow');
  var tasks = [];
  // Populate the map of tracked entity attributes to type
  tasks.push(Async.each.bind(null, Object.keys(row.attributes), this._getTrackedEntityAttributeType.bind(this)));
  // Populate the map of data elements to type
  tasks.push(Async.each.bind(null, Object.keys(row.dataElements), this._getDataElementType.bind(this)));
  // Track the entity
  tasks.push(this._addTrackedEntity.bind(this, row.parameters, row.attributes));
  if (this._options.programID && this.programDate) {
    // Enroll in the program
    tasks.push(this._enrollInProgram.bind(this, row.parameters));
  }
  if (this._options.stageID && this.eventDate) {
    // Track the events
    tasks.push(this._addEvent.bind(this, row.parameters, row.dataElements));
    if (this._options.duplicateThreshold >= 0) {
      // Check for duplicate events
      tasks.splice(4, 0, this._checkForDuplicateEvent.bind(this, row.parameters));
    }
  }

  Async.waterfall(tasks, next);
};

Populator.prototype._getTrackedEntityAttributeType = function (trackedEntityAttributeID, next) {
  if (!!this._cache.trackedEntityAttributeTypes[trackedEntityAttributeID]) {
    return next();
  }
  this.emit('getTrackedEntityAttributeType', trackedEntityAttributeID);
  Request.get({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'trackedEntityAttributes/' + trackedEntityAttributeID)),
    json: true
  }, function (err, res, body) {
    if (err) {
      return next(err);
    }
    if (res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    this._cache.trackedEntityAttributeTypes[trackedEntityAttributeID] = body.valueType;
    if (!this._cache.firstUniqueTrackedEntityAttributeID && body.unique === true) {
      this._cache.firstUniqueTrackedEntityAttributeID = trackedEntityAttributeID;
    }
    next();
  }.bind(this));
};

Populator.prototype._getDataElementType = function (dataElementID, next) {
  if (!!this._cache.dataElementTypes[dataElementID]) {
    return next();
  }
  this.emit('getDataElementType', dataElementID);
  Request.get({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'dataElements/' + dataElementID)),
    json: true
  }, function (err, res, body) {
    if (err) {
      return next(err);
    }
    if (!~[200, 404].indexOf(res.statusCode)) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    this._cache.dataElementTypes[dataElementID] = body.type;
    next();
  }.bind(this));
};

Populator.prototype._addTrackedEntity = function (knownKeys, trackedEntityAttributes, next) {
  this.emit('addTrackedEntity');
  var payload = {
    trackedEntityType: this._options.trackedEntityID,
    orgUnit: knownKeys.orgUnit,
    attributes: []
  };
  for (var key in trackedEntityAttributes) {
    payload.attributes.push(this._cache.createTrackedEntityAttribute(key, trackedEntityAttributes[key]));
  }

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'trackedEntityInstances')),
    json: payload
  }, function (err, res, body) {
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

    if (res.statusCode === 409) {
      if (body.response.importSummaries[0].conflicts.length === 1 && /non-unique/i.test(body.response.importSummaries[0].conflicts[0].value)) {
        return this._getTrackedEntityInstanceID(knownKeys, trackedEntityAttributes, function (err, trackedEntityInstanceID) {
          if (err) {
            return next(err);
          }
          this._updateTrackedEntityInstance(knownKeys, trackedEntityAttributes, trackedEntityInstanceID, next);
        }.bind(this));
      }
      return next(new Error('Adding tracked entity failed'));
    }
    if (res.statusCode !== 201 && res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    if (typeof body === 'string') {
      return next(new Error('Could not parse response body'));
    }
    next(null, body.response.importSummaries[0].reference);
  }.bind(this));
};

Populator.prototype._getTrackedEntityInstanceID = function (knownKeys, trackedEntityAttributes, next) {
  this.emit('getTrackedEntityInstanceID');
  var value = trackedEntityAttributes[this._cache.firstUniqueTrackedEntityAttributeID];
  if (!value) {
    return next(new Error('No unique attributes found'));
  }
  if (this._cache.trackedEntityAttributeTypes[this._cache.firstUniqueTrackedEntityAttributeID] === 'number') {
    value = parseInt(value);
  }
  Request.get({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'trackedEntityInstances')),
    qs: {
      ou: knownKeys.orgUnit,
      filter: this._cache.firstUniqueTrackedEntityAttributeID + ':EQ:' + value
    },
    json: true
  }, function (err, res, body) {
    if (err) {
      return next(err);
    }
    if (!body.trackedEntityInstances || !body.trackedEntityInstances[0]) {
      return next(new Error('Failed to look up existing tracked entity instance'));
    }
    return next(null, body.trackedEntityInstances[0].trackedEntityInstance);
  });
};

Populator.prototype._updateTrackedEntityInstance = function (knownKeys, trackedEntityAttributes, trackedEntityInstanceID, next) {
  this.emit('updateTrackedEntityInstance');
  var payload = {
    trackedEntityType: this._options.trackedEntityID,
    orgUnit: knownKeys.orgUnit,
    attributes: []
  };
  for (var key in trackedEntityAttributes) {
    payload.attributes.push(this._cache.createTrackedEntityAttribute(key, trackedEntityAttributes[key]));
  }

  var requestTime = Date.now();
  var request = Request.put({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'trackedEntityInstances/' + trackedEntityInstanceID)),
    json: payload
  }, function (err, res, body) {
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
    if (body.response.status !== 'SUCCESS') {
      return next(new Error('Updating tracked entity failed'));
    }
    next(null, trackedEntityInstanceID);
  }.bind(this));
};

Populator.prototype._enrollInProgram = function (knownKeys, trackedEntityInstanceID, next) {
  this.emit('enrollInProgram');
  var payload = {
    program: this._options.programID,
    orgUnit: knownKeys.orgUnit,
    trackedEntityInstance: trackedEntityInstanceID,
    enrollmentDate: knownKeys.programDate,
    incidentDate: knownKeys.programDate
  };

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'enrollments')),
    json: payload
  }, function (err, res, body) {
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
      return next(null, trackedEntityInstanceID);
    }
    if (!body) {
      return next(new Error('Invalid response body'));
    }
    if (body.status !== 'SUCCESS') {
      return next(null, trackedEntityInstanceID);
    }
    next(null, trackedEntityInstanceID);
  }.bind(this));
};

Populator.prototype._checkForDuplicateEvent = function (knownKeys, trackedEntityInstanceID, duplicate, next) {
  if (typeof duplicate === 'function') {
    next = duplicate;
    duplicate = false;
  }
  this.emit('checkForDuplicateEvent');

  var eventDate = Moment(knownKeys.eventDate, ['YYYY-MM-DD']);
  if (!eventDate.isValid() || eventDate.parsingFlags().overflow !== -1 || eventDate.parsingFlags().charsLeftOver !== 0) {
    return next(new Error('Invalid date ' + knownKeys.eventDate));
  }

  var requestTime = Date.now();
  var request = Request.get({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'events')),
    qs: {
      program: this._options.programID,
      programStage: this._options.stageID,
      trackedEntityInstance: trackedEntityInstanceID,
      pageSize: 1,
      page: 1,
      startDate: eventDate.subtract(this._options.duplicateThreshold, 'days').format('YYYY-MM-DD')
    },
    json: true
  }, function (err, res, body) {
    if (err) {
      return next(err);
    }
    this.emit('checkForDuplicateEventResponse', res, {
      method: request.method,
      path: request.path,
      headers: request.headers,
      timestamp: requestTime
    });
    if (res.statusCode !== 200) {
      return next(new Error('Unexpected status code ' + res.statusCode));
    }
    if (!body.events || body.events.length === 0) {
      return next(null, trackedEntityInstanceID);
    }
    if (this._options.duplicateStageID) {
      return next(null, trackedEntityInstanceID, true);
    }
    next(new Error('Duplicate event'));
  }.bind(this));
};

Populator.prototype._addEvent = function (knownKeys, dataElements, trackedEntityInstanceID, duplicate, next) {
  if (typeof duplicate === 'function') {
    next = duplicate;
    duplicate = false;
  }
  this.emit('addEvent');
  var payload = {
    program: this._options.programID,
    programStage: duplicate ? this._options.duplicateStageID : this._options.stageID,
    trackedEntityInstance: trackedEntityInstanceID,
    orgUnit: knownKeys.eventOrgUnit || knownKeys.orgUnit,
    storedBy: 'admin',
    eventDate: knownKeys.eventDate,
    dataValues: []
  };

  if (knownKeys.latitude && knownKeys.longitude) {
    payload.coordinate = {
      latitude: knownKeys.latitude,
      longitude: knownKeys.longitude
    }
  }

  for (var key in dataElements) {
    payload.dataValues.push(this._cache.createDataElement(key, dataElements[key]));
  }

  var requestTime = Date.now();
  var request = Request.post({
    url: URL.resolve(this._options.url, createDhisUrl(this._options.dhisVersion, 'events')),
    json: payload
  }, function (err, res, body) {
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
    if (res.statusCode > 203 || !body || body.response.importSummaries[0].status !== 'SUCCESS') {
      return next(new Error('Adding event failed'));
    }
    next();
  }.bind(this));
};

module.exports = Populator;
