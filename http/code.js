// datatables-tool.js

var allSettings 

// Handle AJAX type errors
var handle_ajax_error = function(jqXHR, textStatus, errorThrown) {
  $('body > .dataTables_processing').remove()
  if(jqXHR.responseText.match(/database file does not exist/) != null){
    $('body').html('<div class="problem"><h4>This dataset is empty.</h4><p>Once your dataset contains data,<br/>it will show up in a table here.</p></div>')
  } else if(jqXHR.responseText.match(/Gateway Time-out/) != null){
    $('body').html('<div class="problem"><h4>This dataset is too big.</h4><p>Well this is embarassing. Your dataset is too big for the <em>View in a table tool</em> to display.</p><p>Try downloading it as a spreadsheet.</p></div>')
  } else {
    scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
  }
}

// Links clickable etc. in one row of data
var prettifyRow = function( tr, array, iDisplayIndex, iDisplayIndexFull ) {
  $('td', tr).each(function(){
      $(this).html(
          $(this).html()
          // first add links onto URLs:
          .replace(
              /((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+)/g,
              '<a href="$1" target="_blank">$1</a>'
          )
          // then convert images to themselves embedded.
          // XXX _normal is to match Twitter images, watch for it causing trouble
	  // e.g. https://si0.twimg.com/profile_images/2559953209/pM981LrS_normal - remove it
          .replace(
              />((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+(\.jpeg|\.png|\.jpg|\.gif|\.bmp|_normal))</ig,
              '><img src="$1" height="48"><'
          )
	  // match LinkedIn image URLs, which always have "licdn.com/mpr/mpr" in them.
	  // e.g. http://m3.licdn.com/mpr/mprx/0_oCf8SHoyvJ0Wq_CEo87xSEoAvRHIq5CEe_R0SEw2EOpRI3voQk0uio0GUveqBC_QITDYCDvcT0rm
          .replace(
              />((http|https|ftp):\/\/[a-z0-9\.]+licdn.com\/mpr\/mpr[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+)</ig,
              '><img src="$1" height="48"><'
          )
          // shorten displayed part of any URLs longer than 30 characters, down to 30
          .replace(
              />((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]{31,})</g,
              function (str, p1, offset, s) {
                 return ">" + p1.substr(0,30) + "&hellip;<"
              }
          )
      )
  })
  return tr
}

// Save known state of all tabs, and active tab
var saveState = function (oSettings, oData) {
  allSettings['active'] = currentActiveTable
  allSettings['tables'][currentActiveTable] = oData

  var j = JSON.stringify(allSettings)
  var fname = escapeshell("allSettings.json")
  scraperwiki.exec("echo -n <<ENDOFJSON >" + fname + ".new.$$ " + escapeshell(j) + "\nENDOFJSON\n" +
    "mv " + fname + ".new.$$ " + fname,
    function(content) {
      if (content != "") {
        scraperwiki.alert("Unexpected saveState response!", content, "error")
      }
    }, handle_ajax_error
  )
}

// Restore column status from the view's box's filesystem
var loadState = function (oSettings) {
  if (currentActiveTable in allSettings['tables']) {
    oData = allSettings['tables'][currentActiveTable]
    // force the display length we calculated was suitable when first making the table
    // (rather than using the saved setting)
    oData.iLength = oSettings._iDisplayLength
  } else {
    oData = false
  }
  return oData
}


// Read active table from the box's filesystem and pass it on to callback
var loadAllSettings = function(callback) {
  var oData = false
  scraperwiki.exec("touch allSettings.json; cat allSettings.json" ,
    function(content) {
      try {
        allSettings = JSON.parse(content)
      } catch (e) {
        allSettings = { tables: {}, active: null }
      }
      callback()
    }, handle_ajax_error
  )
}

// Escape identifiers
var escapeSQL = function(column_name) {
  return '"' + column_name.replace(/"/g, '""') + '"'
}
var escapeshell = function(cmd) {
    return "'"+cmd.replace(/'/g,"'\\''")+"'";
};

// Function to map JSON data between DataTables format and ScraperWiki's SQL endpoint format.
// It returns a function for the fnServerData parameter
var convertData = function(table_name, column_names) {
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

    // construct SQL query needed according to the parameters
    var order_by = ""
    if (params.iSortingCols >= 1) {
      var order_parts = []
      for (var i = 0; i < params.iSortingCols; i++) {
        order_part = escapeSQL(column_names[params["iSortCol_" + i]])
        if (params["sSortDir_" + i] == 'desc') {
          order_part += " desc"
        } else if (params["sSortDir_" + i] != 'asc') {
          scraperwiki.alert("Got unknown sSortDir_" + i + " value in table " + table_name)
        }
        order_parts.push(order_part)
      }
      order_by = " order by " + order_parts.join(",")
    }
    var where = ""
    if (params.sSearch) {
      // XXX no idea if this bog standard Javascript escape really does what we want with SQL databases.
      // There's no security risk (as endpoint is sandboxed). There could be user experience pain though.
      var search = "'%" + escape(params.sSearch.toLowerCase()) + "%'"
      where = " where " + _.map(column_names, function(n) { return "lower(" + escapeSQL(n) + ") like " + search }).join(" or ")
      if (where.length > 1500) {
        scraperwiki.alert("Filtering is unavailable.", "Your dataset has too many columns")
        $(".search-query").val("").trigger("keyup")
        return
      }
    }
    var query = "select * " +
           " from " + escapeSQL(table_name) +
         where +
         order_by +
           " limit " + params.iDisplayLength +
           " offset " + params.iDisplayStart

    var counts
    var rows = []
    async.parallel([
      function(cb) {
        // get column counts
        scraperwiki.sql("select (select count(*) from " + escapeSQL(table_name) + ") as total, (select count(*) from " + escapeSQL(table_name) + where + ") as display_total", function (data) {
          counts = data[0]
          cb()
        }, handle_ajax_error)
      }, function(cb) {
        oSettings.jqXHR = $.ajax( {
          "dataType": 'json',
          "type": "GET",
          "url": sqliteEndpoint,
          "data": { q: query },
          "success": function ( response ) {
            // ScraperWiki returns a list of dicts. This converts it to a list of lists.
            for (var i=0;i<response.length;i++) {
              var row = []
              _.each(meta.table[table_name].columnNames, function(col) {
                row.push(response[i][col])
              })
              rows.push(row)
            }
            cb()
          },
          "error": handle_ajax_error
        });
      }], function() {
        // Send the data to dataTables
        fnCallback({
          "aaData" : rows,
          "iTotalRecords": counts.total, // without filtering
          "iTotalDisplayRecords": counts.display_total // after filtering
        })
      }
    )
  }
}

// Make one of the DataTables (in one tab)
// 'i' should be the integer position of the datatable in the list of all tables
// 'table_name' is obviously the name of the active table
var constructDataTable = function(i, table_name) {
  // Find or make the table
  $(".maintable").hide()
  var id = "table_" + i
  var $outer = $("#" + id)
  if ($outer.length == 0) {
    $outer = $('<div class="maintable" id="table_' + i + '"> <table class="table table-striped table-bordered innertable display"></table> </div>')
    $('body').append($outer)
  } else {
    $outer.show()
    return
  }
  var $t = $outer.find("table")

  // Find out the column names
  column_names = meta.table[table_name].columnNames
  if (column_names.length == 0) {
    scraperwiki.alert("No columns in the table", jqXHR.responseText)
    return
  }

  // Make the column headings
      var thead = '<thead><tr>'
  _.each(column_names, function(column_name) {
    thead += '<th>' + column_name + '</th>'
  })
  thead += '</tr></thead>'
  $t.append(thead)

  var num_columns = column_names.length
  console.log("num_columns", num_columns)
  var rows_to_show = 500
  if (num_columns >= 10) {
    rows_to_show = 250
  }
  if (num_columns >= 20) {
    rows_to_show = 100
  }
  if (num_columns >= 40) {
    rows_to_show = 50
  }
  console.log("rows_to_show", rows_to_show)

  // Fill in the datatables object
  $t.dataTable({
    "bProcessing": true,
    "bServerSide": true,
    "bDeferRender": true,
    "bPaginate": true,
    "bFilter": true,
    "iDisplayLength": rows_to_show,
    "bScrollCollapse": true,
    "sDom": 'r<"table_controls"pfi><"table_wrapper"t>',
    "sPaginationType": "bootstrap",
    "fnServerData": convertData(table_name, column_names),
    "fnRowCallback": prettifyRow,
    "fnInitComplete": function(oSettings){
      if (oSettings.aoColumns.length > 30){
        // Remove search box if there are so many columns the ajax request
        // would cause a 414 Request URI Too Large error on wide datasets
        $('#table_' + i + ' .dataTables_filter').empty()
      } else {
        // Otherwise really hackily replace their rubbish search input with a nicer one
        var $copy = $('.dataTables_filter label input').clone(true).addClass('search-query')
        $('#table_' + i + ' .dataTables_filter').html($copy)
      }
    },
    "bStateSave": true,
    "fnStateSave": saveState,
    "fnStateLoad": loadState,
    "oLanguage": {
      "sEmptyTable": "This table is empty"
     }
  })
}

// Create and insert spreadsheet-like tab bar at bottom of page.
// 'tables' should be a list of table names.
// 'active_table' should be the one you want to appear selected.
var constructTabs = function(tables, active_table){
  var $ul = $('<ul>').addClass('nav nav-tabs').appendTo('body')
  $.each(tables, function(i, table_name){
    var li = '<li id="tab_' + i + '">'
    if (table_name == active_table){
      var li = '<li id="tab_' + i + '" class="active">'
      currentActiveTable = table_name
      currentActiveTableIndex = i
    }
    var a = '<a href="#"'+ ( table_name.slice(0,1)=='_' ? ' class=""' : '' ) +'>' + table_name + '</a>'
    $(li).append(a).bind('click', function(e){
      e.preventDefault()
      $(this).addClass('active').siblings('.active').removeClass('active')
      currentActiveTable = table_name
      currentActiveTableIndex = i
      constructDataTable(i, table_name)
    }).appendTo($ul)
  })
}

// Make all the DataTables and their tabs
var constructDataTables = function(first_table_name) {
  if ( ! first_table_name || ! first_table_name in _.values(tables) ) {
    first_table_name = tables[0]
  }
  constructTabs(tables, first_table_name)
  $("#tab_" + currentActiveTableIndex).trigger('click')
}

// Main entry point, make the data table
var settings
var sqliteEndpoint
var tables
var currentActiveTable
var currentActiveTableIndex
var meta
$(function(){
  settings = scraperwiki.readSettings()
  sqliteEndpoint = settings.target.url + '/sqlite'

  async.parallel([
    function (cb) {
      scraperwiki.sql.meta(function(newMeta) {
        meta = newMeta
        tables = _.keys(meta.table)
        // filter out tables starting with double underscore
        // (this tool completely ignores such tables)
        tables = _.reject(tables, function(tableName){
          return tableName.slice(0,2) == '__'
        })
        cb()
      }, handle_ajax_error)
    },
    function (cb) {
      loadAllSettings(function() {
        cb()
      })
    }],
    function (err, results) { 
      $('body > .dataTables_processing').remove()
      if(tables.length){
          currentActiveTable = allSettings['active']
          constructDataTables(currentActiveTable)
      } else {
        $('body').html('<div class="problem"><h4>This dataset is empty.</h4><p>Once your dataset contains data,<br/>it will show up in a table here.</p></div>')
      }
    }
   )
});


