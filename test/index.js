'use strict';

var Lab = require('lab');
var Path = require('path');
var Populator = require('../lib/populator');
var Request = require('request');
var Sinon = require('sinon');
var URL = require('url');

var lab = exports.lab = Lab.script();

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var it = lab.it;

var fixturesPath = Path.join(__dirname, 'fixtures');
var options = {
  url: 'http://localhost/',
  csvPath: fixturesPath,
  donePath: fixturesPath,
  failPath: fixturesPath
};

describe('Populator', function() {
  var sandbox;

  beforeEach(function(next) {
    sandbox = Sinon.sandbox.create();
    next();
  });

  afterEach(function(next) {
    sandbox.restore();
    next();
  });

  describe('with a valid csv', function() {

    it('should make the expected requests', function(next) {
      var get = sandbox.stub(Request, 'get');
      var post = sandbox.stub(Request, 'post');
      var trackedEntityInstanceID = 'HmIkjadvki';

      get.withArgs(Sinon.match({json: true, url: URL.resolve(options.url, 'api/trackedEntityAttributes/attributeID')}), Sinon.match.func)
          .yields(null, {statusCode: 200}, {valueType: 'string'});
      get.withArgs(Sinon.match({json: true, url: URL.resolve(options.url, 'api/dataElements/dataElementID')}), Sinon.match.func)
          .yields(null, {statusCode: 200}, {valueType: 'string'});
 
      var addTrackedEntityRequest = {
        url: URL.resolve(options.url, 'api/trackedEntityInstances'),
        json: Sinon.match({
          trackedEntity: 'trackedEntityID',
          orgUnit: 'expectedOrgUnit',
          attributes: Sinon.match([
            Sinon.match({attribute: 'attributeID', value: 'expectedAttribute'})
          ])
        })
      };
      post.withArgs(Sinon.match(addTrackedEntityRequest), Sinon.match.func)
          .yields(null, {statusCode: 201}, {status: 'SUCCESS', reference: trackedEntityInstanceID});
 
      var enrollInProgramRequest = {
        url: URL.resolve(options.url, 'api/enrollments'),
        json: Sinon.match({
          program: 'programID',
          trackedEntityInstance: trackedEntityInstanceID,
          dateOfEnrollment: '1970-01-01',
          dateOfIncident: '1970-01-01'
        })
      };
      post.withArgs(Sinon.match(enrollInProgramRequest), Sinon.match.func)
          .yields(null, {statusCode: 201}, {status: 'SUCCESS'});
 
      var addEventRequest = {
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
      };
      post.withArgs(Sinon.match(addEventRequest), Sinon.match.func)
          .yields(null, {statusCode: 201}, {importSummaries: [{status: 'SUCCESS'}]});
 
      Populator(options, next);
    });
  });
});
