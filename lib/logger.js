'use strict';

var Winston = require('winston');

module.exports = new Winston.Logger({
  transports: [
    new Winston.transports.Console({level: 'info', colorize: true}),
    new Winston.transports.File({level: 'error', filename: 'error.log'})
  ]
});
