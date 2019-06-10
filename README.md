# dhis2-tracker-populator

[![Build Status](https://travis-ci.org/jembi/dhis2-tracker-populator.svg)](https://travis-ci.org/jembi/dhis2-tracker-populator)

Populate [DHIS2 Tracker](https://www.dhis2.org/individual-data-records) with individual data records read from a number of CSV files.

---

## Install

This is a node.js application. Refer to <http://nodejs.org/> for instructions on how install nodejs and NPM for your operating system.

Install the package globally using NPM.

```bash
npm install -g dhis2-tracker-populator
```

---

## CSV file format

The CSV files must follow a naming convention of `programID.programStageID.trackedEntityID.csv`. The values that make up the filename will be used when making requests to the API. These are the uids of the program, stage and trackedEntity which can be found using api/resource calls, for example:

Program: <https://apps.dhis2.org/demo/api/programs/IpHINAT79UW> (shows attributes)

Stage: <https://apps.dhis2.org/demo/api/programStages/A03MvHHogjR> (shows data elements)

The CSV files must contain the following columns:

* `orgUnit` : the uid of the organisation unit
* `programDate` : yyyy-mm-dd
* `eventDate` : yyyy-mm-dd

Any number of additional attributes or data elements can be specified with column headers of the following format:

* Attributes: The uid of the attribute prepended with the string `A|`.
* Data elements: The uid of the data element prepended with the string `DE|`.
* Each line in the CSV corresponds to an event.
* If the tracked entity exists already (there is a unique attribute), other attributes will not be updated
* If the tracked entity is already enrolled into the program, the application will continue on to adding the event
* There is no restriction on the number of events added to a program for a particular tracked entity, and multiple identical events can be added (for example if the same csv file is operated on more than once)
* The application assumes that there is only one unique attribute per tracked entity (this is determined by the application at run time from the DHIS2 resources api)
* The csv file can be generated from a sql query to a database, from an excel spreadsheet, or any other source, as long as it is added to the csv directory in the proper format (this must actually be comma separated)
* Event coordinates can be added by specifying latitude and longitude columns in the csv (Note: event coordinates are only inserted and cannot be updated. Ensure that the Capture coordinates flag is set on the program stage).

e.g. file: `IpHINAT79UW.A03MvHHogjR.cyl5vuJ5ETQ.csv`

```csv
orgUnit,programDate,eventDate,A|dv3nChNSIxy,A|hwlRTFIFSUq,DE|UXz7xuGCEhU
sY1WN6LjmAx,2014-08-11,2014-08-11,babyfirstname,babylastname,3000
```

---

## Run

Run the populator from the command line.

```sh
Usage: dhis2-tracker-populator [OPTIONS] URL

Options:
  -c, --csv        Path to the directory containing the csv files
  -d, --done       Path to the directory in which to place the done files
  -f, --fail       Path to the directory in which to place the failed files
  -t, --threshold  The minimum number of days between duplicate events

  --help      Show this help
  --version   Print the version and exit
```

NB: The folders specified in the options above need to be created manually

The `threshold` option specifies the number of days between events for the same program, stage and tracked entity instance which will cause them to be considered duplicates. For example, if set to `0` events on the same day will be considered duplicates. The default value of `-1` disables duplicate checking.

The default options are:

* csv: `./csv/`
* done: `./csvdone/`
* fail: `./csvfail/`
* threshold: `-1`

Example:

```sh
dhis2-tracker-populator https://username:password@apps.dhis2.org/demo
```

This will read data records from the CSV files found in the `csv` directory and make requests to the API for the given URL to populate the tracker. If an error occurs while processing a CSV file it will be moved into the `csvfail` directory, otherwise it will be moved to the `csvdone` directory on completion.

Best practice is to use `./bin/split.js` to split a multi-line csv into individual files. This will give granular control and a view of exactly which files have been processed and which did not get fully added to the program.

---

## Notes

To remove ALL tracker data from your DHIS2 database run the following sql commands in order:

```sql
delete from trackedentitydatavalue;
delete from programstageinstance;
delete from programinstance;
delete from trackedentityaudit;
delete from trackedentityattributevalue;
delete from trackedentityinstance;
```

> WARNING: This cannot be undone

---

## Populator Testing

How to do a basic populate into DHIS2 using the `write` function in the `Populator` (**not a CSV import**)

> Examples below relate to the **MomConnect Staging** DHIS2 instance

1. Navigate to the DHIS2 Tracker Populator directory and open a `Node` shell

    ```sh
    cd /path/to/dhis2-tracker-populator/lib
    node
    ```

1. In the `Node` shell, import the populator module and instantiate a new populator:

    ```javascript
    const Populator = require('./populator');

    const populator = new Populator({
      url: 'https://user:password@dhis2-instance-path/',
      programID: 'Program UID',
      stageID: 'Program Stage UID',
      trackedEntityID: 'Tracked Entity Attribute UID',
      duplicateThreshold: 'An integer (days)',
      uniqueDataElement: 'Data Element UID'
    });
    ```

    > The URL in the populator requires a **/** on the end

    | Populator Option | Description | Example |
    | :---: | :---: | :---: |
    | url | URL and authentication details to a DHIS2 instance | <https://{user}:{password}@staging.dhis.dhmis.org/momconnect/> |
    | programID | [A DHIS2 Program ID](https://staging.dhis.dhmis.org/momconnect/api/programs) eg: MomConnect, NurseConnect or MalariaConnect Programs | CsKMsVrpRny (MomConnect Program) |
    | stageID | [A DHIS2 Program Stage ID](https://staging.dhis.dhmis.org/momconnect/api/programStages) eg: Clinic Subscription, Message Change, HelpDesk| AVSoW6NZOCD (Public Subscription) |
    | trackedEntityID | [An entity tracked by DHIS2](https://staging.dhis.dhmis.org/momconnect/api/trackedEntities) ie: a mother or nurse in MomConnect | et3hFnvRGtX (Mother Subscription) |
    | uniqueAttributeID<sup>§</sup> | A Tracked Entity Attribute that can be used to uniquely identify a tracked entity instance. For example the [System ID](https://staging.dhis.dhmis.org/momconnect/api/trackedEntityAttributes/HMadXWvPaS4) in the momConnect DHIS2 system is a uuid given to each mother when they sign up | HMadXWvPaS4 |
    | duplicateThreshold<sup>§</sup> | If a similar event is found but it falls outside of the `duplicateThreshold` number of days it won't trigger a **Duplicate Event** error. This option is ignored if the `uniqueDataElement` is provided as it is far less reliable. | 0 ( `-1` disables duplicateThreshold check ) |
    | uniqueElementID<sup>§</sup> | A Data Element on an `Event` used to prevent duplicate processing of messages eg: In the MomConnect system the [Event ID](https://staging.dhis.dhmis.org/momconnect/api/dataElements/VIXMHChW3mb) is a uuid given to each message from Praekelt to uniquely identify events. If a message needs to be rerun, data won't be duplicated in DHIS2 if it has already successfully been processed. | VIXMHChW3mb |

    > **§** optional - defaults to backward compatible functionality if not supplied

1. Then write some data to DHIS

    ```javascript
    populator.write({
      parameters: {
        orgUnit: 'HxdpS7eL5hZ',
        programDate: '2019-04-16',
        eventDate: '2019-04-16'
      },
      attributes: {
        AMwD6ZTkNYJ: '+27123456789',
        HMadXWvPaS4: '{random uuid}'
      },
      dataElements: {
        u8qaP9AqGL5: '+27123456789',
        MxxPNA4C2xZ: 'en',
        rXkucI2pquj: 7,
        uIEht9XYOWS: 1,
        VIXMHChW3mb: '{random uuid}'
      }
    });
    ```

    | Populator | Key | Description | Example (String) |
    | :---: | :---: | :---: | :---: |
    | `Parameter`| orgUnit | [Organisation Unit](https://staging.dhis.dhmis.org/momconnect/api/organisationUnits) (ou) - The facility at which the encounter occurred | HxdpS7eL5hZ ( Test Clinic ) |
    | `Parameter`| programDate | Date of registration in the [DHIS2 Tracker Capture Program](https://docs.dhis2.org/2.27/en/user/html/about_program_maintenance_app.html) | YYYY-MM-DD |
    | `Parameter`| eventDate | Date that the [DHIS2 Event](https://docs.dhis2.org/2.28/en/developer/html/webapi_events.html) occurred | YYYY-MM-DD |
    | [`Attribute`](https://docs.dhis2.org/2.26/en/developer/html/webapi_tracked_entity_instance_management.html) | [AMwD6ZTkNYJ<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/trackedEntityAttributes/AMwD6ZTkNYJ) | Mother Subscription Cell Number | +27123456789 |
    | [`Attribute`](https://docs.dhis2.org/2.26/en/developer/html/webapi_tracked_entity_instance_management.html) | [HMadXWvPaS4<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/trackedEntityAttributes/HMadXWvPaS4) | **System ID** - a uuid generated by Praekelt to uniquely identify a mother instead of by cellphone number | 4afe11af-5c2c-4e83-848f-759ccd0b2e26 |
    | [`Data Element`](https://docs.dhis2.org/2.25/en/user/html/manage_data_element.html) | [u8qaP9AqGL5<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/dataElements/u8qaP9AqGL5) | MomConnect Device MSISDN | +27123456789 |
    | [`Data Element`](https://docs.dhis2.org/2.25/en/user/html/manage_data_element.html) | [MxxPNA4C2xZ<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/dataElements/MxxPNA4C2xZ) | MomConnect Language Preference | en |
    | [`Data Element`](https://docs.dhis2.org/2.25/en/user/html/manage_data_element.html) | [rXkucI2pquj<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/dataElements/rXkucI2pquj) | [Software Type (SWT)](#software-type-provider) Provider Code | 4 |
    | [`Data Element`](https://docs.dhis2.org/2.25/en/user/html/manage_data_element.html) | [uIEht9XYOWS<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/dataElements/uIEht9XYOWS) | [Mobile Health Application (MHA)](#mobile-health-application-provider) Provider Code | 1 |
    | [`Data Element`](https://docs.dhis2.org/2.25/en/user/html/manage_data_element.html) | [VIXMHChW3mb<sup>‡</sup>](https://staging.dhis.dhmis.org/momconnect/api/dataElements/VIXMHChW3mb) | **Event ID** - a uuid generated by Praekelt per message to prevent duplicate events being processed | c20832f3-4ee8-4259-90e8-65b82dd3f245 |

    > **‡** - MomConnect Staging DHIS2 specific UIDs

### Software Type Provider

| Code | SWT |
|:---:|---|
| 1 | VUMI USSD |
| 2 | VUMI SMS |
| 3 | ANDROID REGISTRATION |
| 4 | VUMI WHATSAPP |
| 5 | COMMCARE COMMUNITY APP |
| 6 | COMMCARE FACILITY APP |
| 7 | VUMI USSD4WHATSAPP |

### Mobile Health Application Provider

| Code | MHA |
| :---: | --- |
| 1 | Praekelt Foundation |
| 2 | Dimagi |
| 3 | VP |
| 4 | Mobenzi |
| 5 | Jembi |
| 6 | WhatsApp |
