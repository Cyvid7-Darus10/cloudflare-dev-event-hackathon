/**
 * Ask Rectify: the chat widget.
 *
 * Self-contained on purpose. It builds its own markup, so the only change to
 * Cyrus's page is a stylesheet link and a script tag, and nothing here can
 * collide with the flag board's own state.
 *
 * It uses the board's tokens from styles.css rather than its own palette, and
 * it sits above the fixed publish bar so it can never cover the CTA.
 *
 * Styles live in chat.css and are linked from the page. They cannot be
 * injected from here: this site sends `style-src 'self'` with no
 * 'unsafe-inline', so an injected stylesheet is dropped and the widget
 * renders with no rules at all.
 */
(function () {
  "use strict";

  var API = "/api/chat";
  var MAX = 600;

  var SUGGESTED = [
    "What does Rectify do?",
    "Which Cloudflare services does it use?",
    "What is not finished yet?"
  ];

  var root = document.createElement("div");
  root.className = "ask";
  root.innerHTML = [
    '<div class="ask__p" role="dialog" aria-label="Ask Rectify">',
    '<div class="ask__h"><b>Ask Rectify</b><span>about this prototype</span>',
    '<button class="ask__x" type="button" aria-label="Close">&times;</button></div>',
    '<div class="ask__log" id="ask-log" aria-live="polite"></div>',
    '<div class="ask__note">Answers come from a small model and can be wrong.</div>',
    '<form class="ask__f" id="ask-f">',
    '<input id="ask-i" type="text" maxlength="' + MAX + '" autocomplete="off"',
    ' placeholder="Ask about Rectify" aria-label="Your question" />',
    '<button type="submit" id="ask-go">Send</button>',
    "</form></div>",
    '<button class="ask__b" type="button" id="ask-t" aria-expanded="false"',
    ' aria-label="Ask about this prototype">Ask</button>'
  ].join("");
  document.body.appendChild(root);

  var log = root.querySelector("#ask-log");
  var form = root.querySelector("#ask-f");
  var input = root.querySelector("#ask-i");
  var send = root.querySelector("#ask-go");
  var toggle = root.querySelector("#ask-t");
  var history = [];
  var busy = false;

  function bubble(role, text) {
    var el = document.createElement("div");
    el.className = "ask__m ask__m--" + role;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function greet() {
    var hint = document.createElement("div");
    hint.className = "ask__hint";
    hint.textContent =
      "I can explain what Rectify does, how the pipeline is built, and what did not get "
      + "finished in the two hours. Ask anything, or start here.";
    var wrap = document.createElement("div");
    wrap.className = "ask__s";
    SUGGESTED.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", function () { ask(q); });
      wrap.appendChild(b);
    });
    hint.appendChild(wrap);
    log.appendChild(hint);
  }

  function ask(text) {
    if (busy) return;
    var q = String(text || "").trim().slice(0, MAX);
    if (!q) return;

    var chips = log.querySelector(".ask__s");
    if (chips) chips.remove();

    bubble("u", q);
    history.push({ role: "user", content: q });
    input.value = "";

    busy = true;
    send.disabled = true;
    input.disabled = true;
    var pending = bubble("a", "Thinking...");

    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-6) })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        var reply = data && (data.reply || data.error);
        if (!reply) {
          pending.className = "ask__m ask__m--e";
          pending.textContent = "No answer came back. Try again in a moment.";
          return;
        }
        pending.textContent = reply;
        if (data.reply) history.push({ role: "assistant", content: data.reply });
      })
      .catch(function () {
        pending.className = "ask__m ask__m--e";
        pending.textContent = "Could not reach the assistant. The rest of the page still works.";
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        input.disabled = false;
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  function open(next) {
    root.classList.toggle("on", next);
    toggle.setAttribute("aria-expanded", next ? "true" : "false");
    toggle.textContent = next ? "Close" : "Ask";
    if (next) {
      if (!log.childNodes.length) greet();
      input.focus();
    } else {
      toggle.focus();
    }
  }

  toggle.addEventListener("click", function () { open(!root.classList.contains("on")); });
  root.querySelector(".ask__x").addEventListener("click", function () { open(false); });
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root.classList.contains("on")) open(false);
  });
})();
