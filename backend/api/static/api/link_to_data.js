// Admin helper: on a MetadataRecord form, each link-or-upload radio (Link to
// data, Acquisition report, Project report) shows either its link text box
// or its file upload (+ description), following the radio. The radio's
// data-link-field / data-file-fields attributes (see _link_or_file_radio in
// forms.py) name those rows. The other one is cleared server-side on save.
// It also fills the Protocol dropdown from the Link to data's scheme.
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function rows(names) {
    return names
      .filter(Boolean)
      .map(function (name) {
        return document.querySelector(".form-row.field-" + name);
      })
      .filter(Boolean);
  }

  function show(list, visible) {
    list.forEach(function (row) {
      row.style.display = visible ? "" : "none";
    });
  }

  function setup(name, radios) {
    var first = radios[0];
    var linkRows = rows([first.getAttribute("data-link-field")]);
    var fileRows = rows((first.getAttribute("data-file-fields") || "").split(" "));

    function sync() {
      var picked = document.querySelector('input[name="' + name + '"]:checked');
      var isFile = picked && picked.value === "file";
      show(linkRows, !isFile);
      show(fileRows, isFile);
    }

    radios.forEach(function (radio) {
      radio.addEventListener("change", sync);
    });
    sync();
  }

  // Link scheme -> Protocol choice (the template's Protocol field, a select
  // whose options are edited on the template). A doi.org link is a DOI.
  var SCHEMES = { https: "HTTPS", http: "HTTP", ftp: "FTP", sftp: "SFTP", smb: "SMB", s3: "S3" };

  function protocolFor(link) {
    link = (link || "").trim().toLowerCase();
    if (/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/.test(link)) return "DOI";
    var match = /^([a-z0-9]+):\/\//.exec(link);
    return match ? SCHEMES[match[1]] || "" : "";
  }

  // Fill Protocol from the Link to data while it's empty, or still the
  // value filled in from the link - never over one picked by hand.
  function setupProtocol() {
    var link = document.querySelector('[name="link_to_data"]');
    var protocol = document.querySelector('select[name="tpl__protocol"]');
    if (!link || !protocol) return;
    var filled = "";
    link.addEventListener("input", function () {
      if (protocol.value && protocol.value !== filled) return;
      var guess = protocolFor(link.value);
      if (guess && !protocol.querySelector('option[value="' + guess + '"]')) {
        guess = "";  // not one of this template's options
      }
      if (guess || protocol.value === filled) {
        protocol.value = guess;
        filled = guess;
      }
    });
  }

  onReady(function () {
    setupProtocol();
    var groups = {};
    document.querySelectorAll("input[type=radio][data-link-field]").forEach(function (radio) {
      (groups[radio.name] = groups[radio.name] || []).push(radio);
    });
    Object.keys(groups).forEach(function (name) {
      setup(name, groups[name]);
    });
  });
})();
