// Runs first (in <head>) so the saved theme and motion choice apply before the page paints.
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var t = localStorage.getItem("c3.theme");
    if (t === "light" || t === "dark") d.setAttribute("data-theme", t);
    if (localStorage.getItem("c3.motion") === "reduced") d.setAttribute("data-motion", "reduced");
  } catch (e) {}
})();
