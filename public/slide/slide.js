/*
 * Deck navigation. External file because the Worker's CSP
 * (src/platform/safety.ts) is `script-src 'self'` with no `unsafe-inline`,
 * so an inline <script> never runs in the browser.
 */
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll(".s"));
  var titles = ["Rectify", "The problem", "The product", "The payoff", "Architecture",
    "Matching ladder", "The diff", "Learning loop", "Durable Object", "The output",
    "Services", "What we cut", "The team", "Demo", "Close"];
  var dots = document.getElementById("d");
  var label = document.getElementById("t");
  var i = 0;

  slides.forEach(function (_, n) {
    var el = document.createElement("i");
    el.addEventListener("click", function () { go(n); });
    dots.appendChild(el);
  });

  function go(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, k) { s.classList.toggle("on", k === i); });
    Array.prototype.forEach.call(dots.children, function (el, k) { el.classList.toggle("on", k === i); });
    label.textContent = "";
    var count = document.createElement("b");
    count.textContent = String(i + 1);
    label.appendChild(count);
    label.appendChild(document.createTextNode(" / " + slides.length + "   " + titles[i]));
    slides[i].scrollTop = 0;
    if (location.hash !== "#" + (i + 1)) history.replaceState(null, "", "#" + (i + 1));
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { go(0); }
    else if (e.key === "End") { go(slides.length - 1); }
  });
  document.getElementById("next").addEventListener("click", function () { go(i + 1); });
  document.getElementById("prev").addEventListener("click", function () { go(i - 1); });

  go(Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));
})();
