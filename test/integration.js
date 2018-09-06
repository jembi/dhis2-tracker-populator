'use strict';

var Chai = require('chai');
var Lab = require('lab');
var Path = require('path');
var Request = require('request');
var Sinon = require('sinon');
var TrackerPopulator = require('../lib/index');
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

describe('Tracker populator', function () {
  var sandbox = Sinon.sandbox.create();
  var requestMock;

  var requestObject = {
    body: new Buffer('{}')
  };

  beforeEach(function (next) {
    requestMock = sandbox.mock(Request);
    next();
  });

  afterEach(function (next) {
    sandbox.restore();
    next();
  });

  describe('with a valid csv', function () {
    var trackedEntityInstanceID = 'some tracked entity instance id';

    it('should make the expected requests', function (next) {
      // Get attributes
      var getAttributeRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/trackedEntityAttributes/attributeID'),
        json: true
      });
      requestMock.expects('get').once().withExactArgs(getAttributeRequest, Sinon.match.func).yields(
        null, {
          statusCode: 200
        }, {
          valueType: 'string',
          unique: true
        }
      );

      // Get data elements
      var getDataElementRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/dataElements/dataElementID'),
        json: true
      });
      requestMock.expects('get').once().withExactArgs(getDataElementRequest, Sinon.match.func).yields(
        null, {
          statusCode: 200
        }, {
          type: 'string'
        }
      );

      // Add tracked entity
      var addTrackedEntityRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/trackedEntityInstances'),
        json: Sinon.match({
          trackedEntityType: 'trackedEntityID',
          orgUnit: 'expectedOrgUnit',
          attributes: Sinon.match([
            Sinon.match({
              attribute: 'attributeID',
              value: 'expectedAttribute'
            })
          ])
        })
      });
      requestMock.expects('post').once().withExactArgs(addTrackedEntityRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null, {
          statusCode: 201
        }, {
          response: {
            status: 'SUCCESS',
            importSummaries: [{
              reference: trackedEntityInstanceID
            }]
          }
        }
      );

      // Enroll in program
      var enrollInProgramRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/enrollments'),
        json: Sinon.match({
          program: 'programID',
          orgUnit: 'expectedOrgUnit',
          trackedEntityInstance: trackedEntityInstanceID,
          enrollmentDate: '1970-01-01',
          incidentDate: '1970-01-01'
        })
      });
      requestMock.expects('post').once().withExactArgs(enrollInProgramRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null, {
          statusCode: 201
        }, {
          status: 'SUCCESS'
        }
      );

      // Check for duplicate events
      var checkForDuplicateEventRequest = Sinon.match({
        url: URL.resolve(options.url, 'api/events'),
        qs: Sinon.match({
          pageSize: 1,
          page: 1,
          program: 'programID',
          programStage: 'stageID',
          trackedEntityInstance: trackedEntityInstanceID,
          startDate: '1970-01-01'
        }),
        json: true
      });
      requestMock.expects('get').once().withExactArgs(checkForDuplicateEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null, {
          statusCode: 200
        }, {
          events: []
        }
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
            Sinon.match({
              dataElement: 'dataElementID',
              value: 'expectedDataElement'
            })
          ])
        })
      });
      requestMock.expects('post').once().withExactArgs(addEventRequest, Sinon.match.func).returns(requestObject).yieldsAsync(
        null, {
          statusCode: 201
        }, {
          response: {
            importSummaries: [{
              status: 'SUCCESS'
            }]
          }
        }
      );

      TrackerPopulator(options, function (err) {
        if (err) {
          return next(err);
        }
        requestMock.verify();
        next();
      });
    });
  });
});
