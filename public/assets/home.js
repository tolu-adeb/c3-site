// Home: the chart gains a layer per story step, the rail shows where you are, and live results fill in when public.
(function () {
  "use strict";
  var chart = document.getElementById("chart");
  var steps = [].slice.call(document.querySelectorAll(".step"));
  var rail = document.getElementById("rail"), fill = document.getElementById("rail-fill"), pct = document.getElementById("rail-pct");
  var story = document.getElementById("how"), label = document.getElementById("chart-step");
  var links = rail ? [].slice.call(rail.querySelectorAll("a[data-step]")) : [];
  var current = 0;

  function setStep(n) {
    if (n === current) return;
    current = n;
    if (chart) chart.setAttribute("class", Array.from({ length: n }, function (_, i) { return "show-" + (i + 1); }).join(" "));
    steps.forEach(function (s) { s.classList.toggle("on", Number(s.getAttribute("data-step")) === n); });
    links.forEach(function (a) {
      var on = Number(a.getAttribute("data-step")) === n;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
      a.parentNode.classList.toggle("cur", on || (n === 0 && a.getAttribute("data-step") === "1"));
    });
    if (label) label.textContent = n ? "Step " + n + " of " + steps.length : "";
  }

  function onScroll() {
    if (!story) return;
    var r = story.getBoundingClientRect(), vh = window.innerHeight;
    // the step whose top has passed 55% of the screen is the current one
    var n = 0;
    steps.forEach(function (s) { if (s.getBoundingClientRect().top < vh * 0.55) n = Number(s.getAttribute("data-step")); });
    setStep(n);
    var done = Math.min(1, Math.max(0, (vh * 0.55 - r.top) / Math.max(1, r.height)));
    if (fill) fill.style.transform = "scaleX(" + done.toFixed(4) + ")";
    if (pct) pct.textContent = Math.round(done * 100) + "%";
    if (rail) rail.classList.toggle("on", r.top < vh * 0.6 && r.bottom > vh * 0.2);
  }

  if (chart && steps.length) {
    setStep(-1);
    setStep(0);
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; onScroll(); });
    }, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  // ---------- live results, when the track record is public ----------
  var box = document.getElementById("results-live");
  if (box && window.fetch) {
    fetch("/api/track").then(function (r) { return r.json(); }).then(function (d) {
      if (!d.public || !d.stats || !d.stats.trades) return;
      var s = d.stats;
      var wr = s.win_rate == null ? "–" : (100 * s.win_rate).toFixed(1) + "%";
      var net = s.net_pts == null ? "–" : (s.net_pts > 0 ? "+" : "") + Number(s.net_pts).toFixed(1);
      box.innerHTML = '<div class="stats">' +
        '<div class="stat"><b>' + Number(s.trades) + '</b><span>Closed virtual trades</span></div>' +
        '<div class="stat"><b>' + wr + '</b><span>Win rate</span></div>' +
        '<div class="stat"><b class="' + (s.net_pts >= 0 ? "pos" : "neg") + '">' + net + '</b><span>Net points</span></div></div>' +
        '<p class="note">' + (s.label ? String(s.label).replace(/[<>&]/g, "") + ". " : "") + "One MNQ micro contract, after commission.</p>";
    }).catch(function () {});
  }
})();
