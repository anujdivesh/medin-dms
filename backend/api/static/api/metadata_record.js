// Admin helper: when the template dropdown on a MetadataRecord form changes,
// reload the page with ?template=<id> so the server renders that template's
// fields immediately (no "save and continue" step needed).
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  onReady(function () {
    var select = document.getElementById("id_template");
    if (!select) {
      return;
    }
    select.addEventListener("change", function () {
      var url = new URL(window.location.href);
      if (this.value) {
        url.searchParams.set("template", this.value);
      } else {
        url.searchParams.delete("template");
      }
      window.location.assign(url.toString());
    });
  });
})();
