var sax      = require('sax'),
	saxpath  = require('saxpath'),
	xml2js   = require('xml2js'),
	libxmljs = require('libxmljs'), // for validation only TODO: think about using SAX instead
	stream   = require('stream'),
	util     = require('util'),
	fs       = require('fs');

module.exports = SaxmlpList;
module.exports.Saxmlp = Saxmlp;
module.exports.List = SaxmlpList;

function SaxmlpList(list, settings) {
	if (list.constructor !== Array) {
		this.list = [ new Saxmlp(list, settings) ];
	} else {
		this.list = list.map(function(x) { return new Saxmlp(x.contents, settings); });
	}
	this.settings = settings;
	this.onEnd = [];
}
SaxmlpList.prototype.on = function(tag, handler) {
	this.list.map(function(x) { return x.on(tag, handler); })
	return this;
}
SaxmlpList.prototype.off = function(tag, handler) {
	this.list.map(function(x) { return x.off(tag, handler); })
	return this;
}
SaxmlpList.prototype.end = function(handler) {
	this.onEnd.push(handler);
	return this;
}
SaxmlpList.prototype.error = function(handler) {
	this.list.map(function(x) { return x.error(handler); })
	return this;
}
SaxmlpList.prototype.parse = function() {
	var self = this,
		list = this.list.slice(0),
		next = function() {
			if (!list.length) { return _call(self.onEnd); }
			list.shift().end(next).parse();
		}
	next();
}
SaxmlpList.prototype.validate = function(schemas, task) {
	this.list.map(function(x) { return x.validate(schemas, task) });
}


function Saxmlp(data, settings) {
	if (data) {
		this.data = (data.toString ? data.toString() : data).replace("\ufeff", "");
	}
	this.stream = new StreamVariable(this.data);
	this.parser = sax.createStream(true);
	this.settings = settings;
	this.tags = {};
	this.streamers = {};
	this.onEnd = [];
	this.onError = [];
	var self = this;
	this.stream.on('end', function() { _call(self.onEnd); });
	this.parser.onerror = function(msg) { _call(self.onError); }
}
Saxmlp.prototype.on = function(tag, handler) {
	if (!tag || !handler) { return; }
	if (!this.tags[tag]) { this.tags[tag] = []; }
	this.tags[tag].push(handler);
	this.streamers[tag] = new saxpath.SaXPath(this.parser, tag);
	this.streamers[tag].on('match', this.getMatcher(tag));
	return this;
}
Saxmlp.prototype.off = function(tag, handler) {
	if (!tag || !this.tags[tag]) { return; }
	if (handler) {
		for (var i in this.tags[tag]) {
			if (this.tags[tag] === handler) {
				return this.tags[tag].splice(i, 1);
			}
		}
	} else {
		delete this.tags[tag];
		delete this.streamers[tag];
	}
	return this;
}

Saxmlp.prototype.end = function(handler) {
	this.onEnd.push(handler);
	return this;
}

Saxmlp.prototype.error = function(handler) {
	this.onError.push(handler);
	return this;
}

Saxmlp.prototype.parse = function() {
	// console.log('parse', this);
	this.stream.pipe(this.parser);
	return this;
}

Saxmlp.prototype.validate = function(schemas, task) {
    var xml,
        is_valid = false,
        errh = task.error ? task.error : task, // for compatibility
        schema, xsd, i;
    try {
         xml = libxmljs.parseXml(this.data);
    } catch(e) {
        errh.fatal("Saxmlp.validate: couldn't parse XML"); return;
    }
    if (schemas.constructor !== Array) { schemas = [ schemas ]; }
    for (i in schemas) {
        schema = fs.readFileSync(schemas[i], 'utf-8');
        if (!schema) {
            errh.warn("Saxmlp.validate: couldn't read XSD schema from" + schemas[i]);
            continue;
        }
        xsd = libxmljs.parseXml(schema);
        if (!schema) {
            errh.warn("Saxmlp.validate: libxmljs: couldn't parse XSD schema from" + schemas[i]);
            continue;
        }
        is_valid = xml.validate(xsd); // returns true if XML is valid
        if (is_valid) { break; }
        else {
        	for (var j in xml.validationErrors) {
        		var er = xml.validationErrors[j];
        		errh.fatal(er.line, er.toString().trim() + " | at line " + er.line + " at col " + er.column);
        		// console.log(schemas[i], xml.validationErrors[j].code);
        	}
        }
    }
    return is_valid;
}


/* private methods */

Saxmlp.prototype.getMatcher = function(tag) {
	var self = this;
	return function(xml) {
		if (!self.tags[tag]) { return; }
		var js = xml2js.parseString(xml, function(err, result) {
			if (err) { throw err; }
			_call(self.tags[tag], result);
		})
	}
}


function _call(list, context) {
	for (var i in list) {
		list[i](context);
	}
}




util.inherits(StreamVariable, stream.Readable);

function StreamVariable(data, opt) {
	stream.Readable.call(this, opt);
	this.data = data ? data.toString() : null;
	this.chunkSize = opt && opt.size ? opt.size : 4096;
}

StreamVariable.prototype._read = function() {
	if (!this.data || !this.data.length) {
		return this.push(null);
	}
	var chunk = this.data.substr(0, this.chunkSize);
	this.data = this.data.substr(this.chunkSize);
	this.push(chunk);
}




