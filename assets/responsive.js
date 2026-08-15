/* =========================================================
   بوردنق / Boarding — التنقّل الموحّد
   يبني ترويسة واحدة + درج جوال + شريط سفلي على كل الصفحات
   ========================================================= */
(function () {
  'use strict';

  // الأقسام الأربعة الرئيسية + CTA + الملف
  var SECTIONS = [
    { key: 'planner',  file: 'planner.html',  icon: 'event',          ar: 'خطط لرحلتك', en: 'Planner' },
    { key: 'buddies',  file: 'buddies.html',  icon: 'diversity_3',    ar: 'خوّة سفر',   en: 'Buddies' },
    { key: 'explore',  file: 'explore.html',  icon: 'explore',        ar: 'استكشف',     en: 'Explore' },
    { key: 'memories', file: 'memories.html', icon: 'photo_library',  ar: 'الذكريات',   en: 'Memories' }
  ];
  var NEW_TRIP = 'planner.html?new=1';

  // شريط الجوال السفلي (5): الرئيسية، استكشف، جديد(CTA)، خوّة، رحلاتي
  var TABS = [
    { key: 'home',     file: 'index.html',    icon: 'home',        ar: 'الرئيسية' },
    { key: 'explore',  file: 'explore.html',  icon: 'explore',     ar: 'استكشف' },
    { key: 'new',      file: NEW_TRIP,        icon: 'add',         ar: 'رحلة جديدة', cta: true },
    { key: 'buddies',  file: 'buddies.html',  icon: 'diversity_3', ar: 'خوّة سفر' },
    { key: 'mytrips',  file: 'mytrips.html',  icon: 'luggage',     ar: 'رحلاتي' }
  ];

  // خريطة الصفحات الفرعية إلى القسم الأب (لإبراز التبويب الصحيح)
  var PARENT = {
    'index.html': 'home',
    'planner.html': 'planner', 'trip.html': 'planner', 'prep.html': 'planner',
    'packing.html': 'planner', 'expenses.html': 'planner',
    'buddies.html': 'buddies',
    'explore.html': 'explore', 'recommendations.html': 'explore',
    'memories.html': 'memories',
    'mytrips.html': 'mytrips', 'friends.html': 'mytrips', 'profile.html': 'mytrips'
  };

  var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (!path) path = 'index.html';
  var section = PARENT[path] || 'home';

  function icon(name) { return '<span class="material-symbols-outlined">' + name + '</span>'; }

  // علامة الشعار: تذكرة برتقالية مائلة بداخلها طائرة (إعادة رسم SVG)
  function logoMarkSVG() {
    return '<svg class="bn-mark" viewBox="0 0 56 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="bnMarkG" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#F6AE55"/><stop offset="1" stop-color="#E85D3D"/></linearGradient>' +
        '<mask id="bnMarkM">' +
          '<rect x="7" y="11" width="42" height="20" rx="5" fill="#fff"/>' +
          '<circle cx="35" cy="11" r="2.6" fill="#000"/>' +
          '<circle cx="35" cy="31" r="2.6" fill="#000"/>' +
        '</mask>' +
      '</defs>' +
      '<g transform="rotate(-22 28 21)">' +
        '<rect x="7" y="11" width="42" height="20" rx="5" fill="url(#bnMarkG)" mask="url(#bnMarkM)"/>' +
        '<line x1="35" y1="14" x2="35" y2="28" stroke="#FFF7EE" stroke-opacity=".8" stroke-width="1.6" stroke-dasharray="1.4 2.4" stroke-linecap="round"/>' +
        '<g transform="translate(13.8,13.8) scale(.6) rotate(-12 12 12)" fill="#FFF7EE">' +
          '<path d="M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' +
        '</g></g></svg>';
  }
  function logoHTML() {
    return '<a class="bn-logo" href="index.html" aria-label="بوردنق باس">' +
      '<img class="bn-mark" src="assets/logo.png?v=11" alt="BoardingPass Logo" ' +
        'onerror="this.style.display=\'none\'"/>' +
      '<span class="bn-logo-tx"><span class="bn-logo-ar">بوردنق باس</span><span class="bn-logo-en">BoardingPass</span></span></a>';
  }

  var _scrim = null;
  function openDrawer() { if (_scrim) _scrim.classList.add('open'); }
  function closeDrawer() { if (_scrim) _scrim.classList.remove('open'); }

  function buildHeader() {
    if (document.getElementById('bn-header')) return;
    var navLinks = SECTIONS.map(function (s) {
      return '<a href="' + s.file + '"' + (s.key === section ? ' class="is-active"' : '') + '>' +
        icon(s.icon) + '<span>' + s.ar + '</span></a>';
    }).join('');

    var hd = document.createElement('header');
    hd.id = 'bn-header';
    hd.innerHTML =
      '<div class="bn-hd">' +
        logoHTML() +
        '<nav class="bn-mainnav">' + navLinks + '</nav>' +
        '<div class="bn-hd-actions">' +
          '<button class="bn-icon" data-act="theme" title="الوضع الليلي" aria-label="الوضع الليلي">' + icon('dark_mode') + '</button>' +
          '<a class="bn-icon bn-profile" href="index.html?auth=1" title="حسابي" aria-label="تسجيل الدخول / حسابي">' + icon('account_circle') + '</a>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(hd, document.body.firstChild);
    // ربط مباشر مضمون للبرغر (إضافة إلى التفويض)
    var burger = hd.querySelector('.bn-burger');
    if (burger) burger.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
  }

  function buildDrawer() {
    if (document.querySelector('.bn-drawer-scrim')) return;
    var scrim = document.createElement('div'); scrim.className = 'bn-drawer-scrim';
    var links = SECTIONS.map(function (s) {
      return '<a href="' + s.file + '"' + (s.key === section ? ' class="is-active"' : '') + '>' +
        icon(s.icon) + '<span>' + s.ar + '</span></a>';
    }).join('');
    var drawer = document.createElement('aside'); drawer.className = 'bn-drawer';
    drawer.innerHTML =
      '<div class="bn-drawer__head">' +
        logoHTML() +
        '<button class="bn-icon" data-act="close-menu" aria-label="إغلاق">' + icon('close') + '</button>' +
      '</div>' +
      links +
      '<a href="mytrips.html"' + (section === 'mytrips' ? ' class="is-active"' : '') + '>' + icon('luggage') + '<span>رحلاتي</span></a>' +
      '<a class="bn-drawer__cta bn-cta" href="' + NEW_TRIP + '" style="justify-content:center">' + icon('add') + '<span>إنشاء رحلة جديدة</span></a>';
    scrim.appendChild(drawer);           // الدرج داخل الغطاء
    document.body.appendChild(scrim);
    _scrim = scrim;

    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeDrawer(); });
    drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeDrawer); });
    var closeBtn = drawer.querySelector('[data-act="close-menu"]');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); closeDrawer(); });
    // تفويض احتياطي
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-act]');
      if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'menu') openDrawer();
      else if (a === 'close-menu') closeDrawer();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  function buildTabBar() {
    if (document.querySelector('.bn-tabbar')) return;
    var bar = document.createElement('nav'); bar.className = 'bn-tabbar'; bar.setAttribute('aria-label', 'التنقل');
    var inner = document.createElement('div'); inner.className = 'bn-tabbar__inner';
    TABS.forEach(function (t) {
      var active = (t.key === section) || (t.key === 'home' && section === 'home');
      var a = document.createElement('a');
      a.href = t.file;
      if (t.cta) {
        a.className = 'bn-tab bn-tab--cta';
        a.innerHTML = '<span class="bn-tab__fab">' + icon(t.icon) + '</span><span class="bn-tab__label">' + t.ar + '</span>';
      } else {
        a.className = 'bn-tab' + (active ? ' is-active' : '');
        a.innerHTML = icon(t.icon) + '<span class="bn-tab__label">' + t.ar + '</span>';
      }
      inner.appendChild(a);
    });
    bar.appendChild(inner);
    document.body.appendChild(bar);
  }

  // زر الوضع الليلي (يفوّض للصفحة إن وُجد زرها، وإلا يتولّاه بنفسه)
  function wireTheme() {
    try { if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act="theme"]');
      if (!t) return;
      var pageBtn = document.getElementById('themeToggleBtn') || document.getElementById('theme-toggle');
      if (pageBtn && pageBtn !== t) { pageBtn.click(); syncThemeIcon(); return; }
      var dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e2) {}
      syncThemeIcon();
    });
    syncThemeIcon();
  }
  function syncThemeIcon() {
    var dark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('#bn-header [data-act="theme"] .material-symbols-outlined')
      .forEach(function (i) { i.textContent = dark ? 'light_mode' : 'dark_mode'; });
  }

  // ===== زر اللغة: يفوّض لزر الترجمة الخاص بالصفحة =====
  function findPageLangToggle() {
    var t = document.getElementById('langToggle') || document.getElementById('lang-toggle');
    if (t) return t;
    var els = document.querySelectorAll('button, a');
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest('#bn-header') || els[i].closest('.bn-drawer')) continue;
      var tx = (els[i].textContent || '').trim();
      if (tx === 'EN' || tx === 'AR') return els[i];
    }
    return null;
  }
  function wireLang() {
    var btn = document.querySelector('#bn-header [data-act="lang"]');
    if (!btn) return;
    var hasI18n = !!document.querySelector('[data-i18n]');
    var pageToggle = findPageLangToggle();
    if (!hasI18n || !pageToggle) { btn.style.display = 'none'; return; }  // لا ترجمة على هذه الصفحة
    function sync() { btn.textContent = (document.documentElement.lang === 'en') ? 'AR' : 'EN'; }
    sync();
    btn.addEventListener('click', function () { pageToggle.click(); setTimeout(sync, 60); });
  }

  // ===== الملف/الحساب: يفتح نافذة تسجيل الدخول والتسجيل إن وُجدت =====
  function wireProfile() {
    var pf = document.querySelector('#bn-header .bn-profile');
    if (!pf) return;
    var authBtn = document.getElementById('profile-btn'); // مُشغّل نافذة الدخول (في الصفحة الرئيسية)
    if (authBtn) {
      pf.addEventListener('click', function (e) { e.preventDefault(); authBtn.click(); });
    }
    // فتح النافذة تلقائياً عند القدوم برابط ?auth=1
    if (/[?&]auth=1/.test(location.search)) {
      setTimeout(function () { var a = document.getElementById('profile-btn'); if (a) a.click(); }, 300);
    }
  }

  function buildFooter() {
    if (document.getElementById('bn-footer')) return;
    var f = document.createElement('footer');
    f.id = 'bn-footer';
    f.innerHTML =
      '<div class="bn-ft-in">' +
        logoHTML() +
        '<nav class="bn-ft-links"><a href="#">سياسة الخصوصية</a><a href="#">شروط الخدمة</a><a href="#">مركز المساعدة</a></nav>' +
        '<div class="bn-ft-cp">© 2025 بوردنق باس · BoardingPass — جميع الحقوق محفوظة.</div>' +
      '</div>';
    document.body.appendChild(f);
  }

  function init() {
    try { buildDrawer(); } catch (e) {}
    try { buildHeader(); } catch (e) {}
    try { buildTabBar(); } catch (e) {}
    try { buildFooter(); } catch (e) {}
    try { wireTheme(); } catch (e) {}
    try { wireLang(); } catch (e) {}
    try { wireProfile(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
