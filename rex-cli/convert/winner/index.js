/*
	Library for converting real estate data between REX and Winner XML formats
	REX format: https://github.com/vne/rex-format
	Winner format: https://baza-winner.ru/winner/support/xml-template.html

	This library implements interface described here: https://github.com/vne/rex-format/tree/master/rex-cli

	Written by Vladimir Neverov <sanguini@gmail.com> in 2014
 */

var Saxmlp   = require('saxmlp'),
	js2xml   = require('js2xml'),
	Dicset   = require('Dicset'),
	traverse = require('traverse'),
	moment   = require('moment'),
	objpath  = require('object-path');

module.exports = {
	export: function(task, callback) {
		var results = {}, cnt = 0, ecnt = 0,
			xmlp = new Saxmlp(task.data),
			dic = new Dicset(task.config.dicfile);

		// set parser error handler
		xmlp.error(function(msg) { task.log.error("XML parser error:", msg); });

		// each 'order' tag will be processed here
		// JSON representation of XML fragment created by xml2js is passed as first argument
		xmlp.on('//orders/order', function(xml) {
			var order = xml.order,        // get JSON for the order itself
				file = getFileFor(order), // determine the destination file
				res, obj = {};
			cnt += 1;
			// do not convert the order if there's no destination file
			if (!file) { return task.error.fatal(order && order.$ ? order.$.id : null, "Couldn't find appropriate file for the order"); }
			// do the conversion
			res = exportOrder(task, order, dic);
			// if there is a result
			if (res) {
				ecnt += 1;
				// put the conversion result to the appropriate file
				obj[file.elem] = res;
				if (!results[file.name]) { results[file.name] = { contents: [], file: file }; }
				results[file.name].contents.push(js2xml(obj, true));
			}
			if (cnt % 100 === 0) { task.log.progress("processed", cnt, "orders, exported", ecnt, "of them"); }
		});

		// in the end of input data we put all converted data together
		xmlp.end(function() {
			// add XML headers, correct root tags and XSD schemas
			var res = Object.keys(results).map(function(e) {
				return {
					type: 'file',
					name: e,
					contents: '<?xml version="1.0" encoding="UTF-8"?><'
						+ results[e].file.root
						+ ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="'
						+ results[e].file.schema
						+ '">'
						+ results[e].contents.join('\n')
						+ '</' + results[e].file.root + '>',
				}
			});
			// end the conversion
			callback(null, {
				data: res,
				from: 'rex',
				to: task.format,
				errors: task.error,
				meta: null
			});
		});

		// start XML processing
		xmlp.parse();
	},
	import: function(task, callback) {
		var results = [], cnt = 0,
			xmlp = new Saxmlp(task.data),
			dic = new Dicset(task.config.dicfile, { xml2js: true }),
			// handleREX function is common post-processor for all types of estate
			handleREX = function(xml, res) {
				cnt += 1;
				if (res) {
					// put converted data to the results list
					results.push(res);
				}
				if (cnt % 100 === 0) {
					task.log.progress("processed", cnt, "orders, imported", results.length, "of them");
				}
			}

		// set parser error handler
		xmlp.error(function(msg) { task.log.error("XML parser error:", msg); });

		// register handlers for several estate tags (see Winner format description for more)
		xmlp.on('//flats/flat',                   function(xml) { handleREX(xml.flat,          importObjectAs('flat',     task, xml.flat,          dic)); })
		xmlp.on('//rent/flat',                    function(xml) { handleREX(xml.flat,          importObjectAs('rent',     task, xml.flat,          dic)); })
		xmlp.on('//country_houses/country_house', function(xml) { handleREX(xml.country_house, importObjectAs('country',  task, xml.country_house, dic)); })
		xmlp.on('//commercials/commercial',       function(xml) { handleREX(xml.commercial,    importObjectAs('commerce', task, xml.commercial,    dic)); })

		// in the end of input data we put all converted data together
		xmlp.end(function() {
			callback(null, {
				data: '<?xml version="1.0" encoding="UTF-8"?><root rev="1.0"><orders>' + results.join('\n') + '</orders></root>',
				from: 'rex',
				to: task.format,
				errors: task.error,
				meta: null
			});
		});

		// start XML processing
		xmlp.parse();
	},
	validate: function(task, callback) {
		// if at least one XSD schema among listed in task.config.schemas says that data is valid,
		// then return no error
		var xmlp = new Saxmlp(task.data);
		if (xmlp.validate(task.config.schemas, task)) {
			// validation is OK
			callback();
		} else {
			// there were some errors, so return them
			callback(null, task.error);
		}
	}
}

/*
  import (Winner -> REX)
  ----------------------

  importObjectAs function converts objects from Winner to REX format

  Input data is expected to be in xml2js notation

  Output data is an XML string (that differ from exportOrder function and there is
  reason why: object root tag in Winner format varies depending on object type)

  Arguments:
  	- what - string, one of 'flat', 'rent', 'country', 'commerce'. These values are related to Winner format.
  	- task - a task object as it is passed to import/export/validate functions
  	- obj  - input data in Winner format in xml2js notation
	- dic  - a Dicset instance
*/

function importObjectAs(what, task, obj, dic) {
	var type        = dic.lookup('rex_type', op(obj, "actual.0")) || dic.lookup('rex_type_optp', op(obj, "optp.0")),
		oid         = op(obj, "id.0"),
		is_sell     = type && zint(type.$.id) === 2,
		is_flats    = what === 'flats',
		is_rent     = what === 'rent' || (type && zint(type.$.id) === 4),
		is_country  = what === 'country',
		is_commerce = what === 'commerce',
		region      = dic.reverse('region_geo', op(obj, "region_geo.0")),
		is_city     = [7800000000000].indexOf(region.$.id) >= 0,
		phonestr    = op(obj, "telefon.0"),
		phones      = phonestr ? phonestr.split(';').map(function(x) { return x.trim() }) : [];

	var order = {
		$: {
			mtm: dt2ts(op(obj, "date.0"))
		},
		type: type,
		price: {
			full: op(obj, "price.0")
		},
		owner: {
			agent: {
				phone: phones[0],
				email: op(obj, "email.0"),
				additional: {
					phone: phones.slice(1)
				}
			},
			url: op(obj, "company_url.0")
		},
		estate: {
			location: {
				country: { $: { id: 1 }, _: "Россия" },
				region: dic.reverse('region_geo', op(obj, "region_geo.0")),
				area: is_city ? dic.reverse('region_geo', op(obj, "region_geo.0")) : dic.lookup('rex_area', op(obj, "area_geo.0")),
				city: is_city ? { $: { id: 1 }, _: "Санкт-Петербург" } : undefined,
				district: is_city ? dic.lookup('rex_district', strip(op(obj, "area_geo.0"), ["р-н", "район", "р"])) : undefined,
				street: is_city ? op(obj, "address.0") : undefined,
				house: op(obj, "dom.0"),
				string: op(obj, "address.0")
			},
			type: { $: { id: 1 }, _: "жилая" },
			object: dic.reverse('aptp', op(obj, "aptp.0")),
			desc: {
				text: cdata(trim(op(obj, "remark.0"))),
			},
			house: {
				type: dic.reverse('tip', op(obj, "tip.0"))
			},
			flat: {
				space: {
					total: fl0(obj, "sq.0.$.pl_ob"),
					living: fl0(obj, "sq.0.$.pl"),
					kitchen: fl0(obj, "sq.0.$.kitch"),
					desc: cdata(trim(op(obj, "sq.0.$.pl_r")))
				},
				storey: {
					actual: op(obj, "floor.0"),
					total: op(obj, "fl_ob.0")
				},
				rooms: {
					total: op(obj, "flats.0"),
					actual: op(obj, "rooms.0"),
				}
			},
			transport: {
				metro: {
					station: dic.ilookup(
						'rex_metro',
						strip(
							op(obj, "metro.0"),
							["проспект", "пр", "пр.", "площадь", "пл", "пл.", "улица", "ул", "ул."]
						)
					),
					time: op(obj, "metro.0.$.farval"),
					type: dic.reverse('metro_type', op(obj, "metro.0.$.fartp"))
				}
			},
			facilities: {
				elevator: bool_is(op(obj, "lift.0"), "лифт"),
				garbage_chute: bool_is(op(obj, "musor.0"), "мусоропровод"),
				balcony: dic.ilookup('rex_balcony', op(obj, "balkon.0")),
				bath: dic.ilookup('rex_bath_type', op(obj, "san.0")),
				view: dic.ilookup('rex_view_type', op(obj, "okna.0")),
				floor: dic.ilookup('rex_floor_type', op(obj, "pol.0")),
				decoration: dic.ilookup('rex_decoration_type', op(obj, "remont.0")),
				phone: dic.ilookup('rex_phone', op(obj, "tel.0")),
				furniture: bool_is(op(obj, "mebel.0"), "+"),
				fridge: bool_is(op(obj, "xolod.0"), "+"),
				tv: bool_is(op(obj, "tv.0"), "+"),
				washmachine: bool_is(op(obj, "washer.0"), "+"),
			}
		},
		meta: {
			extid: op(obj, "id.0"),
			link: cdata(trim(op(obj, "object_url.0"))),
			attachments: attachments(op(obj, "photos.0"))
		}
	};
	if (op(obj, "nova.0") === '+') { order.estate.house.ready_status = { $: { id: 1 }, _: "строится" }; }
	if (strip(op(obj, "ipoteka.0")) === '+') {
		order.mortgage = {
			term: { $: { id: 2 }, _: "ипотека" }
		}
	}

	if (is_rent) {
		order.rent = {}
		if (op(obj, "rent_term.0") === "посуточно") {
			order.rent.short = 'true';
		}

	} else if (is_country) {
		order.estate.type = { $: { id: 2 }, _: "загородная" };
		order.estate.location.string = op(obj, "place_geo.0");
		if (order.estate.location.string.length && op(obj, "address.0")) { order.estate.location.string += ', '; }
		order.estate.location.string += op(obj, "address.0");
		order.estate.plot = {
			space: fl0(op(obj, "sq.0.$.pl_s"))
		}
		order.estate.facilities.electricity = false_is(op(obj, "electro.0"), "нет");
		order.estate.facilities.gas = false_is(op(obj, "gas.0"), "нет");
		order.estate.facilities.water = false_is(op(obj, "water.0"), "нет");
		order.estate.facilities.heating = dic.lookup('rex_heating', op(obj, "heat.0"));
		order.estate.facilities.sewer = dic.lookup('rex_sewer', op(obj, "sewer.0"));
		order.estate.facilities.guard = bool_is(op(obj, "ohrana.0"), "+");
	} else if (is_commerce) {
		order.estate.commerce = {};
		order.estate.type = { $: { id: 3 }, _: "коммерческая" };
		order.estate.object = dic.lookup('rex_com_object', op(obj, "aptp.0"));
		if (order.estate.object) {
			order.estate.commerce.purpose = { $: { id: 7 }, _: op(obj, "aptp.0") };
		} else {
			order.estate.object = { $: { id: 8 }, _: "нежилое помещение" };
			order.estate.commerce.purpose = dic.lookup('rex_com_purpose', op(obj, "aptp.0"));
		}



	}

	// remove undefined and null fields
	order = traverse(order).map(function(x) {
		if (typeof x === "undefined" || (x === null)) { return this.remove(); }
	});

	// skip order if mandatory fields are not filled
	var ok = true;
	if (!order.type.$.id) { ok = false; task.error.fatal(oid, "Missing deal type"); }
	if (!order.estate.type.$.id) { ok = false; task.error.fatal(oid, "Missing estate type"); }
	if (!order.estate.object.$.id) { ok = false; task.error.fatal(oid, "Missing object type"); }
	if (is_commerce) {
		if (order.estate.commerce && !order.estate.commerce.purpose.$.id) { ok = false; task.error.fatal(oid, "Missing commercial purpose"); }
	}

	// add order to statistics; do it here because on the upper level there will be no order in case of failure.
	// convert it to XML before because order here is not in xml2js syntax (see comments at https://github.com/vne/rex-format/tree/master/rex-cli)
	var xml = js2xml({ order: order });
	ok ? task.stat.ok(xml) : task.stat.fail(xml);

	return ok ? xml : undefined;
}



/*
	export (REX -> Winner)
	----------------------

	exportOrder function converts objects from REX format to Winner format

	Input data is expected to be in xml2js notation

	Output data is a JS object in js2xml notation. That is different from importObjectAs function, see comment there.

	Arguments:
		- task  - a task object as it is passed to export/import/validate function
		- order - an estate object in REX format in xml2js notation
		- dic   - a Dicset instance
 */

function exportOrder(task, order, dic) {
	var oid        = objpath.coalesce(order, ["$.id", "meta.0.extid.0", "meta.0.extid.0._"]),
		is_sell    = [1,2].indexOf(zint(objpath.get(order, "type.0.$.id"))) >= 0,
		is_rent    = [3,4].indexOf(zint(objpath.get(order, "type.0.$.id"))) >= 0,
		is_novo    = [1,2].indexOf(zint(objpath.get(order, "estate.0.house.0.ready_status.0.$.id"))) >= 0, // new houses
		is_com     = zint(objpath.get(order, "estate.0.type.0.$.id")) === 3, // commercial estate
		is_country = zint(objpath.get(order, "estate.0.type.0.$.id")) === 2, // estate in the country (Lenobl for SPb)
		is_flats   = !is_country && !is_com && !is_rent, // flats are everything except country, commerce and rent
		region_geo = zint(objpath.get(order, "estate.0.location.0.region.0.$.id")),
		is_city    = [7800000000000].indexOf(region_geo) >= 0,
		is_spb     = [7800000000000].indexOf(region_geo) >= 0,
		area_geo   = is_city ? tagtext(objpath.get(order, "estate.0.location.0.district.0")) : tagtext(objpath.get(order, "estate.0.location.0.area.0")),
		metro      = tagtext(objpath.get(order, "estate.0.transport.0.metro.0.station.0")),
		metro_time = tagtext(objpath.get(order, "estate.0.transport.0.metro.0.time.0")),
		metro_type = dic.from_id('metro_type', objpath.get(order, "estate.0.transport.0.metro.0.type.0.$.id")),
		ipo_terms  = objpath.get(order, "mortgage.0.term"),
		has_ipo    = ipo_terms ? ipo_terms.filter(function(e) { return [2,3].indexOf(zint(e.$.id)) >= 0 }).length > 0 : false,
		term       = zint(tagtext(objpath.get(order, "rent.0.term.0")));

	var flat = {
		id: order.$.id,
		date: dt(new Date())
	};
	flat.actual = is_rent ? "арендуется" : "продается";
	flat.aptp = dic.from_id('aptp', objpath.get(order, "estate.0.object.0.$.id"));
	if (is_flats) {
		flat.nova = is_novo ? "+" : "-";
	}
	if (is_rent) {
		flat.rent_term = dic.from_id('rent_term', tagtext(objpath.get(order, "rent.0.short.0")));
	}
	if (is_com || is_country) {
		flat.optp = is_rent ? "аренда" : "продажа";
	}
	flat.region_geo = dic.from_id('region_geo', region_geo);
	flat.area_geo = area_geo;
	flat.place_geo = !is_city ? tagtext(objpath.get(order, "estate.0.location.0.string.0")) : dic.from_id('region_geo', region_geo);
	flat.metro = undefined;
	flat.address = tagtext(objpath.coalesce(order, ["estate.0.location.0.street.0", "estate.0.location.0.string.0"]));
	flat.dom = tagtext(objpath.get(order, "estate.0.location.0.house.0"));
	flat.price = {
			$: { currency: "RUB" },
			_: tagtext(objpath.get(order, "price.0.full.0"))
	};
	if (is_com) {
		if (tagtext(objpath.get(order, "price.0.per_meter.0"))) {
			flat.price_sq = {
				$: { currency: "RUB" },
				_: tagtext(objpath.get(order, "price.0.per_meter.0"))
			};
			if (flat.price_sq._) {
				flat.factor_sq = flat.factor;
			}
		}
	}
	if (is_flats || is_rent) {
		flat.flats = tagtext(objpath.get(order, "estate.0.flat.0.rooms.0.total.0"));
		flat.rooms = tagtext(objpath.get(order, "estate.0.flat.0.rooms.0.actual.0"));
	}
	flat.sq = {
		$: {
			pl_ob: tagtext(objpath.get(order, "estate.0.flat.0.space.0.total.0")),
			pl: tagtext(objpath.get(order, "estate.0.flat.0.space.0.living.0")),
			kitch: Math.min(zint(tagtext(objpath.get(order, "estate.0.flat.0.space.0.kitchen.0"))), 500), // 500 is the limit of Winner XML schema
			pl_r: trim(tagtext(objpath.get(order, "estate.0.flat.0.space.0.desc.0")))
		}
	};

	// The following fixes some strange bug that causes validation against XSD to fail.
	// Probably, this is a bug in validator, because xmllint reports everything OK
	if (flat.sq.$.pl_r) {
		flat.sq.$.pl_r = flat.sq.$.pl_r + " ";
	}

	if (is_country) {
		flat.electro = bool(tagtext(objpath.get(order, "estate.0.facilities.0.electricity.0")), "есть", "нет");
		flat.gas = bool(tagtext(objpath.get(order, "estate.0.facilities.0.gas.0")), "есть", "нет");
		flat.water = bool(tagtext(objpath.get(order, "estate.0.facilities.0.water.0")), "есть", "нет");
		flat.heat = dic.from_id('heat', objpath.get(order, "estate.0.facilities.0.heating.0.$.id"));
		flat.sewer = dic.from_id('sewer', objpath.get(order, "estate.0.facilities.0.sewer.0.$.id"));
		flat.ohrana = bool(tagtext(objpath.get(order, "estate.0.facilities.0.concierge.0")), "+", "-");
	}
	if (is_flats || is_rent || is_com) {
		flat.floor = zint(tagtext(objpath.get(order, "estate.0.flat.0.storey.0.actual.0")));
		flat.fl_ob = zint(tagtext(objpath.get(order, "estate.0.flat.0.storey.0.total.0")));
	}
	if (is_flats || is_rent) {
		flat.tip = dic.from_id('tip', objpath.get(order, "estate.0.house.0.type.0.$.id"));
	}
	if (is_flats) {
		flat.lift = bool(tagtext(objpath.get(order, "estate.0.facilities.0.elevator.0")), "лифт", "без лифта");
		flat.musor = bool(tagtext(objpath.get(order, "estate.0.facilities.0.garbage_chute.0")), "мусоропровод", "без мусоропровода");
	}
	if (is_flats || is_rent) {
		flat.balkon = dic.from_id('balkon', objpath.get(order, "estate.0.facilities.0.balcony.0.$.id"));
	}
	if (is_flats || is_rent) {
		flat.san = dic.from_id('san', objpath.get(order, "estate.0.facilities.0.bath.0.$.id"));
	}
	if (is_flats) {
		flat.okna = dic.from_id('okna', objpath.get(order, "estate.0.facilities.0.view.0.$.id"));
		flat.pol = dic.from_id('pol', objpath.get(order, "estate.0.facilities.0.floor.0.$.id"));
	}
	if (is_flats || is_rent) {
		flat.tel = bool(tagtext(objpath.get(order, "estate.0.facilities.0.phone.0")), "Т", "-");
	}
	if (is_flats) {
		flat.ipoteka = bool(has_ipo, '+', '-');
	}
	if (is_rent) {
		flat.mebel = bool(tagtext(objpath.get(order, "estate.0.facilities.0.furniture.0")), "+", "-");
		flat.xolod = bool(tagtext(objpath.get(order, "estate.0.facilities.0.fridge.0")), "+", "-");
		flat.tv = bool(tagtext(objpath.get(order, "estate.0.facilities.0.tv.0")), "+", "-");
		flat.washer = bool(tagtext(objpath.get(order, "estate.0.facilities.0.washmachine.0")), "+", "-");
	}
	flat.telefon = phone(tagtext(objpath.get(order, "owner.0.agent.0.phone.0")));
	flat.email = tagtext(objpath.get(order, "owner.0.agent.0.email.0"));
	flat.company_url = tagtext(objpath.get(order, "owner.0.url.0"));
	flat.object_url = tagtext(objpath.get(order, "meta.0.link.0"));
	flat.photos = rex_images(objpath.get(order, "meta.0.attachments.0.attachment")).map(function(x) { return tagtext(objpath.get(x, "url.0")) }).join(';');
	flat.remark = cdata(tagtext(objpath.get(order, "estate.0.desc.0.text.0")));
	if (is_country) {
		flat.actual = "продается/арендуется";
		flat.place_geo = tagtext(objpath.get(order, "estate.0.location.0.string.0"));
		flat.address = tagtext(objpath.get(order, "estate.0.location.0.street.0"));
		flat.sq = {
			$: {
				pl: tagtext(objpath.get(order, "estate.0.flat.0.space.0.total.0")),
				pl_s: tagtext(objpath.get(order, "estate.0.plot.0.space.0"))
			}
		};
	}
	if (is_com) {
		if (flat.aptp && flat.aptp.trim().toLowerCase() === "иное") {
			flat.aptp = dic.from_id('com_purpose', objpath.get(order, "estate.0.commerce.0.purpose.0.$.id"));
		}
		flat.actual = "продается/арендуется";

		flat.factor = dic.from_id('rent_factor', term);
		if (flat.rent_term && flat.rent_term.trim().toLowerCase() === "посуточно") {
			flat.factor = "в сутки";
		}
		flat.sq = {
			$: {
				pl_min: tagtext(objpath.coalesce(order, ["estate.0.commerce.0.space.0.business.0", "estate.0.commerce.0.space.0.total.0"])),
				pl_max: tagtext(objpath.coalesce(order, ["estate.0.commerce.0.space.0.total.0", "estate.0.commerce.0.space.0.business.0"])),
			}
		}
		flat.park = bool(tagtext(objpath.get(order, "estate.0.facilities.0.parking.0"), "+", "-"));
	}
	if (metro) {
		flat.metro = {
			$: {},
			_: metro
		}
		if (metro_time) { flat.metro.$.farval = metro_time; }
		if (metro_type) { flat.metro.$.fartp = metro_type; }
	}
	// remove undefined and null fields
	flat = traverse(flat).map(function(x) {
		if (typeof x === "undefined" || x === null) { return this.remove(); }
	});

	// check if mandatory fields are OK
	var ok = true;
	if (!flat.id) { ok = false; task.error.fatal(oid, "Missing object ID (id)"); }
	if (!flat.date) { ok = false; task.error.fatal(oid, "Missing object last update date (date)"); }
	if (!flat.aptp) { ok = false; task.error.fatal(oid, "Missing object type (aptp)"); }
	if (!flat.region_geo) { ok = false; task.error.fatal(oid, "Missing region (region_geo)"); }
	if (!flat.area_geo) { ok = false; task.error.fatal(oid, "Missing area (area_geo)"); }
	if (!flat.place_geo) { ok = false; task.error.fatal(oid, "Missing location place name (place_geo)"); }
	if (!flat.telefon) { ok = false; task.error.fatal(oid, "Missing agent phone number"); }
	if (is_flats) {
		if (!flat.actual) { ok = false; task.error.fatal(oid, "Missing object actuality (actual)"); }
		if (!flat.address) { ok = false; task.error.fatal(oid, "Missing object address (address)"); }
		if (!flat.nova) { ok = false; task.error.fatal(oid, "Missing whether object is a new building (nova)"); }
		if (!flat.dom) { ok = false; task.error.fatal(oid, "Missing house number (dom)"); }
		if (!flat.price._) { ok = false; task.error.fatal(oid, "Missing price"); }
		if (!flat.floor) { ok = false; task.error.fatal(oid, "Missing floor"); }
		if (!flat.fl_ob) { ok = false; task.error.fatal(oid, "Missing total number of floors"); }
		if (!flat.sq.$.pl_ob) { ok = false; task.error.fatal(oid, "Missing total flat space"); }
		if (!flat.flats) { ok = false; task.error.fatal(oid, "Missing full number of rooms in flat (flats)"); }
		if (
			(zint(op(order, "type.0.$.id")) === 2) &&             // sell
			(zint(op(order, "estate.0.object.0.$.id")) === 2) &&  // room
			!flat.rooms
			) { ok = false; task.error.fatal(oid, "Missing actual number of rooms in flat (flats)"); }
	} else if (is_rent) {
		if (!flat.price._) { ok = false; task.error.fatal(oid, "Missing price (price)"); }
		if (!flat.flats) { ok = false; task.error.fatal(oid, "Missing full number of rooms in flat (flats)"); }
		if ((zint(op(order, "type.0.$.id")) === 2) && !flat.rooms) { ok = false; task.error.fatal(oid, "Missing actual number of rooms in flat (flats)"); }
		if (!flat.sq) { ok = false; task.error.fatal(oid, "Missing object space (sq)"); }
		if (!flat.sq.$.pl_ob) { ok = false; task.error.fatal(oid, "Missing total flat space (sq.$pl_ob"); }
		if (!flat.floor) { ok = false; task.error.fatal(oid, "Missing floor"); }
		if (!flat.fl_ob) { ok = false; task.error.fatal(oid, "Missing total number of floors"); }
	} else if (is_com) {
		if ([7, 8, 9].indexOf(zint(objpath.get(order, "estate.0.object.0.$.id"))) < 0) { return null; } // just skip non-commercial objects w/o errors
		if (!flat.actual) { ok = false; task.error.fatal(oid, "Missing object actuality (actual)"); }
		if (!flat.optp) { ok = false; task.error.fatal(oid, "Missing operation type (optp)"); }
		if (!flat.address) { ok = false; task.error.fatal(oid, "Missing object address (address)"); }
		if (!flat.floor) { ok = false; task.error.fatal(oid, "Missing floor (floor)"); }
		if (!flat.sq) { ok = false; task.error.fatal(oid, "Missing object space (sq)"); }
		if (!flat.price._ && !flat.price_sql._) {
			ok = false; task.error.fatal(oid, "Missing price");
		}
	} else if (is_country) {
		if (!flat.actual) { ok = false; task.error.fatal(oid, "Missing object actuality (actual)"); }
		if (!flat.address) { ok = false; task.error.fatal(oid, "Missing object address (address)"); }
		if (!flat.sq) { ok = false; task.error.fatal(oid, "Missing object space (sq)"); }
		if (!flat.optp) { ok = false; task.error.fatal(oid, "Missing operation type (optp)"); }
	}
	if (is_spb && !flat.metro) { ok = false; task.error.fatal(oid, "Missing metro (metro)"); }

	// add order to statistics
	ok ? task.stat.ok(order) : task.stat.fail(order);

	return ok ? js2xml(flat, true) : undefined;
}

/*
	helper functions
	----------------
 */

/*
	take order in REX format in xml2js notation and return an object with resulting file name and object root tag

	Output is an object with the following fields:
	 - root   - XML root tag
	 - elem   - estate object root tag
	 - name   - resulting file name
	 - schema - appropriate XSD schema file name
*/
function getFileFor(order) {
	var is_spblo   = [7800000000000, 4700000000000].indexOf(zint(objpath.get(order, "estate.0.location.0.region.0.$.id"))) >= 0,
		is_flat    = [1,2].indexOf(zint(objpath.get(order, "estate.0.object.0.$.id"))) >= 0,
		is_rent    = [3,4].indexOf(zint(objpath.get(order, "type.0.$.id"))) >= 0,
		is_com     = zint(objpath.get(order, "estate.0.type.0.$.id")) === 3, // commercial estate
		is_country = zint(objpath.get(order, "estate.0.type.0.$.id")) === 2, // estate in the country (Lenobl for SPb)
		file = {};

	if (!is_spblo) { return;}
	if (is_com)          { file = { root: 'commercials',    elem: 'commercial',    name: 'commercial_spb.xml',    schema: 'commercial_spb.xsd' }; }
	else if (is_country) { file = { root: 'country_houses', elem: 'country_house', name: 'country_house_spb.xml', schema: 'country_house_spb.xsd' }; }
	else if (is_rent)    { file = { root: 'rent',           elem: 'flat',          name: 'rent_spb.xml',          schema: 'rent_spb.xsd' }; }
	else if (is_flat)    { file = { root: 'flats',          elem: 'flat',          name: 'flats_spb.xml',         schema: 'flats_spb.xsd' }; }
	else { return; }
	return file;
}

/* convert to integer and always return a number */
function zint(x) {
	var y = parseInt(x, 10);
	return isNaN(y) ? 0 : y;
}

/* return boolean true for string "true" and for any other true-like objects, false in all other cases */
function is_true(x) {
	if (!x) { return false; }
	if (x.constructor === String) { return x.toLowerCase() === "true" }
	return !!x;
}

/* return second argument if first is true, third - if false, fourth - if undefined */
function bool(x, tr, fl, und) {
	if (typeof x === "undefined") { return und; }
	if (is_true(x)) { return tr; }
	return fl;
}

/*
    return string 'false' if first argument is equal to second (case-insensitive and
	with stripping of spaces) and 'true' otherwise
*/
function false_is(x, tr) {
	if (!x && !tr && x === tr) { return 'false'; }
	if (!x) { return; }
	if (strip(x.toString().toLowerCase()) === strip(tr.toString().toLowerCase())) {
		return 'false';
	}
	return 'true';
}

/*
    return string 'true' if first argument is equal to second (case-insensitive and
	with stripping of spaces) and 'false' otherwise
 */
function bool_is(x, tr) {
	if (!x && !tr && x === tr) { return 'true'; }
	if (!x) { return; }
	if (strip(x.toString().toLowerCase()) === strip(tr.toString().toLowerCase())) {
		return 'true';
	}
	return 'false';
}

/* return either a date formatted with format or undefined */
function dt(date, fmt) {
	var d = moment(date);
	if (!fmt) { fmt = "DD-MM-YYYY"; }
	return d.isValid() ? d.format(fmt) : undefined;
}

/* parse a date with format and return unix timestamp */
function dt2ts(x, fmt) {
	var d = moment(x);
	if (!fmt) { fmt = "DD-MM-YYYY"; }
	return d.isValid() ? d.unix() : undefined;
}

/* wrap first argument (if it is defined) into CDATA */
function cdata(x) {
	if (typeof x === "undefined") { return; }
	return x && x.toString && x.toString().length ? '<![CDATA[' + x + ']]>' : x;
}

/*
	make a phone number: remove all non-digits, add default city and/or country
	codes if length is appropriate (works in St.-Petersburg, Russia)
*/
function phone(x) {
	if (!x || x.constructor !== String) { return x; }
	var p = x.replace(/[^0-9]/g, '');
	if (p.length === 7) {
		p = '8812' + p; // hardcoding is bad :)
	} else if (p.length === 10) {
		p = '8' + p; // not so bad :)
	}
	return p;
}

/* filter REX attachments for images and always return an array */
function rex_images(attlist) {
	if (!attlist || !attlist.constructor === Array) { return []; }
	return attlist
		.filter(function(x) { return ['image', 'planning'].indexOf(objpath.get(x, "type.0._")) >= 0 });
}

/*
	return a text from a tag (as represented by xml2js).
	Text can be stored in _ property if there are attributes and directly in the tag if there aren't
*/
function tagtext(tag) {
	if (!tag) { return; }
	if (tag.constructor === Object) {
		return tag._;
	}
	return tag;
}

/* shortcut for getting tag text */
function op(obj, path) {
	return tagtext(objpath.get(obj, path));
}

/* parse float and do not return NaN */
function fl(obj, path) {
	var x = parseFloat(objpath.get(obj, path));
	return isNaN(x) ? undefined : x;
}

/* parse float and return undefined instead of 0 */
function fl0(obj, path) {
	var x = fl(obj, path);
	return x ? x : undefined;
}

/* strip occurences of list entries from x (only those that appear as separate words), then trim the result */
function strip(x, list) {
	var re, i;
	if (!x || !list) { return x; }
	for (i in list) {
		re = new RegExp('\s' + list[i] + '\s', 'g');
		x = x.replace(re, '');
	}
	return x.replace(/\s\s+/g, ' ').trim();
}

/* return x or x.trim() depending on whether x is a string */
function trim(x) {
	if (!x || x.constructor !== String) { return x; }
	return x.trim();
}

/* convert Winner attachments to REX */
function attachments(str) {
	if (!str || !str.split) { return; }
	return str.split(';').map(function(x) {
		return {
			type: 'image',
			url: cdata(x)
		}
	});
}
