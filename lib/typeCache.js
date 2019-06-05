'use strict';

function TypeCache() {
  this.trackedEntityAttributeTypes = {};
  this.dataElementTypes = {};
  // ID of a unique attribute to look up existing tracked entity instances
  this.uniqueTrackedEntityAttributeID = null;
  // This is the UID of the unique data element in DHIS2
  // that can be used to prevent duplication of events
  this.uniqueEventDataElementID = null;
}

TypeCache.prototype.createTrackedEntityAttribute = function (key, value) {
  var attribute = {
    attribute: key,
    value: value
  };
  if (this.trackedEntityAttributeTypes[key] === 'number') {
    attribute.value = parseInt(attribute.value);
  }
  return attribute;
};

TypeCache.prototype.createDataElement = function (key, value) {
  var dataElement = {
    dataElement: key,
    value: value
  };
  if (this.dataElementTypes[key] === 'int') {
    dataElement.value = parseInt(dataElement.value);
  }
  return dataElement;
};

module.exports = TypeCache;
