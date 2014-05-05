/*
	copy converter
	Accepts any data, returns the same data
 */
module.exports = {
	export: function(task, callback) {
		// task.data is in REX format
		// task.format === 'copy'
		callback({
			data: task.data,
			from: 'rex',
			to: task.format,
			meta: null,
			errors: null
		});
	},
	import: function(task, callback) {
		// task.data is something
		// task.format === 'null'
		callback({
			data: task.data,
			from: task.format,
			to: 'rex',
			meta: null,
			errors: null
		});
	},
	validate: function(task, callback) {
		// task.data is something
		// task.format === 'null'
		callback();
	}
};
