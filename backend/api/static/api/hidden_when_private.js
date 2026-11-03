// Admin helper: shows the "Hide when private" row on a MetadataRecord form
// only while Access constraints is Private, ticks the default link & file
// fields whenever it's switched to Private (still editable after), moves the
// note above the checkboxes, and adds All / None quick-pick buttons. Greyed-
// out (unmapped) fields are never touched.
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function editableBoxes(widget) {
    return widget.querySelectorAll('input[type="checkbox"]:not([disabled])');
  }

  function addToolbar(widget) {
    function pick(test) {
      editableBoxes(widget).forEach(function (box) {
        box.checked = test(box);
      });
    }

    var bar = document.createElement("div");
    bar.className = "hwp-toolbar";
    [
      ["All", function () { return true; }],
      ["None", function () { return false; }],
    ].forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button";
      btn.textContent = item[0];
      btn.addEventListener("click", function () { pick(item[1]); });
      bar.appendChild(btn);
    });
    widget.parentNode.insertBefore(bar, widget);
  }

  onReady(function () {
    var row = document.querySelector(".form-row.field-hidden_when_private");
    var widget = document.getElementById("id_hidden_when_private");
    if (!row || !widget) {
      return;
    }
    var help = row.querySelector(".help");
    if (help) {
      help.classList.add("hwp-note");
      widget.parentNode.insertBefore(help, widget);
    }
    addToolbar(widget);

    var access = document.getElementById("id_access_constraints");
    if (!access) {
      return;
    }
    function sync() {
      row.style.display = access.value === "private" ? "" : "none";
    }
    access.addEventListener("change", function () {
      if (access.value === "private") {
        // Switched to Private: tick the link & file defaults on top of
        // whatever's already picked - the user can untick them freely.
        editableBoxes(widget).forEach(function (box) {
          if (box.hasAttribute("data-default")) {
            box.checked = true;
          }
        });
      }
      sync();
    });
    sync();
  });
})();
