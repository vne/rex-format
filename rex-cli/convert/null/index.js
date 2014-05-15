/*
	null converter
	Accepts any data, returns null
 */
module.exports = {
	export: function(task, callback) {
		// task.data is in REX format
		// task.format === 'null'
		// task.log is the logging function
		callback(null, {
			data: null,
			from: 'rex',
			to: task.format,
			meta: null,
			errors: null
		});
	},
	import: function(task, callback) {
		// task.data is null
		// task.format === 'null'
		// task.log is the logging function
		callback(null, {
			data: null,
			from: task.format,
			to: 'rex',
			meta: null,
			errors: null
		});
	},
	validate: function(task, callback) {
		// task.data is null
		// task.format === 'null'
		// task.log is the logging function
		callback();
	}
};
