#!/usr/bin/env node

var path = require('path'),
	fs = require('fs'),
	pyfmt = require('pyfmt').upgrade(),
	objpath = require('object-path'),
	traverse = require('traverse'),
	argv = require('minimist')(process.argv.slice(2)),
	diff = require('deep-diff'),
	ErrorHandler = require('errh'),
	rexstat = require('rex-stat'),
	Saxmlp = require('saxmlp'),
	MAX_LEN = 60,         // maximum length of inline diff description
	MAX_OBJECT_COUNT = 5, // when neither -v nor -s are specified
	currencies = {
		RUR: 1,
		EUR: 48,
		USD: 37
	},
	limit_object_count = argv.v || argv.s ? 0 : MAX_OBJECT_COUNT,
	format = argv._[0],
	file = argv._[1],
	cstat = {},
	imex_path = path.normalize(process.argv[1]),
	imex_bin = path.basename(imex_path),
	imex_root = path.dirname(imex_path),
	task, i, phases, res, indata, buf, log;

// hardcoded unimportant XML paths (they are matched as strings or regexes against object-path representations of paths in xml2js objects)
var unimp_paths = [
	/^meta\.0\.attachments\.0\.attachment\.\d+\.(width|height|size|length|title|mime)/i,
	/^meta\.0\.(highlight|imported|source|url)/,
	/^title/,
	/^owner\.0\.group/,
	/^owner\.0\.url/,
	/^owner\.0\.agent\.0\.\$/,
	/^estate\.0\.\$/,
];
// paths of medium importance
var medium_importance_paths = [
	/^meta\.0\.(link|extid)/,
	/^estate\.0\.facilities/,
	/^estate\.0\.location\.0\.(gps|street|flat)/,
	/^estate\.0\.flat\.0\.levels/,
	/^estate\.0\.flat\.0\.storey\.0\.type/,
	/^estate\.0\.house\.0\.(ready_status|repair_year)/,
	/^rent\.0/,
	/^$\.(ctm|mtm)/
];

if (!format || argv.h) {
	console.log('Usage: %s format input-file [-s|-v] [-d dictionary-file] [-x exclude-list-file]', imex_bin);
	console.log();
	console.log(' -s     - do a double conversion of input data, display statistics');
	console.log(' -v     - do a double conversion, display information on each compared object (may be a LONG output)');
	console.log(' -d     - path to dictionary file, will be passed as task.config.dicfile to a converter');
	console.log(' -x     - path to file which contains a list of tags that should be excluded from comparison. Tag started with / is treated as a regex');
	console.log(' -n     - process only this amount of objects in case when neither -v nor -s options are specified (' + MAX_OBJECT_COUNT + ' by default)')
	console.log(' -h     - this help');
	console.log();
	console.log('A run without options will behave like -v, but details about missing/changed strings will be omitted');
	console.log('-s will override -v');
	return;
}

if (argv.n) {
	limit_object_count = parseInt(argv.n, 10);
}

// currency converter stub
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

// logger stub
log = function() {
	console.log.apply(console, Array.prototype.slice.call(arguments, 0));
};
log.error = log;
log.alert = log;
log.info = log;
log.debug = log;
log.progress = function(){}; // do not log progress here

// read exceptions list from the file, merge with hardcoded exceptions in unimp_paths
if (argv.x) {
	var xdata = fs.readFileSync(argv.x, "utf-8");
	if (!xdata) {
		console.log("Couldn't read exceptions list from file", argv.x);
	} else {
		unimp_paths = unimp_paths.concat(
			xdata
				.split('\n')
				.filter(function(x) { x = x.trim(); return x.length && x.indexOf('#') !== 0 })
				.map(function(x) { return x.indexOf('/') === 0 ? new RegExp(x.substr(1)) : x })
		);
	}
}

// require the converter
try {
	req = path.resolve(path.join('./tasks/convert', format));
	console.log('require', req);
	converter = require(req);
} catch(e) {
	return console.log('Failed to load converter library for format %s: %s', format, e.toString());
}

if (limit_object_count) {
	console.log("Limiting object count to", limit_object_count, "use -s or -v to process the whole input");
}

// read input data from file
var indata = fs.readFileSync(file, "utf-8"),
	infiles = [ { name: file, contents: indata} ];
if (!indata) {
	return console.error("Couldn't read input file", file);
}

// create task object
task = {
	data: infiles,                                       // input data
	format: format,                                      // format name
	config: {                                            // fake task config
		convert: format,
		dicfile: argv.d ? path.resolve(argv.d) : null    // dictionary file
	},
	log: log,                                            // logger
	error: new ErrorHandler(format, "convert"),          // error handler
	stat: new rexstat(),                                 // statistics handler
	currency: currency,                                  // currency stub
	__file: req,                                         // path to required module
	__dir: path.dirname(req)
};

// create a map of input objects
parseResult(infiles, limit_object_count, function(err, inmap) {
	if (err) { return console.log(err); }
	// export input data
	console.log("Exporting orders");
	converter.export(task, function(err, eres) {
		if (err) { return console.error('Export error', err.toString()); }
		// import the results of export
		console.log("Importing exported objects");
		task.data = eres.data;
		converter.import(task, function(err, ires) {
			if (err) { return console.error("Import error", err.toString()); }
			// create a map of imported objects
			parseResult(ires.data, limit_object_count, function(err, exmap) {
				if (err) { return console.error('Import error', err.toString()); }
				console.log('Double conversion done, comparing data');
				// do the comparison of original and imported objects
				compareResults(inmap, exmap);
			});
		});
	});
});

////////////////////////////////////////////////////////////////////////////


/* parse REX XML and return a map of orders where order IDs are the keys */
function parseResult(data, lim, callback) {
	var xmlp = new Saxmlp(data),
		res = {}, cnt = 0;
	xmlp.error(function(msg) { console.error("Error parsing XML", msg); callback(new Error("Error parsing XML" + msg.toString()) )})
	xmlp.on('//orders/order', function(xml) {
		var order = xml.order,
			oid = parseInt(objpath.coalesce(order, ["$.id", "meta.0.extid"]), 10);
		cnt += 1;
		if (lim && cnt > lim) { return; }
		// console.log('oid', oid);
		if (!oid) { return; }
		res[oid] = order;
	});
	xmlp.end(function() {
		callback(null, res);
	});
	xmlp.parse();
}

/* compare original input and results of double conversion */
function compareResults(inmap, exmap) {
	var lmiss = {}, rmiss = {}, tocmp = {}; i;
	for (i in inmap) {
		if (!exmap[i]) {
			rmiss[i] = inmap[i];
		} else {
			tocmp[i] = inmap[i];
		}
	}
	for (i in exmap) {
		if (!inmap[i]) {
			lmiss[i] = exmap[i];
		}
	}

	if (limit_object_count || argv.s) {
		var ks = Object.keys(tocmp);
		ks.map(function(x) { compareOrders(x, inmap[x], exmap[x]); });
		Object.keys(cstat)
			.sort(function(a, b) {
				return cstat[b].total - cstat[a].total;
			})
			.map(function(x) {
				console.log("%50s: %5.1f%% %4d/%d (%4d changed, %4d new, %4d deleted, %4d array changed)".pyfmt(x, cstat[x].total/ks.length*100, cstat[x].total, ks.length, cstat[x].E||0, cstat[x].N||0, cstat[x].D||0, cstat[x].A||0));
			});

	}
	if (limit_object_count || argv.v) {
		if (Object.keys(rmiss).length) {
			console.log("Only in original");
			Object.keys(rmiss).map(function(x) { console.log('oo:', objectSig(x, rmiss[x])); });
			console.log();
		}
		if (Object.keys(lmiss).length) {
			console.log("Only in conversion results");
			Object.keys(lmiss).map(function(x) { console.log('or:', objectSig(x, lmiss[x])); });
			console.log();
		}

		if (Object.keys(tocmp).length) {
			// console.log("Left for comparison:", Object.keys(tocmp).length);
			Object.keys(tocmp).map(function(x) {
				console.log(compareOrders(x, inmap[x], exmap[x]));
			})
		}
	}
}

/* compare two orders (original and imported), return string representation of diff */
function compareOrders(id, left, right) {
	var df = groupDiffs(diff(rmUndefined(left), rmUndefined(right)));
	return "\n" + objectSig(id, left) + "\n" + strDiffs(id, df).map(function(x) { return '  ' + x }).join('\n');
	// console.log();
	// console.log(objectSig(id, left));
	// strDiffs(id, df).map(function(x) { console.log('  ', x); })
}

/* stringify object diffs, return string */
function strDiffs(id, df) {
	var s = [];
	if (df.important.N) { df.important.N.map(function(x) { s.push('[!] ' + strDiff(id, x)); }); }
	if (df.important.D) { df.important.D.map(function(x) { s.push('[!] ' + strDiff(id, x)); }); }
	if (df.important.E) { df.important.E.map(function(x) { s.push('[!] ' + strDiff(id, x)); }); }
	if (df.medium.N) { df.medium.N.map(function(x) { s.push('    ' + strDiff(id, x)); }); }
	if (df.medium.D) { df.medium.D.map(function(x) { s.push('    ' + strDiff(id, x)); }); }
	if (df.medium.E) { df.medium.E.map(function(x) { s.push('    ' + strDiff(id, x)); }); }
	return s;
}

/* stringify one diff, return a string */
function strDiff(id, df) {
	var s, a, fmt = "%9s property %-40s";
	// console.log('strDiff', JSON.stringify(df, null, 4));
	if (df.kind === 'D') {
		s = fmt.pyfmt('missing', df.path.join('.'));
		if (argv.v) { s += ' | ' + shorten(df.lhs); }
	} else if (df.kind === 'N') {
		s = fmt.pyfmt('redundant', df.path.join('.'));
		if (argv.v) { s += ' | ' + shorten(df.rhs); }
	} else if (df.kind === 'E') {
		s = fmt.pyfmt('changed', df.path.join('.'));
		if (argv.v) {
			var l = shorten(df.lhs),
				r = shorten(df.rhs);
			if (l.length > MAX_LEN && r.length > MAX_LEN) {
				s += ' | ' + l + "\n\t  --" + r;
			} else if (l.length > MAX_LEN) {
				s += ' | ' + l + "\n\t  --\n\t" + r;
			} else if (r.length > MAX_LEN) {
				s += ' | ' + l + "\n\t  --" + r;
			} else {
				s += ' | ' + l.trim() + ' -- ' + r.trim();
			}
		}
	}
	return s;
}

/* stringify and shorten a diff description, return a string */
function shorten(x) {
	var s;
	if (!x) { return; }

	if (x.constructor === Array && x.length === 1) {
		x = x[0];
	}

	if (x.constructor === Object) {
		s = JSON.stringify(x);
	} else if (x.constructor === Array) {
		s = '[';
		if (x.length) {
			// console.log('shorten', x.length, x);
			if (x.length > 4) {
				x.slice(0, 3).map(shorten);
				s += '...';
				s += x[x.length - 1];
			} else {
				s += x.map(shorten).join(',');
			}
		}
		s += ']';
	} else {
		s = x.toString();
	}
	if (s.length > MAX_LEN) {
		return "\n\t" + s;
	} else {
		return s;
	}
}

/* group diffs by importance, add numbers to statistics, return object with grouped diffs (important, medium, unimportant) */
function groupDiffs(df) {
	var g = { important: {}, medium: {}, unimportant: {} };
	df.map(function(x) {
		var p = x.path.join('.'),
			r = g.important;

		if (pathMatches(p, unimp_paths)) { r = g.unimportant; }
		else if (pathMatches(p, medium_importance_paths)) { r = g.medium; };

		if (r !== g.unimportant) {
			if (!cstat[p]) { cstat[p] = { total: 0 }; }
			if (!cstat[p][x.kind]) { cstat[p][x.kind] = 0; }
			cstat[p][x.kind] += 1;
			cstat[p].total += 1;
		}

		if (!r[x.kind]) { r[x.kind] = []; }
		r[x.kind].push(x);
	});
	return g;
}

/* return true if one of the conditions match the path */
function pathMatches(p, conds) {
	for (var i in conds) {
		var c = conds[i];
		if (c.constructor === RegExp) {
			if (c.test(p)) { return true; }
		} else if (c.constructor === Function) {
			if (c(p)) { return true; }
		} else if (c.constructor === String) {
			if (c === p) { return true; }
		}
	}
}

/* remove undefined fields in object, trim strings */
function rmUndefined(obj) {
    return traverse(obj).map(function (x) {
        if (typeof x === "undefined" || (x === null) || ((x.constructor === Object) && (Object.keys(x).length == 0))) {
            return this.remove();
        } else if (x.constructor === String) {
        	this.update(x.trim());
        }
    });
}

/* return estate order signature (id, address, etc) as string */
function objectSig(id, obj) {
	var address = objpath.get(obj, "estate.0.location.0.string.0"),
		type = objpath.get(obj, "type.0._"),
		etype = objpath.get(obj, "estate.0.type.0._"),
		otype = objpath.get(obj, "estate.0.object.0._");
	return "%8d (%12s, %12s, %17s | %s)".pyfmt(id, type, etype, otype, address);
}