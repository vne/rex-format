var fs = require('fs');

module.exports = Dicset;

/*
	A set of dictionaries

	Constructor takes path to dictionary file as first argument, settings object as second argument.

	Dictionary file has an INI-like syntax:

	> [dicname]
	> from1 	to1 	comment1
	> from2	to2		comment2
	> "from 3 value"   "to 3 value"    a long and winding comment
	>
	> [dicname2]
	> ...

	There are two settings recognized by now:
	 - def - a default value that is returned when no dictionary is found
	 - xml2js - boolean, if true - do output in xml2js style (default is old-fashioned non-compatible style :)

	Lines starting with # are treated as comments and ignored. Empty lines are ignored.
	Columns can be divided with any number of space characters (including tabs, excluding newlines).
	'from' and 'to' values can be quoted. In this case they can contain spaces. The following characters
	are recognized as quotes: ", ' and `

	The constructor reads the file and returns an object with several lookup methods. It can throw an exception if
	either a dictionary file couldn't be read or is malformed (not INI-like syntax).

	.lookup method maps values from the first column to the second one, returns object (syntax depends on xml2js option)
	.reverse method maps values from the second column to the first one, returns object
	.comment method maps comments to 'from' and 'to' values (returns object { from: ..., to: ... }), returns object
	.ilookup, .ireverse and .icomment methods perform case-insensitive lookups, they return objects

	.to_id method do a reverse lookup (by 'to' field) and return ID only ('from' field)
	.from_id method do a straight lookup (by 'from' field) and return ID onlu
	.to_comment and .from_comment methods do lookups by 'to' and 'from' fields respectively and return a text comment

	> var dic = new Dicset('/path/to/file');
	> console.log(dic.lookup('metro', 15));

	This will lookup a 'metro' dictionary for value 15 and return an object like this (in case when xml2js option is false):

	> {
	> 	$id: 25,
	> 	comment: 'Central station'
	> }

	With xml2js option set the output will be:

	> {
	> 	$: {
	>		id: 25
	>	},
	> 	comment: 'Central station'
	> }

	If either dictionary is missing or a value is not found, a default value (undefined by default) is returned.

	N.B.! If a lookup result (for either 'from' and 'to' lookups) is zero, this is treated as special case and undefined is returned. You can mark records
	that do not currently have a mapping with zero.
 */

function Dicset(path, settings) {
	var dics, entries, i, rec, e, dn, re, def;
	this.settings = settings && settings.constructor === Object ? settings : {};
	def = settings && settings.constructor === Object ? settings.def : settings; // for compatibility
	try {
		dics =  fs.readFileSync(path, 'utf-8');
	} catch(e) {
		throw new Error("Couldn't find dictionary file: " + path);
	}
	dics = dics.replace("\r\n", "\n");
	entries = dics.split('\n');
	this.dic = {}; // forward lookup table (first column to second)
	this.rev = {}; // reverse lookup table (second column to first)
	this.com = {}; // comment lookup table (third column to first and second)
	this.idic = {} // same, case-insensitive
	this.irev = {};
	this.icom = {};
	if (def) { def === 'true' ? this.def = {} : this.def = def; }
	for (i = 0; i < entries.length; i++) {
		e = entries[i];
		if (/^\s*$/.test(e)) { continue; } // skip empty lines
		if (/^\s*#/.test(e)) { continue; } // skip comments
		if (re = /^\s*\[(.+)\]\s*$/.exec(e)) {
			// read current dic name
			dn = re[1];
			continue;
		}
		if (!dn) {
			throw new Error("Malformed dictionary file: " + path);
		}
		if (!this.dic[dn])  { this.dic[dn]  = {}; }
		if (!this.rev[dn])  { this.rev[dn]  = {}; }
		if (!this.com[dn])  { this.com[dn]  = {}; }
		if (!this.idic[dn]) { this.idic[dn] = {}; }
		if (!this.irev[dn]) { this.irev[dn] = {}; }
		if (!this.icom[dn]) { this.icom[dn] = {}; }

		var vals = this._parseLine(e);
		if (!vals) {
			throw new Error("Malformed dictionary file: " + path + " at line " + (i + 1));
		}
		for (var j = 0; j < vals.length; j++) {
			var v = vals[j];
			this.dic[dn][v.from]    = { id: v.to,     comment: v.comment };
			this.rev[dn][v.to]      = { id: v.from,   comment: v.comment };
			this.com[dn][v.comment] = { from: v.from, to: v.to           };
			this.idic[dn][v.from.toString().toLowerCase()]    = this.dic[dn][v.from];
			this.irev[dn][v.to.toString().toLowerCase()]      = this.rev[dn][v.to];
			this.icom[dn][v.comment.toString().toLowerCase()] = this.com[dn][v.comment];
		}
	}
}

Dicset.prototype.to_id = function(dic, id, icase) {
	var v = this.reverse(dic, id, icase);
	if (v) { return v.$id; }
}

Dicset.prototype.from_id = function(dic, id, icase) {
	var v = this.lookup(dic, id, icase);
	if (v) { return v.$id; }
}

Dicset.prototype.to_comment = function(dic, id, icase) {
	var v = this.reverse(dic, id, icase);
	if (v) { return v._; }
}

Dicset.prototype.from_comment = function(dic, id, icase) {
	var v = this.lookup(dic, id, icase);
	if (v) { return v._; }
}

Dicset.prototype.lookup = function(dic, id, icase) {
	if (!this.dic[dic]) { return this.def; }
	if (id && icase) { id = id.toString().toLowerCase(); }
	return this.formatEntry(this.dic[dic][id]);
}
Dicset.prototype.ilookup = function(dic, id) { return this.lookup(dic, id, true); }

Dicset.prototype.reverse = function(dic, id, icase) {
	if (!this.rev[dic]) { return this.def; }
	if (id && icase) { id = id.toString().toLowerCase(); }
	return this.formatEntry(this.rev[dic][id]);
}
Dicset.prototype.ireverse = function(dic, id) { return this.reverse(dic, id, true); }

Dicset.prototype.comment = function(dic, id, icase) {
	if (!this.com[dic]) { return this.def; }
	if (id && icase) { id = id.toString().toLowerCase(); }
	return this.com[dic][id];
}
Dicset.prototype.icomment = function(dic, id) { return this.comment(dic, id, true); }

Dicset.prototype.formatEntry = function(v) {
	if (this.settings.xml2js) { return this.xml2jsFormatter(v); }
	return this.defaultFormatter(v);
}

Dicset.prototype.defaultFormatter = function(v) {
	if (typeof v === "undefined") { return this.def; }
	var vi = parseInt(v.id, 10);
	if (vi === 0) { return this.def; } // special case: 0 means absense of value
	return { $id: v.id, _: v.comment };
}

/* format entries in xml2js style */
Dicset.prototype.xml2jsFormatter = function(v) {
	if (typeof v === "undefined") { return this.def; }
	var vi = parseInt(v.id, 10);
	if (vi === 0) { return this.def; } // special case: 0 means absense of value
	return { $: { id: v.id }, _: v.comment };
}

Dicset.prototype._parseLine = function(line) {
	var c, i, quote, skip = false, from, to, comment, buf = '',
		quotes = /["'`]/,
		spaces = /\s/,
		STATE = {
			from: 0,
			to: 1,
			comment: 2,
			space: 10
		},
		st = STATE.from;

	line = line.trim();
	i = 0;
	while ( i < line.length ) {
		c = line.charAt(i);
		// console.log('  ', st, i, c, 'quote=',quote, 'buf=', buf);
		if (!skip) {
			i += 1;
		}
		skip = false;
		if (st === STATE.from) {
			if (quote) {
				if (c === quote) {
					from = buf;
					buf = '';
					quote = undefined;
					st = STATE.to;
				} else {
					buf += c;
				}
			} else {
				if (!buf.length && quotes.test(c)) {
					quote = c;
					continue;
				} else if (spaces.test(c)) {
					from = buf;
					buf = '';
					quote = undefined;
					st = STATE.to;
				} else {
					buf += c;
				}
			}
		} else if (st === STATE.to) {
			if (!buf.length && spaces.test(c)) {
				continue;
			}
			if (quote) {
				if (c === quote) {
					to = buf;
					buf = '';
					quote = undefined;
					st = STATE.comment;
				} else {
					buf += c;
				}
			} else {
				// console.log('    to', buf.length, quotes.test(c), c);
				if (!buf.length && quotes.test(c)) {
					quote = c;
					continue;
				} else if (spaces.test(c)) {
					to = buf;
					buf = '';
					quote = undefined;
					st = STATE.comment;
				} else {
					buf += c;
				}
			}
		} else if (st === STATE.comment) {
			if (!buf.length && spaces.test(c)) {
				continue;
			}
			comment = line.substr(i - 1).trim();
			break;
		}
	}
	if (buf.length) {
		if (!from) { throw new Error("Malformed line: " + line); };
		if (!to) { to = buf; }
		else if (!comment) { comment = buf; }
	}
	// console.log('  FIN', from, '|', to, '|', comment);
	return [{
		from: from,
		to: to,
		comment: comment || ''
	}];
}

