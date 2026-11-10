// Admin helper: on a MetadataTemplate's field rows, swaps the Name box for a
// dropdown of the built-in record fields whenever Field type is "Built-in
// field". Picking one fills in the name, moves the row to that field's
// default section, and fills in the label if it's blank or was the previous
// pick's default. Fields already used by another row are
// greyed out. The built-in list comes from the field type select's
// data-builtins attribute (see FieldDefinitionForm).
(function () {
  var BUILTIN = "builtin";

  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function rowInputs(row) {
    return {
      type: row.querySelector('select[name$="-field_type"]'),
      name: row.querySelector('input[name$="-name"]'),
      label: row.querySelector('input[name$="-label"]'),
      section: row.querySelector('select[name$="-section"]'),
    };
  }

  // Names picked by every other built-in row, so they can be greyed out.
  function usedNames(except) {
    var used = {};
    document.querySelectorAll(".builtin-picker").forEach(function (picker) {
      if (picker !== except && picker.style.display !== "none" && picker.value) {
        used[picker.value] = true;
      }
    });
    return used;
  }

  function refreshAll() {
    document.querySelectorAll(".builtin-picker").forEach(function (picker) {
      var used = usedNames(picker);
      Array.prototype.forEach.call(picker.options, function (option) {
        option.disabled = option.value !== "" && used[option.value] === true;
      });
    });
  }

  function setup(row) {
    var inputs = rowInputs(row);
    if (!inputs.type || !inputs.name || inputs.name.dataset.builtinPicker) {
      return;
    }
    if (inputs.name.name.indexOf("__prefix__") !== -1) {
      return; // the hidden "add another" template row
    }
    inputs.name.dataset.builtinPicker = "1";
    var builtins = JSON.parse(inputs.type.getAttribute("data-builtins") || "[]");
    var labels = {};
    var sections = {};

    var picker = document.createElement("select");
    picker.className = "builtin-picker";
    picker.appendChild(new Option("— choose a built-in field-", ""));
    builtins.forEach(function (item) {
      labels[item[0]] = item[1];
      sections[item[0]] = item[2];
      picker.appendChild(new Option(item[1] + " (" + item[0] + ")", item[0]));
    });
    inputs.name.parentNode.insertBefore(picker, inputs.name.nextSibling);

    picker.addEventListener("change", function () {
      var previous = inputs.name.value;
      inputs.name.value = picker.value;
      if (inputs.label && (!inputs.label.value || inputs.label.value === labels[previous])) {
        inputs.label.value = labels[picker.value] || "";
      }
      if (inputs.section && sections[picker.value] !== undefined) {
        inputs.section.value = String(sections[picker.value]);
      }
      refreshAll();
    });

    function sync() {
      var isBuiltin = inputs.type.value === BUILTIN;
      picker.style.display = isBuiltin ? "" : "none";
      inputs.name.style.display = isBuiltin ? "none" : "";
      if (isBuiltin) {
        // Keep the pick in step with the stored name ("" if it isn't one).
        picker.value = labels.hasOwnProperty(inputs.name.value) ? inputs.name.value : "";
      }
      refreshAll();
    }
    inputs.type.addEventListener("change", sync);
    sync();
  }

  onReady(function () {
    document.querySelectorAll('select[name$="-field_type"]').forEach(function (select) {
      setup(select.closest("tr") || select.closest(".inline-related"));
    });
    // Rows added with "Add another Field definition".
    document.addEventListener("formset:added", function (event) {
      setup(event.target);
    });
    document.addEventListener("formset:removed", refreshAll);
  });
})();
