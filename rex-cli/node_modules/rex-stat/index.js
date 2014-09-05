var objpath = require('object-path'),
	pyfmt = require('pyfmt').upgrade(),
	xml2js = require('xml2js');

module.exports = REXStat;

function REXStat(task, id, settings) {
	this.task = task;
	this.id = id;
	this.settings = settings;
	this.start_tm = new Date();
	this.stat = {
		ok: 0,
		fail: 0,
		total: 0,
		by_op: {},
		by_etype: {},
		by_otype: {},
	};
}

REXStat.prototype.ok = function(order) {
	if (!order) { return; }
	this.processOrder(order, true);
	this.stat.ok += 1;
}

REXStat.prototype.fail = function(order) {
	if (!order) { return; }
	this.processOrder(order, false);
	this.stat.fail += 1;
}

REXStat.prototype.processOrder = function(order, success) {
	var self = this;
	if (order.constructor === String) {
		xml2js.parseString(order, function(err, res) {
			if (err) { return console.log("REXStat: XML parsing error"); }
			self.addOrder(res.order, success);
		})
	} else if (order.constructor === Object) {
		self.addOrder(order, success);
	} else {
		return console.log("REXStat: order is neither a string nor an object");
	}
}

REXStat.prototype.addOrder = function(order, success) {
	var oid = objpath.coalesce(order, ["$.id", "meta.0.extid.0", "meta.0.extid.0._"]),
		opr = op(order, "type.0"),
		etype = op(order, "estate.0.type.0"),
		otype = op(order, "estate.0.object.0"),
		photos = op(order, "meta.0.attachments.0.attachment"),
		photocnt = photos ? photos.length : 0,
		suffix = success ? ".ok" : ".fail";

	this.stat.total += 1;

	this.inc("by_op." + opr, 1, suffix);
	this.inc("by_etype." + etype, 1, suffix);
	this.inc("by_otype." + otype, 1, suffix);

	this.inc("by_op."    + opr   + ".by_etype." + etype, 1, suffix);
	this.inc("by_otype." + otype + ".by_etype." + etype, 1, suffix);

	this.inc("by_etype." + etype + ".by_op." + opr, 1, suffix);
	this.inc("by_otype." + otype + ".by_op." + opr, 1, suffix);

	this.inc("by_op."    + opr   + ".by_otype." + otype, 1, suffix);
	this.inc("by_etype." + etype + ".by_otype." + otype, 1, suffix);

	this.inc("photos.total", photocnt);
	if (!photocnt) { this.inc("photos.zero"); }
	if (photocnt) { this.inc("photos.exist"); }
}

REXStat.prototype.inc = function(path, inc, suffix) {
	if (!inc) { inc = 1; }
	var tpath = suffix ? path + ".total" : path,
		spath = path + suffix;
	objpath.set(
		this.stat,
		tpath,
		zint(objpath.get(this.stat, path + ".total", 0)) + inc
	);
	if (suffix) {
		objpath.set(
			this.stat,
			path + suffix,
			zint(objpath.get(this.stat, path + suffix, 0)) + inc
		);
	}
}

REXStat.prototype.toString = function() {
	var i, j, l1w = 17, l2w = 30, maxw = 30;
		s = "\nStatistics for " + this.task + ": " + this.id + "\n",
		s += "  Conversion started at " + this.start_tm + " and took " + ((new Date()).getTime() - this.start_tm)/1000 + " s\n";
		fleaf = function(name, leaf, width) {
			width = Math.max(width, name.length);
			var w2 = maxw - width;
			return ("%" + width + "s:%" + w2 + "s %8d = %8d ok + %8d errors\n").pyfmt(name, "", (leaf.total || 0), (leaf.ok || 0), (leaf.fail || 0));
		},
		fsub = function(spaces, list) {
			var q = '';
			for (var j in list) {
				q += spaces + fleaf(j, list[j], l2w);
			}
			return q;
		}

	s += fleaf("Totals", this.stat, 8);
	s += "    of them " + (this.stat.photos.exist || 0) + " have photos, " + (this.stat.photos.zero || 0) + " do not. " + (this.stat.photos.total || 0) + " photos processed.\n";
	s += "\n";

	s += "By operation:\n================================\n";
	for (i in this.stat.by_op) {
		s += "  " + fleaf(i, this.stat.by_op[i], l1w);
		s += fsub("  ", this.stat.by_op[i].by_etype);
		s += fsub("  ", this.stat.by_op[i].by_otype);
	}
	s += "\n";
	s += "By estate type:\n================================\n";
	for (i in this.stat.by_etype) {
		s += "  " + fleaf(i, this.stat.by_etype[i], l1w);
		s += fsub("  ", this.stat.by_etype[i].by_op);
		s += fsub("  ", this.stat.by_etype[i].by_otype);
	}
	s += "\n";
	s += "By object type:\n================================\n";
	for (i in this.stat.by_otype) {
		s += "  " + fleaf(i, this.stat.by_otype[i], l1w);
		s += fsub("  ", this.stat.by_otype[i].by_etype);
		s += fsub("  ", this.stat.by_otype[i].by_op);
	}

	return s;
}


function tagtext(tag) {
	if (!tag) { return; }
	if (tag.constructor === Object) {
		return tag._;
	}
	return tag;
}

function op(obj, path) {
	return tagtext(objpath.get(obj, path));
}

function zint(x) {
	var y = parseInt(x, 10);
	return isNaN(y) ? 0 : y;
}

