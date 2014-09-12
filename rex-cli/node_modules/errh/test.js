/* Run tests with Mocha: http://visionmedia.github.io/mocha/ */

var ErrorHandler = require('errh'),
	assert = require('assert'),
	errh = new ErrorHandler('test1', 'test2');

describe('ErrorHandler', function() {
	it('should set name', function() {
		assert.equal(errh.task, 'test1');
	});
	it('should set id', function() {
		assert.equal(errh.id, 'test2');
	});
	it('should have zero length in the beginning', function() {
		assert.equal(errh.length, 0);
	});
	it('should implement .info, .warn and .error methods', function() {
		assert.doesNotThrow(function() {
			assert.equal(errh.info.constructor, Function);
			assert.equal(errh.warn.constructor, Function);
			assert.equal(errh.fatal.constructor, Function);
		}, /TypeError/, "One or more method is missing");
	});
	it('should register info message', function() {
		errh.info(1, 'info message');
		assert.equal(errh.length, 1);
	});
	it('should register warning message', function() {
		errh.warn(2, 'warning message');
		assert.equal(errh.length, 2);
	});
	it('should register fatal message', function() {
		errh.fatal(3, 'fatal message');
		assert.equal(errh.length, 3);
	});
	it('should return a list of errors', function() {
		var lst = errh.list();
		assert.equal(lst.constructor, Array);
		assert.equal(lst.length, 3);
	});
	it('should return error statistics', function() {
		var s = errh.stat();
		assert.equal(s.total, 3);
		assert.equal(s.info, 1);
		assert.equal(s.warn, 1);
		assert.equal(s.fatal, 1);
	});
	it('should return string error description', function() {
		var d = '' + errh; // indirect .toString call
		assert.equal(d.constructor, String);
		assert.notEqual(d.length, 0);
	});
});
