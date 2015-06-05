'use strict';

var Chai = require('chai');
var Lab = require('lab');
var ObjectAssign = require('object-assign');
var Path = require('path');
var Populator = require('../lib/populator');
var Request = require('request');
var Sinon = require('sinon');
var SinonChai = require('sinon-chai');
var URL = require('url');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;

Chai.use(SinonChai);
var expect = Chai.expect;

describe('Populator', function() {
  var OPTIONS = {
    url: 'http://localhost/',
    programID: 'some program id',
    stageID: 'some stage id',
    trackedEntityID: 'some tracked entity id',
    duplicateThreshold: 0
  };
  var KNOWN_KEYS = {
    orgUnit: 'some org unit',
    programDate: '1970-01-01',
    eventDate: '1970-01-01'
  };
  var ATTRIBUTES = {
    attributeID: 'some attribute value'
  };
  var DATA_ELEMENTS = {
    dataElementID: 'some data element value'
  };

  var sandbox = Sinon.sandbox.create();
  var populator = new Populator(OPTIONS);
  var requestMock;

  beforeEach(function(next) {
    requestMock = sandbox.mock(Request);
    next();
  });

  afterEach(function(next) {
    sandbox.restore();
    next();
  });

  describe('#addTrackedEntity', function() {

    var requestObjectBody = {
      trackedEntity: OPTIONS.trackedEntityInstanceID,
      orgUnit: KNOWN_KEYS.orgUnit,
      attributes: ATTRIBUTES
    };
    var requestObject = {
      method: 'POST',
      path: '/api/trackedEntityInstances',
      body: new Buffer(JSON.stringify(requestObjectBody))
    };
    var expectedRequestObject = Sinon.match({
      method: requestObject.method,
      path: requestObject.path,
      body: Sinon.match(requestObjectBody),
      timestamp: Sinon.match.number
    });

    var addTrackedEntityResponseListener;
    var addTrackedEntityRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/trackedEntityInstances'),
      json: Sinon.match({
        trackedEntity: OPTIONS.trackedEntityID,
        orgUnit: KNOWN_KEYS.orgUnit,
        attributes: Sinon.match(Object.keys(ATTRIBUTES).map(function(key) {
          return Sinon.match({attribute: key, value: ATTRIBUTES[key]});
        }))
      })
    });

    beforeEach(function(next) {
      addTrackedEntityResponseListener = sandbox.stub();
      populator.on('addTrackedEntityResponse', addTrackedEntityResponseListener);
      next();
    });

    afterEach(function(next) {
      populator.removeListener('addTrackedEntityResponse', addTrackedEntityResponseListener);
      next();
    });

    describe('with a non-201 response status code', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 500};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, {});
        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          requestMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Unexpected status code 500');
          next();
        });
      });
    });

    describe('with an invalid response body', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, '<html></html>');
        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          requestMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Could not parse response body');
          next();
        });
      });
    });

    describe('with an unknown conflict', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Unknown error'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          requestMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Adding tracked entity failed');
          next();
        });
      });
    });

    describe('with more than one conflict', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Non-unique'},
              {value: 'Unknown error'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          requestMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Adding tracked entity failed');
          next();
        });
      });
    });

    describe('with a non-unique conflict', function() {
      var populatorMock;

      beforeEach(function(next) {
        populatorMock = sandbox.mock(populator);
        next();
      });

      it('should get the tracked entity instance id and update it', function(next) {
        var trackedEntityInstanceID = 'some tracked entity instance id';
        populatorMock.expects('_getTrackedEntityInstanceID').once()
            .withExactArgs(KNOWN_KEYS, ATTRIBUTES, Sinon.match.func)
            .yieldsAsync(null, trackedEntityInstanceID);
        populatorMock.expects('_updateTrackedEntityInstance').once()
            .withExactArgs(KNOWN_KEYS, ATTRIBUTES, trackedEntityInstanceID, Sinon.match.func)
            .yieldsAsync(null, trackedEntityInstanceID);

        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Non-unique'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          populatorMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with valid arguments', function() {

      it('should should return the new tracked entity instance ID', function(next) {
        var newTrackedEntityInstanceID = 'new tracked entity instance id';
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            status: 'SUCCESS',
            reference: newTrackedEntityInstanceID
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err, trackedEntityInstanceID) {
          requestMock.verify();
          expect(addTrackedEntityResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(trackedEntityInstanceID).to.equal(newTrackedEntityInstanceID);
          next();
        });
      });
    });
  });

  describe('#enrollInProgram', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    var requestBody = {
      program: OPTIONS.programID,
      orgUnit: KNOWN_KEYS.orgUnit,
      trackedEntityInstance: trackedEntityInstanceID,
      dateOfEnrollment: KNOWN_KEYS.programDate,
      dateOfIncident: KNOWN_KEYS.programDate
    };
    var requestObject = {
      method: 'POST',
      path: '/api/enrollments',
      body: new Buffer(JSON.stringify(requestBody))
    };
    var expectedRequestObject = Sinon.match({
      method: requestObject.method,
      path: requestObject.path,
      body: Sinon.match(requestBody),
      timestamp: Sinon.match.number
    });

    var enrollInProgramResponseListener;
    var enrollInProgramRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/enrollments'),
      json: Sinon.match(requestBody)
    });

    beforeEach(function(next) {
      enrollInProgramResponseListener = sandbox.stub();
      populator.on('enrollInProgramResponse', enrollInProgramResponseListener);
      next();
    });

    afterEach(function(next) {
      populator.removeListener('enrollInProgramResponse', enrollInProgramResponseListener);
      next();
    });

    describe('with a 409 response status code', function() {

      it('should return the tracked entity instance ID', function(next) {
        var response = {statusCode: 409};
        requestMock.expects('post').once().withExactArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, null);

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(enrollInProgramResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with an invalid response body', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, null);

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(enrollInProgramResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Invalid response body');
          next();
        });
      });
    });

    describe('with an unsuccessful response body', function() {

      it('should return the tracked entity instance ID', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, {status: 'ERROR'});

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(enrollInProgramResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with a successful response body', function() {

      it('should return the tracked entity instance ID', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, {status: 'SUCCESS'});

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(enrollInProgramResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });
  });

  describe('#addEvent', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    var requestObjectBody = {
      program: OPTIONS.programID,
      programStage: OPTIONS.stageID,
      trackedEntityInstance: trackedEntityInstanceID,
      orgUnit: KNOWN_KEYS.orgUnit,
      storedBy: 'admin',
      eventDate: KNOWN_KEYS.eventDate,
      dataValues: DATA_ELEMENTS
    };
    var requestObject = {
      method: 'POST',
      path: '/api/events',
      body: new Buffer(JSON.stringify(requestObjectBody))
    };
    var expectedRequestObject = Sinon.match({
      method: requestObject.method,
      path: requestObject.path,
      body: Sinon.match(requestObjectBody),
      timestamp: Sinon.match.number
    });

    var addEventResponseListener;
    var addEventRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/events'),
      json: Sinon.match({
        program: OPTIONS.programID,
        programStage: OPTIONS.stageID,
        trackedEntityInstance: trackedEntityInstanceID,
        orgUnit: KNOWN_KEYS.orgUnit,
        storedBy: 'admin',
        eventDate: KNOWN_KEYS.eventDate,
        dataValues: Sinon.match(Object.keys(DATA_ELEMENTS).map(function(key) {
          return Sinon.match({dataElement: key, value: DATA_ELEMENTS[key]});
        }))
      })
    });

    beforeEach(function(next) {
      addEventResponseListener = sandbox.stub();
      populator.on('addEventResponse', addEventResponseListener);
      next();
    });

    afterEach(function(next) {
      populator.removeListener('addEventResponse', addEventResponseListener);
      next();
    });

    describe('with a non-20x response code', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 500};
        requestMock.expects('post').once().withExactArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, null);

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(addEventResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with no response body', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(null, response, null);

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(addEventResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with an unsuccessful response body', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            importSummaries: [
              {status: 'ERROR'}
            ]
          }
        );

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(addEventResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with a successful response body', function() {

      it('should not return an error', function(next) {
        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            importSummaries: [
              {status: 'SUCCESS'}
            ]
          }
        );

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(addEventResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          next();
        });
      });
    });

    describe('with an eventOrgUnit and a successful response body', function() {

      it('should not return an error', function(next) {
        var eventOrgUnit = 'some event org unit';
        var eventOrgUnitRequest = Sinon.match({
          url: URL.resolve(OPTIONS.url, 'api/events'),
          json: Sinon.match({
            program: OPTIONS.programID,
            programStage: OPTIONS.stageID,
            trackedEntityInstance: trackedEntityInstanceID,
            orgUnit: eventOrgUnit,
            storedBy: 'admin',
            eventDate: KNOWN_KEYS.eventDate,
            dataValues: {}
          })
        });

        var response = {statusCode: 201};
        requestMock.expects('post').once().withExactArgs(eventOrgUnitRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {
            importSummaries: [
              {status: 'SUCCESS'}
            ]
          }
        );

        var knownKeys = ObjectAssign({}, KNOWN_KEYS, {eventOrgUnit: eventOrgUnit});

        populator._addEvent(knownKeys, {}, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(addEventResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          next();
        });
      });
    });
  });

  describe('#checkForDuplicateEvent', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    var checkForDuplicateEventRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/events'),
      qs: Sinon.match({
        program: OPTIONS.programID,
        programStage: OPTIONS.stageID,
        trackedEntityInstance: trackedEntityInstanceID,
        orgUnit: KNOWN_KEYS.orgUnit,
        startDate: '1970-01-01'
      }),
      json: true
    });

    describe('with a non-200 response code', function() {

      it('should return an error with the correct message', function(next) {
        requestMock.expects('get').once().withExactArgs(checkForDuplicateEventRequest, Sinon.match.func).yieldsAsync(
          null,
          {statusCode: 500}
        );

        populator._checkForDuplicateEvent(KNOWN_KEYS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(err).to.exist;
          expect(err.message).to.equal('Unexpected status code 500');
          next();
        });
      });
    });

    describe('with no duplicate events', function() {

      it('should not return an error', function(next) {
        requestMock.expects('get').once().withExactArgs(checkForDuplicateEventRequest, Sinon.match.func).yieldsAsync(
          null,
          {statusCode: 200},
          {events: []}
        );

        populator._checkForDuplicateEvent(KNOWN_KEYS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(err).to.not.exist;
          next();
        });
      });
    });

    describe('with at least one duplicate event', function() {

      it('should return an error with the correct message', function(next) {
        requestMock.expects('get').once().withExactArgs(checkForDuplicateEventRequest, Sinon.match.func).yieldsAsync(
          null,
          {statusCode: 200},
          {
            events: [
              {eventDate: Date.now()}
            ]
          }
        );

        populator._checkForDuplicateEvent(KNOWN_KEYS, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(err).to.exist;
          expect(err.message).to.equal('Duplicate event');
          next();
        });
      });
    });

    describe('with an eventOrgUnit and at least one duplicate event', function() {

      it('should return an error with the correct message', function(next) {
      var eventOrgUnit = 'some event org unit';
        var eventOrgUnitRequest = Sinon.match({
          url: URL.resolve(OPTIONS.url, 'api/events'),
          qs: Sinon.match({
            program: OPTIONS.programID,
            programStage: OPTIONS.stageID,
            trackedEntityInstance: trackedEntityInstanceID,
            orgUnit: eventOrgUnit,
            startDate: '1970-01-01'
          }),
          json: true
        });

        requestMock.expects('get').once().withExactArgs(eventOrgUnitRequest, Sinon.match.func).yieldsAsync(
          null,
          {statusCode: 200},
          {
            events: [
              {eventDate: Date.now()}
            ]
          }
        );

        var knownKeys = ObjectAssign({}, KNOWN_KEYS, {eventOrgUnit: eventOrgUnit});

        populator._checkForDuplicateEvent(knownKeys, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(err).to.exist;
          expect(err.message).to.equal('Duplicate event');
          next();
        });
      });
    });
  });

  describe('#getTrackedEntityInstanceID', function() {

    describe('with no unique attributes', function() {

      before(function(next) {
        populator._cache.firstUniqueTrackedEntityAttributeID = null;
        next();
      });

      it('should return an error with the correct message', function(next) {
        populator._getTrackedEntityInstanceID(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(err).to.exist;
          expect(err.message).to.equal('No unique attributes found');
          next();
        });
      });
    });

    describe('with at least one unique attribute', function() {
      var uniqueAttributeID = Object.keys(ATTRIBUTES)[0];

      beforeEach(function(next) {
        populator._cache.firstUniqueTrackedEntityAttributeID = uniqueAttributeID;
        next();
      });

      afterEach(function(next) {
        populator._cache.firstUniqueTrackedEntityAttributeID = null;
        next();
      });

      it('should return the existing tracked entity instance ID', function(next) {
        var existingTrackedEntityInstanceID = 'existing tracked entity instance id';

        var getTrackedEntityInstanceRequest = Sinon.match({
          url: URL.resolve(OPTIONS.url, 'api/trackedEntityInstances'),
          qs: Sinon.match({
            ou: KNOWN_KEYS.orgUnit,
            attribute: uniqueAttributeID + ':EQ:' + ATTRIBUTES[uniqueAttributeID]
          }),
          json: true
        });
        requestMock.expects('get').once().withExactArgs(getTrackedEntityInstanceRequest, Sinon.match.func).yieldsAsync(
          null,
          {},
          {
            rows: [
              [existingTrackedEntityInstanceID]
            ]
          }
        );

        populator._getTrackedEntityInstanceID(KNOWN_KEYS, ATTRIBUTES, function(err, trackedEntityInstanceID) {
          requestMock.verify();
          expect(err).to.not.exist;
          expect(trackedEntityInstanceID).to.equal(existingTrackedEntityInstanceID);
          next();
        });
      });

      it('should return an error with the correct message when no tracked entity instance is found', function(next) {
        var existingTrackedEntityInstanceID = 'existing tracked entity instance id';

        var getTrackedEntityInstanceRequest = Sinon.match({
          url: URL.resolve(OPTIONS.url, 'api/trackedEntityInstances'),
          qs: Sinon.match({
            ou: KNOWN_KEYS.orgUnit,
            attribute: uniqueAttributeID + ':EQ:' + ATTRIBUTES[uniqueAttributeID]
          }),
          json: true
        });
        requestMock.expects('get').once().withExactArgs(getTrackedEntityInstanceRequest, Sinon.match.func).yieldsAsync(
          null,
          {},
          {
            rows: []
          }
        );

        populator._getTrackedEntityInstanceID(KNOWN_KEYS, ATTRIBUTES, function(err) {
          requestMock.verify();
          expect(err).to.exist;
          expect(err.message).to.equal('Failed to look up existing tracked entity instance');
          next();
        });
      });
    });
  });

  describe('#updateTrackedEntityInstance', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    var requestObjectBody = {
      trackedEntity: OPTIONS.trackedEntityInstanceID,
      orgUnit: KNOWN_KEYS.orgUnit,
      attributes: ATTRIBUTES
    };
    var requestObject = {
      method: 'PUT',
      path: '/api/trackedEntityInstances/' + trackedEntityInstanceID,
      body: new Buffer(JSON.stringify(requestObjectBody))
    };
    var expectedRequestObject = Sinon.match({
      method: requestObject.method,
      path: requestObject.path,
      body: Sinon.match(requestObjectBody),
      timestamp: Sinon.match.number
    });

    var updateTrackedEntityInstanceResponseListener;
    var updateTrackedEntityInstanceRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/trackedEntityInstances/' + trackedEntityInstanceID),
      json: Sinon.match({
        trackedEntity: OPTIONS.trackedEntityID,
        orgUnit: KNOWN_KEYS.orgUnit,
        attributes: Sinon.match(Object.keys(ATTRIBUTES).map(function(key) {
          return Sinon.match({attribute: key, value: ATTRIBUTES[key]});
        }))
      })
    });

    beforeEach(function(next) {
      updateTrackedEntityInstanceResponseListener = sandbox.stub();
      populator.on('updateTrackedEntityInstanceResponse', updateTrackedEntityInstanceResponseListener);
      next();
    });

    afterEach(function(next) {
      populator.removeListener('updateTrackedEntityInstanceResponse', updateTrackedEntityInstanceResponseListener);
      next();
    });

    describe('with a non-200 response code', function() {

      it('should return an error with the correct message', function(next) {
        var response = {statusCode: 500};
        requestMock.expects('put').once().withExactArgs(updateTrackedEntityInstanceRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response
        );

        populator._updateTrackedEntityInstance(KNOWN_KEYS, ATTRIBUTES, trackedEntityInstanceID, function(err) {
          requestMock.verify();
          expect(updateTrackedEntityInstanceResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Unexpected status code 500');
          next();
        });
      });
    });

    describe('should return an error with the correct message', function() {

      it('should return the tracked entity instance id', function(next) {
        var response = {statusCode: 200};
        requestMock.expects('put').once().withExactArgs(updateTrackedEntityInstanceRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {status: 'ERROR'}
        );

        populator._updateTrackedEntityInstance(KNOWN_KEYS, ATTRIBUTES, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(updateTrackedEntityInstanceResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.exist;
          expect(err.message).to.equal('Updating tracked entity failed');
          next();
        });
      });
    });

    describe('with a successful response body', function() {

      it('should return the tracked entity instance id', function(next) {
        var response = {statusCode: 200};
        requestMock.expects('put').once().withExactArgs(updateTrackedEntityInstanceRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
          null,
          response,
          {status: 'SUCCESS'}
        );

        populator._updateTrackedEntityInstance(KNOWN_KEYS, ATTRIBUTES, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          requestMock.verify();
          expect(updateTrackedEntityInstanceResponseListener).to.be.calledWith(response, expectedRequestObject);
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });
  });
});
