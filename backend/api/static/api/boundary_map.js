// Admin helper: adds an interactive map next to the boundary_type field on
// the MetadataRecord form, so the west/east/south/north_bounding_* fields
// can be drawn (as a rectangle "zone" or a single "point") instead of typed
// in by hand. Falls back to nothing if the fields aren't on the page (e.g.
// list view), and the raw number fields always keep working even if this
// script or the Leaflet CDN fails to load.
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function loadCss(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src, cb) {
    var script = document.createElement("script");
    script.src = src;
    script.onload = cb;
    document.head.appendChild(script);
  }

  onReady(function () {
    var typeField = document.getElementById("id_boundary_type");
    var westField = document.getElementById("id_west_bounding_longitude");
    var eastField = document.getElementById("id_east_bounding_longitude");
    var southField = document.getElementById("id_south_bounding_latitude");
    var northField = document.getElementById("id_north_bounding_latitude");
    if (!typeField || !westField || !eastField || !southField || !northField) {
      return;
    }

    var typeRow = typeField.closest(".form-row") || typeField.parentElement;
    var eastRow = eastField.closest(".form-row") || eastField.parentElement;
    var northRow = northField.closest(".form-row") || northField.parentElement;

    var mapRow = document.createElement("div");
    mapRow.className = "form-row";
    mapRow.innerHTML =
      '<div style="margin-bottom: 6px;">' +
      '<button type="button" id="boundary-map-draw" class="button">Draw on map</button> ' +
      '<button type="button" id="boundary-map-clear" class="button">Clear</button>' +
      "</div>" +
      '<div id="boundary-map" style="height: 350px; max-width: 700px; border: 1px solid #ccc;"></div>' +
      '<p class="help">Click "Draw on map", then drag a rectangle (Zone) or click once (Point) - matches the toggle above. The fields above update automatically; you can also edit the numbers directly.</p>';
    typeRow.parentNode.insertBefore(mapRow, typeRow.nextSibling);

    loadCss("https://unpkg.com/leaflet@1.3.1/dist/leaflet.css");
    loadCss("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css");
    loadCss("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css");
    loadScript("https://unpkg.com/leaflet@1.3.1/dist/leaflet.js", function () {
      loadScript("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js", function () {
        loadScript("https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js", function () {
          loadScript("https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.20/leaflet-maplibre-gl.js", initMap);
        });
      });
    });

    var map, drawnItems, rectangleDrawer, markerDrawer;

    function initMap() {
      map = L.map("boundary-map").setView([-15, 175], 4);
      // OpenFreeMap styles are vector (MapLibre), not plain raster XYZ tiles -
      // plain tile.openstreetmap.org kept hitting usage-policy blocks (403
      // "Access blocked") the more this page's map got reloaded during dev.
      // L.maplibreGL (the maplibre-gl-leaflet bridge) adds each as a Leaflet
      // layer so Leaflet.Draw's rectangle/marker tools above still work
      // unchanged, and so they sit in the same layer switcher as the
      // plain-raster satellite option.
      var baseLayers = {
        // Matches the tile source pygeoapi's own item/list pages use
        // (pygeoapi-generate-config's server.map). Same OSM usage-policy
        // blocking risk under heavy reload applies here too - the OpenFreeMap
        // options above stay available as a fallback if this gets blocked.
        OpenStreetMap: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          maxZoom: 19,
        }),
        "OpenFreeMap Liberty": L.maplibreGL({ style: "https://tiles.openfreemap.org/styles/liberty" }),
        "OpenFreeMap Bright": L.maplibreGL({ style: "https://tiles.openfreemap.org/styles/bright" }),
        "OpenFreeMap Positron": L.maplibreGL({ style: "https://tiles.openfreemap.org/styles/positron" }),
        // Plain World_Imagery has no place names/roads/borders on it - paired
        // with Esri's reference overlay (place labels + boundaries) in a
        // layerGroup so "Satellite" is one selectable, fully-labelled option.
        "Satellite (Esri)": L.layerGroup([
          L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
              attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
              maxZoom: 19,
            }
          ),
          L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            { maxZoom: 19 }
          ),
        ]),
      };
      baseLayers["OpenFreeMap Bright"].addTo(map);
      L.control.layers(baseLayers).addTo(map);

      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      rectangleDrawer = new L.Draw.Rectangle(map, { shapeOptions: { color: "#0d6efd" } });
      markerDrawer = new L.Draw.Marker(map);

      map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        syncFieldsFromShape(e.layer);
      });

      document.getElementById("boundary-map-draw").addEventListener("click", function () {
        drawnItems.clearLayers();
        rectangleDrawer.disable();
        markerDrawer.disable();
        if (typeField.value === "point") {
          markerDrawer.enable();
        } else {
          rectangleDrawer.enable();
        }
      });

      document.getElementById("boundary-map-clear").addEventListener("click", function () {
        rectangleDrawer.disable();
        markerDrawer.disable();
        drawnItems.clearLayers();
        westField.value = "";
        eastField.value = "";
        southField.value = "";
        northField.value = "";
      });

      typeField.addEventListener("change", updateFieldVisibility);
      updateFieldVisibility();
      restoreExisting();
    }

    function updateFieldVisibility() {
      var isPoint = typeField.value === "point";
      if (eastRow) eastRow.style.display = isPoint ? "none" : "";
      if (northRow) northRow.style.display = isPoint ? "none" : "";
    }

    function syncFieldsFromShape(layer) {
      if (typeField.value === "point") {
        var latlng = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter();
        westField.value = latlng.lng.toFixed(5);
        southField.value = latlng.lat.toFixed(5);
        eastField.value = "";
        northField.value = "";
      } else {
        var bounds = layer.getBounds();
        westField.value = bounds.getWest().toFixed(5);
        eastField.value = bounds.getEast().toFixed(5);
        southField.value = bounds.getSouth().toFixed(5);
        northField.value = bounds.getNorth().toFixed(5);
      }
    }

    function restoreExisting() {
      var w = parseFloat(westField.value);
      var s = parseFloat(southField.value);
      if (isNaN(w) || isNaN(s)) {
        return;
      }
      if (typeField.value === "point") {
        drawnItems.addLayer(L.marker([s, w]));
        map.setView([s, w], 7);
        return;
      }
      var e = parseFloat(eastField.value);
      var n = parseFloat(northField.value);
      if (isNaN(e) || isNaN(n)) {
        return;
      }
      var rect = L.rectangle(
        [
          [s, w],
          [n, e],
        ],
        { color: "#0d6efd" }
      );
      drawnItems.addLayer(rect);
      map.fitBounds(rect.getBounds());
    }
  });
})();
