// datatables-tool.js

var allSettings

// Handle AJAX type errors
var handle_ajax_error = function(jqXHR, textStatus, errorThrown) {
  $('#content > .dataTables_processing').remove()
  if(jqXHR.responseText.match(/database file does not exist/) != null){
    $('#table-sidebar-loading').text('No tables')
    $('#content').html('<div class="problem"><h4>This dataset is empty.</h4><p>Once your dataset contains data,<br/>it will show up in a table here.</p></div>')
  } else if(jqXHR.responseText.match(/Gateway Time-out/) != null){
    $('#content').html('<div class="problem"><h4>Well this is embarassing.</h4><p>Your dataset is too big to display.</br>Try downloading it as a spreadsheet.</p></div>')
  } else {
    scraperwiki.alert(errorThrown, jqXHR.responseText, "error")
  }
}

// http://stackoverflow.com/questions/7740567/escape-markup-in-json-driven-jquery-datatable
function htmlEncode(value) {
  return $('<div/>').text(value).html();
}
function htmlDecode(value) {
  return $('<div/>').html(value).text();
}

function pluralise(number, plural_suffix, singular_suffix){
  var plural_suffix = plural_suffix || 's';
  var singular_suffix = singular_suffix || '';
  if(number == 1){
    return singular_suffix;
  } else {
    return plural_suffix;
  }
}

// Links clickable etc. in one row of data
var prettifyCell = function( content ) {
  content = $.trim(content)

  escaped_content = htmlEncode(content)

  // convert images to themselves embedded.
  // XXX _normal is to match Twitter images, watch for it causing trouble
  // e.g. https://si0.twimg.com/profile_images/2559953209/pM981LrS_normal - remove it
  if (content.match(/^((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+(\.jpeg|\.png|\.jpg|\.gif|\.bmp|_normal))$/ig)) {
    content = '<img src="' + escaped_content + '" class="inline">'
  }
  // match LinkedIn image URLs, which always have "licdn.com/mpr/mpr" in them.
  // e.g. http://m3.licdn.com/mpr/mprx/0_oCf8SHoyvJ0Wq_CEo87xSEoAvRHIq5CEe_R0SEw2EOpRI3voQk0uio0GUveqBC_QITDYCDvcT0rm
  else if (content.match(/^((http|https|ftp):\/\/[a-z0-9\.]+licdn.com\/mpr\/mpr[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+)$/ig)) {
    content = '<img src="' + escaped_content + '" class="inline">'
  }
  // add links onto URLs:
  else if (content.match(/^((http|https|ftp):\/\/[a-zA-Z0-9-_~#:\.\?%&\/\[\]@\!\$'\(\)\*\+,;=]+)$/g)) {
    less_30 = escaped_content
    if (content.length > 30) {
      less_30 = htmlEncode(content.substr(0,30)) + "&hellip;"
    }
    content = '<a href="' + escaped_content + '" target="_blank">' + less_30 + '</a>'
  }
  else {
    less_500 = escaped_content
    if (content.length > 500) {
      less_500 = htmlEncode(content.substr(0,500)) + "<span title='" + content.length + " characters in total'>&hellip;</span>"
    }
    content = less_500
  }

  return content
}

// Save known state of all tabs, and active tab
// oSettings is ignored (it's only there because DataTables provides it)
// oData should either be a DataTables object, or null (in the case of a grid)
var saveState = function (oSettings, oData) {
  console.log('save', window.currentActiveTable, window.currentActiveTableType, oData)
  window.allSettings['active'] = window.currentActiveTable
  window.allSettings['activeType'] = window.currentActiveTableType
  window.allSettings['tables'][window.currentActiveTable] = oData

  var j = JSON.stringify(window.allSettings)
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
  if (window.currentActiveTable in window.allSettings['tables']) {
    oData = window.allSettings['tables'][window.currentActiveTable]
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
        window.allSettings = JSON.parse(content)
      } catch (e) {
        window.allSettings = { tables: {}, active: null, activeType: null }
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
  return "'" + cmd.replace(/'/g,"'\\''") + "'";
}

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
      var search = "'%" + params.sSearch.toLowerCase().replace("%", "$%").replace("_", "$_").replace("$", "$$") + "%'"
      where = " where " + _.map(column_names, function(n) { return "lower(" + escapeSQL(n) + ") like " + search + " escape '$'"}).join(" or ")
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
          "url": window.sqliteEndpoint,
          "data": { q: query },
          "success": function ( response ) {
            // ScraperWiki returns a list of dicts. This converts it to a list of lists.
            for (var i=0;i<response.length;i++) {
              var row = []
              _.each(window.meta.table[table_name].columnNames, function(col) {
                row.push(prettifyCell(response[i][col]))
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
// 'table_type' should be either 'table' or 'grid'
// 'table_index' should be the integer position of the datatable in the list of all tables/grids
// 'table_name' is obviously the name of the active table/grid
var constructDataTable = function(table_type, table_index, table_name) {
  // Find or make the table
  $(".maintable").hide()
  var wrapper_id = table_type + "_" + table_index
  var $outer = $("#" + wrapper_id)
  if ($outer.length == 0) {
    $outer = $('<div class="maintable" id="' + wrapper_id + '"> <table class="table table-striped table-bordered innertable display"></table> </div>')
    $('#content').append($outer)
  } else {
    $outer.show()
    return
  }
  var $t = $outer.find("table")

  if(table_type == 'grid'){

    // This is a grid! Bypass DataTables, and just ajax in the entire table element
    if('url' in window.meta.grid[table_name]){
      $.get(window.meta.grid[table_name]['url']).done(function(html){
        var innerHtml = $('<div>').html(html).find('table').html()
        $t.html(innerHtml).removeClass('table-striped')
        saveState(null, null)
      }).fail(handle_ajax_error)
    } else {
      scraperwiki.alert('This grid has no URL', 'We can&rsquo;t load the content of this grid. Try clearing your data and importing again.', 'error')
    }

  } else {

    // This is a table! Find out the column names
    column_names = window.meta.table[table_name].columnNames
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

    // Show fewer rows the more columns there are (for large tables to load quicker)
    var num_columns = column_names.length
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

    // Fill in the datatables object
    window.currentTable = $t.dataTable({
      "bProcessing": true,
      "bServerSide": true,
      "bDeferRender": true,
      "bPaginate": true,
      "bFilter": true,
      "iDisplayLength": rows_to_show,
      "bScrollCollapse": true,
      "sDom": 'r<"table_controls"p<"form-search"<"input-append">>i><"table_wrapper"t>',
      "sPaginationType": "bootstrap",
      "fnServerData": convertData(table_name, column_names),
      "fnInitComplete": function(oSettings){
        if (oSettings.aoColumns.length > 30){
          // Remove search box if there are so many columns the ajax request
          // would cause a 414 Request URI Too Large error on wide datasets
          $('#' + wrapper_id + ' .input-append').empty()
        } else {
          // Otherwise, append search box and handle clicks / enter key
          var $btn = $('<button class="btn">Search</button>').on('click', function(){
            searchTerm = $(this).prev().val()
            window.currentTable.fnFilter(searchTerm)
          })
          var $input = $('<input type="search" class="input-medium search-query">').on('keypress', function(e){
            if (e.which === 13) {
              $(this).next().trigger('click')
            }
          })
          if(oSettings.oLoadedState != null){
            $input.val(oSettings.oLoadedState.oSearch.sSearch)
          }
          $('#' + wrapper_id + ' .input-append').html($input).append($btn)
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
}

// Create and insert spreadsheet-like tab bar at top of page.
// 'tables' should be a list of table names.
// 'active_table' should be the one you want to appear selected.
var constructTabs = function(active_table){
  var $ul = $('#table-sidebar > ul.nav')
  $ul.empty()
  var publicTables = _.filter(window.tables, isPublicTable)
  var devTables = _.filter(window.tables, isDevTable)
  if(publicTables.length){
    var subtitle = publicTables.length + ' Table' + pluralise(publicTables.length)
    $ul.append('<li class="nav-header">' + subtitle + '</li>')
    $.each(publicTables, function(i, table_name){
      $ul.append(constructTab('table', window.tables.indexOf(table_name), table_name, active_table))
    })
  }
  if(window.grids.length){
    var subtitle = window.grids.length + ' Unstructured table' + pluralise(window.grids.length)
    $ul.append('<li class="nav-header">' + subtitle + '<li>')
    $.each(window.grids, function(i, grid_checksum){
      $ul.append(constructTab('grid', window.grids.indexOf(grid_checksum), grid_checksum, active_table))
    })
  }
  if(devTables.length){
    var subtitle = devTables.length + ' Developer Table' + pluralise(devTables.length)
    $ul.append('<li class="nav-header" id="developer-tables">' + subtitle + '</li>')
    $.each(devTables, function(i, table_name){
      var $li = constructTab('table', window.tables.indexOf(table_name), table_name, active_table)
      $li.addClass('developer')
      $ul.append($li)
    })
  }
}

var constructTab = function(type, table_index, table_name, active_table){
  var $li = $('<li>')
  if (table_name == active_table){
    $li.addClass('active')
    window.currentActiveTable = table_name
    window.currentActiveTableIndex = table_index
    window.currentActiveTableType = type
  }
  var $a = $('<a>').appendTo($li)
  if(type == 'grid'){
    if('title' in window.meta.grid[table_name]){
      $a.text(window.meta.grid[table_name]['title'])
    } else {
      $a.text(table_name)
    }
  } else {
    $a.text(table_name)
  }
  $a.attr('data-table-index', table_index)
  $a.attr('data-table-name', table_name)
  $a.attr('data-table-type', type)
  return $li
}

// Short functions to weed out non-user-facing tables
var isHiddenTable = function(table_name){
  return table_name.slice(0,2)=='__'
}
var isDevTable = function(table_name){
  return table_name.slice(0,1)=='_' && !isHiddenTable(table_name)
}
var isPublicTable = function(table_name){
  return table_name.slice(0,1)!='_'
}

// Make all the DataTables and their tabs
var constructDataTables = function(first_table_name) {
  var all_tables_and_grids = window.tables.concat(window.grids)
  if ( ! first_table_name || ! _.contains(all_tables_and_grids, first_table_name) ) {
    // Get the first non underscore table if there is one, or the first
    // table overall
    first_table_name = _.reject(all_tables_and_grids, function(table_name) {
        return isDevTable(table_name)
    })[0] || window.tables[0]
  }

  // Populate the sidebar
  constructTabs(first_table_name)

  if(isDevTable(first_table_name)) {
    toggleDevTables()
  }

  // Activate one of the sidebar tables (This is really hacky)
  // These global variables are set in constructTab
  $('a[data-table-index="' + window.currentActiveTableIndex + '"][data-table-type="' + window.currentActiveTableType + '"][data-table-name="' + window.currentActiveTable + '"]').trigger('click')
}

// Get table names in the right order, ready for display
var filter_and_sort_tables = function(messy_table_names) {
  // Filter out tables starting with double underscore
  nice_tables = _.reject(messy_table_names, isHiddenTable)
  // Put tables beginning with a single underscore at the end
  return _.reject(nice_tables, isDevTable).concat(_.filter(nice_tables, isDevTable))
}

var toggleDevTables = function() {
    $('#developer-tables').nextAll().toggle()
}

// Main entry point
var settings
var sqliteEndpoint
var tables
var grids
var currentActiveTable
var currentActiveTableIndex
var currentActiveTableType
var meta

$(function(){
  window.settings = scraperwiki.readSettings()
  window.sqliteEndpoint = window.settings.target.url + '/sqlite'

  async.parallel([
    function (cb) {
      scraperwiki.sql.meta(function(newMeta) {
        window.meta = newMeta
        window.tables = filter_and_sort_tables(_.keys(window.meta.table))
        var unsorted_grids = _.keys(window.meta.grid)
        window.grids = _.sortBy(unsorted_grids, function(grid_checksum) {
          return window.meta.grid[grid_checksum]['number']
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
      $('#content > .dataTables_processing').remove()
      if(window.tables.length){
          window.currentActiveTable = window.allSettings['active']
          if(window.currentActiveTable && isDevTable(window.currentActiveTable)){
            // we don't want to automatically switch to _ tables
            // so we pretend the state was never saved
            window.currentActiveTable = undefined
          }
          constructDataTables(window.currentActiveTable)
      } else {
        $('#table-sidebar-loading').text('No tables')
        $('#content').html('<div class="problem"><h4>This dataset is empty.</h4><p>Once your dataset contains data,<br/>it will show up in a table here.</p></div>')
      }
    }
   )

   $(document).on('click', '#table-sidebar li a', function(){
     var $a = $(this)
     var $li = $a.parent()
     $li.addClass('active').siblings('.active').removeClass('active')
     window.currentActiveTable = $a.attr('data-table-name')
     window.currentActiveTableIndex = $a.attr('data-table-index')
     window.currentActiveTableType = $a.attr('data-table-type')
     constructDataTable(window.currentActiveTableType, window.currentActiveTableIndex, window.currentActiveTable)
   })

  $(document).on('click', '#developer-tables', toggleDevTables)
});


