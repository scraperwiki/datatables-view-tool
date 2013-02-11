// When there are errors call this
var showAlert = function(title, message, level) {
	var $div;
	level = level || 0;
	$div = $("<div>").addClass("alert").text(message);
	$div.prepend('<button type="button" class="close" data-dismiss="alert">×</button>');
	$div.prepend("<strong>" + title + "</strong> ");
	if (level) {
		$div.addClass("alert-error");
	}
	return $div.prependTo("body");
};

var escapeSQL = function(column_name) {
	return "`" + column_name + "`"
}

// Function to map JSON data between DataTables format and ScraperWiki's SQL endpoint format.
// It returns a function for the fnServerData parameter
var convertData = function(tableName, column_names) {
	// This is a wrapper round the GET request DataTables makes to get more data
	// sSource - the URL, we don't use it, we hard code it instead
	// aoData - contains the URL parameters, e.g. what page, what to filter, what order and so on
	// fnCallback - where to call with the data you get back
	// oSettings - settings object for the whole DataTables, see http://datatables.net/docs/DataTables/1.9.0/DataTable.models.oSettings.html
	return function ( sSource, aoData, fnCallback, oSettings ) {
		// convert aoData into a normal hash (called ps)
		var params = {}
		for (var i=0;i<aoData.length;i++) { 
			params[aoData[i].name] = aoData[i].value
		}

		console.log(params)

		// construct set of GET parameters to send to ScraperWiki SQL endpoint
		var data = {}
		var columns  = _.map(column_names, escapeSQL).join(",")
		data.q = "select " + columns + " from " + escapeSQL(tableName) + " limit " + params.iDisplayLength + " offset " + params.iDisplayStart

		oSettings.jqXHR = $.ajax( {
			"dataType": 'json',
			"type": "GET",
			"url": sqliteEndpoint,
			"data": data,
			"success": function ( response ) {
				// ScraperWiki returns a list of dicts. This converts it to a list of lists.
				var rows = []
				for (var i=0;i<response.length;i++) { 
					var row = []
					for (k in response[i]) {
						row.push(response[i][k])
					}
					rows.push(row)
				}
				// Send the data to dataTables
				fnCallback({ 
					"aaData" : rows,
					"iTotalRecords": 999, // without filtering
					"iTotalDisplayRecords": 999 // after filtering
				})
			}
		} );
	}
}

// Find the column names
function getTableColumnNames(table_name, callback){
    scraperwiki.sql("select * from `" + table_name + "` limit 1", function(data) {
		callback(_.keys(data[0]))
	}, function(jqXHR, textStatus, errorThrown) {
		showAlert(errorThrown, jqXHR.responseText, "error")
	})
}

// Make one of the DataTables (in one tab)
var constructDataTable = function(table_name) {
	getTableColumnNames(table_name, function(column_names) {
		console.log("Columns", column_names)
		if (column_names.length == 0) {
			showAlert("No data in the table", jqXHR.responseText)
			return
		}

		var $t = $('#maintable')
		$t.empty()
        var thead = '<thead><tr>'
		_.each(column_names, function(column_name) {
			thead += '<th>' + column_name + '</th>'
		})
		thead += '</tr></thead>'
		$t.append(thead)

		$('#maintable').dataTable( {
			"bProcessing": true,
			"bServerSide": true,
			"bPaginate": true,
			"fnServerData": convertData(table_name, column_names)
		} );
	})
}

// Make all the DataTables (each tab)
var constructDataTables = function() {
	// XXX todo, make one for each tab
	var tableName = tables[0]
	constructDataTable(tableName)
}

// Main entry point, make the data table
var settings
var sqliteEndpoint
var tables
$(function(){
	settings = scraperwiki.readSettings()
	sqliteEndpoint = settings.target.url + '/sqlite'

	scraperwiki.sql("select name from sqlite_master where type = 'table'", function(data, textStatus, jqXHR) {
		tables = []
		$.each(data, function (i) {
			tables.push(data[i].name)
		})
		console.log("Tables are:", tables)
		constructDataTables()
	}, function(jqXHR, textStatus, errorThrown) {
		showAlert(errorThrown, jqXHR.responseText, "error")
	})

});




