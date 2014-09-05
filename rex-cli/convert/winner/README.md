Конвертер для формата Winner
============================

Это - библиотека, реализующая преобразование данных об объектах недвижимости между форматами
REX [https://github.com/vne/rex-format](https://github.com/vne/rex-format)
и Winner [https://baza-winner.ru/winner/support/xml-template.html](https://baza-winner.ru/winner/support/xml-template.html).

Библиотека реализует интерфейс (API), описанный здесь [https://github.com/vne/rex-format/tree/master/rex-cli](https://github.com/vne/rex-format/tree/master/rex-cli)

Написана как рабочий образец для других конвертеров для проекта ollon в 2014 году
Автор: Владимир Неверов <sanguini@gmail.com>

Нюансы
------

1. Формат REX предусматривает хранение разного рода объектов недвижимости в одном файле. В формате Winner типы объектов
жёстко привязан к файлу, файлы должны иметь определённые имена. Данный конвертер реализует преобразование только для Санкт-Петербурга
и Ленобласти, это соответствует файлам flats_spb.xml, rent_spb.xml, country_house_spb.xml и commercial_spb.xml.

При экспорте на вход можно подать один файл в формате REX и получить несколько файлов в формате Winner. Поэтому конвертер в качестве результата
преобразования возвращает не строку, а массив объектов, где каждый объект имеет вид:

	{
		type: "file",
		name: "file.name",
		contents: "file contents"
	}

2. Файл winner.dic - это словари для библиотеки Dicset

3. Валидация реализована как проверка на соответствие входных данных хотя бы одной схеме из
списка (файлов), заданного в конфигурации задачи и доступного через task.config.schemas.
При запуске через rex-cli этот параметр никак не задать, поэтому rex-cli для тестирования валидации
использовать не получится. Либо rex-cli нужно адаптировать (например, добавить аргумент командной строки для директории
со схемами) и прислать пулл-реквест на гитхабе.

Конфигурация задачи вообще сейчас выглядит так:

	{
		"fetch": {
			"task": "file"
		},
		"convert": {
			"task": "winner"
		},
		"publish": {
			"task": "file"
		},
		"dicfile": "$IMEX_ROOT/tasks/convert/winner/winner.dic",
		"schemas": [
			"$IMEX_ROOT/tasks/convert/winner/xsd/flats_spb.xsd",
			"$IMEX_ROOT/tasks/convert/winner/xsd/rent_spb.xsd",
			"$IMEX_ROOT/tasks/convert/winner/xsd/country_house_spb.xsd",
			"$IMEX_ROOT/tasks/convert/winner/xsd/commercial_spb.xsd"
		]
	}

TODO: Возможно, rex-cli следует адаптировать для работы с файлами конфигурации, предназначенными для основной
программы импорта-экспорта.