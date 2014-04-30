/*
	null converter
	Accepts any data, returns null
 */
module.exports = {
	export: function(task) {
		// task.data is in REX format
		// task.format === 'null'
		return {
			data: null,
			from: 'rex',
			to: task.format,
			meta: null,
			errors: null
		};
	},
	import: function(task) {
		// task.data is null
		// task.format === 'null'
		return {
			data: null,
			from: task.format,
			to: 'rex',
			meta: null,
			errors: null
		}
	},
	validate: function(task) {
		// task.data is null
		// task.format === 'null'
		return;
	}
};
