// ==UserScript==
// @id             mu-density
// @name           IITC plugin: show MU density for each field
// @category       Info
// @version        0.0.1
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @description    [vorlon-0.0.1] When fields are created, calculate and display the MU density for the field in question
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==


function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
window.plugin.mudensity = function() {};

window.plugin.mudensity.toRad = function(arg) {
   return arg * Math.PI / 180;
}

window.plugin.mudensity.haversine = function(lat1,lat2,lng1,lng2) {
   var Lat = window.plugin.mudensity.toRad((lat2-lat1)/1E6);
   var Lng = window.plugin.mudensity.toRad((lng2-lng1)/1E6);

   var R = 6371; // radius in kilometers

   var a = Math.sin(Lat/2) * Math.sin (Lat/2) +
           Math.cos(window.plugin.mudensity.toRad(lat1/1E6)) *
           Math.cos(window.plugin.mudensity.toRad(lat2/1E6)) *
           Math.sin(Lng/2) * Math.sin (Lng/2);
   var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
   return R * c;
}

window.plugin.mudensity.area = function(f) {
   var a = window.plugin.mudensity.haversine(f.portal1.lat, f.portal2.lat,
                                             f.portal1.lng, f.portal2.lng);
   var b = window.plugin.mudensity.haversine(f.portal2.lat, f.portal3.lat,
                                             f.portal2.lng, f.portal3.lng);
   var c = window.plugin.mudensity.haversine(f.portal3.lat, f.portal1.lat,
                                             f.portal3.lng, f.portal1.lng);

   var s = (a+b+c)/2;
   return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

window.plugin.mudensity.handleData = function(data) {

  // the link and field can come in any order in the data, so we have to
  // handle the possibility of the field being either first or last.  If the
  // link makes *multiple* fields, however, we punt, since we don't know for
  // sure which MU maps to which field.  This can be determined by seeing that
  // there is more than one portal that both source and target portals are
  // linked to.
  var candidate = { portal1: null, portal2: null, portal3: null, mu: 0,
                    timestamp: null, area: 0 };

  $.each(data.raw.success, function(ind, json) {

    // find portal information
    var skipThisMessage = false;
    var isField = false;
    var portal1 = null;
    var portal2 = null;
    var portal3 = null;
    var mu = 0;

    $.each(json[2].plext.markup, function(ind, markup) {
      switch(markup[0]) {
      case 'TEXT':
        // This could eventually be useful because we do get the count
        // of MU destroyed; but skip for now
        if(markup[1].plain.indexOf('destroyed the Link') !== -1
          || markup[1].plain.indexOf('destroyed a Control Field') !== -1
          || markup[1].plain.indexOf('Your Link') !== -1) {
          skipThisMessage = true;
          return false;
        }
        if (isField) {
          var res = parseInt(markup[1].plain, 10);
          // ignore fields with 1MU, as this gives us an upper bound but
          // no lower bound
          if (res > 1) {
            mu = res;
          }
        }
        if(markup[1].plain.indexOf('created a Control Field') !== -1) {
          isField = true;
        }
        break;
      case 'PORTAL':
        var portal = { name: markup[1].name,
                       lat: markup[1].latE6,
                       lng: markup[1].lngE6 };
        if (!portal1)
          portal1 = portal;
        else
          portal2 = portal;
        break;
      }

    });

    if (!portal1)
      return true;

    if (candidate.portal1) {
      if (candidate.portal1.lng != portal1.lng
          || candidate.portal1.lat != portal1.lat
          || (portal2 && candidate.portal2)
          || (mu && candidate.mu)
          || candidate.timestamp != json[1])
      {
        candidate = { portal1: null, portal2: null, portal3: null, mu: 0,
                      timestamp: null, area: 0 };
      }
    }

    if (!candidate.portal1) {
      candidate.portal1 = portal1;
      candidate.timestamp = json[1];
    }
    if (portal2)
      candidate.portal2 = portal2;
    if (mu)
      candidate.mu = mu;

    if (candidate.portal2 && candidate.mu) {
      // we don't try to map portals to guids because the guids aren't
      // actually relevant for finding fields, since fields are just a set of
      // points without references to the portals.

      $.each(window.fields, function(g,f) {
        var d = f.options.data;
        var point = [0,0,0];
        for (var i = 0; i < 3; i++)
        {
           if (d.points[i].latE6 == candidate.portal1.lat
               && d.points[i].lngE6 == candidate.portal1.lng)
           {
             point[i] = 1;
           } else if (d.points[i].latE6 == candidate.portal2.lat
               && d.points[i].lngE6 == candidate.portal2.lng)
           {
             point[i] = 2;
           }
        }
        // not a match.
        if (point[0] + point[1] + point[2] < 3)
          return true;

        // more than one match, we don't know which is which.
        if (portal3) {
          portal3 = null;
          return false;
        }

        for (var i = 0; i < 3; i++)
        {
          if (point[i] == 0)
          {
              portal3 = { lat: d.points[i].latE6, lng: d.points[i].lngE6 };
          }
        } 
      });

      if (portal3) {
        candidate.portal3 = portal3;
        candidate.area = window.plugin.mudensity.area(candidate);
//        alert("Density is between "
//              + ((candidate.mu-.5)/candidate.area).toString()
//              + " and "
//              + ((candidate.mu+.5)/candidate.area).toString()
//              + " MU/km^2");
        window.plugin.mudensity.listFields.push(candidate);
      }
      candidate = { portal1: null, portal2: null, portal3: null, mu: 0,
                    timestamp: null, area: 0 };
    }
  });
}



window.plugin.mudensity.listFields = [];
window.plugin.mudensity.listPortals = [];
window.plugin.mudensity.sortBy = 1; // second column: level
window.plugin.mudensity.sortOrder = -1;
window.plugin.mudensity.enlP = 0;
window.plugin.mudensity.resP = 0;
window.plugin.mudensity.neuP = 0;
window.plugin.mudensity.filter = 0;

/*
 * plugins may add fields by appending their specifiation to the following list. The following members are supported:
 * title: String
 *     Name of the column. Required.
 * value: function(portal)
 *     The raw value of this field. Can by anything. Required, but can be dummy implementation if sortValue and format
 *     are implemented.
 * sortValue: function(value, portal)
 *     The value to sort by. Optional, uses value if omitted. The raw value is passed as first argument.
 * sort: function(valueA, valueB, portalA, portalB)
 *     Custom sorting function. See Array.sort() for details on return value. Both the raw values and the portal objects
 *     are passed as arguments. Optional. Set to null to disable sorting
 * format: function(cell, portal, value)
 *     Used to fill and format the cell, which is given as a DOM node. If omitted, the raw value is put in the cell.
 * defaultOrder: -1|1
 *     Which order should by default be used for this column. -1 means descending. Default: 1
 */


window.plugin.mudensity.fields = [
  {
    title: "Portal 1",
    value: function(portal) { return portal.options.data.title; },
    sortValue: function(value, portal) { return value.toLowerCase(); },
    format: function(cell, portal, value) {
      $(cell)
        .append(plugin.mudensity.getPortalLink(portal))
        .addClass("portalTitle");
    }
  },
  {
    title: "Portal 2",
    value: function(portal) { return portal.options.data.title; },
    sortValue: function(value, portal) { return value.toLowerCase(); },
    format: function(cell, portal, value) {
      $(cell)
        .append(plugin.mudensity.getPortalLink(portal))
        .addClass("portalTitle");
    }
  },
  {
    title: "Portal 3",
    value: function(portal) { return portal.options.data.title; },
    sortValue: function(value, portal) { return value.toLowerCase(); },
    format: function(cell, portal, value) {
      $(cell)
        .append(plugin.mudensity.getPortalLink(portal))
        .addClass("portalTitle");
    }
  },
  {
    title: "MU density",
    value: function(portal) { return portal.options.team; },
    format: function(cell, portal, value) {
      $(cell).text(['NEU', 'RES', 'ENL'][value]);
    }
  },
  {
    title: "Links",
    value: function(portal) { return window.getPortalLinks(portal.options.guid); },
    sortValue: function(value, portal) { return value.in.length + value.out.length; },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .addClass('help')
        .attr('title', 'In:\t' + value.in.length + '\nOut:\t' + value.out.length)
        .text(value.in.length+value.out.length);
    }
  },
  {
    title: "Fields",
    value: function(portal) { return getPortalFieldsCount(portal.options.guid) },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .text(value);
    }
  },
  {
    title: "AP",
    value: function(portal) {
      var links = window.getPortalLinks(portal.options.guid);
      var fields = getPortalFieldsCount(portal.options.guid);
      return portalApGainMaths(portal.options.data.resCount, links.in.length+links.out.length, fields);
    },
    sortValue: function(value, portal) { return value.enemyAp; },
    format: function(cell, portal, value) {
      var title = '';
      if (PLAYER.team == portal.options.data.team) {
        title += 'Friendly AP:\t'+value.friendlyAp+'\n'
               + '- deploy '+(8-portal.options.data.resCount)+' resonator(s)\n'
               + '- upgrades/mods unknown\n';
      }
      title += 'Enemy AP:\t'+value.enemyAp+'\n'
             + '- Destroy AP:\t'+value.destroyAp+'\n'
             + '- Capture AP:\t'+value.captureAp;

      $(cell)
        .addClass("alignR")
        .addClass('help')
        .prop('title', title)
        .html(digits(value.enemyAp));
    }
  },
];

//fill the listPortals array with portals avaliable on the map (level filtered portals will not appear in the table)
window.plugin.mudensity.getPortals = function() {
  //filter : 0 = All, 1 = Neutral, 2 = Res, 3 = Enl, -x = all but x
  var retval=false;

  var displayBounds = map.getBounds();

  window.plugin.mudensity.listPortals = [];
  $.each(window.portals, function(i, portal) {
    // eliminate offscreen portals (selected, and in padding)
    if(!displayBounds.contains(portal.getLatLng())) return true;

    retval=true;

    switch (portal.options.team) {
      case TEAM_RES:
        window.plugin.mudensity.resP++;
        break;
      case TEAM_ENL:
        window.plugin.mudensity.enlP++;
        break;
      default:
        window.plugin.mudensity.neuP++;
    }

    // cache values and DOM nodes
    var obj = { portal: portal, values: [], sortValues: [] };

    var row = document.createElement('tr');
    row.className = TEAM_TO_CSS[portal.options.team];
    obj.row = row;

    var cell = row.insertCell(-1);
    cell.className = 'alignR';

    window.plugin.mudensity.fields.forEach(function(field, i) {
      cell = row.insertCell(-1);

      var value = field.value(portal);
      obj.values.push(value);

      obj.sortValues.push(field.sortValue ? field.sortValue(value, portal) : value);

      if(field.format) {
        field.format(cell, portal, value);
      } else {
        cell.textContent = value;
      }
    });

    window.plugin.mudensity.listPortals.push(obj);
  });

  return retval;
}

window.plugin.mudensity.displayPL = function() {
  var list;
  window.plugin.mudensity.sortBy = 1;
  window.plugin.mudensity.sortOrder = -1;
  window.plugin.mudensity.enlP = 0;
  window.plugin.mudensity.resP = 0;
  window.plugin.mudensity.neuP = 0;
  window.plugin.mudensity.filter = 0;

  if (window.plugin.mudensity.getPortals()) {
    list = window.plugin.mudensity.portalTable(window.plugin.mudensity.sortBy, window.plugin.mudensity.sortOrder,window.plugin.mudensity.filter);
  } else {
    list = $('<table class="noPortals"><tr><td>Nothing to show!</td></tr></table>');
  };

  if(window.useAndroidPanes()) {
    $('<div id="mudensity" class="mobile">').append(list).appendTo(document.body);
  } else {
    dialog({
      html: $('<div id="mudensity">').append(list),
      dialogClass: 'ui-dialog-mudensity',
      title: 'Portal list: ' + window.plugin.mudensity.listPortals.length + ' ' + (window.plugin.mudensity.listPortals.length == 1 ? 'portal' : 'portals'),
      id: 'portal-list',
      width: 700
    });
  }
}

window.plugin.mudensity.portalTable = function(sortBy, sortOrder, filter) {
  // save the sortBy/sortOrder/filter
  window.plugin.mudensity.sortBy = sortBy;
  window.plugin.mudensity.sortOrder = sortOrder;
  window.plugin.mudensity.filter = filter;

  var portals = window.plugin.mudensity.listPortals;
  var fields = window.plugin.mudensity.listFields;
  var sortField = window.plugin.mudensity.fields[sortBy];

  portals.sort(function(a, b) {
    var valueA = a.sortValues[sortBy];
    var valueB = b.sortValues[sortBy];

    if(sortField.sort) {
      return sortOrder * sortField.sort(valueA, valueB, a.portal, b.portal);
    }

    return sortOrder *
      (valueA < valueB ? -1 :
      valueA > valueB ?  1 :
      0);
  });

  if(filter !== 0) {
    portals = portals.filter(function(obj) {
      return filter < 0
        ? obj.portal.options.team+1 != -filter
        : obj.portal.options.team+1 == filter;
    });
  }

  var table, row, cell;
  var container = $('<div>');

  table = document.createElement('table');
  table.className = 'filter';
  container.append(table);

  row = table.insertRow(-1);

  var length = window.plugin.mudensity.listPortals.length;

  ["All", "Neutral", "Resistance", "Enlightened"].forEach(function(label, i) {
    cell = row.appendChild(document.createElement('th'));
    cell.className = 'filter' + label.substr(0, 3);
    cell.textContent = label+':';
    cell.title = 'Show only portals of this color';
    $(cell).click(function() {
      $('#mudensity').empty().append(window.plugin.mudensity.portalTable(sortBy, sortOrder, i));
    });


    cell = row.insertCell(-1);
    cell.className = 'filter' + label.substr(0, 3);
    if(i != 0) cell.title = 'Hide portals of this color';
    $(cell).click(function() {
      $('#mudensity').empty().append(window.plugin.mudensity.portalTable(sortBy, sortOrder, -i));
    });

    switch(i-1) {
      case -1:
        cell.textContent = length;
        break;
      case 0:
        cell.textContent = window.plugin.mudensity.neuP + ' (' + Math.round(window.plugin.mudensity.neuP/length*100) + '%)';
        break;
      case 1:
        cell.textContent = window.plugin.mudensity.resP + ' (' + Math.round(window.plugin.mudensity.resP/length*100) + '%)';
        break;
      case 2:
        cell.textContent = window.plugin.mudensity.enlP + ' (' + Math.round(window.plugin.mudensity.enlP/length*100) + '%)';
    }
  });

  table = document.createElement('table');
  table.className = 'portals';
  container.append(table);

  var thead = table.appendChild(document.createElement('thead'));
  row = thead.insertRow(-1);

  cell = row.appendChild(document.createElement('th'));
  cell.textContent = '#';

  window.plugin.mudensity.fields.forEach(function(field, i) {
    cell = row.appendChild(document.createElement('th'));
    cell.textContent = field.title;
    if(field.sort !== null) {
      cell.classList.add("sortable");
      if(i == window.plugin.mudensity.sortBy) {
        cell.classList.add("sorted");
      }

      $(cell).click(function() {
        var order;
        if(i == sortBy) {
          order = -sortOrder;
        } else {
          order = field.defaultOrder < 0 ? -1 : 1;
        }

        $('#mudensity').empty().append(window.plugin.mudensity.portalTable(i, order, filter));
      });
    }
  });

  portals.forEach(function(obj, i) {
    var row = obj.row
    if(row.parentNode) row.parentNode.removeChild(row);

    row.cells[0].textContent = i+1;

    table.appendChild(row);
  });

  container.append('<div class="disclaimer">Click on portals table headers to sort by that column. '
    + 'Click on <b>All, Neutral, Resistance, Enlightened</b> to only show portals owner by that faction or on the number behind the factions to show all but those portals.</div>');

  return container;
}

// portal link - single click: select portal
//               double click: zoom to and select portal
// code from getPortalLink function by xelio from iitc: AP List - https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/plugins/ap-list.user.js
window.plugin.mudensity.getPortalLink = function(portal) {
  var coord = portal.getLatLng();
  var perma = '/intel?ll='+coord.lat+','+coord.lng+'&z=17&pll='+coord.lat+','+coord.lng;

  // jQuery's event handlers seem to be removed when the nodes are remove from the DOM
  var link = document.createElement("a");
  link.textContent = portal.options.data.title;
  link.href = perma;
  link.addEventListener("click", function(ev) {
    renderPortalDetails(portal.options.guid);
    ev.preventDefault();
    return false;
  }, false);
  link.addEventListener("dblclick", function(ev) {
    zoomToAndShowPortal(portal.options.guid, [coord.lat, coord.lng]);
    ev.preventDefault();
    return false;
  });
  return link;
}

window.plugin.mudensity.onPaneChanged = function(pane) {
  if(pane == "plugin-mudensity")
    window.plugin.mudensity.displayPL();
  else
    $("#mudensity").remove()
};

var setup =  function() {
  if(window.useAndroidPanes()) {
    android.addPane("plugin-mudensity", "MU Density", "ic_action_paste");
    addHook("paneChanged", window.plugin.mudensity.onPaneChanged);
  } else {
    $('#toolbox').append(' <a onclick="window.plugin.mudensity.displayPL()" title="Show MU density for created fields">MU Density</a>');
  }

  $("<style>")
    .prop("type", "text/css")
    .html("#mudensity.mobile {\n  background: transparent;\n  border: 0 none !important;\n  height: 100% !important;\n  width: 100% !important;\n  left: 0 !important;\n  top: 0 !important;\n  position: absolute;\n  overflow: auto;\n}\n\n#mudensity table {\n  margin-top: 5px;\n  border-collapse: collapse;\n  empty-cells: show;\n  width: 100%;\n  clear: both;\n}\n\n#mudensity table td, #mudensity table th {\n  background-color: #1b415e;\n  border-bottom: 1px solid #0b314e;\n  color: white;\n  padding: 3px;\n}\n\n#mudensity table th {\n  text-align: center;\n}\n\n#mudensity table .alignR {\n  text-align: right;\n}\n\n#mudensity table.portals td {\n  white-space: nowrap;\n}\n\n#mudensity table th.sortable {\n  cursor: pointer;\n}\n\n#mudensity table .portalTitle {\n  min-width: 120px !important;\n  max-width: 240px !important;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n#mudensity .sorted {\n  color: #FFCE00;\n}\n\n#mudensity table.filter {\n  table-layout: fixed;\n  cursor: pointer;\n  border-collapse: separate;\n  border-spacing: 1px;\n}\n\n#mudensity table.filter th {\n  text-align: left;\n  padding-left: 0.3em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n#mudensity table.filter td {\n  text-align: right;\n  padding-right: 0.3em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n#mudensity .filterNeu {\n  background-color: #666;\n}\n\n#mudensity table tr.res td, #mudensity .filterRes {\n  background-color: #005684;\n}\n\n#mudensity table tr.enl td, #mudensity .filterEnl {\n  background-color: #017f01;\n}\n\n#mudensity table tr.none td {\n  background-color: #000;\n}\n\n#mudensity .disclaimer {\n  margin-top: 10px;\n  font-size: 10px;\n}\n\n#mudensity.mobile table.filter tr {\n  display: block;\n  text-align: center;\n}\n#mudensity.mobile table.filter th, #mudensity.mobile table.filter td {\n  display: inline-block;\n  width: 22%;\n}\n\n")
    .appendTo("head");

  addHook('publicChatDataAvailable', window.plugin.mudensity.handleData);
  window.chat.backgroundChannelData('plugin.mudensity', 'all', true);    //enable this plugin's interest in 'all' COMM

}

// PLUGIN END //////////////////////////////////////////////////////////


setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);


