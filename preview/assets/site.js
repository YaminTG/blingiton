/* Blingiton preview — shared behaviour: chrome, language, bag, metal switch, name preview. */
(() => {
  const BL = window.BL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- icons (Lucide-style strokes) ---------- */
  const P = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bag: '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
    sparkle: '<path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13 7 4 4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor"/>',
    whatsapp: '<path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z"/><path d="M9 9.5c.3 2.6 2.4 4.8 5.2 5.3l1.1-1.3-1.8-1-.8.8c-1-.4-1.9-1.3-2.3-2.3l.8-.8-1-1.8z"/>',
  };
  const icon = (n, extra = '') => `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

  /* ---------- language ---------- */
  const CHROME_AR = {
    skip: 'انتقل إلى المحتوى',
    an1: 'ادفع بالبطاقة أو نقداً عند الاستلام', an2: 'شحن DHL Express لكل العالم', an3: 'القطع المخصّصة جاهزة خلال 4 أيام',
    navShop: 'المتجر', navNames: 'قطع بالأسماء', navEarrings: 'أقراط', navRings: 'خواتم', navCustom: 'طلبات خاصة',
    menu: 'القائمة', search: 'بحث', home: 'الرئيسية',
    ftTag: 'مجوهرات فضة 925 خالدة ستحبها للأبد. تُصنع في الأردن، وتصلك مغلّفة بالوردي.',
    ftShop: 'المتجر', ftHelp: 'المساعدة', ftContact: 'تواصل معنا',
    ftLetters: 'الحروف', ftBracelets: 'أساور', ftDelivery: 'التوصيل والإرجاع', ftCare: 'العناية بالفضة', ftTrack: 'تتبّع طلبك',
    ftJordan: 'الأردن', ftSmall: '© 2026 Blingiton · تصميم تجريبي، المتجر ليس فعّالاً بعد.',
    wa: 'اطلب عبر واتساب',
  };
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const t = (k, vars) => {
    let s = (BL.t[lang()] && BL.t[lang()][k]) || BL.t.en[k] || k;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b);
    return s;
  };
  const pName = (p) => lang() === 'ar' ? p.ar : p.en;
  const money = (n) => `${n} ${t('jod')}`;

  function applyLang(l) {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    const AR = Object.assign({}, CHROME_AR, window.PAGE_AR || {});
    $$('[data-i18n]').forEach((el) => {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      const ar = AR[el.dataset.i18n];
      el.innerHTML = l === 'ar' && ar ? ar : el.dataset.en;
    });
    $$('[data-i18n-ph]').forEach((el) => {
      if (el.dataset.enPh === undefined) el.dataset.enPh = el.placeholder;
      const ar = AR[el.dataset.i18nPh];
      el.placeholder = l === 'ar' && ar ? ar : el.dataset.enPh;
    });
    $$('[data-i18n-label]').forEach((el) => {
      if (el.dataset.enLabel === undefined) el.dataset.enLabel = el.getAttribute('aria-label') || '';
      const ar = AR[el.dataset.i18nLabel];
      el.setAttribute('aria-label', l === 'ar' && ar ? ar : el.dataset.enLabel);
    });
    const lb = $('#lang-btn');
    if (lb) { lb.textContent = l === 'ar' ? 'English' : 'عربي'; lb.lang = l === 'ar' ? 'en' : 'ar'; lb.setAttribute('aria-label', l === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'); }
    if (window.PAGE_TITLE) document.title = window.PAGE_TITLE[l];
    store.set('bl-lang', l);
    renderBag();
    document.dispatchEvent(new CustomEvent('bl:lang', { detail: l }));
  }

  /* ---------- chrome ---------- */
  function renderChrome() {
    const active = document.body.dataset.page;
    const cur = (p) => active === p ? ' aria-current="page"' : '';
    const top = $('#chrome-top');
    if (top) top.outerHTML = `
      <a class="skip" href="#main" data-i18n="skip">Skip to content</a>
      <div class="announce"><div class="wrap">
        <span data-i18n="an1">Pay by card or cash on delivery</span>
        <span class="wide" data-i18n="an2">DHL Express worldwide</span>
        <span class="wide" data-i18n="an3">Custom pieces ready in 4 days</span>
      </div></div>
      <header class="header"><div class="wrap">
        <button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="Menu" data-i18n-label="menu" aria-controls="menu" aria-expanded="false">${icon('menu')}</button>
        <a class="brand" href="./" aria-label="Blingiton home"><img src="img/logo.png" alt="" width="52" height="52"><span>BLINGITON</span></a>
        <nav class="nav" aria-label="Main">
          <a href="shop"${cur('shop')} data-i18n="navShop">Shop</a>
          <a href="shop?cat=names" data-i18n="navNames">Name pieces</a>
          <a href="shop?cat=earrings" data-i18n="navEarrings">Earrings</a>
          <a href="shop?cat=rings" data-i18n="navRings">Rings</a>
          <a href="./#custom" data-i18n="navCustom">Custom orders</a>
        </nav>
        <div class="tools">
          <button class="lang-btn" id="lang-btn" type="button">عربي</button>
          <a class="icon-btn" href="shop" aria-label="Search" data-i18n-label="search">${icon('search')}</a>
          <button class="icon-btn" id="bag-btn" type="button" aria-controls="bag" aria-expanded="false">${icon('bag')}<span class="count" id="bag-count" data-n="0" aria-hidden="true">0</span></button>
        </div>
      </div></header>`;

    const bottom = $('#chrome-bottom');
    if (bottom) bottom.outerHTML = `
      <footer class="footer"><div class="wrap">
        <div>
          <div class="footer-brand"><img src="img/logo.png" alt="" width="64" height="64"><strong style="font-size:20px;letter-spacing:.08em;color:#fff">BLINGITON</strong></div>
          <p style="margin-top:14px;max-width:34ch" data-i18n="ftTag">Timeless 925 sterling silver you’ll love forever. Made in Jordan, wrapped in pink.</p>
        </div>
        <div><h3 data-i18n="ftShop">Shop</h3><ul>
          <li><a href="shop?cat=names" data-i18n="navNames">Name pieces</a></li>
          <li><a href="shop?cat=letters" data-i18n="ftLetters">Letters</a></li>
          <li><a href="shop?cat=bracelets" data-i18n="ftBracelets">Bracelets</a></li>
          <li><a href="shop?cat=earrings" data-i18n="navEarrings">Earrings</a></li>
        </ul></div>
        <div><h3 data-i18n="ftHelp">Help</h3><ul>
          <li><a href="#" data-i18n="ftDelivery">Delivery &amp; returns</a></li>
          <li><a href="#" data-i18n="ftCare">Silver care</a></li>
          <li><a href="#" data-i18n="ftTrack">Track your order</a></li>
          <li><a href="./#custom" data-i18n="navCustom">Custom orders</a></li>
        </ul></div>
        <div><h3 data-i18n="ftContact">Contact</h3><ul>
          <li><a href="https://wa.me/${BL.whatsapp}" target="_blank" rel="noopener">WhatsApp +962 79 638 4424</a></li>
          <li><a href="${BL.instagram}" target="_blank" rel="noopener">Instagram @blingitonnnn</a></li>
          <li data-i18n="ftJordan">Jordan</li>
        </ul></div>
        <p class="small" data-i18n="ftSmall">© 2026 Blingiton · Preview design, not a live shop yet.</p>
      </div></footer>
      <a class="wa" href="https://wa.me/${BL.whatsapp}" target="_blank" rel="noopener" aria-label="Order on WhatsApp" data-i18n-label="wa">${icon('whatsapp')}<span data-i18n="wa">Order on WhatsApp</span></a>
      <div class="scrim" id="scrim" hidden></div>
      <aside class="drawer left" id="menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" hidden>
        <div class="drawer-head"><h2 id="menu-title" data-i18n="menu">Menu</h2><button class="icon-btn" type="button" data-close aria-label="Close" data-i18n-label="close">${icon('x')}</button></div>
        <nav class="drawer-nav" aria-label="Menu">
          <a href="./" data-i18n="home">Home</a>
          <a href="shop" data-i18n="navShop">Shop</a>
          <a href="shop?cat=names" data-i18n="navNames">Name pieces</a>
          <a href="shop?cat=earrings" data-i18n="navEarrings">Earrings</a>
          <a href="shop?cat=rings" data-i18n="navRings">Rings</a>
          <a href="./#custom" data-i18n="navCustom">Custom orders</a>
        </nav>
      </aside>
      <aside class="drawer" id="bag" role="dialog" aria-modal="true" aria-labelledby="bag-title" hidden>
        <div class="drawer-head"><h2 id="bag-title"></h2><button class="icon-btn" type="button" data-close>${icon('x')}</button></div>
        <div class="drawer-body" id="bag-body"></div>
        <div class="drawer-foot" id="bag-foot"></div>
      </aside>
      <div class="toast" id="toast" role="status" aria-live="polite"><img src="img/logo.png" alt=""><span id="toast-text"></span></div>`;
  }

  /* ---------- drawers ---------- */
  let opener = null;
  function openDrawer(id) {
    const d = document.getElementById(id), scrim = $('#scrim');
    opener = document.activeElement;
    d.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => { d.classList.add('open'); scrim.classList.add('open'); });
    document.documentElement.style.overflow = 'hidden';
    $$(`[aria-controls="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    setTimeout(() => { const f = d.querySelector('[data-close]'); if (f) f.focus(); }, 60);
  }
  function closeDrawers() {
    $$('.drawer.open').forEach((d) => {
      d.classList.remove('open');
      $$(`[aria-controls="${d.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
      setTimeout(() => { d.hidden = true; }, 300);
    });
    const scrim = $('#scrim');
    if (scrim) { scrim.classList.remove('open'); setTimeout(() => { scrim.hidden = true; }, 250); }
    document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  function trapFocus(e) {
    const d = $('.drawer.open');
    if (!d) return;
    if (e.key === 'Escape') { closeDrawers(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('a[href], button:not([disabled]), input, select, textarea', d).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- bag ---------- */
  const cart = () => store.get('bl-cart', []);
  const saveCart = (c) => { store.set('bl-cart', c); renderBag(); };
  const product = (id) => BL.products.find((p) => p.id === Number(id));

  function optionLines(it) {
    const L = [];
    if (it.name) L.push(`<b>${t('nameLine')}:</b> <bdi>${esc(it.name)}</bdi>`);
    if (it.style) L.push(`<b>${t('styleLine')}:</b> ${t(it.style)}`);
    if (it.finish) L.push(`<b>${t('finishLine')}:</b> ${t(it.finish)}`);
    if (it.chain) L.push(`<b>${t('chainLine')}:</b> ${it.chain} ${t('cm')}`);
    if (it.stone !== undefined && it.stone !== null) { const s = BL.stones[it.stone]; L.push(`<b>${t('stoneLine')}:</b> ${lang() === 'ar' ? s.ar : s.en}`); }
    if (it.gift) L.push(t('giftLine'));
    if (it.note) L.push(`<b>${t('noteLine')}:</b> “${esc(it.note)}”`);
    return L.join('<br>');
  }

  function renderBag() {
    const body = $('#bag-body'); if (!body) return;
    const c = cart();
    const n = c.reduce((s, i) => s + i.qty, 0);
    const count = $('#bag-count');
    count.textContent = n; count.dataset.n = n;
    const bb = $('#bag-btn');
    bb.setAttribute('aria-label', `${t('bagTitle')}, ${n === 1 ? t('item') : t('items', { n })}`);
    $('#bag-title').textContent = t('bagTitle');
    const closeBtn = $('#bag [data-close]'); closeBtn.setAttribute('aria-label', t('close'));
    if (!c.length) {
      body.innerHTML = `<div class="empty"><img src="img/logo.png" alt="" width="96" height="96"><p>${t('bagEmpty')}</p><a class="btn btn-outline" href="shop">${t('shopNow')}</a></div>`;
      $('#bag-foot').innerHTML = '';
      return;
    }
    body.innerHTML = c.map((it, i) => {
      const p = product(it.id);
      return `<div class="line-item">
        <img src="${p.img}" alt="" width="76" height="76" loading="lazy">
        <div>
          <div class="li-name">${pName(p)}</div>
          <div class="li-meta">${optionLines(it)}</div>
          <div class="li-row">
            <div class="stepper"><button type="button" data-dec="${i}" aria-label="${t('decrease')}">−</button><span aria-label="${t('qty')}">${it.qty}</span><button type="button" data-inc="${i}" aria-label="${t('increase')}">+</button></div>
            <span class="price">${money(p.price * it.qty)}</span>
          </div>
          <button class="link-btn" type="button" data-rm="${i}">${t('remove')}</button>
        </div>
      </div>`;
    }).join('');
    const sub = c.reduce((s, it) => s + product(it.id).price * it.qty, 0);
    $('#bag-foot').innerHTML = `<div class="sum-row"><span>${t('subtotal')}</span><span class="price">${money(sub)}</span></div>
      <a class="btn btn-primary btn-block" href="checkout">${t('checkout')} ${icon('arrow', 'flip')}</a>`;
  }

  function addToBag(item, { open = false } = {}) {
    const c = cart();
    const same = c.find((x) => JSON.stringify({ ...x, qty: 0 }) === JSON.stringify({ ...item, qty: 0 }));
    if (same) same.qty += 1; else c.push({ ...item, qty: 1 });
    saveCart(c);
    const count = $('#bag-count');
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    toast(t('added'));
    if (open) openDrawer('bag');
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    $('#toast-text').textContent = msg;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- metal ---------- */
  function setMetal(m) {
    document.body.dataset.metal = m;
    store.set('bl-metal', m);
    $$('[data-metal]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.metal === m)));
    document.dispatchEvent(new CustomEvent('bl:metal', { detail: m }));
  }
  function metalSwitch() {
    return `<div class="metal" role="radiogroup" aria-label="Finish">
      <button type="button" role="radio" data-metal="silver" aria-checked="true"><span class="dot"></span><span>${t('silver')}</span></button>
      <button type="button" role="radio" data-metal="gold" aria-checked="false"><span class="dot gold"></span><span>${t('gold')}</span></button>
    </div>`;
  }

  /* ---------- name preview: a nameplate necklace drawn on canvas ---------- */
  const METALS = {
    silver: { stops: ['#FFFFFF', '#E4E3E8', '#A2A1AA', '#F1F1F4', '#C3C2CA'], edge: '#6E6D77', link: '#9D9CA5', shine: '#FAFAFC', ring: '#8C8B94' },
    gold: { stops: ['#FFF8DF', '#F2D27F', '#B4862F', '#F7E2A4', '#D1A24A'], edge: '#8B6420', link: '#C49A45', shine: '#FFF3CC', ring: '#B38631' },
  };
  const FONTS = {
    script: { en: ['', 400, '"Great Vibes", cursive'], ar: ['', 700, '"Aref Ruqaa", serif'] },
    classic: { en: ['italic', 600, '"Playfair Display", serif'], ar: ['', 700, 'Amiri, serif'] },
    modern: { en: ['', 800, '"Nunito Sans", sans-serif'], ar: ['', 700, '"Reem Kufi", sans-serif'] },
    kufi: { en: ['', 800, '"Noto Kufi Arabic", sans-serif'], ar: ['', 800, '"Noto Kufi Arabic", sans-serif'] },
  };
  const fontStr = (f, px) => `${f[0]} ${f[1]} ${px}px ${f[2]}`.trim();

  // opts.metal forces a finish (used by the order unboxing); otherwise the site-wide silver/gold choice is used
  function plate(el, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    el.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const nameEl = el.querySelector('.name');
    let stoneIdx = null;

    // points along a quadratic curve, evenly spaced by arc length, with their direction
    function curvePoints(p0, p1, p2, gap) {
      const N = 240, pts = [];
      let prev = p0, len = 0, next = 0;
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
        const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
        len += Math.hypot(x - prev[0], y - prev[1]);
        if (len >= next) {
          const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
          const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
          pts.push([x, y, Math.atan2(dy, dx)]);
          next += gap;
        }
        prev = [x, y];
      }
      return pts;
    }

    // cable chain: alternating flat and edge-on oval links
    function drawChain(p0, p1, p2, m) {
      const pts = curvePoints(p0, p1, p2, 5.2);
      ctx.save();
      ctx.shadowColor = 'rgba(78,15,42,.25)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
      pts.forEach(([x, y, a], i) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.4, i % 2 ? 1.05 : 2.2, 0, 0, Math.PI * 2);
        ctx.lineWidth = 1.35; ctx.strokeStyle = m.link; ctx.stroke();
        ctx.restore();
      });
      ctx.restore();
      pts.forEach(([x, y, a], i) => {
        if (i % 2) return;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2.2, 0, Math.PI * 1.1, Math.PI * 1.6);
        ctx.lineWidth = 0.8; ctx.strokeStyle = m.shine; ctx.stroke();
        ctx.restore();
      });
    }

    function ring(x, y, m) {
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = m.ring; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4.2, Math.PI * 1.05, Math.PI * 1.55);
      ctx.lineWidth = 0.9; ctx.strokeStyle = m.shine; ctx.stroke();
    }

    // draw the name invisibly and scan it to find where the first and last letters really are,
    // so the rings attach to metal instead of to the edge of the text box
    const probe = document.createElement('canvas');
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    function findEnds(text, font, dir, cx, base, top, h, left, right, W, H) {
      probe.width = W; probe.height = H;
      pctx.font = font; pctx.direction = dir; pctx.textAlign = 'center'; pctx.textBaseline = 'alphabetic';
      pctx.fillStyle = '#000'; pctx.fillText(text, cx, base);
      const d = pctx.getImageData(0, 0, W, H).data;
      const y0 = Math.max(0, Math.round(top + h * 0.12)), y1 = Math.min(H - 1, Math.round(top + h * 0.72));
      const hit = (x) => {
        const ys = [];
        for (let y = y0; y <= y1; y++) if (d[(y * W + x) * 4 + 3] > 110) ys.push(y);
        return ys.length ? ys[Math.floor(ys.length / 2)] : null;
      };
      let l = null, r = null;
      for (let x = Math.max(0, Math.floor(left) - 2); x < W && x <= cx; x++) { const y = hit(x); if (y !== null) { l = [x, y]; break; } }
      for (let x = Math.min(W - 1, Math.ceil(right) + 2); x >= 0 && x >= cx; x--) { const y = hit(x); if (y !== null) { r = [x, y]; break; } }
      const fy = top + h * 0.34;
      return { l: l || [left, fy], r: r || [right, fy] };
    }

    function draw() {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const text = nameEl.textContent;
      const ar = nameEl.dataset.script === 'ar';
      const f = FONTS[nameEl.dataset.style || 'script'][ar ? 'ar' : 'en'];
      const m = METALS[(opts.metal || document.body.dataset.metal) === 'gold' ? 'gold' : 'silver'];
      ctx.direction = ar ? 'rtl' : 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // largest size that fits the available width
      const maxW = W * 0.76;
      let px = Math.min(H * 0.34, 120);
      ctx.font = fontStr(f, px);
      let mt = ctx.measureText(text);
      const inkW = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
      if (inkW > maxW) { px *= maxW / inkW; ctx.font = fontStr(f, px); mt = ctx.measureText(text); }

      // centre the actual ink of the letters where the pendant should hang
      const asc = mt.actualBoundingBoxAscent, desc = mt.actualBoundingBoxDescent;
      const cx = W / 2 + (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight) / 2;
      const base = H * 0.56 + (asc - desc) / 2;
      const left = cx - mt.actualBoundingBoxLeft, right = cx + mt.actualBoundingBoxRight;
      const top = base - asc;

      // jump rings sit on the real first and last strokes of the name, then the chain runs up from them
      const ends = findEnds(text, ctx.font, ctx.direction, cx, base, top, asc + desc, left, right, W, H);
      const off = 3;
      const lx = ends.l[0] - off, ly = ends.l[1], rx = ends.r[0] + off, ry = ends.r[1];
      const spread = Math.max(W * 0.18, 40);
      const sl = Math.max(8, lx - spread), sr = Math.min(W - 8, rx + spread);
      drawChain([sl, -6], [sl + spread * 0.25, ly * 0.78], [lx - off, ly], m);
      drawChain([sr, -6], [sr - spread * 0.25, ry * 0.78], [rx + off, ry], m);

      // the name: soft drop shadow, a darker edge for thickness, then the polished face
      const edge = Math.max(1, px * 0.018);
      const grad = ctx.createLinearGradient(0, top, 0, top + asc + desc);
      [0, 0.32, 0.5, 0.66, 1].forEach((o, i) => grad.addColorStop(o, m.stops[i]));
      ctx.save();
      ctx.shadowColor = 'rgba(78,15,42,.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
      ctx.fillStyle = m.edge; ctx.fillText(text, cx, base + edge);
      ctx.restore();
      ctx.fillStyle = m.edge; ctx.fillText(text, cx, base + edge);
      ctx.fillStyle = grad; ctx.fillText(text, cx, base);

      ring(lx, ly, m);
      ring(rx, ry, m);

      // birthstone set beside the end of the name
      if (stoneIdx !== null) {
        const c = BL.stones[stoneIdx].c;
        const r = 6.5;
        const gx = ar ? lx : rx, gy = (ar ? ly : ry) + 17;
        ctx.beginPath(); ctx.arc(gx, gy, r + 2, 0, Math.PI * 2); ctx.fillStyle = m.ring; ctx.fill();
        const g = ctx.createRadialGradient(gx - 2, gy - 2, 1, gx, gy, r);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, c); g.addColorStop(1, c);
        ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      }
    }

    function redraw() {
      draw();
      if (document.fonts && document.fonts.load) {
        const f = FONTS[nameEl.dataset.style || 'script'][nameEl.dataset.script === 'ar' ? 'ar' : 'en'];
        document.fonts.load(fontStr(f, 64), nameEl.textContent).then(draw, () => {});
      }
    }
    const api = {
      set({ name, style, stone }) {
        if (name !== undefined) {
          const v = name.trim() || nameEl.dataset.sample;
          nameEl.textContent = v;
          nameEl.dataset.script = /[؀-ۿ]/.test(v) ? 'ar' : 'en';
        }
        if (style) nameEl.dataset.style = style;
        if (stone !== undefined) stoneIdx = stone;
        redraw();
      },
      draw: redraw,
    };
    nameEl.dataset.sample = nameEl.textContent;
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(el);
    else window.addEventListener('resize', draw);
    document.addEventListener('bl:metal', draw);
    if (document.fonts) document.fonts.ready.then(draw);
    redraw();
    return api;
  }

  /* ---------- product card ---------- */
  function cardHTML(p) {
    const tag = p.personal ? `<span class="card-tag">${t('personalise')}</span>` : '';
    const add = p.personal ? '' : `<button class="card-add" type="button" data-add="${p.id}" aria-label="${esc(t('addNamed', { name: pName(p) }))}">${icon('plus')}</button>`;
    return `<article class="card">
      <div class="card-img"><img src="${p.img}" alt="${esc(pName(p))}" loading="lazy" width="594" height="594">${tag}</div>
      <h3 class="card-name"><a class="card-link" href="product?id=${p.id}"><span class="sr-only">${esc(pName(p))}</span></a>${esc(pName(p))}</h3>
      <div class="card-row"><span class="price">${money(p.price)}</span>${add}</div>
    </article>`;
  }

  /* ---------- boot ---------- */
  renderChrome();
  const params = new URLSearchParams(location.search);
  const startLang = params.get('lang') === 'ar' || params.get('lang') === 'en' ? params.get('lang') : store.get('bl-lang', 'en');
  document.body.dataset.metal = store.get('bl-metal', 'silver');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-add]');
    if (a) { addToBag({ id: Number(a.dataset.add) }); return; }
    if (e.target.closest('#bag-btn')) { openDrawer('bag'); return; }
    if (e.target.closest('#menu-btn')) { openDrawer('menu'); return; }
    if (e.target.closest('[data-close]') || e.target.id === 'scrim') { closeDrawers(); return; }
    if (e.target.closest('#lang-btn')) { applyLang(lang() === 'ar' ? 'en' : 'ar'); return; }
    const m = e.target.closest('[data-metal]');
    if (m) { setMetal(m.dataset.metal); return; }
    const c = cart();
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), rm = e.target.closest('[data-rm]');
    if (inc) { c[inc.dataset.inc].qty++; saveCart(c); }
    if (dec) { const i = dec.dataset.dec; c[i].qty--; if (c[i].qty < 1) c.splice(i, 1); saveCart(c); }
    if (rm) { c.splice(rm.dataset.rm, 1); saveCart(c); }
  });
  document.addEventListener('keydown', trapFocus);
  $$('.drawer-nav a').forEach((a) => a.addEventListener('click', () => closeDrawers()));

  window.BLX = { $, $$, t, esc, icon, money, pName, product, cardHTML, addToBag, cart, saveCart, plate, metalSwitch, setMetal, lang, store, optionLines, openDrawer };
  document.addEventListener('DOMContentLoaded', () => {
    applyLang(startLang);
    setMetal(document.body.dataset.metal);
  });
  // content above an anchor is rendered by script and fonts load late, so re-align once everything is in
  window.addEventListener('load', () => {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  });
})();
