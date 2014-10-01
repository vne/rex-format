#!/usr/local/bin/node

// process command line arguments
var argv = require('minimist')(process.argv.slice(2)),
	fs = require('fs'),
	path = require('path'),
	ErrorHandler = require('errh'),
	rexstat = require('rex-stat');

var exec = process.argv[1],
	infiles = argv.i ? argv.i : '/dev/stdin', // will work only on Unix
	outfile = argv.o,
	dicfile = argv.d ? argv.d : 'dic.xml',
	informat = argv.f,
	outformat = argv.t,
	verbose = argv.v,
	force = argv.force,
	stat = new rexstat(),
	currencies = {
		RUR: 1,
		EUR: 48,
		USD: 37
	},
	dir, indata = [], converter, log, task, i, contents;

var currency = {};
currency.rate = function(name) {
	if (!name || !name.toUpperCase) { return 1; }
	name = name.toUpperCase().trim();
	return currencies[name] ? currencies[name] : null;
};
currency.to = function(name, value) {
	var rate = currency.rate(name),
		v = parseFloat(value);
	if (!rate || rate === 1) { return value; }
	if (isNaN(v) || !v) { return v; }
	return v / rate;
}
currency.from = function(name, value) {
	var rate = currency.rate(name),
		v = parseFloat(value);
	if (!rate || rate === 1) { return value; }
	if (isNaN(v) || !v) { return v; }
	return v * rate;
}

// display help if needed
if (argv.h || (!informat && !outformat)) {
	console.log('Usage: %s [-f <input-format-name>|-t <output-format-name>]', exec);
	console.log();
	console.log('Arguments:');
	console.log(' -i <file> - input file name. If not specified, STDIN is used');
	console.log(' -o <file> - output file name. If not specified, STDOUT is used');
	console.log(' -d <file> - dictionary file. Converter may access this file as task.config.dicfile');
	console.log(' -f <name> - format name, from which the conversion should be performed');
	console.log(' -t <name> - format name, to which the conversion should be perform');
	console.log(' -v        - be verbose and print metadata and other useless stuff');
	console.log(' --force   - do a conversion in case of failed validation');
	console.log();
	console.log('If -f and -t arguments are used simultaneously, then -f argument is preferred.');
	console.log('Conversion is always from something to REX format or from REX format to something');
	return;
}


if (informat) {
	dir = -1; // import
	format = informat;
	console.log('Conversion from %s format to REX', format);
} else {
	dir = 1; // export
	format = outformat;
	console.log('Conversion from REX format to format %s', format);
}

// read data from file
for (i = 0; i < infiles.length; i++) {
    contents = fs.readFileSync(infiles[i], { encoding: 'utf-8'});
    if (!contents) continue;
    indata.push({
        name: infiles[i],
        contents: contents
    });
    console.log('Input data length = %d read from %s', contents.length, infiles[i]);
}

if (indata.length == 0) {
	return console.error('No input data');
}

// try to load the converter
try {
	converter = require('./convert/' + format);
} catch(e) {
	return console.log('Failed to load converter library for format %s: %s', format, e);
}
console.log('Converter library found. Calling it now');
console.log();

log = function() {
	console.log.apply(console, Array.prototype.slice.call(arguments, 0));
};
log.error = log;
log.alert = log;
log.info = log;
log.debug = log;
log.progress = log;

task = {
	data: indata,
	format: format,
	config: {
		fetch: "file",
		convert: format,
		publish: "file",
		dicfile: argv.d ? path.resolve(argv.d) : null
	},
	log: log,
	error: new ErrorHandler(format, "convert"),
	stat: stat,
	currency: currency
}

// try to convert data
var cresult, vresult;
if (dir > 0) {
	// case of export
	// no need to validate the input since it is in REX format and we
	// assume that it is always valid for now :)
	try {
		converter.export(task, function(err, result) {
			if (err) { return console.log('An error occured during export: ', err); }
			printResult(result);
		});
	} catch(e) {
		return console.log('Converter has thrown an exception during export:', e);
	}
} else {
	// case of import
	// first try to validate the data
	try {
		converter.validate(task, function(err, vresult) {
			if (err) { return console.log('An error occured during validation: ', err); }
			// if there were errors during validation, print them out
			if (vresult) {
				console.log('---------------------------------------');
				console.log('Validation failed');
				printErrors('validation', vresult);
			}
			if (!vresult || force) {
				// validation was successfull or force is used
				// do the conversion
				try {
					converter.import(task, function(err, result) {
						if (err) { return console.log('An error occured during import: ', err); }
						printResult(result);
					});
				} catch(e) {
					return console.log('Converter has thrown an exception during import:', e);
				}
			}
		});
	} catch(e) {
		return console.log('Converter has thrown an exception during validation:', e);
	}
}

function printResult(cresult) {
	if (cresult) {
		// something was converted
		console.log('---------------------------------------');
		// errors first
		if (!cresult.errors) {
			console.log('Conversion OK');
		} else {
			console.log('There were errors during conversion');
			printErrors('error', cresult.errors);
		}
		// print out metadata if there are some
		if (cresult.meta) {
			console.log('Conversion produced metadata for %d objects', cresult.meta.length);
			if (verbose) {
				printErrors('metadata', cresult.meta);
			}
		}
		// write converted data to file or stdout
        if (cresult.data) {
            if (cresult.data.constructor === Array) {
                cresult.data.forEach(function (d) {
                    if (outfile) {  // treat value existing as flag that write to file needed
                        writeToFile(d);
                    } else {
                        console.log(cresult.data);
                    }
                });
            } else {    // old behavior
                if (outfile) {
                    writeToFile({ name: outfile, contents: cresult.data });
                } else {
                    console.log(cresult.data);
                }
            }
        } else {
            console.log('No data was returned');
        }
	} else {
		console.log('Conversion failed');
	}
}

function printErrors(prefix, errors) {
	for (var i = 0; i < errors.length; i++) {
		console.log("%s: object %s: %s", prefix, errors[i].id, errors[i].error);
	}
}

function writeToFile(d, i, self) {
    //append path to filename, if it has no path already
    var f = path.dirname(d.name) == '.' ? path.join(path.dirname(outfile), d.name) : d.name;
    fs.writeFileSync(f, d.contents, { encoding: 'utf-8' });
}
