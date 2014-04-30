/*
	copy converter
	Accepts any data, returns the same data
 */
module.exports = {
	export: function(task) {
		// task.data is in REX format
		// task.format === 'copy'
		return {
			data: task.data,
			from: 'rex',
			to: task.format,
			meta: null,
			errors: null
		};
	},
	import: function(task) {
		// task.data is something
		// task.format === 'null'
		return {
			data: task.data,
			from: task.format,
			to: 'rex',
			meta: null,
			errors: null
		}
	},
	validate: function(task) {
		// task.data is something
		// task.format === 'null'
		return;
	}
};
