/* =========================================================
   بوردنق / Boarding — طبقة الاستجابة (تنقّل الجوال + الروابط)
   - يربط روابط الترويسة بين الصفحات تلقائياً
   - يبني شريط تنقّل سفلي مناسب للجوال ويبرز الصفحة الحالية
   ========================================================= */
(function () {
  'use strict';

  // خريطة الوجهات: مفتاح دلالي -> ملف الصفحة + أيقونة + عنوان
  var DEST = {
    home:            { file: 'index.html',           icon: 'home',                    ar: 'الرئيسية', en: 'Home' },
    trip:            { file: 'trip.html',             icon: 'flight',                  ar: 'الرحلة',   en: 'Trip' },
    recommendations: { file: 'recommendations.html',  icon: 'explore',                 ar: 'التوصيات', en: 'Explore' },
    expenses:        { file: 'expenses.html',         icon: 'account_balance_wallet',  ar: 'المصاريف', en: 'Expenses' },
    friends:         { file: 'friends.html',          icon: 'group',                   ar: 'الأصدقاء', en: 'Friends' }
  };
  var ORDER = ['home', 'trip', 'recommendations', 'expenses', 'friends'];

  // الصفحة الحالية
  var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (!path) path = 'index.html';
  function currentKey() {
    for (var k in DEST) if (DEST[k].file === path) return k;
    if (path === '' || path === 'index.html') return 'home';
    if (path === 'profile.html') return null;
    return 'home';
  }

  // استنتاج الوجهة من نص/سمة الرابط
  function keyFromAnchor(a) {
    var i18n = (a.getAttribute('data-i18n') || '').toLowerCase();
    if (i18n) {
      if (i18n.indexOf('home') > -1) return 'home';
      if (i18n.indexOf('trip') > -1 || i18n.indexOf('trips') > -1) return 'trip';
      if (i18n.indexOf('recommend') > -1 || i18n.indexOf('explore') > -1) return 'recommendations';
      if (i18n.indexOf('expens') > -1) return 'expenses';
      if (i18n.indexOf('friend') > -1) return 'friends';
    }
    var t = (a.textContent || '').trim();
    if (t.indexOf('الرئيسية') > -1 || /(^|\b)home\b/i.test(t)) return 'home';
    if (t.indexOf('الرحل') > -1 || /trip/i.test(t)) return 'trip';
    if (t.indexOf('التوصيات') > -1 || t.indexOf('استكشف') > -1 || /explore|recommend/i.test(t)) return 'recommendations';
    if (t.indexOf('المصاريف') > -1 || /expens/i.test(t)) return 'expenses';
    if (t.indexOf('الأصدقاء') > -1 || /friend/i.test(t)) return 'friends';
    return null;
  }

  function wireHeaderLinks() {
    // اربط روابط الترويسة (القائمة العلوية) بالصفحات الحقيقية.
    // حاويات القائمة العلوية في كل الصفحات تشترك في الصنف md:flex
    var scopes = document.querySelectorAll('header a, nav a, [class*="md:flex"] a');
    scopes.forEach(function (a) {
      if (a.closest('.bn-tabbar')) return; // تجاهل شريط الجوال
      var href = a.getAttribute('href') || '';
      if (href && href !== '#' && href.indexOf('.html') > -1) return; // مربوط مسبقاً
      var k = keyFromAnchor(a);
      if (k) a.setAttribute('href', DEST[k].file);
    });
    // الشعار -> الرئيسية
    document.querySelectorAll('header img').forEach(function (img) {
      var link = img.closest('a');
      if (link) { if (!link.getAttribute('href') || link.getAttribute('href') === '#') link.setAttribute('href', 'index.html'); }
    });
    // أيقونة الحساب -> الملف الشخصي (إن لم تكن مرتبطة بنافذة دخول)
    document.querySelectorAll('#profile-btn, .profile-icon').forEach(function (el) {
      var btn = el.closest('a') || el;
      if (btn.classList && btn.classList.contains('auth-trigger')) return; // تفتح نافذة الدخول
    });
  }

  function buildTabBar() {
    if (document.querySelector('.bn-tabbar')) return;
    var active = currentKey();
    var bar = document.createElement('nav');
    bar.className = 'bn-tabbar';
    bar.setAttribute('aria-label', 'التنقل');
    var inner = document.createElement('div');
    inner.className = 'bn-tabbar__inner';

    var isEN = document.documentElement.getAttribute('lang') === 'en';
    ORDER.forEach(function (k) {
      var d = DEST[k];
      var a = document.createElement('a');
      a.className = 'bn-tab' + (k === active ? ' is-active' : '');
      a.href = d.file;
      a.innerHTML =
        '<span class="material-symbols-outlined">' + d.icon + '</span>' +
        '<span class="bn-tab__label">' + (isEN ? d.en : d.ar) + '</span>';
      inner.appendChild(a);
    });
    bar.appendChild(inner);
    document.body.appendChild(bar);

    // حدّث تسميات الشريط عند تبديل اللغة
    var langBtn = document.getElementById('langToggle') || document.getElementById('lang-toggle');
    if (langBtn) {
      langBtn.addEventListener('click', function () {
        setTimeout(function () {
          var en = document.documentElement.getAttribute('lang') === 'en';
          bar.querySelectorAll('.bn-tab').forEach(function (a, i) {
            var lbl = a.querySelector('.bn-tab__label');
            if (lbl) lbl.textContent = en ? DEST[ORDER[i]].en : DEST[ORDER[i]].ar;
          });
        }, 50);
      });
    }
  }

  function init() {
    try { wireHeaderLinks(); } catch (e) {}
    try { buildTabBar(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
