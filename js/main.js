/* ==========================================================================
   Congress of Independent Unions — interactions & motion (v5 "Orano" dark)
   - Per-letter staggered headline reveal + periodic glitch pass
   - Crimson freight particles traveling the hero route network (SVG)
   - Mouse parallax on hero layers, custom cursor, scroll-spy rail
   - Scroll reveals, counters, nav state, mobile menu
   ========================================================================== */

(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     Hero: split headline lines into letters, stagger them in
  ------------------------------------------------------------------ */
  function initHeadline() {
    var title = document.getElementById("heroTitle");
    if (!title) return;
    var lines = title.querySelectorAll(".js-letters");

    if (prefersReduced) {
      title.classList.add("hero--in");
      return;
    }

    lines.forEach(function (line, li) {
      var text = line.textContent;
      line.textContent = "";
      var frag = document.createDocumentFragment();
      // shuffled per-letter delays, Orano style (letters pop in out of order)
      var delays = [];
      for (var i = 0; i < text.length; i++) delays.push(i);
      delays.sort(function () { return Math.random() - 0.5; });

      Array.prototype.forEach.call(text, function (ch, i) {
        var span = document.createElement("span");
        span.className = "lt";
        if (ch === " ") {
          span.innerHTML = "&nbsp;";
        } else {
          span.textContent = ch;
        }
        var d = 0.35 + li * 0.18 + delays[i] * 0.045;
        span.style.setProperty("--dl", d.toFixed(3) + "s");
        frag.appendChild(span);
      });
      line.appendChild(frag);
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        title.classList.add("hero--in");
      });
    });
  }

  /* ------------------------------------------------------------------
     Hero: periodic glitch pass over the headline
  ------------------------------------------------------------------ */
  function initGlitch() {
    var title = document.getElementById("heroTitle");
    if (!title || prefersReduced) return;

    function schedule() {
      var wait = 4500 + Math.random() * 4500;
      setTimeout(function () {
        if (!document.hidden) {
          title.classList.add("is-glitching");
          setTimeout(function () {
            title.classList.remove("is-glitching");
          }, 380);
        }
        schedule();
      }, wait);
    }
    // first pass shortly after the letters settle
    setTimeout(schedule, 2600);
  }

  /* ------------------------------------------------------------------
     Hero: crimson shipment particles along the network paths
  ------------------------------------------------------------------ */
  function initNetworkParticles() {
    var svg = document.querySelector(".hero__net");
    if (!svg || prefersReduced) return;
    var paths = svg.querySelectorAll("#netLines .net-path");
    var NS = "http://www.w3.org/2000/svg";
    var particles = [];

    paths.forEach(function (path, i) {
      var len = path.getTotalLength();
      var dot = document.createElementNS(NS, "circle");
      dot.setAttribute("r", "2.6");
      dot.setAttribute("fill", "#ef2a48");
      var halo = document.createElementNS(NS, "circle");
      halo.setAttribute("r", "7");
      halo.setAttribute("fill", "#ef2a48");
      halo.setAttribute("opacity", "0.2");
      // append inside the paths' own group: getPointAtLength returns local
      // coordinates, and the group may carry a transform (the US map does)
      path.parentNode.appendChild(halo);
      path.parentNode.appendChild(dot);
      particles.push({
        path: path, len: len, dot: dot, halo: halo,
        t: Math.random(),
        speed: 0.0018 + Math.random() * 0.0016,
        dir: i % 2 === 0 ? 1 : -1
      });
    });

    function frame() {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.t += p.speed * p.dir;
        if (p.t > 1) { p.t = 1; p.dir = -1; }
        if (p.t < 0) { p.t = 0; p.dir = 1; }
        var pt = p.path.getPointAtLength(p.t * p.len);
        p.dot.setAttribute("cx", pt.x);
        p.dot.setAttribute("cy", pt.y);
        p.halo.setAttribute("cx", pt.x);
        p.halo.setAttribute("cy", pt.y);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------
     Hero: gentle mouse parallax on the layers
  ------------------------------------------------------------------ */
  function initParallax() {
    if (prefersReduced) return;
    var hero = document.getElementById("hero");
    var layers = document.querySelectorAll(".hero__layer");
    if (!hero || !layers.length) return;

    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach(function (layer) {
        var depth = parseFloat(layer.getAttribute("data-depth") || "0");
        layer.style.transform =
          "translate(" + (-nx * depth) + "px," + (-ny * depth) + "px)";
      });
    });
    hero.addEventListener("mouseleave", function () {
      layers.forEach(function (layer) { layer.style.transform = ""; });
    });
  }

  /* ------------------------------------------------------------------
     Custom cursor — crimson dot + trailing ring (fine pointers only)
     Position AND hover-scale are lerped here every frame; the ring must
     have no CSS transform transition or it drags a full beat behind.
  ------------------------------------------------------------------ */
  function initCursor() {
    if (prefersReduced) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    var cursor = document.getElementById("cursor");
    if (!cursor) return;
    var dot = cursor.querySelector(".cursor__dot");
    var ring = cursor.querySelector(".cursor__ring");

    document.documentElement.classList.add("has-cursor");

    var mx = -100, my = -100, rx = -100, ry = -100;
    var scale = 1, targetScale = 1, started = false;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      cursor.classList.add("is-active");
      var t = e.target;
      var interactive = t.closest &&
        t.closest("a, button, .pillar, .contact-card, .marquee");
      cursor.classList.toggle("is-hover", !!interactive);
      targetScale = interactive ? 1.5 : 1;
      if (!started) { started = true; rx = mx; ry = my; loop(); }
    });
    document.addEventListener("mouseleave", function () {
      cursor.classList.remove("is-active");
    });

    function loop() {
      rx += (mx - rx) * 0.38;
      ry += (my - ry) * 0.38;
      scale += (targetScale - scale) * 0.22;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      ring.style.transform =
        "translate(" + rx + "px," + ry + "px) scale(" + scale.toFixed(3) + ")";
      requestAnimationFrame(loop);
    }
  }

  /* ------------------------------------------------------------------
     Scroll-spy for the right-edge section rail
  ------------------------------------------------------------------ */
  function initRail() {
    var rail = document.getElementById("rail");
    if (!rail) return;
    var links = rail.querySelectorAll("a[data-rail]");
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("data-rail")] = a; });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = map[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach(function (a) { a.classList.remove("is-active"); });
          link.classList.add("is-active");
        }
      });
    }, { rootMargin: "-42% 0px -42% 0px", threshold: 0 });

    Object.keys(map).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }

  /* ------------------------------------------------------------------
     Scroll reveals
  ------------------------------------------------------------------ */
  function initReveals() {
    var els = document.querySelectorAll(".reveal");
    if (prefersReduced) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    // Elements already in view at load (deep links, refresh mid-page)
    // appear instantly — no fade-in from a blank page.
    var vh = window.innerHeight;
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        el.style.transition = "none";
        el.classList.add("is-visible");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { el.style.transition = ""; });
        });
      } else {
        io.observe(el);
      }
    });
  }

  /* ------------------------------------------------------------------
     Counters
  ------------------------------------------------------------------ */
  function initCounters() {
    var nums = document.querySelectorAll("[data-count]");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var target = parseInt(el.getAttribute("data-count"), 10);
        var plain = el.hasAttribute("data-plain");
        if (prefersReduced || target === 0) {
          el.textContent = plain ? String(target) : target.toLocaleString("en-US");
          return;
        }
        var dur = 1600, start = null;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 4);
          var val = Math.round(target * eased);
          el.textContent = plain ? String(val) : val.toLocaleString("en-US");
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     Nav state, progress bar, mobile menu
  ------------------------------------------------------------------ */
  function initNav() {
    var nav = document.getElementById("nav");
    var fill = document.getElementById("progressFill");
    window.addEventListener("scroll", function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 40);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      fill.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }, { passive: true });

    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("mobileMenu");
    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", "true");
    }
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
  }

  /* ------------------------------------------------------------------ */
  document.getElementById("year").textContent = String(new Date().getFullYear());

  initHeadline();
  initGlitch();
  initNetworkParticles();
  initParallax();
  initCursor();
  initRail();
  initReveals();
  initCounters();
  initNav();
})();
