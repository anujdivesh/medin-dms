// Admin helper: on a MetadataRecord form, adds a "Sections" panel beside the
// form listing every titled fieldset (Identification, Classification, ...).
// Clicking one scrolls to it; the section in view is highlighted.
(function () {
  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  onReady(function () {
    var form = document.getElementById("metadatarecord_form");
    if (!form) {
      return;
    }
    var headings = form.querySelectorAll("fieldset.module > h2");
    if (headings.length < 2) {
      return;
    }

    var nav = document.createElement("nav");
    nav.className = "section-nav";
    nav.setAttribute("aria-label", "Form sections");
    var title = document.createElement("div");
    title.className = "section-nav-title";
    title.textContent = "Sections";
    nav.appendChild(title);
    var list = document.createElement("ol");
    nav.appendChild(list);

    var links = [];
    headings.forEach(function (heading, i) {
      var fieldset = heading.parentNode;
      if (!fieldset.id) {
        fieldset.id = "section-" + (i + 1);
      }
      var link = document.createElement("a");
      link.href = "#" + fieldset.id;
      link.textContent = heading.textContent.trim();
      link.addEventListener("click", function (event) {
        event.preventDefault();
        fieldset.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", "#" + fieldset.id);
      });
      var item = document.createElement("li");
      item.appendChild(link);
      list.appendChild(item);
      links.push({ link: link, fieldset: fieldset });
    });

    form.parentNode.insertBefore(nav, form);
    document.body.classList.add("has-section-nav");

    // Highlight the last section whose top has scrolled past the top third.
    function update() {
      var line = window.innerHeight / 3;
      var current = links[0];
      links.forEach(function (entry) {
        if (entry.fieldset.getBoundingClientRect().top <= line) {
          current = entry;
        }
      });
      links.forEach(function (entry) {
        entry.link.classList.toggle("active", entry === current);
      });
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });
})();
