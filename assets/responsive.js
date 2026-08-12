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

  var _scrim = null, _drawer = null;
  function openDrawer() { if (_scrim) _scrim.classList.add('open'); if (_drawer) _drawer.classList.add('open'); }
  function closeDrawer() { if (_scrim) _scrim.classList.remove('open'); if (_drawer) _drawer.classList.remove('open'); }

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
        '<a class="bn-logo" href="index.html">' + icon('flight') + '<span>بوردنق</span></a>' +
        '<nav class="bn-mainnav">' + navLinks + '</nav>' +
        '<div class="bn-hd-actions">' +
          '<a class="bn-cta bn-header-cta" href="' + NEW_TRIP + '">' + icon('add') + '<span class="bn-cta-txt">إنشاء رحلة</span></a>' +
          '<button class="bn-icon" data-act="theme" title="الوضع الليلي" aria-label="الوضع الليلي">' + icon('dark_mode') + '</button>' +
          '<a class="bn-icon" href="mytrips.html" title="رحلاتي" aria-label="رحلاتي">' + icon('account_circle') + '</a>' +
          '<button class="bn-icon bn-burger" data-act="menu" aria-label="القائمة">' + icon('menu') + '</button>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(hd, document.body.firstChild);
    // ربط مباشر مضمون للبرغر (إضافة إلى التفويض)
    var burger = hd.querySelector('.bn-burger');
    if (burger) burger.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
  }

  function buildDrawer() {
    if (document.querySelector('.bn-drawer')) return;
    var scrim = document.createElement('div'); scrim.className = 'bn-drawer-scrim';
    var links = SECTIONS.map(function (s) {
      return '<a href="' + s.file + '"' + (s.key === section ? ' class="is-active"' : '') + '>' +
        icon(s.icon) + '<span>' + s.ar + '</span></a>';
    }).join('');
    var drawer = document.createElement('aside'); drawer.className = 'bn-drawer';
    drawer.innerHTML =
      '<div class="bn-drawer__head">' +
        '<a class="bn-logo" href="index.html">' + icon('flight') + '<span>بوردنق</span></a>' +
        '<button class="bn-icon" data-act="close-menu" aria-label="إغلاق">' + icon('close') + '</button>' +
      '</div>' +
      links +
      '<a href="mytrips.html"' + (section === 'mytrips' ? ' class="is-active"' : '') + '>' + icon('luggage') + '<span>رحلاتي</span></a>' +
      '<a class="bn-drawer__cta bn-cta" href="' + NEW_TRIP + '" style="justify-content:center">' + icon('add') + '<span>إنشاء رحلة جديدة</span></a>';
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    _scrim = scrim; _drawer = drawer;

    scrim.addEventListener('click', closeDrawer);
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

  function init() {
    try { buildDrawer(); } catch (e) {}
    try { buildHeader(); } catch (e) {}
    try { buildTabBar(); } catch (e) {}
    try { wireTheme(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
