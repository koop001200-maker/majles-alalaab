/* «مجلس الألعاب» — التنقل بأسهم الريموت/الكيبورد بين الأزرار حسب مكانها على الشاشة.
   ما يتدخل لو اللعبة نفسها تعاملت مع السهم (preventDefault) أو لو الكتابة داخل حقل. */
(function () {
  if (window.__majlisNav) return; window.__majlisNav = true;
  var DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  var SEL = 'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"]), input[type="checkbox"], input[type="radio"]';
  function visible(el) {
    if (!el.getClientRects().length || el.closest("[inert],[hidden]")) return false;
    var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    var cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.pointerEvents !== "none";
  }
  function scope() {
    var d = [].slice.call(document.querySelectorAll("dialog[open]")).pop();
    return d || document;
  }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }
  window.addEventListener("keydown", function (e) {
    var dir = DIRS[e.key];
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !/^(checkbox|radio|button|submit)$/.test(t.type || "")) || (t && t.isContentEditable)) return;
    var list = [].slice.call(scope().querySelectorAll(SEL)).filter(visible);
    if (!list.length) return;
    var cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) < 0) { e.preventDefault(); list[0].focus(); return; }
    var c = center(cur), best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var p = center(el), dx = p.x - c.x, dy = p.y - c.y;
      var main = dir[0] ? dx * dir[0] : dy * dir[1], side = dir[0] ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) return;
      var score = main + side * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) { e.preventDefault(); best.focus(); }
  });
})();
