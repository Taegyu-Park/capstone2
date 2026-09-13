// 카테고리 탭 전환. 해시에 카테고리를 반영해 새로고침·공유해도 같은 탭이 열립니다.
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
  if (!tabs.length) return;

  function activate(cat, updateHash) {
    var found = false;
    tabs.forEach(function (t) {
      var on = t.dataset.cat === cat;
      t.classList.toggle('active', on);
      if (on) found = true;
    });
    if (!found) return false;
    panels.forEach(function (p) {
      p.classList.toggle('active', p.dataset.cat === cat);
    });
    if (updateHash) history.replaceState(null, '', '#' + cat);
    return true;
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      activate(t.dataset.cat, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  var fromHash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (fromHash) activate(fromHash, false);

  window.addEventListener('hashchange', function () {
    activate(decodeURIComponent(location.hash.replace(/^#/, '')), false);
  });
})();
