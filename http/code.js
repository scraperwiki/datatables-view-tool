// datatables-tool.js

// Handle AJAX type errors
var handle_ajax_error = function(jqXHR, textStatus, errorThrown) {
  $('body > .dataTables_processing').remove()
  if(jqXHR.responseText.match(/database file does not exist/) != null){
    $('body').html('<div class="problem"><h4>This dataset is empty.</h4><p>No database has been specified in this dataset&rsquo;s <b>box.json</b> file.</p></div>')
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

// Save current active tab/table, and its status to the filesystem in the view's box
var saveState = function (oSettings, oData) {
  var j = JSON.stringify(oData)
  var fname = escapeshell("settings_" + currentActiveTable + ".json")
  scraperwiki.exec("echo -n <<ENDOFJSON >" + fname + ".new.$$ " + escapeshell(j) + "\nENDOFJSON\n" +
    "mv " + fname + ".new.$$ " + fname,
    function(content) {
      if (content != "") {
        scraperwiki.alert("Unexpected saveState response!", content, "error")
      }
      saveActiveTable()
    }, handle_ajax_error
  )
}

// Save just the active table
var saveActiveTable = function () {
  scraperwiki.exec("echo -n " + escapeshell(currentActiveTable) + " >active_table.txt",
    function(content) {
      if (content != "") {
        scraperwiki.alert("Unexpected saveActiveTable response!", content, "error")
      }
    }, handle_ajax_error
  )

}

// Add this in, needed for loadState which must return asynchronously
scraperwiki.async_exec = function(cmd, success, error) {
  var options, settings;
  settings = scraperwiki.readSettings();
  options = {
    url: "" + window.location.protocol + "//" + window.location.host + "/" + scraperwiki.box + "/exec",
    async: false,
    type: "POST",
    dataType: "text",
    data: {
      apikey: settings.source.apikey,
      cmd: cmd
    }
  };
  if (success != null) {
    options.success = success;
  }
  if (error != null) {
    options.error = error;
  }
  return $.ajax(options);
};

// Restore column status from the view's box's filesystem
var loadState = function (oSettings) {
  var fname = escapeshell("settings_" + currentActiveTable + ".json")
  var oData = false
  scraperwiki.async_exec("touch " + fname + "; cat " + fname,
    function(content) {
      try {
        oData = JSON.parse(content)
      } catch (e) {
	oData = false
      }
    }, handle_ajax_error
  )
  return oData
}


// Read active table from the box's filesystem and pass it on to callback
var loadActiveTable = function(callback) {
  scraperwiki.exec("touch active_table.txt; cat active_table.txt",
    function(content) {
      callback(content)
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

    // get column counts
    scraperwiki.sql("select (select count(*) from " + escapeSQL(table_name) + ") as total, (select count(*) from " + escapeSQL(table_name) + where + ") as display_total", function (data) {
      var counts = data[0]

      oSettings.jqXHR = $.ajax( {
        "dataType": 'json',
        "type": "GET",
        "url": sqliteEndpoint,
        "data": { q: query },
        "success": function ( response ) {
          // ScraperWiki returns a list of dicts. This converts it to a list of lists.
          var rows = []
          for (var i=0;i<response.length;i++) {
            var row = []
            _.each(meta.table[table_name].columnNames, function(col) {
              row.push(response[i][col])
            })
            rows.push(row)
          }
          // Send the data to dataTables
          fnCallback({
            "aaData" : rows,
            "iTotalRecords": data[0].total, // without filtering
            "iTotalDisplayRecords": data[0].display_total // after filtering
          })
        },
        "error": handle_ajax_error
      } );
    }, handle_ajax_error)
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

  // Fill in the datatables object
  $t.dataTable({
    "bProcessing": true,
    "bServerSide": true,
    "bDeferRender": true,
    "bPaginate": true,
    "bFilter": true,
    "iDisplayLength": 500,
    "bScrollCollapse": true,
    "sDom": 'r<"table_controls"pfi><"table_wrapper"t>',
    "sPaginationType": "bootstrap",
    "fnServerData": convertData(table_name, column_names),
    "fnRowCallback": prettifyRow,
    "fnInitComplete": function(oSettings){
      if(oSettings.aoColumns.length > 30){
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
    $(li).append('<a href="#">' + table_name + '</a>').bind('click', function(e){
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

  scraperwiki.sql.meta(function(newMeta) {
    meta = newMeta
    tables = _.keys(meta.table)
    $('body > .dataTables_processing').remove()
    if(tables.length){
      loadActiveTable(function(saved_active_table) {
        constructDataTables(saved_active_table)
      })
    } else {
      $('body').html('<div class="problem"><h4>This dataset is empty.</h4><p>Once your dataset contains data,<br/>it will show up in a table here.</p></div>')
    }
  }, handle_ajax_error)
});
