(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (err) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (err) { /* private mode */ } },
  };

  // ---- silver / gold, remembered across the three looks ----
  const metalBtn = document.getElementById('metal');
  const metalLabel = document.getElementById('metal-label');
  const setMetal = (metal) => {
    document.body.dataset.metal = metal;
    if (!metalBtn) return;
    metalBtn.setAttribute('aria-pressed', String(metal === 'gold'));
    metalLabel.textContent = metal === 'gold' ? 'Gold' : 'Silver';
  };
  setMetal(store.get('bl-metal') === 'gold' ? 'gold' : 'silver');
  if (metalBtn) {
    metalBtn.addEventListener('click', () => {
      const metal = document.body.dataset.metal === 'gold' ? 'silver' : 'gold';
      setMetal(metal);
      store.set('bl-metal', metal);
    });
  }

  // ---- light engine: one light source shared by every .lit element ----
  const lit = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? lit.add(e.target) : lit.delete(e.target);
  }, { rootMargin: '120px' });
  document.querySelectorAll('.lit').forEach((el) => io.observe(el));

  let tx = innerWidth * 0.68, ty = innerHeight * 0.4, cx = tx, cy = ty;
  let lastInput = -Infinity, tilt = null;
  const point = (x, y) => { tx = x; ty = y; lastInput = performance.now(); };
  addEventListener('pointermove', (e) => point(e.clientX, e.clientY), { passive: true });
  addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });

  function frame(now) {
    const active = now - lastInput < 2000;
    if (tilt) {
      tx = innerWidth * clamp(0.5 + tilt.g / 45, 0, 1);
      ty = innerHeight * clamp(0.5 + (tilt.b - 45) / 45, 0, 1);
    } else if (!active && !reduce) {
      tx = innerWidth * (0.5 + 0.38 * Math.sin(now / 3200));
      ty = innerHeight * (0.45 + 0.3 * Math.sin(now / 2400 + 1.3));
    }
    const k = tilt ? 0.2 : active ? 0.35 : 0.04;
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    for (const el of lit) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--lx', (cx - r.left).toFixed(1) + 'px');
      el.style.setProperty('--ly', (cy - r.top).toFixed(1) + 'px');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- tilt the phone to move the light ----
  const tiltBtn = document.getElementById('tilt');
  const onTilt = (e) => { if (e.gamma != null) tilt = { g: e.gamma, b: e.beta }; };
  if (tiltBtn && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches) {
    tiltBtn.hidden = false;
    tiltBtn.addEventListener('click', async () => {
      if (tiltBtn.getAttribute('aria-pressed') === 'true') {
        removeEventListener('deviceorientation', onTilt);
        tilt = null;
        tiltBtn.setAttribute('aria-pressed', 'false');
        return;
      }
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const state = await DeviceOrientationEvent.requestPermission();
          if (state !== 'granted') { tiltBtn.hidden = true; return; }
        }
      } catch (err) {
        tiltBtn.hidden = true;
        return;
      }
      addEventListener('deviceorientation', onTilt);
      tiltBtn.setAttribute('aria-pressed', 'true');
    });
  }

  // ---- live name previews ----
  const arabic = /[؀-ۿ]/;
  document.querySelectorAll('[data-name-input]').forEach((input) => {
    const out = document.getElementById(input.dataset.nameInput);
    const sample = out.textContent;
    const update = () => {
      out.textContent = input.value.trim() || sample;
      out.dataset.script = arabic.test(out.textContent) ? 'ar' : 'en';
    };
    input.addEventListener('input', update);
    update();
  });
})();
