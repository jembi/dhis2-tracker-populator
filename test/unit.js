'use strict';

var Chai = require('chai');
var Lab = require('lab');
var Path = require('path');
var Populator = require('../lib/populator');
var Request = require('request');
var Sinon = require('sinon');
var SinonChai = require('sinon-chai');
var TypeCache = require('../lib/typeCache');
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
    trackedEntityID: 'some tracked entity id'
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
  var post;

  beforeEach(function(next) {
    post = sandbox.stub(Request, 'post');
    next();
  });

  afterEach(function(next) {
    sandbox.restore();
    next();
  });

  describe('#addTrackedEntity', function() {

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

    describe('with a non-201 response status code', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(null, {statusCode: 500}, {});
        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Unexpected status code 500');
          next();
        });
      });
    });

    describe('with an invalid response body', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(null, {statusCode: 201}, '<html></html>');
        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Could not parse response body');
          next();
        });
      });
    });

    describe('with an unknown conflict', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Unknown error'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Adding tracked entity failed');
          next();
        });
      });
    });

    describe('with more than one conflict', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Non-unique'},
              {value: 'Unknown error'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Adding tracked entity failed');
          next();
        });
      });
    });

    describe('with a non-unique conflict and no unique attributes', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Non-unique'}
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('No unique attributes found');
          next();
        });
      });
    });

    describe('with a non-unique conflict and at least one unique attribute', function() {
      var get;
      var uniqueAttributeID = Object.keys(ATTRIBUTES)[0];

      before(function(next) {
        get = sandbox.stub(Request, 'get');
        TypeCache.firstUniqueTrackedEntityAttributeID = uniqueAttributeID;
        next();
      });

      after(function(next) {
        TypeCache.firstUniqueTrackedEntityAttributeID = null;
        next();
      });

      it('should return the existing tracked entity instance ID', function(next) {
        var existingTrackedEntityInstanceID = 'existing tracked entity instance id';
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            status: 'ERROR',
            conflicts: [
              {value: 'Non-unique'}
            ]
          }
        );

        var getTrackedEntityInstanceRequest = Sinon.match({
          url: URL.resolve(OPTIONS.url, 'api/trackedEntityInstances?ou=' + KNOWN_KEYS.orgUnit +
              '&attribute=' + uniqueAttributeID + ':EQ:' + ATTRIBUTES[uniqueAttributeID]),
          json: true
        });
        get.withArgs(getTrackedEntityInstanceRequest, Sinon.match.func).yields(
          null,
          {},
          {
            rows: [
              [existingTrackedEntityInstanceID]
            ]
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err, trackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(get).to.be.calledOnce;
          expect(err).to.not.exist;
          expect(trackedEntityInstanceID).to.equal(existingTrackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with valid arguments', function() {

      it('should should return the new tracked entity instance ID', function(next) {
        var newTrackedEntityInstanceID = 'new tracked entity instance id';
        post.withArgs(addTrackedEntityRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            status: 'SUCCESS',
            reference: newTrackedEntityInstanceID
          }
        );

        populator._addTrackedEntity(KNOWN_KEYS, ATTRIBUTES, function(err, trackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(err).to.not.exist;
          expect(trackedEntityInstanceID).to.equal(newTrackedEntityInstanceID);
          next();
        });
      });
    });
  });

  describe('#enrollInProgram', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    var enrollInProgramRequest = Sinon.match({
      url: URL.resolve(OPTIONS.url, 'api/enrollments'),
      json: Sinon.match({
        program: OPTIONS.programID,
        trackedEntityInstance: trackedEntityInstanceID,
        dateOfEnrollment: KNOWN_KEYS.programDate,
        dateOfIncident: KNOWN_KEYS.programDate
      })
    });

    describe('with a 409 response status code', function() {

      it('should return the tracked entity instance ID', function(next) {
        post.withArgs(enrollInProgramRequest, Sinon.match.func).yields(null, {statusCode: 409}, null);

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with an invalid response body', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(enrollInProgramRequest, Sinon.match.func).yields(null, {statusCode: 201}, null);

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Invalid response body');
          next();
        });
      });
    });

    describe('with an unsuccessful response body', function() {

      it('should return the tracked entity instance ID', function(next) {
        post.withArgs(enrollInProgramRequest, Sinon.match.func).yields(null, {statusCode: 201}, {status: 'ERROR'});

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });

    describe('with a successful response body', function() {

      it('should return the tracked entity instance ID', function(next) {
        post.withArgs(enrollInProgramRequest, Sinon.match.func).yields(null, {statusCode: 201}, {status: 'SUCCESS'});

        populator._enrollInProgram(KNOWN_KEYS, trackedEntityInstanceID, function(err, returnedTrackedEntityInstanceID) {
          expect(post).to.be.calledOnce;
          expect(err).to.not.exist;
          expect(returnedTrackedEntityInstanceID).to.equal(trackedEntityInstanceID);
          next();
        });
      });
    });
  });

  describe('#addEvent', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

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

    describe('with a non-20x response code', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addEventRequest, Sinon.match.func).yields(null, {statusCode: 500}, null);

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with no response body', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addEventRequest, Sinon.match.func).yields(null, {statusCode: 201}, null);

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with an unsuccessful response body', function() {

      it('should return an error with the correct message', function(next) {
        post.withArgs(addEventRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            importSummaries: [
              {status: 'ERROR'}
            ]
          }
        );

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.exist;
          expect(err.message).to.equal('Adding event failed');
          next();
        });
      });
    });

    describe('with a successful response body', function() {

      it('should not return an error', function(next) {
        post.withArgs(addEventRequest, Sinon.match.func).yields(
          null,
          {statusCode: 201},
          {
            importSummaries: [
              {status: 'SUCCESS'}
            ]
          }
        );

        populator._addEvent(KNOWN_KEYS, DATA_ELEMENTS, trackedEntityInstanceID, function(err) {
          expect(post).to.be.calledOnce;
          expect(err).to.not.exist;
          next();
        });
      });
    });
  });
});
