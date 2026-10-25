(function () {
  var form = document.getElementById("join");
  var msg = document.getElementById("join-msg");
  var btn = form.querySelector("button");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(form);
    var email = String(f.get("email") || "").trim();
    if (!email || email.indexOf("@") < 1) {
      msg.className = "msg err";
      msg.textContent = "Enter your email address.";
      form.email.focus();
      return;
    }
    btn.disabled = true;
    msg.className = "msg";
    msg.textContent = "Joining…";
    fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, note: f.get("note") || "", website: f.get("website") || "" })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (x) {
      if (x.ok) {
        form.reset();
        msg.className = "msg ok";
        msg.textContent = "You're on the list. You'll hear from us when alerts open.";
      } else {
        msg.className = "msg err";
        msg.textContent = (x.d && x.d.error) || "That didn't work. Try again.";
      }
    }).catch(function () {
      msg.className = "msg err";
      msg.textContent = "Couldn't reach the site. Check your connection and try again.";
    }).finally(function () { btn.disabled = false; });
  });
})();
