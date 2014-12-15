# dhis2-tracker-populator

Populate [DHIS2 Tracker](https://www.dhis2.org/individual-data-records) with individual data records read from a number of CSV files.

### Install
This is a node.js application. Refer to http://nodejs.org/ for instructions on how install nodejs and NPM for your operating system.

Install the package globally using NPM.

```bash
npm install -g dhis2-tracker-populator
```

### CSV file format

The CSV files must follow a naming convention of `programID.programStageID.trackedEntityID.csv`. The values that make up the filename will be used when making requests to the API.

The CSV files must contain the following columns:
* `orgUnit`
* `programDate`
* `eventDate`

Any number of additional attributes or data elements can be specified with column headers of the following format:
* Attributes: The ID of the attribute prepended with the string `A|`.
* Data elements: The ID of the data element prepended with the string `DE|`.
* Each line in the CSV corresponds to an event.
* If the tracked entity exists already, atrributes will not be updated
* If the tracked entity is already enrolled into the program, the application will continue on to adding the event
* There is no restriction on the number of events added to a program for a particular tracked entity, and multiple identical events can be added (for example if the same csv file is operated on more than once) 
* The application assumes that there is only one unique attribute per tracked entity (this is determined by the application at run time from the DHIS2 resources api) 
* The csv file can be generated from a sql query to a database, from an excel spreadsheet, or any other source, as ong as it is added to the csv directory in the proper format (this must actually be comma separated)   

### Run

Run the populator from the command line.

```
Usage: dhis2-tracker-populator [OPTIONS] URL

Options:
  -c, --csv   Path to the directory containing the csv files
  -d, --done  Path to the directory in which to place the done files
  -f, --fail  Path to the directory in which to place the failed files

  --help      Show this help
  --version   Print the version and exit
```
NB: The folders specified in the options above need to be created manually

The default options are:
* csv: `./csv/`
* done: `./csvdone/`
* fail: `./csvfail/`

Example:
```bash
dhis2-tracker-populator https://username:password@apps.dhis2.org/demo
```

This will read data records from the CSV files found in the `csv` directory and make requests to the API for the given URL to populate the tracker. If an error occurs while processing a CSV file it will be moved into the `csvfail` directory, otherwise it will be moved to the `csvdone` directory on completion.

Best practice is to use ./bin/split.js  to split a multi-line csv into individual files. This will give granular control and a view of exactly which files have been processed and which did not get fully added to the program.

### Notes
To remove ALL tracker data from your DHIS2 database run the following sql commands in order: 

delete from trackedentitydatavalue;
delete from programstageinstance;
delete from programinstance;
delete from trackedentityaudit;
delete from trackedentityattributevalue;
delete from trackedentityinstance;

WARNING: This cannot be undone
