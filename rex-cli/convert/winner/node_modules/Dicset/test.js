var Dicset = require('./index'),
	assert = require('assert');

var dicfile = 'test.dic',
	dic = new Dicset(dicfile);

// console.log(dic.dic);
describe('Dicset parser', function() {
	it('should read dic file', function() {
		assert(dic.dic, "dic exists");
		assert(dic.rev, "rev exists");
	});
	it('should have dic1 dic', function() {
		assert(dic.dic.dic1, "dic.dic1 exists");
		assert(dic.rev.dic1, "rev.dic1 exists");
	});
	it('should map 1 to 2', function() {
		assert(dic.dic.dic1['1'], "entry for 1 exists");
		assert.equal(dic.dic.dic1['1'].id, 2);
	});
	it('should map 2 to "abc"', function() {
		assert(dic.dic.dic1['2'], "entry for 2 exists");
		assert.equal(dic.dic.dic1['2'].id, "abc");
	});
	it('should map 3 to "abc def"', function() {
		assert(dic.dic.dic1['3'], "entry for 3 exists");
		assert.equal(dic.dic.dic1['3'].id, "abc def");
	});
	it('should map "4 5" to "qwe rty"', function() {
		assert(dic.dic.dic1['4 5'], "entry for '4 5' exists");
		assert.equal(dic.dic.dic1['4 5'].id, "qwe rty");
	});
	it('should map x to y', function() {
		assert(dic.dic.dic1['x'], "entry for x exists");
		assert.equal(dic.dic.dic1['x'].id, "y");
	});
	it('should map "x y" to a long string', function() {
		assert(dic.dic.dic1['x y'], "entry for 'x y' exists");
	});
});

describe('Dicset lookup', function() {
	it('should look up for 1', function() {
		assert.deepEqual(dic.lookup('dic1', 1), { $id: 2, _: "comment1" });
	});
	it('should do reverse lookup for 1', function() {
		assert.deepEqual(dic.reverse('dic1', 2), { $id: 1, _: "comment1" });
	});
	it('should do comment lookup for 1', function() {
		assert.deepEqual(dic.comment('dic1', "comment1"), { from: 1, to: 2 });
	});
	it('should return strings', function() {
		assert.deepEqual(dic.lookup('dic1', 2), { $id: "abc", _: "comment2" });
	});
	it('should return quotes strings', function() {
		assert.deepEqual(dic.lookup('dic1', 3), { $id: "abc def", _: "comment3" });
	});
	it('should lookup for quoted strings', function() {
		assert.deepEqual(dic.lookup('dic1', "4 5"), { $id: "qwe rty", _: "comment4" });
	});
	it('should map strings to strings', function() {
		assert.deepEqual(dic.lookup('dic1', 'x'), { $id: "y", _: "" });
	});
});