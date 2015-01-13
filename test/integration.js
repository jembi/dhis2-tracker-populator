'use strict';

var Chai = require('chai');
var Lab = require('lab');
var Path = require('path');
var Request = require('request');
var Sinon = require('sinon');
var TrackerPopulator = require('../lib/index');
var TypeCache = require('../lib/typeCache');
var URL = require('url');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;

var expect = Chai.expect;

var fixturePath = Path.join(__dirname, 'fixtures');
var options = {
  url: 'http://localhost/',
  csvPath: fixturePath,
  donePath: fixturePath,
  failPath: fixturePath,
  threshold: 1
};

describe('Tracker populator', function() {
  var sandbox = Sinon.sandbox.create();
  var get;
  var post;

  var requestObject = {
    body: new Buffer('{}')
  };

  beforeEach(function(next) {
    get = sandbox.stub(Request, 'get').yields(new Error('Unexpected invocation'));
    post = sandbox.stub(Request, 'post').yields(new Error('Unexpected invocation'));
    next();
  });

  afterEach(function(next) {
    sandbox.restore();
    next();
  });

  afterEach(function(next) {
    TypeCache.trackedEntityAttributeTypes = {};
    TypeCache.dataElementTypes = {};
    TypeCache.firstUniqueTrackedEntityAttributeID = null;
    next();
  });

  describe('with a valid csv', function() {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    it('should make the expected requests', function(next) {
      // Get attributes
      var getAttributeRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/trackedEntityAttributes/attributeID'),
        json: true
      });
      get.withArgs(getAttributeRequest, Sinon.match.func).yields(
        null,
        {statusCode: 200},
        {
          valueType: 'string',
          unique: true
        }
      );

      // Get data elements
      var getDataElementRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/dataElements/dataElementID'),
        json: true
      });
      get.withArgs(getDataElementRequest, Sinon.match.func).yields(
        null,
        {statusCode: 200},
        {type: 'string'}
      );
 
      // Add tracked entity
      var addTrackedEntityRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/trackedEntityInstances'),
        json: Sinon.match({
          trackedEntity: 'trackedEntityID',
          orgUnit: 'expectedOrgUnit',
          attributes: Sinon.match([
            Sinon.match({attribute: 'attributeID', value: 'expectedAttribute'})
          ])
        })
      });
      post.withArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null,
        {statusCode: 201},
        {
          status: 'SUCCESS',
          reference: trackedEntityInstanceID
        }
      );
 
      // Enroll in program
      var enrollInProgramRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/enrollments'),
        json: Sinon.match({
          program: 'programID',
          trackedEntityInstance: trackedEntityInstanceID,
          dateOfEnrollment: '1970-01-01',
          dateOfIncident: '1970-01-01'
        })
      });
      post.withArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null,
        {statusCode: 201},
        {status: 'SUCCESS'}
      );

      // Check for duplicate events
      var checkForDuplicateEventRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/events'),
        qs: Sinon.match({
          orgUnit: 'expectedOrgUnit',
          program: 'programID',
          programStage: 'stageID',
          trackedEntityInstance: trackedEntityInstanceID,
          startDate: '1970-01-01'
        }),
        json: true
      });
      get.withArgs(checkForDuplicateEventRequest, Sinon.match.func).yieldsAsync(
        null,
        {statusCode: 200},
        {events: []}
      );
 
      // Add event
      var addEventRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/events'),
        json: Sinon.match({
          program: 'programID',
          programStage: 'stageID',
          trackedEntityInstance: trackedEntityInstanceID,
          orgUnit: 'expectedOrgUnit',
          storedBy: 'admin',
          eventDate: '1970-01-02',
          dataValues: Sinon.match([
            Sinon.match({dataElement: 'dataElementID', value: 'expectedDataElement'})
          ])
        })
      });
      post.withArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null,
        {statusCode: 201},
        {
          importSummaries: [
            {status: 'SUCCESS'}
          ]
        }
      );
 
      TrackerPopulator(options, function(err) {
        if (err) {
          return next(err);
        }
        expect(get).to.have.callCount(3);
        expect(post).to.have.callCount(3);
        expect(TypeCache.firstUniqueTrackedEntityAttributeID).to.equal('attributeID');
        expect(TypeCache.trackedEntityAttributeTypes.attributeID).to.equal('string');
        expect(TypeCache.dataElementTypes.dataElementID).to.equal('string');
        next();
      });
    });
  });
});
