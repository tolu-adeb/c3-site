(function () {
  var box = document.getElementById("track");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pct(x) { return x == null ? "–" : (100 * x).toFixed(1) + "%"; }
  function num(x, d) { return x == null ? "–" : Number(x).toFixed(d == null ? 1 : d); }
  fetch("/api/track").then(function (r) { return r.json(); }).then(function (d) {
    if (!d.public || !d.stats || !d.stats.trades) {
      box.innerHTML = '<div class="empty"><p><strong>No public results yet.</strong></p><p>Alerts run privately for at least four weeks first, so the numbers here start from a real forward test and not a backtest. <a href="/join/">Join the waitlist</a> to hear when they go up.</p></div>';
      return;
    }
    var s = d.stats;
    var html = '<div class="stats">' +
      '<div class="stat"><b>' + esc(s.trades) + '</b><span>Closed trades</span></div>' +
      '<div class="stat"><b>' + pct(s.win_rate) + '</b><span>Win rate</span></div>' +
      '<div class="stat"><b class="' + (s.net_pts >= 0 ? "pos" : "neg") + '">' + num(s.net_pts) + '</b><span>Net points</span></div>' +
      '<div class="stat"><b>' + num(s.avg_r, 2) + '</b><span>Average R</span></div>' +
      '</div>';
    if (s.months && s.months.length) {
      html += '<div class="scroll"><table class="tbl"><thead><tr><th>Month</th><th class="n">Trades</th><th class="n">Net ($ per micro)</th></tr></thead><tbody>' +
        s.months.map(function (m) { return '<tr><td>' + esc(m.month) + '</td><td class="n">' + esc(m.trades) + '</td><td class="n ' + (m.net_usd >= 0 ? "pos" : "neg") + '">' + num(m.net_usd, 2) + '</td></tr>'; }).join("") +
        '</tbody></table></div>';
    }
    html += '<p class="note">' + (s.label ? esc(s.label) + ". " : "") + (s.first ? "From " + esc(s.first) + " to " + esc(s.last) + ". " : "") +
      'Virtual trades, one MNQ micro contract, after commission. Updated ' + new Date(d.updated_ms).toLocaleString() + '.</p>';
    box.innerHTML = html;
  }).catch(function () {
    box.innerHTML = '<p class="msg err">Results couldn\'t load. Refresh the page to try again.</p>';
  });
})();
