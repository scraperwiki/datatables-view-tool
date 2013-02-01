$(function(){
	if(window.location.hash == ''){
        showAlert('Which dataset do you want to visualise?', 'You didn&rsquo;t supply a JSON object of settings in the URL hash. Are you sure you followed the right link?');
        return false;
    }
    hash = window.location.hash.substr(1);
    try {
        settings = JSON.parse(decodeURIComponent(hash));
    } catch(e) {
        showAlert('Could not read settings from URL hash!', 'The settings supplied in your URL hash are not a valid JSON object. Are you sure you followed the right link?');
        return false
    }
    if('target' in settings && 'url' in settings.target){
        window.sqliteEndpoint = settings.target.url + '/sqlite'
        $('#maintable').dataTable( {
		"bProcessing": true,
		"bServerSide": true,
		"bPaginate": true,
		"fnServerData": function ( sSource, aoData, fnCallback, oSettings ) {
			// convert aoData into a normal hash (called ps)
			var ps = {}
			for (var i=0;i<aoData.length;i++) { 
				ps[aoData[i]['name']] = aoData[i]['value']
			}
			console.log(JSON.stringify(ps))

			/* These are the things from ps that we need to make it handle
			   (please remove them as you implement them!):

			[{"name":"sEcho","value":1},
			{"name":"iColumns","value":2},
			{"name":"sColumns","value":""},
			{"name":"mDataProp_0","value":0},
			{"name":"mDataProp_1","value":1},
			{"name":"sSearch","value":""},
			{"name":"bRegex","value":false},
			{"name":"sSearch_0","value":""},
			{"name":"bRegex_0","value":false},
			{"name":"bSearchable_0","value":true},
			{"name":"sSearch_1","value":""},
			{"name":"bRegex_1","value":false},
			{"name":"bSearchable_1","value":true},
			{"name":"iSortCol_0","value":0},
			{"name":"sSortDir_0","value":"asc"},
			{"name":"iSortingCols","value":1},
			{"name":"bSortable_0","value":true},
			{"name":"bSortable_1","value":true}] */

			var data = {}
			data["q"] = "select * from twitter limit " + ps['iDisplayLength'] + " offset " + ps['iDisplayStart']
			oSettings.jqXHR = $.ajax( {
				"dataType": 'json',
				"type": "GET",
				"url": sqliteEndpoint,
				"data": data,
				"success": function ( response ) {
					var rows = []
					for (var i=0;i<response.length;i++) { 
						var row = []
						for (k in response[i]) {
							row.push(response[i][k])
						}
						rows.push(row)
					}
					console.log(rows)
					return fnCallback({ "aaData" : rows })
				}
			} );
		}
	} );
    } else {
        showAlert('Which dataset do you want to visualise?', 'You supplied a JSON object in the URL hash, but it doesn&rsquo;t contain a &ldquo;settings.target&rdquo; key-value pair. Are you sure you followed the right link?');
    }

});
