// Admin helper: adds an interactive map next to the boundary_type field on
// the MetadataRecord form, so the west/east/south/north_bounding_* fields
// (and boundary_polygon) can be drawn (as a rectangle "zone", a single
// "point" or a "polygon") instead of typed in by hand. Falls back to nothing if the fields aren't on the page (e.g.
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
    var polygonField = document.getElementById("id_boundary_polygon");
    if (!typeField || !westField || !eastField || !southField || !northField) {
      return;
    }

    function rowOf(field) {
      return field ? field.closest(".form-row") || field.parentElement : null;
    }
    var typeRow = rowOf(typeField);
    var westRow = rowOf(westField);
    var eastRow = rowOf(eastField);
    var southRow = rowOf(southField);
    var northRow = rowOf(northField);
    var polygonRow = rowOf(polygonField);

    // Live range checks, mirroring MetadataRecord.clean_coordinate_ranges so
    // a bad value is flagged while typing / drawing instead of only on save.
    // Set up before the map loads so they still work if the CDN fails.
    // MAX_LNG mirrors MAX_LONGITUDE in models.py.
    var MAX_LNG = 300;

    function lngError(value) {
      if (value >= 0 && value <= MAX_LNG) return "";
      var message = "Longitude must be between 0 and " + MAX_LNG + ".";
      if (value < 0 && value >= -180 && value + 360 <= MAX_LNG) {
        message += " For a west longitude add 360: use " + (value + 360).toFixed(5) + ".";
      }
      return message;
    }

    function latError(value) {
      return value >= -90 && value <= 90 ? "" : "Latitude must be between -90 and 90.";
    }

    function numberError(field, check) {
      var text = field.value.trim();
      if (text === "") return "";
      var value = Number(text);
      return isNaN(value) ? "Enter a number." : check(value);
    }

    function polygonError() {
      var text = polygonField.value.trim();
      if (text === "") return "";
      var ring;
      try {
        ring = JSON.parse(text);
      } catch (err) {
        return "Must be a list of [lng, lat] points, e.g. [[185.6, -19.8], ...].";
      }
      if (!Array.isArray(ring)) return "Must be a list of [lng, lat] points.";
      for (var i = 0; i < ring.length; i++) {
        var p = ring[i];
        if (!Array.isArray(p) || p.length !== 2 || isNaN(Number(p[0])) || isNaN(Number(p[1]))) {
          return "Point " + (i + 1) + " is not a [lng, lat] pair.";
        }
        var message = lngError(Number(p[0])) || latError(Number(p[1]));
        if (message) return "Point " + (i + 1) + ": " + message;
      }
      return "";
    }

    var liveErrors = {};

    function showError(field, message) {
      var list = liveErrors[field.id];
      if (!message) {
        if (list) list.remove();
        delete liveErrors[field.id];
        field.style.borderColor = "";
        return;
      }
      if (!list) {
        list = document.createElement("ul");
        list.className = "errorlist";
        field.parentNode.insertBefore(list, field);
        liveErrors[field.id] = list;
      }
      list.innerHTML = "";
      var item = document.createElement("li");
      item.textContent = message;
      list.appendChild(item);
      field.style.borderColor = "var(--error-fg, #ba2121)";
    }

    // Returns true when every boundary field the current type uses is valid.
    function validateBoundary() {
      var type = typeField.value;
      var checks = [
        [westField, type !== "polygon" && numberError(westField, lngError)],
        [southField, type !== "polygon" && numberError(southField, latError)],
        [eastField, type === "zone" && numberError(eastField, lngError)],
        [northField, type === "zone" && numberError(northField, latError)],
      ];
      if (polygonField) checks.push([polygonField, type === "polygon" && polygonError()]);
      var valid = true;
      checks.forEach(function (check) {
        showError(check[0], check[1] || "");
        if (check[1]) valid = false;
      });
      return valid;
    }

    [westField, eastField, southField, northField, polygonField].forEach(function (field) {
      if (field) field.addEventListener("input", validateBoundary);
    });
    typeField.addEventListener("change", validateBoundary);
    if (typeField.form) {
      typeField.form.addEventListener("submit", function (e) {
        if (!validateBoundary()) {
          e.preventDefault();
          typeRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
    validateBoundary();

    var mapRow = document.createElement("div");
    mapRow.className = "form-row";
    mapRow.innerHTML =
      '<div style="margin-bottom: 6px;">' +
      '<button type="button" id="boundary-map-draw" class="button">Draw on map</button> ' +
      '<button type="button" id="boundary-map-clear" class="button">Clear</button>' +
      "</div>" +
      '<div id="boundary-map" style="height: 350px; max-width: 700px; border: 1px solid #ccc;"></div>' +
      '<p class="help">Click "Draw on map", then drag a rectangle (Zone), click once (Point), or click each corner and then the first point again to finish (Polygon) - matches the toggle above. The fields update automatically; you can also edit them directly.</p>';
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

    var map, drawnItems, rectangleDrawer, markerDrawer, polygonDrawer;

    function disableDrawers() {
      rectangleDrawer.disable();
      markerDrawer.disable();
      polygonDrawer.disable();
    }

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
      polygonDrawer = new L.Draw.Polygon(map, { shapeOptions: { color: "#0d6efd" } });

      map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        syncFieldsFromShape(e.layer);
      });

      document.getElementById("boundary-map-draw").addEventListener("click", function () {
        drawnItems.clearLayers();
        disableDrawers();
        if (typeField.value === "point") {
          markerDrawer.enable();
        } else if (typeField.value === "polygon") {
          polygonDrawer.enable();
        } else {
          rectangleDrawer.enable();
        }
      });

      document.getElementById("boundary-map-clear").addEventListener("click", function () {
        disableDrawers();
        drawnItems.clearLayers();
        westField.value = "";
        eastField.value = "";
        southField.value = "";
        northField.value = "";
        if (polygonField) polygonField.value = "";
        validateBoundary();
      });

      typeField.addEventListener("change", updateFieldVisibility);
      updateFieldVisibility();
      restoreExisting();
    }

    function updateFieldVisibility() {
      var type = typeField.value;
      // A polygon's bounding fields are derived from it on save, so only the
      // polygon field itself is shown for that type.
      function show(row, visible) {
        if (row) row.style.display = visible ? "" : "none";
      }
      show(westRow, type !== "polygon");
      show(southRow, type !== "polygon");
      show(eastRow, type === "zone");
      show(northRow, type === "zone");
      show(polygonRow, type === "polygon");
    }

    // Longitudes are stored east-positive (the model rejects negatives), but Leaflet
    // reports -180..180 or beyond depending on which world copy was drawn on.
    function lng360(lng) {
      return (((lng % 360) + 360) % 360).toFixed(5);
    }

    function syncFieldsFromShape(layer) {
      if (typeField.value === "polygon") {
        var ring = layer.getLatLngs()[0].map(function (ll) {
          return [+lng360(ll.lng), +ll.lat.toFixed(5)];
        });
        ring.push(ring[0]);
        if (polygonField) polygonField.value = JSON.stringify(ring);
        var pb = layer.getBounds();
        westField.value = lng360(pb.getWest());
        eastField.value = lng360(pb.getEast());
        southField.value = pb.getSouth().toFixed(5);
        northField.value = pb.getNorth().toFixed(5);
      } else if (typeField.value === "point") {
        var latlng = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter();
        westField.value = lng360(latlng.lng);
        southField.value = latlng.lat.toFixed(5);
        eastField.value = "";
        northField.value = "";
      } else {
        var bounds = layer.getBounds();
        westField.value = lng360(bounds.getWest());
        eastField.value = lng360(bounds.getEast());
        southField.value = bounds.getSouth().toFixed(5);
        northField.value = bounds.getNorth().toFixed(5);
      }
      // Setting .value doesn't fire "input", so re-check explicitly.
      validateBoundary();
    }

    function restoreExisting() {
      if (typeField.value === "polygon") {
        var ring;
        try {
          ring = JSON.parse(polygonField ? polygonField.value : "");
        } catch (err) {
          return;
        }
        if (!Array.isArray(ring) || ring.length < 3) {
          return;
        }
        var poly = L.polygon(
          ring.map(function (p) {
            return [p[1], p[0]];
          }),
          { color: "#0d6efd" }
        );
        drawnItems.addLayer(poly);
        map.fitBounds(poly.getBounds());
        return;
      }
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
