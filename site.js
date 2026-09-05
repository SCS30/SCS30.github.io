/* Rail tracking, post loading, contact form states. */
(function () {
  "use strict";

  /* ================================================================
     Side-rail: active section tracking.
     IntersectionObserver, never a scroll listener.
     ================================================================ */

  var railLinks = Array.prototype.slice.call(document.querySelectorAll(".rail__link"));
  var sections  = railLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var visible = new Set();

    var setCurrent = function () {
      var top = sections.filter(function (s) { return visible.has(s.id); })[0];
      railLinks.forEach(function (a) {
        var on = top && a.getAttribute("href") === "#" + top.id;
        if (on) { a.setAttribute("aria-current", "true"); }
        else    { a.removeAttribute("aria-current"); }
      });
    };

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { visible.add(e.target.id); }
        else { visible.delete(e.target.id); }
      });
      setCurrent();
    }, { rootMargin: "-25% 0px -60% 0px", threshold: 0 });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ================================================================
     Writing: merge posts/index.json into the list, newest first.
     Fails silently: the Chemistry World entry is in the HTML already.
     ================================================================ */

  var list = document.getElementById("posts");

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var safeHref = function (u) {
    var s = String(u == null ? "" : u);
    return /^(https:\/\/|\/|\.\/|posts\/)/.test(s) ? s : "#";
  };

  var readable = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) { return esc(iso); }
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  if (list && window.fetch) {
    fetch("posts/index.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.posts) || !data.posts.length) { return; }

        data.posts.forEach(function (p) {
          if (p.draft) { return; }
          var li = document.createElement("li");
          li.className = "post";
          li.setAttribute("data-date", p.date || "");
          li.innerHTML =
            '<p class="post__when">' + readable(p.date) + "</p>" +
            '<h3 class="post__title"><a class="lnk" href="' + esc(safeHref(p.url)) + '">' + esc(p.title) + "</a></h3>" +
            '<p class="post__dek">' + esc(p.summary) + "</p>" +
            '<p class="post__where">' + esc(p.venue || "Notes") + "</p>";
          list.appendChild(li);
        });

        Array.prototype.slice.call(list.children)
          .sort(function (a, b) {
            return String(b.getAttribute("data-date")).localeCompare(String(a.getAttribute("data-date")));
          })
          .forEach(function (li) { list.appendChild(li); });
      })
      .catch(function () { /* no posts file yet, the section still reads correctly */ });
  }

  /* ================================================================
     Section reveal: one quiet entrance each, once.
     ================================================================ */

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var secs = Array.prototype.slice.call(document.querySelectorAll(".sec"));

  if (!reduced && "IntersectionObserver" in window && secs.length) {
    document.documentElement.classList.add("js-reveal");
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.02 });
    secs.forEach(function (sec) { ro.observe(sec); });

    // Anything already on screen at load settles immediately. Done straight
    // away rather than in requestAnimationFrame, because rAF does not run in a
    // page that is not painting.
    secs.forEach(function (sec) {
      if (sec.getBoundingClientRect().top < window.innerHeight * 1.1) { sec.classList.add("is-in"); }
    });

    // Failsafe. IntersectionObserver, requestAnimationFrame and CSS transitions
    // all stall in a page that is not being painted (a background tab, some
    // embedded views), so adding a class and trusting a transition to finish is
    // not enough. Dropping the flag removes the hidden state outright, which
    // cannot fail. A timer keeps running where the others do not.
    window.setTimeout(function () {
      document.documentElement.classList.remove("js-reveal");
    }, 2500);
  }

  /* ================================================================
     Figure carousel. Auto-advances, but pauses on hover, on focus,
     when the tab is hidden, and never starts under reduced motion.
     ================================================================ */

  var car = document.getElementById("figures");
  if (car) {
    var track  = car.querySelector(".carousel__track");
    var slides = Array.prototype.slice.call(car.querySelectorAll(".slide"));
    var readout = car.querySelector(".carousel__status");
    var toggle = car.querySelector(".carousel__toggle");
    var steps  = Array.prototype.slice.call(car.querySelectorAll(".carousel__btn"));
    var idx = 0, timer = null, paused = reduced, hovering = false;

    var render = function () {
      track.style.transform = "translateX(" + (-idx * 100) + "%)";
      slides.forEach(function (s, n) { s.setAttribute("aria-hidden", String(n !== idx)); });
      readout.textContent = "Figure " + (idx + 1) + " of " + slides.length;
    };

    var go = function (step) { idx = (idx + step + slides.length) % slides.length; render(); };

    var stop  = function () { if (timer) { window.clearInterval(timer); timer = null; } };
    var start = function () {
      stop();
      if (paused || hovering || document.hidden) { return; }
      timer = window.setInterval(function () { go(1); }, 7000);
    };

    steps.forEach(function (b) {
      b.addEventListener("click", function () { go(parseInt(b.dataset.step, 10)); start(); });
    });

    toggle.addEventListener("click", function () {
      paused = !paused;
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.textContent = paused ? "Play" : "Pause";
      start();
    });

    // Pause while the reader is actually looking at or using it.
    car.addEventListener("mouseenter", function () { hovering = true;  stop(); });
    car.addEventListener("mouseleave", function () { hovering = false; start(); });
    car.addEventListener("focusin",    function () { hovering = true;  stop(); });
    car.addEventListener("focusout",   function () {
      if (!car.contains(document.activeElement)) { hovering = false; start(); }
    });
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

    car.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1);  start(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); go(-1); start(); }
    });

    if (reduced) { toggle.textContent = "Play"; toggle.setAttribute("aria-pressed", "true"); }
    render();
    start();
  }

  /* ================================================================
     Contact form: validate on blur once touched, eight button states.
     ================================================================ */

  var form = document.getElementById("contact-form");
  if (!form) { return; }

  var btn    = document.getElementById("form-submit");
  var label  = document.getElementById("form-submit-label");
  var status = document.getElementById("form-status");
  var fields = Array.prototype.slice.call(form.querySelectorAll(".input[required]"));
  var idle   = label.textContent;

  // JS owns validation from here, so the styled messages are what the user sees.
  // The `required` attributes stay, so without JS the browser still validates.
  form.setAttribute("novalidate", "");

  var helperFor = function (el) {
    var id = el.getAttribute("aria-describedby");
    return id ? document.getElementById(id) : null;
  };

  var problem = function (el) {
    var v = el.value.trim();
    if (!v) {
      return el.id === "f-message"
        ? "A message is required. A line or two about what you need is plenty."
        : "This field is required.";
    }
    if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      return "That email address is missing an @ or a domain. Check it and try again.";
    }
    return null;
  };

  var mark = function (el) {
    var msg  = problem(el);
    var help = helperFor(el);
    if (msg) {
      el.setAttribute("aria-invalid", "true");
      el.removeAttribute("data-state");
      if (help) { help.textContent = msg; help.setAttribute("data-state", "error"); }
      return false;
    }
    el.removeAttribute("aria-invalid");
    if (help) { help.textContent = ""; help.removeAttribute("data-state"); }
    return true;
  };

  fields.forEach(function (el) {
    el.addEventListener("blur", function () {
      el.dataset.touched = "1";
      mark(el);
    });
    el.addEventListener("input", function () {
      if (el.dataset.touched) { mark(el); }
    });
  });

  var setStatus = function (text, state) {
    status.textContent = text || "";
    if (state) { status.setAttribute("data-state", state); }
    else { status.removeAttribute("data-state"); }
  };

  var settle = function (state, text) {
    btn.setAttribute("data-state", state);
    label.textContent = text;
    window.setTimeout(function () {
      btn.removeAttribute("data-state");
      btn.disabled = false;
      label.textContent = idle;
    }, 4000);
  };

  form.addEventListener("submit", function (e) {
    var ok = fields.map(function (el) { el.dataset.touched = "1"; return mark(el); })
                   .every(Boolean);

    if (!ok) {
      e.preventDefault();
      setStatus("The form is not complete. The fields marked below need attention.", "error");
      var first = fields.filter(function (el) { return el.getAttribute("aria-invalid") === "true"; })[0];
      if (first) { first.focus({ preventScroll: false }); }
      return;
    }

    // Not yet wired to a Formspree endpoint, so say so plainly rather than failing silently.
    if (form.action.indexOf("YOUR_FORM_ID") !== -1) {
      e.preventDefault();
      setStatus("This form is not connected yet. Paste your Formspree endpoint into the form action in index.html, or email stuartcsmith30@outlook.com in the meantime.", "error");
      return;
    }

    if (!window.fetch) { return; }   // no fetch: let the browser POST normally

    e.preventDefault();
    btn.disabled = true;
    btn.setAttribute("data-state", "loading");
    label.textContent = "Sending";
    setStatus("");

    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (r) {
        if (!r.ok) { throw new Error(String(r.status)); }
        form.reset();
        fields.forEach(function (el) {
          delete el.dataset.touched;
          el.removeAttribute("aria-invalid");
          var help = helperFor(el);
          if (help) { help.textContent = ""; help.removeAttribute("data-state"); }
        });
        setStatus("Message sent. It goes straight to my inbox, and I will reply as soon as I can.", "success");
        settle("success", "Sent");
      })
      .catch(function () {
        setStatus("The message did not send. The form service returned an error. Email stuartcsmith30@outlook.com instead and it will reach me.", "error");
        settle("error", "Try again");
      });
  });
})();
