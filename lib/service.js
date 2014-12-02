var moment = require('moment'),
    http = require('http'),
    express = require('express'),
    fs = require('fs'),
    winston = require('winston'),
    request = require('request'),
    logger = require('morgan'),
    bodyParser = require('body-parser'),
    mkdirp = require('mkdirp'),
    config = require('../config/config.json'),
    mongodb = require('mongodb'),
    csv = require('fast-csv'),
    app = express();


app.set('port', process.env.PORT || config.app_port);

app.use(logger('dev'));
app.use(bodyParser.raw());
var processDirs = {};
var dirs = {};

var type = 'default'; //Default to registration
var ext = '';
//receive data
var processFiles =  [];

var populateRegistration = function() {
    console.log(processFiles.length);
    if(processFile.length>0) {
        var filename = processFiles.pop();
        console.log(filename);
        var dataarray = "";
        dataarray = fs.readFileSync('./csv/'+filename).toString().split(',');
        console.log('DATA ARRAY: ' + dataarray);

        var payloadreg = {
            "trackedEntity": "bWiTYkNuj6B",
            "orgUnit": dataarray[8],
            "attributes": [{
                "attribute": "Y225iXMjPhd", //name
                "value": ""
            }, {
                "attribute": "ra7WkHYCb8P", //name
                "value": ""
            }, {
                "attribute": "yd8abJiRMAK", //id
                "value": dataarray[3]
            }, {
                "attribute": "opKUx9Qxth6", //assigning auth
                "value": dataarray[4]
            }, {
                "attribute": "ljIAt8ZNDNm", //lang
                "value": dataarray[10]
            }, {
                "attribute": "MnXIgtSLeTK", //Client Cell Number
                "value": parseInt(dataarray[6])
            }, {
                "attribute": "AnJxSXFMHVH", //dob
                "value": dataarray[9]
            }, {
                "attribute": "WuDAhgHsgHJ", //MHA
                "value": "1"
            }, {
                "attribute": "AAJ1nCdmU4A", //SWT
                "value": "1"
            }, {
                "attribute": "uGhxe9rGxxI", //Provider MSISDN
                "value": parseInt(dataarray[7]) || parseInt(dataarray[6])
            }, {
                "attribute": "V5yVvawhkHC", //id type
                "value": dataarray[5]
            }, {
                "attribute": "yWAtzzmSNf9", //unique id
                "value": dataarray[2]
            }]
        }
        console.log('PAYLOAD REGISTRATION: ' +payloadreg);

        request.post({
                headers: {'content-type': 'application/json'},
                url: 'http://admin:district9@npr.dhis.hisp.org/staging/api/trackedEntityInstances',
                body: JSON.stringify(payloadreg)
            }, function (error, response, body) {
                console.log(body);
                if (error) {
                    console.log(error);
                    console.log('Registration error' + response);
                }
                var jsonresponse = JSON.parse(body);
                if (jsonresponse.status == "SUCCESS") {
                    console.log('Registration successfull' + response);
                    console.log(JSON.parse(body).reference);
                    enroll(jsonresponse.reference, dataarray, filename);
                }
                else {
                    fs.renameSync('./csv/'+filename, './csvaddfail/'+filename);
                    populateRegistration();
                }
            }
        );
    }

}

var enroll = function(reference,dataarray, filename){
    console.log('enroll');
     var payloadenroll = 
        {
            "trackedEntityInstance": reference,
            "program": "YBM3wffX4Xd",
            "dateOfEnrollment": dataarray[1],
            "dateOfIncident": dataarray[1]
        }
        console.log('ENROLL PAYLOAD: ' + JSON.stringify(payloadenroll));
        request.post({
            headers: {'content-type': 'application/json'},
            url: 'http://admin:district9@npr.dhis.hisp.org/staging/api/enrollments',
            body: JSON.stringify(payloadenroll)
        }, function (error, response, body) {
            console.log(body);
            if (error) {
                console.log(error);
                console.log('Enroll error' + response.status);
            }
            //check if already enrolled
            if (response.statusCode < 203) {
                console.log('Enroll successfull' + response.status);
                addevent(reference,dataarray,filename);
                
            } else {
                console.log('Enroll Failure');
                addevent(reference,dataarray,filename);
            }
            
        }
    );

} 

var addevent = function(reference,dataarray,filename) {
    var payloadevent = {
        "program": "YBM3wffX4Xd",
        "programStage": "y4of8biLRlY",
        "trackedEntityInstance": reference,
        "orgUnit": dataarray[8],
        "eventDate": dataarray[1],
        "storedBy": "admin",
        "dataValues": [{
            "dataElement": "mRSm5Bgafv9", //Client Pregnancy Date
            "value": dataarray[11]
        }, {
            "dataElement": "Ww4LVhK9066", //Provider Encounter Date
            "value": dataarray[1]
        }, {
            "dataElement": "uIEht9XYOWS", //Provider MHA code
            "value": "1"
        }, {
            "dataElement": "I5kgGDHp5Qi", // Provider MSISDN #
            "value": dataarray[6]
        }, {
            "dataElement": "rXkucI2pquj", // rXkucI2pquj
            "value": "1"
        }]
    }
    console.log('EVENT PAYLOAD: ' + JSON.stringify(payloadevent));
    request.post({
            headers: {'content-type': 'application/json'},
            url: 'http://admin:district9@npr.dhis.hisp.org/staging/api//events',
            body: JSON.stringify(payloadevent)
        }, function (error, response, body) {
            console.log(body);
            if (error) {
                console.log(error);
                console.log('Event error' + response.status);
            }
            if (response.statusCode < 203) {
                console.log('Event successfull' + response.status);
                fs.renameSync('./csv/'+filename, './csvdone/'+filename);
                populateRegistration();
            }

        }
    );
}


var readQueue = function() {
    processFiles = fs.readdirSync('./csv/');
    populateRegistration();
}



var populateQueue = function() {
csv.fromPath("registrations.csv")
 .on("data", function(data){
     console.log(data);

     fs.writeFileSync('./csv/'+data[0]+'.csv',data);
 })
 .on("end", function(){
     console.log("done");
 });

}
//populateQueue();
readQueue();



