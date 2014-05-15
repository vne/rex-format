/*
	copy converter
	Accepts any data, returns the same data
 */
module.exports = {
	export: function(task, callback) {
		// task.data is in REX format
		// task.format === 'copy'
		// task.log is the logging function
		callback(null, {
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
		// task.log is the logging function
		callback(null, {
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
		// task.log is the logging function
		callback();
	}
};
