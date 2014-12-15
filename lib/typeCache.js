'use strict';

exports.trackedEntityAttributeTypes = {};
exports.dataElementTypes = {};
// ID of a unique attribute to look up existing tracked entity instances
exports.firstUniqueTrackedEntityAttributeID = null;

exports.createTrackedEntityAttribute = function(key, value) {
  var attribute = {
    attribute: key,
    value: value
  };
  if (exports.trackedEntityAttributeTypes[key] === 'number') {
    attribute.value = parseInt(attribute.value);
  }
  return attribute;
};

exports.createDataElement = function(key, value) {
  var dataElement = {
    dataElement: key,
    value: value
  };
  if (exports.dataElementTypes[key] === 'int') {
    dataElement.value = parseInt(dataElement.value);
  }
  return dataElement;
};
