/**
 * Ask Rectify: the chat widget.
 *
 * Self-contained on purpose. It injects its own styles and markup so the only
 * change to Cyrus's page is one script tag, and nothing here can collide with
 * the flag board's own state.
 *
 * It uses the board's tokens from styles.css rather than its own palette, and
 * it sits above the fixed publish bar so it can never cover the CTA.
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

  var css = [
    ".ask{position:fixed;right:16px;bottom:120px;z-index:40;font-family:var(--ui)}",
    "@media(max-width:660px){.ask{right:10px;bottom:112px;left:10px}}",
    ".ask__b{width:46px;height:46px;border-radius:999px;border:1px solid var(--edge);",
    "background:var(--doc);color:#1d1d1d;cursor:pointer;display:flex;align-items:center;",
    "justify-content:center;margin-left:auto;font:inherit;font-size:12px;font-weight:600;",
    "letter-spacing:.02em}",
    ".ask__b:hover{background:#e0741a}",
    ".ask__p{display:none;flex-direction:column;width:min(360px,calc(100vw - 24px));",
    "height:min(460px,calc(100vh - 200px));background:var(--paper);border:1px solid var(--rule);",
    "border-radius:var(--r-lg);overflow:hidden;margin-bottom:10px}",
    ".ask.on .ask__p{display:flex}",
    ".ask__h{display:flex;align-items:baseline;gap:8px;padding:10px 14px;",
    "border-bottom:1px solid var(--rule);background:var(--paper-2)}",
    ".ask__h b{font-size:13.5px;font-weight:600}",
    ".ask__h span{font-family:var(--mono);font-size:11px;color:var(--ink-3)}",
    ".ask__x{margin-left:auto;background:none;border:0;cursor:pointer;color:var(--ink-3);",
    "font:inherit;font-size:16px;line-height:1;padding:0 2px}",
    ".ask__x:hover{color:var(--ink)}",
    ".ask__log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".ask__m{font-size:13.5px;line-height:1.5;max-width:92%;white-space:pre-wrap;",
    "overflow-wrap:anywhere}",
    ".ask__m--u{align-self:flex-end;background:var(--doc-soft);border:1px solid var(--doc-edge);",
    "color:var(--ink);border-radius:var(--r-md);padding:7px 10px}",
    ".ask__m--a{align-self:flex-start;color:var(--ink-2)}",
    ".ask__m--e{align-self:flex-start;color:var(--lost)}",
    ".ask__hint{font-size:12.5px;color:var(--ink-3);line-height:1.5}",
    ".ask__s{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
    ".ask__s button{font:inherit;font-size:12px;cursor:pointer;text-align:left;",
    "background:var(--paper);border:1px dashed var(--edge);border-radius:999px;",
    "padding:4px 10px;color:var(--ink-2)}",
    ".ask__s button:hover{background:var(--paper-2);color:var(--ink)}",
    ".ask__f{display:flex;gap:6px;padding:10px;border-top:1px solid var(--rule)}",
    ".ask__f input{flex:1;font:inherit;font-family:var(--mono);font-size:12.5px;",
    "padding:7px 9px;border:1px solid var(--edge);border-radius:var(--r-sm);color:var(--ink);",
    "background:var(--paper);min-width:0}",
    ".ask__f button{font:inherit;font-size:12.5px;cursor:pointer;padding:7px 12px;",
    "border:1px solid var(--edge);border-radius:var(--r-sm);background:var(--paper);color:var(--ink)}",
    ".ask__f button:hover:not(:disabled){background:var(--paper-2)}",
    ".ask__f button:disabled,.ask__f input:disabled{opacity:.55;cursor:default}",
    ".ask__note{padding:0 14px 10px;font-size:11px;color:var(--ink-4);font-family:var(--mono)}",
    ".ask :focus-visible{outline:2px solid var(--doc);outline-offset:2px}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

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
