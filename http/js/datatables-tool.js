// datatables-tool.js

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
          // XXX _normal is to match images like: https://si0.twimg.com/profile_images/2559953209/pM981LrS_normal - remove it
          // if it causes trouble
          .replace(
              />((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+(\.jpeg|\.png|\.jpg|\.gif|\.bmp|_normal))</ig,
              '><img src="$1" height="48px"><'
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
  console.log("saveState", oData)
  var j = JSON.stringify(oData)
  var fname = escapeshell("settings_" + currentActiveTable + ".json")
  scraperwiki.exec("echo -n <<ENDOFJSON >" + fname + ".new " + escapeshell(j) + "\nENDOFJSON\n" + 
    "mv " + fname + ".new " + fname + "; " + 
    "echo -n " + escapeshell(currentActiveTable) + " >active_table.txt",
    function(content) { 
      if (content != "") {
        scraperwiki.alert("Unexpected response!", content, "error")
      }
    }, 
    function(jqXHR, textStatus, errorThrown) {
      scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
    }
  )
}

// Add this in, needed for loadState which must return asynchronously
scraperwiki.async_exec = function(cmd, success, error) {
  var options, settings;
  settings = scraperwiki.readSettings();
  options = {
    url: "" + window.location.protocol + "//" + window.location.host + "/" + scraperwiki.boxName + "/exec",
    async: true,
    type: "POST",
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
  scraperwiki.async_exec("touch " + fname + "; cat " + fname,
    function(content) { 
      try {
        var oData = JSON.parse(content);
        console.log("loadState", oData)
        return oData
      } catch (e) {
        return false 
      }
    }, 
    function(jqXHR, textStatus, errorThrown) {
      scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
    }
  )
}


// Read active table from the box's filesystem and pass it on to callback
var loadActiveTable = function(callback) {
  scraperwiki.exec("touch active_table.txt; cat active_table.txt",
    function(content) { 
      callback(content)
    }, 
    function(jqXHR, textStatus, errorThrown) {
      scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
    }
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
    console.log("DataTables params:", params)

    // construct SQL query needed according to the parameters
    var columns  = _.map(column_names, escapeSQL).join(",")
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
    }
    var query = "select " + columns + 
           " from " + escapeSQL(table_name) + 
         where + 
         order_by + 
           " limit " + params.iDisplayLength + 
           " offset " + params.iDisplayStart 
    console.log("SQL query:", query)

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
            for (k in response[i]) {
              row.push(response[i][k])
            }
            rows.push(row)
          }
          // Send the data to dataTables
          fnCallback({ 
            "aaData" : rows,
            "iTotalRecords": data[0].total, // without filtering
            "iTotalDisplayRecords": data[0].display_total // after filtering
          })
        }, 
        "error": function(jqXHR, textStatus, errorThrown) {
          scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
        }
      } );
    }, function(jqXHR, textStatus, errorThrown) {
      scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
    })
  }
}

// Find the column names for a given table
function getTableColumnNames(table_name, callback){
    scraperwiki.sql("select * from " + escapeSQL(table_name) + " limit 1", function(data) {
    callback(_.keys(data[0]))
  }, function(jqXHR, textStatus, errorThrown) {
    scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
  })
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
    console.log("making a new table:", table_name)
    $outer = $('<div class="maintable" id="table_' + i + '"> <table class="table table-striped table-bordered innertable display"></table> </div>')
    $('body').append($outer)
  } else {
    $outer.show()
    console.log("reusing cached table:", table_name)
    return
  }
  var $t = $outer.find("table")

  // Find out the column names
  getTableColumnNames(table_name, function(column_names) {
    console.log("Columns", column_names)
    if (column_names.length == 0) {
      scraperwiki.alert("No data in the table", jqXHR.responseText)
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
      "sDom": '<"table_controls"pfi>r<"table_wrapper"t>',
      "sPaginationType": "bootstrap",
      "fnServerData": convertData(table_name, column_names),
      "fnRowCallback": prettifyRow,
      "fnInitComplete": function(){
        // Really hackily replace their rubbish search input with a nicer one
        var $copy = $('.dataTables_filter label input').clone(true).addClass('search-query')
        $('.dataTables_filter').empty().append($copy)
      },
      "bStateSave": true,
      "fnStateSave": saveState,
      "fnStateLoad": loadState,
    })
  })
}

// Create and insert spreadsheet-like tab bar at bottom of page.
// 'tables' should be a list of table names.
// 'active_table' should be the one you want to appear selected.
var constructTabs = function(tables, active_table){
  var $tabs = $('<div>').addClass('tabs-below').appendTo('body')
  var $ul = $('<ul>').addClass('nav nav-tabs').appendTo($tabs)
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
  if (!first_table_name) {
    first_table_name = tables[0]
  }
  constructTabs(tables, first_table_name)
  $("#tab_" + currentActiveTableIndex).trigger('click')
  console.log($("#tab_" + currentActiveTableIndex))
}

// Main entry point, make the data table
var settings
var sqliteEndpoint
var tables
var currentActiveTable
var currentActiveTableIndex
$(function(){
  settings = scraperwiki.readSettings()
  sqliteEndpoint = settings.target.url + '/sqlite'

  scraperwiki.sql("select name from " + escapeSQL('sqlite_master') + " where type = 'table'", function(data, textStatus, jqXHR) {
    tables = []
    $.each(data, function (i) {
      tables.push(data[i].name)
    })
    console.log("Tables are:", tables)
    loadActiveTable(function(saved_active_table) { 
      constructDataTables(saved_active_table)
    })
  }, function(jqXHR, textStatus, errorThrown) {
    scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
  })

});




