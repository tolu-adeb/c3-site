(function () {
  "use strict";
  var KEY_STORE = "c3.view";
  var $ = function (id) { return document.getElementById(id); };
  var state = { key: null, data: null, tab: "today" };
  var dashEl = $("dash");

  // ---------- key from the secret link (#k=...), kept on this device only ----------
  function readKey() {
    var m = location.hash.match(/(?:^#|&)k=([A-Za-z0-9_-]{20,})/);
    if (m) {
      try { localStorage.setItem(KEY_STORE, m[1]); } catch (e) {}
      history.replaceState(null, "", location.pathname);
      return m[1];
    }
    try { return localStorage.getItem(KEY_STORE); } catch (e) { return null; }
  }
  function lock(why) {
    dashEl.hidden = true;
    $("lock").hidden = false;
    if (why) $("lock").querySelector("h1").textContent = why;
  }

  // ---------- formatting ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(x, d) { return x == null || x === "" || isNaN(x) ? "–" : Number(x).toFixed(d == null ? 2 : d); }
  function pct(x, already) { return x == null || isNaN(x) ? "–" : (already ? Number(x) : 100 * x).toFixed(1) + "%"; }
  function signed(x, d) { if (x == null || isNaN(x)) return "–"; var v = Number(x); return '<span class="' + (v > 0 ? "pos" : v < 0 ? "neg" : "") + '">' + (v > 0 ? "+" : "") + v.toFixed(d == null ? 2 : d) + "</span>"; }
  function ago(ms) {
    if (!ms) return "never";
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 90) return s + " seconds ago";
    if (s < 5400) return Math.round(s / 60) + " minutes ago";
    if (s < 172800) return Math.round(s / 3600) + " hours ago";
    return Math.round(s / 86400) + " days ago";
  }
  function when(v) {
    if (v == null || v === "") return "–";
    var d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
    return isNaN(d) ? esc(v) : esc(d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  }
  function chip(kind, text) { return '<span class="chip ' + kind + '">' + esc(text) + "</span>"; }
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function table(rows, cols, empty) {
    if (!rows || !rows.length) return '<p class="note">' + esc(empty || "Nothing yet.") + "</p>";
    var h = '<div class="scroll"><table class="tbl"><thead><tr>' +
      cols.map(function (c) { return "<th" + (c[2] ? ' class="' + c[2] + '"' : "") + ">" + esc(c[0]) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr>" + cols.map(function (c) {
        var v = typeof c[1] === "function" ? c[1](r) : esc(get(r, c[1]) == null ? "–" : get(r, c[1]));
        return "<td" + (c[2] ? ' class="' + c[2] + '"' : "") + ">" + v + "</td>";
      }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function kv(pairs) {
    return '<dl class="kv">' + pairs.filter(function (p) { return p[1] != null && p[1] !== ""; })
      .map(function (p) { return "<dt>" + esc(p[0]) + "</dt><dd>" + p[1] + "</dd>"; }).join("") + "</dl>";
  }
  function raw(title, obj) { return obj ? '<details class="raw"><summary>' + esc(title) + "</summary><pre>" + esc(JSON.stringify(obj, null, 2)) + "</pre></details>" : ""; }
  function stats(items) {
    return '<div class="stats">' + items.map(function (i) { return '<div class="stat"><b>' + i[1] + "</b><span>" + esc(i[0]) + "</span></div>"; }).join("") + "</div>";
  }

  // ---------- header: is the bot alive ----------
  var ICON = {
    good: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.6v.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    bad: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
  };
  function inSession() {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    var m = Number(o.hour) * 60 + Number(o.minute);
    return o.weekday !== "Sat" && o.weekday !== "Sun" && m >= 565 && m < 960;
  }
  function header(d) {
    var st = d.status && d.status.data;
    var kind, title, sub = [];
    if (!d.last_seen_ms) {
      kind = "bad"; title = "The bot hasn't checked in yet";
      sub.push("Once the bot on your computer has site publishing turned on, it checks in every minute.");
    } else if (d.online && st && st.running) {
      kind = "good"; title = "The bot is running";
    } else if (d.online) {
      kind = "warn"; title = "The site is up, but the bot's monitor isn't running";
    } else {
      kind = inSession() ? "bad" : "warn";
      title = inSession() ? "The bot isn't checking in during the session" : "The bot is offline";
    }
    if (d.last_seen_ms) sub.push("Last check-in " + ago(d.last_seen_ms) + ".");
    if (st) {
      if (st.tag) sub.push("Posting tag " + st.tag + ".");
      if (st.alpha && st.alpha.paused && st.alpha.paused.on) sub.push("Signal posts are paused.");
      var s = st.stream || {};
      sub.push(s.enabled === false ? "Price stream off." : s.connected ? "Price stream connected." : "Price stream not connected.");
    }
    $("pulse").className = "pulse " + kind;
    $("pulse").innerHTML = ICON[kind] + "<span>" + esc(title) + "</span>";
    $("pulse-sub").textContent = sub.join(" ");

    // the site's own record (from check-ins) merged with the bot's: the bot's goes back before the site existed
    var botDays = {};
    ((st && st.uptime && st.uptime.days) || []).forEach(function (x) { botDays[x.day] = x; });
    var first = d.first_seen_ms ? new Date(d.first_seen_ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null;
    var since = st && st.uptime && st.uptime.since;          // "YYYY-MM-DD HH:MM" ET: the bot's record starts here
    var days = (d.coverage || []).map(function (x) {
      var b = botDays[x.day];
      var botKnows = !!b && !!since && (x.day > since.slice(0, 10) || (x.day === since.slice(0, 10) && since.slice(11) < "16:00"));
      var known = botKnows || (first && x.day >= first);
      return { day: x.day, so_far: x.so_far, known: known,
        pct: Math.max(x.pct || 0, b ? b.pct || 0 : 0), saw_open: x.saw_open || !!(b && b.saw_open) };
    }).reverse();
    $("days").innerHTML = days.map(function (x) {
      if (!x.known) return '<div class="day nodata" title="' + esc(x.day) + '"><b>–</b>' + esc(new Date(x.day + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })) + "<br>No record</div>";
      var cls = x.pct >= 95 ? "full" : x.pct > 0 ? "part" : "none";
      var dt = new Date(x.day + "T12:00:00");
      var label = dt.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
      return '<div class="day ' + cls + '" title="' + esc(x.day) + '"><b>' + (x.pct > 0 ? Math.round(x.pct) + "%" : "Off") + "</b>" + esc(label) +
        "<br>" + (x.saw_open ? "Open caught" : x.so_far && x.pct === 0 ? "Not yet" : "Open missed") + "</div>";
    }).join("");
    $("days-note").textContent = "Share of each session (9:25 to 16:00 ET) the bot was running, from its own record and its check-ins with this site. Market holidays show as Off.";
  }

  // ---------- tabs ----------
  var TABS = [
    ["today", "MNQ bot today"],
    ["research", "Research"],
    ["papers", "Research papers"],
    ["swing", "Swing desk"],
    ["controls", "Controls"],
    ["track", "Track record"],
    ["published", "Published data"],
    ["waitlist", "Waitlist"],
    ["hooks", "Webhooks"]
  ];
  function drawTabs() {
    $("tabs").innerHTML = TABS.map(function (t) {
      return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel" tabindex="' + (t[0] === state.tab ? '0' : '-1') + '" aria-selected="' + (t[0] === state.tab) + '" data-tab="' + t[0] + '">' + esc(t[1]) + "</button>";
    }).join("");
  }
  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.getAttribute("data-tab");
    try { sessionStorage.setItem("c3.tab", state.tab); } catch (err) {}
    drawTabs(); drawPanel();
    $("tab-" + state.tab).focus();
  });
  $("tabs").addEventListener("keydown", function (e) {
    var index = TABS.findIndex(function (t) { return t[0] === state.tab; });
    var next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : e.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : e.key === "ArrowRight" ? (index + 1) % TABS.length : null;
    if (next === null) return;
    e.preventDefault(); $("tab-" + TABS[next][0]).click();
  });

  function snap() { return (state.data && state.data.snapshot && state.data.snapshot.data) || {}; }
  function snapNote() {
    var s = state.data && state.data.snapshot;
    return s ? '<p class="note">Snapshot from the bot, ' + esc(ago(s.received_ms)) + ".</p>" : '<p class="note">No snapshot from the bot yet. It sends one every 5 minutes once publishing is on.</p>';
  }

  function panelToday() {
    var st = (state.data.status && state.data.status.data) || {};
    var a = st.alpha || {};
    var s = snap();
    var alpha = s.alpha || {};
    var h = "<h2>Bot</h2>";
    if (!a.enabled) {
      h += '<p class="note">' + esc(a.hint || "The signal bot is switched off on your computer.") + "</p>";
    } else {
      h += kv([
        ["Symbol", esc((a.symbol || "–") + (a.proxy ? " via " + a.proxy + " × " + n(a.ratio, 4) : ""))],
        ["Session day", esc(a.day || "–")],
        ["Last bar", esc(a.last_bar || "–")],
        ["Stream age", a.stream_age_s == null ? "–" : esc(a.stream_age_s + " s")],
        ["Discord", a.discord ? esc((a.discord.mode || "not set up") + ", " + (a.discord.sent || 0) + " sent today") : "–"],
        ["Day finished", a.done_reason ? esc(a.done_reason) : "Not yet"],
        ["Open trade", a.open_trade ? esc((a.open_trade.side_label || a.open_trade.side || "") + " " + (a.open_trade.setup || "") + " from " + n(a.open_trade.entry)) : "None"]
      ]);
    }
    var guard = st.guard || [];
    if (guard.length) h += '<div class="gate">' + guard.map(function (g) { return "<div>" + esc(g) + "</div>"; }).join("") + "</div>";
    var errs = [].concat(st.errors || [], a.errors || []);
    if (errs.length) h += "<h2>Recent errors</h2>" + table(errs.slice(-8).map(function (e) { return { e: typeof e === "string" ? e : JSON.stringify(e) }; }), [["Error", "e"]]);

    h += "<h2>Today's events</h2>" + table((s.events || []).slice(0, 40), [
      ["Time", function (r) { return when(r.ts || r.at); }],
      ["Event", function (r) { return esc(r.title || r.type); }],
      ["Discord", function (r) { return r.delivered === "ok" || r.delivered === "edited" ? chip("good", "Posted") : r.delivered ? chip("dim", r.delivered) : "–"; }]
    ], "No events today.");

    h += "<h2>Recent trades</h2>" + table((alpha.trades || []).slice(0, 25), [
      ["Day", "date"], ["Setup", "setup"], ["Side", function (r) { return esc(r.side_label || r.side || "–"); }],
      ["Entry", function (r) { return n(r.entry); }, "n"], ["Stop", function (r) { return n(r.stop); }, "n"],
      ["Points", function (r) { return signed(r.pts); }, "n"], ["R", function (r) { return signed(r.r); }, "n"],
      ["Exit", function (r) { return esc(r.final || r.exit || "–"); }]
    ], "No trades recorded.");

    var bt = alpha.backtest && alpha.backtest.stats;
    if (bt) {
      h += "<h2>Backtest of current settings</h2>" + stats([
        ["Trades", esc(bt.trades)], ["Win rate", pct(bt.win_rate, bt.win_rate > 1)], ["Net points", signed(bt.net_pts, 1)],
        ["Profit factor", n(bt.profit_factor)], ["Max drawdown (pts)", n(bt.max_dd_pts, 1)]
      ]);
    }
    if (alpha.learner && alpha.learner.length) {
      h += "<h2>Adaptive filter</h2>" + table(alpha.learner, [
        ["Setup", "setup"], ["Regime", "regime"], ["Trades", "n", "n"], ["Win rate", function (r) { return pct(r.win_rate, r.win_rate > 1); }, "n"],
        ["Avg R", function (r) { return signed(r.avg_r); }, "n"], ["Active", function (r) { return r.active ? chip("good", "On") : chip("dim", "Off"); }]
      ]);
    }
    return h + snapNote() + raw("Raw status from the bot", st);
  }

  function panelResearch() {
    var s = snap();
    var p = s.parity || {};
    var sum = p.summary || {};
    var h = "<h2>Live vs backtest</h2>";
    h += stats([["Days compared", esc(sum.judged != null ? sum.judged : "–")], ["Matched", esc(sum.matched != null ? sum.matched : "–")],
      ["Live R", signed(sum.live_r)], ["Backtest R", signed(sum.backtest_r)]]);
    h += table(sum.rows, [
      ["Day", "day"],
      ["Verdict", function (r) { var v = r.verdict || "–"; return chip(v === "match" ? "good" : v === "differs" ? "bad" : "dim", v); }],
      ["Live", function (r) { return signed(get(r, "live.r") != null ? get(r, "live.r") : r.live_r); }, "n"],
      ["Backtest", function (r) { return signed(get(r, "backtest.r") != null ? get(r, "backtest.r") : r.backtest_r); }, "n"],
      ["Why", function (r) { return esc([].concat(r.causes || [], r.notes || []).join("; ") || "–"); }]
    ], "No days compared yet.");

    var f = s.forward || {};
    var c = f.counts || {};
    h += "<h2>Forward lab</h2>" + stats([["Ready", esc(c.ready || 0)], ["Paper trading", esc(c.paper || 0)], ["Queued", esc(c.queued || 0)],
      ["Approved", esc(c.approved || 0)], ["Ideas tried", esc(f.total_trials || 0)]]);
    var fs = f.status || {};
    h += kv([["Last run", esc(fs.last_run || "Not yet")], ["Runs daily at", esc(fs.time || "–")],
      ["Re-tested first", (f.retry_first || []).length ? esc((f.retry_first || []).map(function (x) { return x.name || x.id || x; }).join(", ")) : "Nothing waiting"]]);
    h += table(f.strategies, [
      ["Idea", function (r) { return esc(r.name || r.id); }],
      ["Status", function (r) { return chip(r.status === "approved" || r.status === "ready" ? "good" : r.status === "retired" ? "dim" : "warn", r.status || "–"); }],
      ["Route", function (r) { return esc(r.route || "–"); }],
      ["Origin", function (r) { return esc(r.origin || "–"); }],
      ["", function (r) {
        var b = "";
        if (r.id == null) return b;
        if (r.status !== "approved" && r.status !== "retired") b += '<button type="button" class="quiet" data-cmd="approve_strategy" data-id="' + esc(r.id) + '" data-name="' + esc(r.name || r.id) + '">Approve</button> ';
        if (r.status !== "retired") b += '<button type="button" class="quiet" data-cmd="retire_strategy" data-id="' + esc(r.id) + '" data-name="' + esc(r.name || r.id) + '">Retire</button>';
        return b;
      }]
    ], "No strategies in the forward lab yet.");

    var rf = (state.data.status && state.data.status.data && state.data.status.data.refit) || null;
    if (rf) h += "<h2>Sunday re-fit</h2>" + raw("Last re-fit", rf);
    return h + snapNote();
  }

  function panelSwing() {
    var s = snap();
    var sw = s.swing || {};
    var sb = sw.scoreboard || {};
    var h = "<h2>Your channel's ideas</h2>" + stats([["Taken", esc(sb.taken || 0)], ["Open", esc(sb.open || 0)], ["Closed", esc(sb.closed || 0)],
      ["Win rate", sb.win_rate == null ? "–" : pct(sb.win_rate, sb.win_rate > 1)], ["Total R", signed(sb.sum_R, 1)]]);
    var g = sw.gate;
    if (g) h += '<div class="gate">' + (g.market_branch ? chip("good", "Market filter: open") : chip("warn", "Market filter: closed")) +
      " SPY " + n(g.spy_close) + " vs " + esc(g.sma_n) + "-day average " + n(g.spy_sma) + (g.date ? " on " + esc(g.date) : "") + ".</div>";
    h += table(sw.ideas, [
      ["Symbol", "symbol"], ["Posted", function (r) { return esc(r.posted_et || "–"); }], ["By", "author"],
      ["State", function (r) { var v = r.state || "–"; return chip(/OPEN|FILLED/.test(v) ? "good" : /STOP|LOSS/.test(v) ? "bad" : "dim", v); }],
      ["Entry", function (r) { return n(r.entry_lo) + (r.entry_hi && r.entry_hi !== r.entry_lo ? "–" + n(r.entry_hi) : ""); }, "n"],
      ["Stop", function (r) { return n(r.stop_px != null ? r.stop_px : r.stop); }, "n"],
      ["Last", function (r) { return n(r.price != null ? r.price : r.close); }, "n"],
      ["R", function (r) { return signed(r.r); }, "n"]
    ], "No open ideas.");
    var rec = s.swing_record;
    if (rec && rec.by_tier && rec.by_tier.length) {
      h += "<h2>Results by tier</h2>" + table(rec.by_tier, [["Tier", "group"], ["Trades", "n", "n"], ["Wins", "wins", "n"],
        ["Win rate", function (r) { return pct(r.win_rate, r.win_rate > 1); }, "n"], ["Total R", function (r) { return signed(r.sum_r, 1); }, "n"]]);
    }
    var w = s.wide || {};
    var ws = w.status || {};
    var ev = ws.evidence || {};
    h += "<h2>Wide scan</h2>" + '<div class="gate">' + (ev.ok ? chip("good", "Posting allowed") : chip("warn", "Posting held")) + " " + esc(ev.why || "") +
      (ws.mode ? " Mode: " + esc(ws.mode) + "." : "") + "</div>";
    var wsb = w.scoreboard || {};
    h += stats([["Taken", esc(wsb.taken || 0)], ["Open", esc(wsb.open || 0)], ["Closed", esc(wsb.closed || 0)],
      ["Win rate", wsb.win_rate == null ? "–" : pct(wsb.win_rate, wsb.win_rate > 1)], ["Total R", signed(wsb.sum_R, 1)]]);
    h += table(w.ideas, [["Symbol", "symbol"], ["Rank", function (r) { return esc(r.rank != null ? r.rank : "–"); }, "n"],
      ["State", function (r) { return esc(r.state || "–"); }], ["To entry (ATR)", function (r) { return n(r.dist_atr); }, "n"],
      ["Entry", function (r) { return n(r.entry_lo) + (r.entry_hi && r.entry_hi !== r.entry_lo ? "–" + n(r.entry_hi) : ""); }, "n"], ["R", function (r) { return signed(r.r); }, "n"]
    ], "No wide-scan ideas from the last run.");
    return h + snapNote();
  }

  function panelTrack() {
    var t = state.data.track;
    var pub = state.data.track_public;
    var h = '<div class="gate">' + (pub ? chip("good", "Public") : chip("dim", "Private")) + " " +
      (pub ? "The public track record page shows these numbers." : "The public page says results aren't out yet. Set TRACK_RECORD_PUBLIC to \"true\" in the site's settings when the forward test is done.") + "</div>";
    if (!t) return h + '<p class="note">The bot hasn\'t sent results yet.</p>';
    var d = t.data || {};
    h += stats([["Closed trades", esc(d.trades || 0)], ["Win rate", d.win_rate == null ? "–" : pct(d.win_rate)], ["Net points", signed(d.net_pts, 1)],
      ["Net $ per micro", signed(d.net_usd)], ["Max drawdown $", n(d.max_dd_usd)]]);
    if (d.label) h += '<p class="note">' + esc(d.label) + "</p>";
    h += table(d.months, [["Month", "month"], ["Trades", "trades", "n"], ["Net $", function (r) { return signed(r.net_usd); }, "n"]], "No months yet.");
    return h + '<p class="note">Sent ' + esc(ago(t.received_ms)) + ".</p>";
  }

  function panelWaitlist() {
    var w = state.data.waitlist || {};
    var h = stats([["Signups", esc(w.n || 0)], ["Latest", w.last ? esc(ago(w.last)) : "–"]]);
    h += '<div class="row-actions"><button type="button" class="quiet" id="csv">Download as CSV</button></div><div id="wl"><p class="note">Loading signups…</p></div>';
    setTimeout(loadWaitlist, 0);
    return h;
  }
  function loadWaitlist() {
    api("/api/p/waitlist").then(function (d) {
      var box = $("wl");
      if (!box) return;
      box.innerHTML = table(d.signups, [["Email", "email"], ["Note", function (r) { return esc(r.note || ""); }], ["Joined", function (r) { return when(r.created_ms); }],
        ["", function (r) { return '<button type="button" class="quiet" data-del="' + esc(r.id) + '" data-email="' + esc(r.email) + '">Remove</button>'; }]], "No signups yet.");
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-del]");
    if (b) {
      if (!window.confirm("Remove " + b.getAttribute("data-email") + " from the waitlist?")) return;
      api("/api/p/waitlist/" + b.getAttribute("data-del"), { method: "DELETE" }).then(function () { load(); });
    }
    if (e.target.id === "csv") {
      fetch("/api/p/waitlist.csv", { headers: { authorization: "Bearer " + state.key } }).then(function (r) { return r.blob(); }).then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "c3-waitlist.csv"; document.body.appendChild(a); a.click(); a.remove();
      });
    }
  });

  function panelHooks() {
    var w = state.data.webhooks || {};
    var h = '<div class="gate">' + (w.enabled ? chip("good", "On") : chip("dim", "Off")) + " " +
      (w.enabled ? "TradingView webhooks are being accepted and stored." : "The TradingView front door is built but switched off until the receiver design is agreed with khuovi.") + "</div>";
    h += stats([["Stored", esc(w.n || 0)], ["Duplicates", esc(w.dups || 0)], ["Last received", w.last ? esc(ago(w.last)) : "–"]]);
    h += '<div id="hk"></div>';
    setTimeout(function () {
      api("/api/p/webhooks").then(function (d) {
        var box = $("hk");
        if (box) box.innerHTML = "<h2>Most recent</h2>" + table(d.recent, [["#", "id", "n"], ["Symbol", "sym"], ["Bar time", function (r) { return when(r.t); }],
          ["Received", function (r) { return when(r.received_ms); }], ["Duplicate", function (r) { return r.dup ? "Yes" : ""; }]], "No webhooks stored.");
      });
    }, 0);
    return h;
  }

  // ---------- controls: commands the bot checks with your control code before running ----------
  var CTL_STORE = "c3.ctl";
  function ctlCode() { try { return localStorage.getItem(CTL_STORE); } catch (e) { return null; } }
  var LABELS = {
    pause_posting: "Pause signal posts", resume_posting: "Resume signal posts", approve_strategy: "Approve strategy",
    retire_strategy: "Retire strategy", run_forward_lab: "Run the forward lab", run_parity: "Run live vs backtest",
    run_wide_backtest: "Run wide-scan backtest", analyze_paper: "Analyse paper", reanalyze_paper: "Analyse paper again",
    test_paper_idea: "Test in forward lab", dismiss_paper_idea: "Dismiss idea"
  };
  function sortedJSON(o) {
    var keys = Object.keys(o || {}).sort(); var out = {};
    keys.forEach(function (k) { out[k] = o[k]; });
    return JSON.stringify(out);
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function nonce() {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function sign(code, c) {
    var enc = new TextEncoder();
    var msg = c.action + "\n" + sortedJSON(c.args) + "\n" + c.nonce + "\n" + c.ts;
    return crypto.subtle.importKey("raw", enc.encode(code), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (k) { return crypto.subtle.sign("HMAC", k, enc.encode(msg)); }).then(hex);
  }
  function say(text, kind) {
    state.msg = [text, kind || ""];                 // kept so a panel redraw doesn't wipe it
    var el = $("ctl-msg");
    if (el) { el.className = "msg " + (kind || ""); el.textContent = text; }
  }
  function sendCommand(action, args) {
    var code = ctlCode();
    if (!code) { state.tab = "controls"; drawTabs(); drawPanel(); say("Enter your control code first.", "err"); return; }
    var c = { action: action, args: args || {}, nonce: nonce(), ts: Math.floor(Date.now() / 1000) };
    say(LABELS[action] + ": sending…");
    sign(code, c).then(function (mac) {
      c.mac = mac;
      return api("/api/p/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    }).then(function (r) {
      say(LABELS[action] + ": waiting for the bot (it checks every 10 seconds)…");
      watch(r.id, action, Date.now());
    }).catch(function () { say(LABELS[action] + ": couldn't send. Try again.", "err"); });
  }
  function watch(id, action, started) {
    setTimeout(function () {
      api("/api/p/commands").then(function (d) {
        state.commands = d.commands;
        var c = (d.commands || []).filter(function (x) { return x.id === id; })[0];
        if (c && (c.status === "pending" || c.status === "sent") && Date.now() - started < 120000) return watch(id, action, started);
        if (!c || c.status === "pending" || c.status === "sent") say(LABELS[action] + ": the bot hasn't picked it up yet. Is it running?", "err");
        else if (c.status === "done") say(LABELS[action] + ": done.", "ok");
        else say(LABELS[action] + ": " + (c.status === "refused" ? "refused by the bot. " : "didn't work. ") + (c.result || ""), "err");
        load();
      });
    }, 4000);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cmd]");
    if (!b) return;
    var action = b.getAttribute("data-cmd");
    var args = {};
    if (b.getAttribute("data-id")) args.id = Number(b.getAttribute("data-id"));
    var name = b.getAttribute("data-name");
    var ask = {
      approve_strategy: "Approve " + name + "? The bot uses it from the next session.",
      retire_strategy: "Retire " + name + "?",
      pause_posting: "Pause the MNQ bot's Discord posts? Trades are still tracked.",
      resume_posting: "Resume the MNQ bot's Discord posts?"
    }[action];
    if (ask && !window.confirm(ask)) return;
    sendCommand(action, args);
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "ctl-form") return;
    e.preventDefault();
    var v = String(new FormData(e.target).get("code") || "").trim().toLowerCase();
    if (!/^[a-z2-7]{4}(-[a-z2-7]{4}){5}$/.test(v)) { say("That doesn't look like a control code (six groups of four letters and digits).", "err"); return; }
    try { localStorage.setItem(CTL_STORE, v); } catch (err) {}
    drawPanel(); say("Control code saved on this device.", "ok");
  });

  function panelControls() {
    var st = (state.data.status && state.data.status.data) || {};
    var a = st.alpha || {};
    var paused = a.paused && a.paused.on;
    var botReady = st.site && st.site.controls;
    var m = state.msg || ["", ""];
    var h = '<p class="msg ' + esc(m[1]) + '" id="ctl-msg" role="status">' + esc(m[0]) + "</p>";
    if (!botReady) h += '<div class="gate">' + chip("warn", "Not set up") + " The bot on your computer has no control code yet, so it will refuse commands. Add ABG_SITE_CONTROL_CODE to its .env (mnq site keygen does it) and restart it.</div>";
    h += "<h2>Signal posts</h2>";
    if (!a.enabled) h += '<p class="note">The signal bot is off on your computer.</p>';
    else h += '<div class="gate">' + (paused ? chip("warn", "Paused") + " Discord posts are held since " + esc(String(a.paused.at || "").slice(0, 16)) + ". Trades are still tracked." :
      chip("good", "Posting") + " Signals go to Discord as usual (tag " + esc(st.tag || "–") + ").") + "</div>" +
      '<div class="row-actions"><button type="button" data-cmd="' + (paused ? "resume_posting" : "pause_posting") + '">' + (paused ? "Resume posts" : "Pause posts") + "</button></div>";
    h += "<h2>Run now</h2>" + '<div class="row-actions">' +
      '<button type="button" class="quiet" data-cmd="run_parity">Live vs backtest check</button>' +
      '<button type="button" class="quiet" data-cmd="run_forward_lab">Forward lab</button>' +
      '<button type="button" class="quiet" data-cmd="run_wide_backtest">Wide-scan backtest</button></div>' +
      '<p class="note">Approve or retire forward-lab strategies from the Research tab. Nothing here posts to Discord.</p>';
    h += "<h2>Control code</h2>";
    if (ctlCode()) h += '<p class="note">This device has your control code. Every command is signed with it, and the bot checks the signature before running anything; the site never sees the code.</p><div class="row-actions"><button type="button" class="quiet" id="ctl-forget">Forget the code on this device</button></div>';
    else h += '<form class="stack" id="ctl-form" autocomplete="off"><label>Control code <small>On your computer, in the mnq-bot folder: .venv\\Scripts\\mnq site code</small><input name="code" required spellcheck="false" autocapitalize="off" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"></label><div><button type="submit">Save on this device</button></div></form>';
    h += "<h2>Recent commands</h2><div id=\"cmds\"><p class=\"note\">Loading…</p></div>";
    setTimeout(function () {
      api("/api/p/commands").then(function (d) {
        var box = $("cmds"); if (!box) return;
        box.innerHTML = table(d.commands, [
          ["Sent", function (r) { return when(r.created_ms); }],
          ["Command", function (r) { return esc(LABELS[r.action] || r.action) + (r.args && r.args.id != null ? " #" + esc(r.args.id) : ""); }],
          ["Result", function (r) { return chip(r.status === "done" ? "good" : r.status === "pending" || r.status === "sent" ? "dim" : "bad", r.status); }],
          ["Details", function (r) { return esc((r.result || "").slice(0, 140)); }]
        ], "No commands yet.");
      });
    }, 0);
    return h;
  }
  document.addEventListener("click", function (e) {
    if (e.target.id !== "ctl-forget") return;
    try { localStorage.removeItem(CTL_STORE); } catch (err) {}
    drawPanel(); say("Control code removed from this device.", "ok");
  });

  // ---------- research papers: you add one, the bot reads it and suggests forward-lab tests ----------
  var BUSY = { queued: 1, waiting: 1, fetching: 1, reading: 1, analysing: 1 };
  var STATUS = {
    uploaded: ["dim", "Added"], queued: ["dim", "Sent to the bot"], waiting: ["dim", "Waiting its turn"], fetching: ["warn", "Fetching"],
    reading: ["warn", "Reading"], analysing: ["warn", "Analysing…"], done: ["good", "Analysed"], failed: ["bad", "Didn't work"]
  };
  var IDEA = { "new": ["dim", "Not tested"], queued: ["warn", "Queued for the forward lab"], tested: ["good", "Tested"],
    already_tested: ["good", "Tested before"], dismissed: ["dim", "Dismissed"], invalid: ["bad", "No longer valid"] };
  var KIND = { pdf: "PDF", arxiv: "arXiv", doi: "DOI", url: "Link", title: "Title" };
  var REF_HELP = {
    arxiv: ["arXiv ID", "For example 2106.01234"], doi: ["DOI", "For example 10.2139/ssrn.3247865"],
    url: ["Link", "A PDF link, or the paper's page on SSRN or a journal"], title: ["Paper title", "The bot looks for an open copy on arXiv"]
  };
  state.pdraft = state.pdraft || { kind: "pdf", ref: "", title: "", note: "" };
  state.popen = state.popen || {};

  function panelPapers() {
    var d = state.pdraft;
    var m = state.msg || ["", ""];
    var st = (state.data.status && state.data.status.data) || {};
    var pv = (st.site && st.site.papers) || null;
    var h = '<p class="msg ' + esc(m[1]) + '" id="ctl-msg" role="status">' + esc(m[0]) + "</p>";
    if (!ctlCode()) h += '<div class="gate">' + chip("warn", "Control code needed") + " Analysing a paper uses Claude credits, so the bot only starts when the request is signed with your control code. Add it on the Controls tab first.</div>";
    else if (pv && pv.analyses === false) h += '<div class="gate">' + chip("warn", "Bot can't analyse") + " The bot has no ABG_ANTHROPIC_API_KEY in its .env, so it will refuse.</div>";
    h += '<form class="stack paper-form" id="paper-form" autocomplete="off">' +
      '<fieldset class="seg"><legend>Add a paper from</legend>' + ["pdf", "arxiv", "doi", "url", "title"].map(function (k) {
        return '<label><input type="radio" name="kind" value="' + k + '"' + (d.kind === k ? " checked" : "") + "><span>" + esc(k === "pdf" ? "PDF file" : KIND[k]) + "</span></label>";
      }).join("") + "</fieldset>";
    if (d.kind === "pdf") {
      h += '<label class="drop" id="paper-drop">Choose a PDF or drop it here <small id="paper-file-name">Up to 20 MB. Stays private: only you and the bot can read it.</small>' +
        '<input type="file" name="file" accept="application/pdf,.pdf" id="paper-file"></label>' +
        '<label>Title <small>Optional. Taken from the file name if you leave it empty.</small><input name="title" maxlength="300" value="' + esc(d.title) + '"></label>';
    } else {
      var rh = REF_HELP[d.kind];
      h += "<label>" + esc(rh[0]) + " <small>" + esc(rh[1]) + '</small><input name="ref" required maxlength="1000" spellcheck="false" value="' + esc(d.ref) + '"></label>';
      if (d.kind !== "title") h += '<label>Title <small>Optional</small><input name="title" maxlength="300" value="' + esc(d.title) + '"></label>';
    }
    h += '<label>What should it check? <small>Optional, for example "Does this gap filter help the 9:30 opening trade?"</small><textarea name="note" maxlength="600">' + esc(d.note) + "</textarea></label>" +
      '<div><button type="submit" id="paper-go">Analyse paper</button></div></form>';
    h += '<p class="note">The bot on your computer downloads the paper, reads it with Claude and grades the evidence. Ideas it can express with the strategy\'s own settings get a Test in forward lab button; they go through the same walk-forward check and paper trading as every other idea. Nothing is posted to Discord and nothing goes live without your approval on the Research tab.' +
      (pv ? " Claude tokens used today: " + esc(Number(pv.tokens_today || 0).toLocaleString()) + " of " + esc(Number(pv.tokens_per_day || 0).toLocaleString()) + "." : "") + "</p>";
    h += '<div id="papers"><p class="note">Loading papers…</p></div>';
    setTimeout(loadPapers, 0);
    return h;
  }

  function ideaRow(p, t) {
    var s = IDEA[t.state || "new"] || IDEA["new"];
    var o = t.outcome || {};
    var res = "";
    if (o.verdict) res = esc(o.verdict === "candidate" ? "Passed the walk-forward" : "Didn't pass") + (o.failed && o.failed.length ? " (" + esc(o.failed.join(", ")) + ")" : "");
    if (o.strategy_id != null) res += (res ? ". " : "") + "Forward-lab strategy #" + esc(o.strategy_id) + (o.strategy_status ? " (" + esc(o.strategy_status) + ")" : "") + ", see the Research tab";
    if (o.why) res += (res ? ". " : "") + esc(o.why);
    var btn = "";
    if (!t.state || t.state === "new") {
      btn = '<button type="button" data-pcmd="test_paper_idea" data-pid="' + esc(p.id) + '" data-idea="' + esc(t.id) + '">Test in forward lab</button> ' +
        '<button type="button" class="quiet" data-pcmd="dismiss_paper_idea" data-pid="' + esc(p.id) + '" data-idea="' + esc(t.id) + '">Dismiss</button>';
    }
    return '<div class="idea"><div class="idea-head"><b>' + esc(t.name) + "</b> " + chip(s[0], s[1]) + "</div>" +
      '<p class="mono">' + esc(t.label || JSON.stringify(t.changes)) + "</p>" +
      '<p class="note">' + esc(String(t.rationale || "").replace(/ \(from paper: .*\)$/, "").replace(/([^.!?])$/, "$1.")) + (t.expected ? " Expected: " + esc(t.expected) + "." : "") + "</p>" +
      (res ? '<p class="note">' + res + ".</p>" : "") + (btn ? '<div class="row-actions">' + btn + "</div>" : "") + "</div>";
  }

  function paperBody(p) {
    var r = p.result;
    var h = "";
    if (p.status === "failed") h += '<p class="msg err">' + esc(p.error || "It didn't work.") + "</p>";
    if (p.status === "uploaded" || p.status === "failed" || (p.status === "done" && r)) {
      var again = p.status === "done" || (p.status === "failed" && r);
      h += '<div class="row-actions"><button type="button" class="' + (again ? "quiet" : "") + '" data-pcmd="' + (again ? "reanalyze_paper" : "analyze_paper") + '" data-pid="' + esc(p.id) + '" data-sha="' + esc(p.sha256) + '">' +
        (again ? "Analyse again" : p.status === "failed" ? "Try again" : "Analyse paper") + "</button>" +
        '<button type="button" class="quiet" data-pdel="' + esc(p.id) + '" data-title="' + esc(p.title || "this paper") + '">Remove</button></div>';
    } else if (BUSY[p.status]) {
      h += '<p class="note">' + esc(STATUS[p.status][1]) + ". This updates by itself; a long paper takes a minute or two.</p>";
    }
    if (!r) return h;
    h += "<h3>Summary</h3><p>" + esc(r.summary) + "</p>";
    var g = r.grade || {};
    h += kv([["Authors", esc(r.authors || "–") + (r.year ? ", " + esc(r.year) : "")], ["Evidence", chip(/A|B/.test(g.letter) ? "good" : g.letter === "C" ? "warn" : "bad", "Grade " + (g.letter || "–")) + " " + esc(g.why || "")],
      ["MNQ strategy", esc((r.relevance || {}).mnq || "–") + " relevance. " + esc((r.relevance || {}).mnq_why || "")],
      ["Swing desk", esc((r.relevance || {}).swing || "–") + " relevance. " + esc((r.relevance || {}).swing_why || "")],
      ["Read", esc(r.pages || "–") + (r.pages === 1 ? " page" : " pages") + (r.cut ? ", cut to its key sections to fit" : "") + (r.source_url ? ' from <a href="' + esc(r.source_url) + '" rel="noopener noreferrer" target="_blank">the source</a>' : "")]]);
    if (g.aspects && g.aspects.length) h += table(g.aspects, [["Check", function (a) { return esc(String(a.aspect).replace(/_/g, " ")); }],
      ["Verdict", function (a) { return chip(a.verdict === "good" ? "good" : a.verdict === "poor" ? "bad" : a.verdict === "mixed" ? "warn" : "dim", a.verdict); }], ["Why", "note"]]);
    h += "<h3>Claims</h3>" + table(r.claims, [["Claim", "text"], ["Evidence", "evidence"], ["Strength", function (c) { return chip(c.strength === "strong" ? "good" : c.strength === "moderate" ? "warn" : "dim", c.strength); }]], "No clear claims.");
    h += "<h3>Testable now</h3>" + ((r.testable || []).length ? r.testable.map(function (t) { return ideaRow(p, t); }).join("") :
      '<p class="note">Nothing in this paper maps onto the strategy\'s settings.</p>');
    if ((r.needs_code || []).length) h += "<h3>Needs new code</h3>" + table(r.needs_code, [["Idea", "name"], ["Signal", "signal"], ["Rule", "rule"], ["Where", function (c) { return '<span class="mono">' + esc(c.module) + "</span>"; }]]) +
      '<p class="note">Proposals only. Nothing here changes the bot.</p>';
    if ((r.engine_proposals || []).length) h += "<h3>For the NQ engine</h3>" + table(r.engine_proposals, [["Idea", "name"], ["Touches", "relates_to"],
      ["research/variants.csv row", function (e) { var v = e.variants_row || {}; return '<span class="mono">' + esc([v.run_id, '"' + (v["what changed"] || "") + '"', v.date].join(",")) + "</span>"; }], ["Note", "note"]]) +
      '<p class="note">Proposal text for khuovi\'s engine. It isn\'t added anywhere automatically.</p>';
    if (r.dropped) h += '<p class="note">' + esc(r.dropped) + " item" + (r.dropped === 1 ? "" : "s") + " from Claude's reply didn't pass the checks and " + (r.dropped === 1 ? "was" : "were") + " left out.</p>";
    return h;
  }

  function loadPapers() {
    api("/api/p/papers").then(function (d) {
      state.papers = d;
      var box = $("papers");
      if (!box) return;
      var ps = d.papers || [];
      var head = '<p class="note">' + esc(d.added_today || 0) + " of " + esc(d.per_day || 10) + " added in the last 24 hours.</p>";
      if (!ps.length) { box.innerHTML = head + '<p class="note">No papers yet. Add a PDF or a link above and press Analyse paper; the results show up here.</p>'; return; }
      box.innerHTML = head + ps.map(function (p) {
        var s = STATUS[p.status] || ["dim", p.status];
        var g = p.result && p.result.grade && p.result.grade.letter;
        var n = p.result && p.result.testable ? p.result.testable.length : null;
        return '<details class="paper" data-pid="' + esc(p.id) + '"' + (state.popen[p.id] ? " open" : "") + "><summary>" +
          '<span class="paper-title">' + esc(p.title || p.ref || "Paper #" + p.id) + "</span>" +
          '<span class="paper-meta">' + chip(s[0], s[1]) + " " + chip("dim", KIND[p.kind] || p.kind) + (g ? " " + chip("dim", "Grade " + g) : "") +
          (n != null ? " " + chip(n ? "good" : "dim", n + " testable") : "") + " <small>" + esc(ago(p.created_ms)) + "</small></span></summary>" +
          '<div class="paper-body">' + paperBody(p) + "</div></details>";
      }).join("");
      clearTimeout(state.ptimer);
      if (ps.some(function (p) { return BUSY[p.status]; }) && state.tab === "papers") state.ptimer = setTimeout(loadPapers, 8000);
    }).catch(function () { var box = $("papers"); if (box) box.innerHTML = '<p class="msg err">Couldn\'t load papers. Press Refresh.</p>'; });
  }

  document.addEventListener("toggle", function (e) {
    var el = e.target;
    if (el && el.classList && el.classList.contains("paper")) state.popen[el.getAttribute("data-pid")] = el.open;
  }, true);
  document.addEventListener("input", function (e) {
    var f = e.target.form;
    if (!f || f.id !== "paper-form") return;
    if (e.target.name === "kind") { state.pdraft.kind = e.target.value; drawPanel(true); return; }
    if (e.target.name in state.pdraft) state.pdraft[e.target.name] = e.target.value;
    if (e.target.id === "paper-file") $("paper-file-name").textContent = e.target.files[0] ? e.target.files[0].name + " (" + (e.target.files[0].size / 1048576).toFixed(1) + " MB)" : "";
  });
  ["dragover", "dragleave", "drop"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var z = e.target.closest && e.target.closest("#paper-drop");
      if (!z) return;
      e.preventDefault();
      z.classList.toggle("over", ev === "dragover");
      if (ev === "drop" && e.dataTransfer.files.length) {
        var inp = $("paper-file");
        inp.files = e.dataTransfer.files;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "paper-form") return;
    e.preventDefault();
    var d = state.pdraft, req;
    if (d.kind === "pdf") {
      var file = $("paper-file").files[0];
      if (!file) { say("Choose a PDF first.", "err"); return; }
      if (file.size > 20 * 1048576) { say("That file is over 20 MB, the limit for papers.", "err"); return; }
      var fd = new FormData();
      fd.append("file", file); fd.append("title", d.title || ""); fd.append("note", d.note || "");
      req = { method: "POST", body: fd };
    } else {
      req = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: d.kind, ref: d.ref, title: d.title, note: d.note }) };
    }
    $("paper-go").disabled = true;
    say("Adding the paper…");
    fetch("/api/p/papers", Object.assign(req, { headers: Object.assign({ authorization: "Bearer " + state.key }, req.headers || {}) }))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { say(x.j.error || "Couldn't add the paper.", "err"); return; }
        state.pdraft = { kind: d.kind, ref: "", title: "", note: "" };
        state.popen[x.j.id] = true;
        if (ctlCode()) sendCommand("analyze_paper", { paper_id: x.j.id, sha256: x.j.sha256 });
        else say("Added. Save your control code on the Controls tab, then press Analyse paper on it.", "ok");
        drawPanel(true);
      })
      .catch(function () { say("Couldn't reach the site. Try again.", "err"); })
      .finally(function () { var b = $("paper-go"); if (b) b.disabled = false; });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-pcmd]");
    if (b) {
      var a = b.getAttribute("data-pcmd");
      var args = { paper_id: Number(b.getAttribute("data-pid")) };
      if (b.getAttribute("data-sha")) args.sha256 = b.getAttribute("data-sha");
      if (b.getAttribute("data-idea")) args.idea_id = b.getAttribute("data-idea");
      sendCommand(a, args);
      return;
    }
    var del = e.target.closest("button[data-pdel]");
    if (del) {
      if (!window.confirm("Remove " + del.getAttribute("data-title") + "? The copy on the bot's computer stays.")) return;
      api("/api/p/papers/" + del.getAttribute("data-pdel"), { method: "DELETE" }).then(loadPapers);
    }
  });

  function panelPublished() {
    if (!state.published) {
      if (!state.publishingLoad) {
        state.publishingLoad = true;
        api("/api/p/published").then(function (data) {
          state.published = data;
        }).catch(function (error) {
          state.published = { error: error.message === "unauthorized" ? "Your private link is no longer valid." : "Published data could not be loaded. Press Refresh to retry." };
        }).finally(function () {
          state.publishingLoad = false;
          if (state.tab === "published") drawPanel();
        });
      }
      return '<h2>Published data</h2><p role="status">Loading bundle inventory…</p>';
    }
    var data = state.published;
    if (data.error) return '<h2>Published data</h2><p class="msg err">' + esc(data.error) + '</p>';
    var html = '<h2>Published data</h2><p>Public backtests: <b>' + (data.public ? 'on' : 'off') + '</b>. Current bundle: <code>' + esc(data.current ? data.current.bundle : 'none') + '</code>.</p><p class="note">Preview uses this browser’s private link. Staged data is never public. Publishing is done by the signed exporter; this tab only reads the inventory.</p>';
    if (!data.bundles.length) return html + '<div class="empty">No bundles uploaded yet.</div>';
    data.bundles.forEach(function (bundle) {
      var current = data.current && data.current.bundle === bundle.id;
      html += '<section class="bundle-card"><h3><code>' + esc(bundle.id) + '</code> ' + chip(bundle.state === 'staging' ? 'warn' : 'dim', current ? 'current' : bundle.state) + '</h3><p>' + bundle.files.length + ' files · ' + bundle.files.reduce(function (sum, f) { return sum + f.bytes; }, 0).toLocaleString() + ' bytes · updated ' + when(bundle.updated_ms) + '</p>';
      if (bundle.preview_ready) html += '<p><a class="btn quiet" href="/backtests/?' + (current ? 'preview=current' : 'staging=' + encodeURIComponent(bundle.id)) + '">Preview bundle</a></p>';
      else if (bundle.state === 'staging') html += '<p class="note">Preview needs a valid staged manifest and every listed file.</p>';
      html += '<details><summary>Files and sizes</summary>' + table(bundle.files, [['Path', 'path'], ['Bytes', 'bytes', 'n'], ['SHA-256', function (f) { return '<code class="hash">' + esc(f.sha256) + '</code>'; }]]) + '</details></section>';
    });
    return html;
  }
  var PANELS = { today: panelToday, research: panelResearch, papers: panelPapers, swing: panelSwing, controls: panelControls, track: panelTrack, published: panelPublished, waitlist: panelWaitlist, hooks: panelHooks };
  function drawPanel(full) {
    if (state.tab === "papers" && $("paper-form") && !full) { loadPapers(); return; }   // keep what you're typing
    $("panel").setAttribute("aria-labelledby", "tab-" + state.tab);
    try { $("panel").innerHTML = PANELS[state.tab](); } catch (e) { $("panel").innerHTML = '<p class="msg err">This section couldn\'t be drawn from the latest data.</p>'; }
  }

  // ---------- data ----------
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ authorization: "Bearer " + state.key }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { lock("This private link isn't valid anymore"); throw new Error("unauthorized"); }
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }
  function load() {
    $("refresh").disabled = true;
    return api("/api/p/overview").then(function (d) {
      state.data = d;
      if (state.tab === "published") state.published = null;
      dashEl.hidden = false;
      $("lock").hidden = true;
      header(d); drawTabs(); drawPanel();
    }).catch(function (e) {
      if (e.message !== "unauthorized") $("pulse-sub").textContent = "Couldn't reach the site. It will try again in a minute.";
    }).finally(function () { $("refresh").disabled = false; });
  }

  $("refresh").addEventListener("click", load);
  $("forget").addEventListener("click", function () {
    try { localStorage.removeItem(KEY_STORE); localStorage.removeItem(CTL_STORE); } catch (e) {}
    state.key = null;
    lock("This device no longer has the private link");
  });

  state.key = readKey();
  try { state.tab = sessionStorage.getItem("c3.tab") || state.tab; } catch (e) {}
  if (!PANELS[state.tab]) state.tab = "today";
  if (!state.key) { lock(); return; }
  load();
  setInterval(function () { if (!document.hidden && state.key) load(); }, 60000);
})();
