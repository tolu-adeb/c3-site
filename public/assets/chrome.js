// Shared page chrome: the Display panel (theme, motion, honest page weight) and the tile menu.
(function () {
  "use strict";
  var d = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------- display panel ----------
  var dBtn = $("display-btn"), pop = $("display");
  function syncButtons() {
    var theme = read("c3.theme") || "system", motion = d.getAttribute("data-motion") === "reduced" ? "reduced" : "full";
    document.querySelectorAll("[data-theme-set]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-set") === theme)); });
    document.querySelectorAll("[data-motion-set]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-motion-set") === motion)); });
  }
  function weight() {
    var el = $("weight");
    if (!el || !window.performance || !performance.getEntriesByType) return;
    var nav = performance.getEntriesByType("navigation")[0];
    var res = performance.getEntriesByType("resource");
    var bytes = (nav ? nav.transferSize || nav.encodedBodySize || 0 : 0), hosts = {};
    res.forEach(function (r) { bytes += r.transferSize || r.encodedBodySize || 0; try { hosts[new URL(r.name).host] = 1; } catch (e) {} });
    var others = Object.keys(hosts).filter(function (h) { return h !== location.host; });
    var kb = Math.max(1, Math.round(bytes / 1024));
    el.innerHTML = "This page: <b>" + kb + " KB</b> over <b>" + (res.length + 1) + "</b> requests, " +
      (others.length ? others.length + " to other sites." : "none to other sites.") +
      ' <span class="dim">Measured by your browser; cached files count as 0.</span>';
  }
  function openPop(open) {
    if (!pop) return;
    pop.hidden = !open;
    dBtn.setAttribute("aria-expanded", String(open));
    if (open) { syncButtons(); weight(); var f = pop.querySelector("button[aria-pressed='true']"); if (f) f.focus(); }
  }
  if (dBtn && pop) {
    dBtn.addEventListener("click", function () { openPop(pop.hidden); });
    pop.addEventListener("click", function (e) {
      var t = e.target.closest("[data-theme-set]"), m = e.target.closest("[data-motion-set]");
      if (t) {
        var v = t.getAttribute("data-theme-set");
        if (v === "system") { d.removeAttribute("data-theme"); store("c3.theme", null); }
        else { d.setAttribute("data-theme", v); store("c3.theme", v); }
      }
      if (m) {
        var r = m.getAttribute("data-motion-set") === "reduced";
        if (r) d.setAttribute("data-motion", "reduced"); else d.removeAttribute("data-motion");
        store("c3.motion", r ? "reduced" : null);
        document.dispatchEvent(new CustomEvent("c3:motion"));
      }
      syncButtons();
    });
    document.addEventListener("click", function (e) {
      if (!pop.hidden && !e.target.closest(".toolwrap")) openPop(false);
    });
  }

  // ---------- menu ----------
  var mBtn = $("menu-btn"), menu = $("menu"), mClose = $("menu-close"), last = null;
  function openMenu(open) {
    if (!menu) return;
    menu.hidden = !open;
    mBtn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) { last = document.activeElement; var a = menu.querySelector(".tiles a"); if (a) a.focus(); }
    else if (last) last.focus();
  }
  if (mBtn && menu) {
    mBtn.addEventListener("click", function () { openMenu(menu.hidden); });
    mClose.addEventListener("click", function () { openMenu(false); });
    menu.addEventListener("click", function (e) { if (e.target === menu || e.target.closest(".tiles a")) openMenu(false); });
    menu.addEventListener("keydown", function (e) {           // keep Tab inside the open menu
      if (e.key !== "Tab") return;
      var f = [mClose].concat([].slice.call(menu.querySelectorAll(".tiles a")));
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (menu && !menu.hidden) openMenu(false);
    if (pop && !pop.hidden) { openPop(false); dBtn.focus(); }
  });
})();
