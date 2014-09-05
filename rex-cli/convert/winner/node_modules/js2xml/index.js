module.exports = js2xml;

/*
	Convert JSON object to XML structure

	Important! This library is not compatible 1-to-1 with xml2js

	Example 1:
	var obj = {
		x: "5",
		y: [ 1, 2, 3 ],
		z: {
			z1: "10",
			z2: { z3: "15" }
		}
	}
	js2xml output for this object will be:
	<?xml version="1.0" encoding="UTF-8"?>
	<x>5</x>
	<y>1</y>
	<y>2</y>
	<y>3</y>
	<z>
		<z1>10</z1>
		<z2>
			<z3>15</z3>
		</z2>
	</z>

	Example 2:
	var obj = {
		root: {
			$: { version: 1 },
			_: "a text string",
			list: { y: [
				{
					$: { v: 2 },
					attr: 10
				},
				2,
				3]
			}
		}
	}
	js2xml output for this object will be:
	<?xml version="1.0" encoding="UTF-8"?>
	<root version="1">
		a text string
		<list>
			<y v="2">
				<attr>10</attr>
			</y>
			<y>2</y>
			<y>3</y>
		</list>
	</root>

	Written by Vladimir Neverov <sanguini@gmail.com> in 2014
 */

function js2xml(obj, skipHeader) {
	var k, tag, string = '';
	for (k in obj) {
		if (['$', '_'].indexOf(k) >= 0) { continue; }
		if (obj[k] && obj[k].constructor === Array) {
			obj[k].forEach(function(e) {
				string += processKey(k, e);
			});
		} else {
			string += processKey(k, obj[k]);
		}
	}
	return skipHeader ? string : '<?xml version="1.0" encoding="UTF-8"?>' + string;
}

function processKey(k, data) {
	var string = '';
	if (data) {
		if (data.constructor === String) {
			return openTag(k) + cdata(data) + closeTag(k);
		} else if (data.toString() === parseFloat(data).toString()) {
			return openTag(k) + data + closeTag(k);
		}
	}
	if (!data || Object.keys(data).length === 1 && data.$) {
		return openTag(k, data ? data.$ : null, true);
	}
	string += openTag(k, data.$);
	if (data._) {
		string += data._;
	}
	string += js2xml(data, true);
	string += closeTag(k);
	return string;
}

function openTag(name, attrs, selfClose) {
	var tag = '<' + name;
	if (attrs) {
		for (var i in attrs) {
			tag += ' ' + i + '="' + attrs[i] + '"';
		}
	}
	if (selfClose) { tag += ' /'; }
	tag += '>';
	return tag;
}

function closeTag(name) {
	return '</' + name + '>';
}

function cdata(text) {
	return text;
	return '<![CDATA[' + text + ']]>';
}