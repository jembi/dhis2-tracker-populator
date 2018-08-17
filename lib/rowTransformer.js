'use strict';

var Logger = require('./logger');
var Transform = require('stream').Transform;
var Util = require('util');

function RowTransformer() {
  Transform.call(this, {
    objectMode: true
  });
}

Util.inherits(RowTransformer, Transform);

RowTransformer.prototype._transform = function (row, encoding, callback) {
  Logger.info('Transforming row');
  var transformedRow = {
    parameters: {},
    attributes: {},
    dataElements: {}
  };

  for (var column in row) {
    var value = row[column];
    if (value === 'NULL') {
      value = '';
    }
    var columnParts = column.split('|');
    // Known keys e.g. orgUnit
    if (columnParts.length === 1) {
      transformedRow.parameters[column] = value;
      continue;
    }
    // Tracked entity attributes
    if (columnParts[0] === 'A') {
      transformedRow.attributes[columnParts[1]] = value;
      continue;
    }
    // Data elements
    if (columnParts[0] === 'DE') {
      transformedRow.dataElements[columnParts[1]] = value;
      continue;
    }
  }

  this.push(transformedRow);
  callback();
};

module.exports = RowTransformer;
