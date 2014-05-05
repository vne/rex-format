/*
	bad converter
	Accepts any data, returns ERRORS
 */
module.exports = {
	export: function(task, callback) {
		// task.data is something
		// task.format === 'bad'
		callback({
			data: task.data,
			from: 'rex',
			to: task.format,
			meta: null,
			errors: [
				{ id: 1, error: 'No useful information, in my opinion' },
				{ id: 5, error: 'Again!.. What a waste of time!' }
			]
		});
	},
	import: function(task, callback) {
		// task.data is something
		// task.format === 'bad'
		callback({
			data: task.data,
			from: task.format,
			to: 'rex',
			meta: null,
			errors: [
				{ id: "4-b-1", error: 'What a strange ID!' },
				{ id: 812312, error: "I'm tired of converting" }
			]
		});
	},
	validate: function(task, callback) {
		// task.data is something
		// task.format === 'bad'
		callback([
			{ id: 10, error: 'Указано некорректное значение для цены объекта' },
			{ id: 20, error: 'Минимальное количество комнат больше максимального' }
		]);
	}
};
