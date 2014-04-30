#!/usr/local/bin/node

var argv = require('minimist')(process.argv.slice(2)),
	fs = require('fs');

var exec = process.argv[1],
	infile = argv.i ? argv.i : '/dev/stdin', // will work only on Unix
	outfile = argv.o,
	dicfile = argv.d ? argv.d : 'dic.xml',
	informat = argv.f,
	outformat = argv.t,
	verbose = argv.v,
	force = argv.force,
	dir, indata, converter;

if (argv.h || (!informat && !outformat)) {
	console.log('Usage: %s [-f <input-format-name>|-t <output-format-name>]', exec);
	console.log();
	console.log('Arguments:');
	console.log(' -i <file> - input file name. If not specified, STDIN is used');
	console.log(' -o <file> - output file name. If not specified, STDOUT is used');
	console.log(' -d <file> - name of the file with dictionaries. Reserved for the future');
	console.log(' -f <name> - format name, from which the conversion should be performed');
	console.log(' -t <name> - format name, to which the conversion should be perform');
	console.log(' -v        - be verbose and print metadata and other useless stuff');
	console.log(' --force   - do a conversion in case of failed validation');
	console.log();
	console.log('If -f and -t arguments are used simultaneously, then -f argument is preferred.');
	console.log('Conversion is always from something to REX format or from REX format to something');
	return;
}

if (!informat && !outformat) {
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

indata = fs.readFileSync(infile, { encoding: 'utf-8' });

if (!indata) {
	return console.error('No input data');
}
console.log('Input data length = %d read from %s', indata.length, infile);

try {
	converter = require('./convert/' + format);
} catch(e) {
	return console.log('Failed to load converter library for format %s: %s', format, e);
}
console.log('Converter library found. Calling it now');
console.log();

var cresult, vresult;
if (dir > 0) {
	// export
	// no need to validate the input since it is in REX format and we
	// assume that it is always valid for now :)
	try {
		cresult = converter.export({
			data: indata,
			format: format
		});
	} catch(e) {
		return console.log('Converter has thrown an exception during export:', e);
	}
} else {
	// import
	try {
		vresult = converter.validate({
			data: indata,
			format: format
		});
	} catch(e) {
		return console.log('Converter has thrown an exception during validation:', e);
	}
	if (vresult) {
		console.log('---------------------------------------');
		console.log('Validation failed');
		printErrors('validation', vresult);
	}
	if (!vresult || force) {
		// validation is successfull or force is used
		try {
			cresult = converter.import({
				data: indata,
				format: format
			});
		} catch(e) {
			return console.log('Converter has thrown an exception during import:', e);
		}
	}
}
if (cresult) {
	// something was converted
	console.log('---------------------------------------');
	if (!cresult.errors) {
		console.log('Conversion OK');
	} else {
		console.log('There were errors during conversion');
		printErrors('error', cresult.errors);
	}
	if (cresult.meta) {
		console.log('Conversion produced metadata for %d objects', cresult.meta.length);
		if (verbose) {
			printErrors('metadata', cresult.meta);
		}
	}
	if (cresult.data) {
		if (outfile) {
			fs.writeFileSync(outfile, cresult.data, { encoding: 'utf-8' });
		} else {
			console.log(cresult.data);
		}
	} else {
		console.log('No data was returned');
	}
} else {
	console.log('Conversion failed');
}

function printErrors(prefix, errors) {
	for (var i = 0; i < errors.length; i++) {
		console.log("%s: object %s: %s", prefix, errors[i].id, errors[i].error);
	}
}