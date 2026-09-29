/* =========================================================================
   myEggs — minigame casual
   Toque para soltar o ovo. Acerte o alvo que corre lá embaixo.
   Cabeça = 3 pontos, corpo = 1 ponto. 3 ovos perdidos = fim de jogo.
   ========================================================================= */
(() => {
  "use strict";

  // roundRect para navegadores antigos (Android WebView < 99, Safari < 16)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
  }

  const CFG = window.MYEGGS_CONFIG || {};
  const API = String(CFG.API_BASE || "").replace(/\/+$/, "");
  const LIVES = 3;
  const TOP_N = 5;

  const COLORS = {
    sky: "#9ADCF7", ink: "#1F1A3D", stage: "#2F3E9E", stageTop: "#4656C2",
    yolk: "#FFC21A", shell: "#FFF6E3", alert: "#FF5A5F", paper: "#FFFDF6",
    suit: "#4B5580", skin: "#F2B48C", cloud: "#E9F8FF", sun: "#FFE9A3",
    flags: ["#FF5A5F", "#FFC21A", "#2F3E9E", "#39B97A", "#FFFDF6"],
  };

  // ---------------------------------------------------------------- DOM
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const stage = $("#stage");
  const canvas = $("#game");
  let ctx = canvas.getContext("2d");
  const ui = {
    hud: $("#hud"), lives: $("#hud-lives"), score: $("#hud-score"),
    menu: $("#menu"), over: $("#over"), pause: $("#pause"),
    play: $("#btn-play"), again: $("#btn-again"), mute: $("#btn-mute"),
    finalScore: $("#final-score"), best: $("#final-best"),
    form: $("#name-form"), name: $("#name-input"), save: $("#btn-save"),
    status: $("#over-status"),
  };

  // ------------------------------------------------------------ Storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem("myeggs:" + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("myeggs:" + k, String(v)); } catch (e) { /* modo privado */ } },
  };

  // ------------------------------------------------------------ Helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = () => (Math.random() < 0.5 ? -1 : 1);
  const fmt = (n) => Number(n).toLocaleString("pt-BR");

  // ------------------------------------------------------------ Layout
  let W = 0, H = 0, DPR = 1;
  const L = { unit: 0, eggRx: 0, eggRy: 0, eggY: 0, tw: 0, th: 0, groundY: 0, flagsY: 0 };

  function resize() {
    const r = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    L.unit = Math.min(W, H * 0.62);
    L.eggRx = L.unit * 0.052;
    L.eggRy = L.eggRx * 1.25;
    L.flagsY = H * 0.125;
    L.eggY = H * 0.22;
    L.groundY = H * 0.88;
    L.tw = L.unit * 0.21;
    L.th = L.tw * 1.3;

    egg.x = clamp(egg.x || W / 2, eggMinX(), eggMaxX());
    if (egg.mode === "aim" || egg.mode === "idle") egg.y = L.eggY;
    tgt.x = clamp(tgt.x || W / 2, tgtMinX(), tgtMaxX());
    initClouds();
  }
  const eggMinX = () => L.eggRx + 8;
  const eggMaxX = () => W - L.eggRx - 8;
  const tgtMinX = () => L.tw * 0.55 + 6;
  const tgtMaxX = () => W - L.tw * 0.55 - 6;
  const tgtTop = () => L.groundY - L.th;

  // ------------------------------------------------------------ Sprites (opcionais)
  const sprites = {};
  Object.entries(CFG.SPRITES || {}).forEach(([key, src]) => {
    const img = new Image();
    img.onload = () => { if (img.naturalWidth > 0) sprites[key] = img; };
    img.src = src;
  });

  // ------------------------------------------------------------ Áudio sintetizado
  let actx = null;
  let muted = store.get("mute", "0") === "1";
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
    }
    if (actx && actx.state === "suspended") actx.resume();
    if (actx && voices.raw.length) decodeVoices();
    return actx;
  }
  function tone(f1, f2, dur, type, vol) {
    const a = !muted && audio(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    const a = !muted && audio(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.value = freq || 1800; g.gain.value = vol;
    s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    drop: () => tone(900, 320, 0.3, "triangle", 0.07),
    body: () => { noise(0.18, 0.35, 1600); tone(240, 120, 0.12, "square", 0.05); },
    head: () => { noise(0.22, 0.4, 2400); tone(620, 1040, 0.14, "square", 0.06); },
    miss: () => { noise(0.25, 0.25, 700); tone(170, 60, 0.3, "sine", 0.2); },
    over: () => { tone(440, 220, 0.25, "triangle", 0.1); setTimeout(() => tone(330, 110, 0.4, "triangle", 0.1), 180); },
  };
  // ------------------------------------------------------------ Vozes do alvo
  // Arquivos em CFG.AUDIO.hitVoices. Baixados no início e decodificados no
  // primeiro toque (exigência de navegador para áudio). Sorteio sem repetir
  // a mesma voz duas vezes seguidas.
  const VOICE = Object.assign(
    { hitVoices: [], delay: 0.12, volume: 0.9, mode: "cut" },
    CFG.AUDIO || {}
  );
  const voices = { raw: [], buffers: [], bag: [], last: -1, current: null, decoding: false };

  VOICE.hitVoices.forEach((src) => {
    fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => { if (ab) { voices.raw.push(ab); decodeVoices(); } })
      .catch(() => { /* sem essa voz, o jogo segue */ });
  });

  function decodeVoices() {
    if (!actx || !voices.raw.length) return;
    const pending = voices.raw.splice(0);
    pending.forEach((ab) => {
      // forma com callback: funciona também em Safari antigo
      try {
        actx.decodeAudioData(ab, (buf) => voices.buffers.push(buf), () => {});
      } catch (e) { /* formato não suportado */ }
    });
  }

  function stopVoice() {
    const cur = voices.current;
    if (!cur || !actx) return;
    voices.current = null;
    try {
      cur.gain.gain.setTargetAtTime(0, actx.currentTime, 0.015);
      cur.src.stop(actx.currentTime + 0.06);
    } catch (e) { /* já terminou */ }
  }

  function nextVoiceIndex() {
    const n = voices.buffers.length;
    if (n === 1) return 0;
    if (!voices.bag.length) {
      voices.bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [voices.bag[i], voices.bag[j]] = [voices.bag[j], voices.bag[i]];
      }
      // a próxima a sair (fim do array) não pode repetir a última tocada
      if (voices.bag[n - 1] === voices.last) [voices.bag[0], voices.bag[n - 1]] = [voices.bag[n - 1], voices.bag[0]];
    }
    return voices.bag.pop();
  }

  function playVoice() {
    if (muted || G.state !== "playing") return;
    const a = audio();
    if (!a || !voices.buffers.length) return;
    if (voices.current) {
      if (VOICE.mode === "skip") return;
      stopVoice();
    }
    const i = nextVoiceIndex();
    voices.last = i;
    const src = a.createBufferSource(), g = a.createGain();
    src.buffer = voices.buffers[i];
    g.gain.value = VOICE.volume;
    src.connect(g).connect(a.destination);
    const cur = { src, gain: g, index: i };
    src.onended = () => { if (voices.current === cur) voices.current = null; };
    voices.current = cur;
    src.start();
  }

  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* sem suporte */ } };

  function renderMute() {
    ui.mute.textContent = muted ? "🔇" : "🔊";
    ui.mute.setAttribute("aria-label", muted ? "Ligar som" : "Desligar som");
  }

  // ------------------------------------------------------------ Estado
  const G = {
    state: "menu",           // menu | playing | over
    paused: false,
    score: 0, lives: LIVES, hits: 0, streak: 0,
    playId: null, playPromise: null, submitted: false,
    shake: 0, overIn: 0, time: 0,
  };
  const egg = { x: 0, y: 0, vx: 0, vy: 0, mode: "idle", turnIn: 0, respawnIn: 0, spawnT: 1 };
  const tgt = { x: 0, dir: 1, mul: 1, flipIn: 1.5, hitT: 0, splats: [] };
  const fx = { parts: [], texts: [], ground: [] };
  let clouds = [];

  let top = [];
  let totalPlays = null;
  let lastSaved = null;
  let boardOffline = false;

  const level = () => Math.min(G.hits, 30);

  // ------------------------------------------------------------ Entidades
  function spawnEgg() {
    egg.mode = G.state === "playing" ? "aim" : "idle";
    egg.y = L.eggY;
    egg.x = rand(eggMinX(), eggMaxX());
    egg.vy = 0;
    egg.turnIn = 0;
    egg.spawnT = 0;
  }

  function updateEggAim(dt) {
    egg.turnIn -= dt;
    if (egg.turnIn <= 0) {
      const lv = level();
      if (Math.random() < 0.14) {
        egg.vx = 0;                                   // parada-surpresa
        egg.turnIn = rand(0.12, 0.35);
      } else {
        egg.vx = sign() * W * (0.32 + lv * 0.032) * rand(0.55, 1.5);
        egg.turnIn = rand(0.22, 1.05) / (1 + lv * 0.04);
      }
    }
    egg.x += egg.vx * dt;
    if (egg.x < eggMinX()) { egg.x = eggMinX(); egg.vx = Math.abs(egg.vx); }
    if (egg.x > eggMaxX()) { egg.x = eggMaxX(); egg.vx = -Math.abs(egg.vx); }
  }

  function updateTarget(dt) {
    const lv = G.state === "playing" ? level() : 4;
    const speed = W * (0.5 + lv * 0.042) * tgt.mul;
    tgt.x += tgt.dir * speed * dt;
    if (tgt.x < tgtMinX()) { tgt.x = tgtMinX(); tgt.dir = 1; }
    if (tgt.x > tgtMaxX()) { tgt.x = tgtMaxX(); tgt.dir = -1; }

    tgt.flipIn -= dt;
    if (tgt.flipIn <= 0) {
      if (lv >= 2 || G.state !== "playing") tgt.dir = sign();
      tgt.mul = rand(0.8, 1.25);
      tgt.flipIn = rand(0.7, 2.4) / (1 + lv * 0.06);
    }
    tgt.hitT = Math.max(0, tgt.hitT - dt);
    tgt.splats = tgt.splats.filter((s) => (s.t -= dt) > 0);
  }

  function dropEgg() {
    if (G.state !== "playing" || G.paused || egg.mode !== "aim") return;
    audio();
    egg.mode = "fall";
    egg.vx = 0;
    egg.vy = H * 0.35;
    sfx.drop();
  }

  const HB = Object.assign(
    { head: { cx: 0.5, cy: 0.23, rx: 0.27, ry: 0.21 }, body: { x1: 0.08, x2: 0.92, y1: 0.45, y2: 1 } },
    CFG.HITBOX || {}
  );
  const SHOW_HITBOX = /[?&]hitbox\b/.test(location.search);

  // Caixas em pixels a partir das frações do config
  function hitAreas() {
    const x0 = tgt.x - L.tw / 2, y0 = tgtTop(), w = L.tw, h = L.th;
    return {
      head: { cx: x0 + HB.head.cx * w, cy: y0 + HB.head.cy * h, rx: HB.head.rx * w, ry: HB.head.ry * h },
      body: { x1: x0 + HB.body.x1 * w, x2: x0 + HB.body.x2 * w, y1: y0 + HB.body.y1 * h, y2: y0 + HB.body.y2 * h },
    };
  }

  function hitTest() {
    const a = hitAreas(), r = L.eggRx * 0.85;
    // cabeça: elipse "engordada" pelo raio do ovo
    const dx = (egg.x - a.head.cx) / (a.head.rx + r), dy = (egg.y - a.head.cy) / (a.head.ry + r);
    if (dx * dx + dy * dy < 1) return "head";
    // corpo
    const nx = clamp(egg.x, a.body.x1, a.body.x2), ny = clamp(egg.y, a.body.y1, a.body.y2);
    if (Math.hypot(egg.x - nx, egg.y - ny) < r) return "body";
    return null;
  }

  function drawHitbox() {
    const a = hitAreas();
    ctx.save();
    ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#ff0040";
    ctx.beginPath(); ctx.ellipse(a.head.cx, a.head.cy, a.head.rx, a.head.ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#00c060";
    ctx.strokeRect(a.body.x1, a.body.y1, a.body.x2 - a.body.x1, a.body.y2 - a.body.y1);
    ctx.restore();
  }

  function updateEggFall(dt) {
    const g = H * 2.6, steps = 3, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      egg.vy += g * h;
      egg.y += egg.vy * h;
      const kind = hitTest();
      if (kind) return onHit(kind);
      if (egg.y + L.eggRy * 0.6 >= L.groundY) return onMiss();
    }
  }

  function onHit(kind) {
    const pts = kind === "head" ? 3 : 1;
    G.score += pts; G.hits += 1; G.streak += 1;
    tgt.hitT = 0.55;
    tgt.splats.push({ dx: egg.x - tgt.x, dy: egg.y - tgtTop(), t: 1.6, r: L.eggRx * rand(0.9, 1.25), seed: Math.random() * 10 });
    burst(egg.x, egg.y, 14);
    floatText(egg.x, egg.y - L.eggRy * 1.5, kind === "head" ? "Na cara! +3" : "+1", kind === "head" ? COLORS.alert : COLORS.paper, kind === "head" ? 1.25 : 1);
    (kind === "head" ? sfx.head : sfx.body)();
    setTimeout(playVoice, VOICE.delay * 1000);          // reação do alvo depois do splat
    buzz(kind === "head" ? 40 : 20);
    egg.mode = "wait"; egg.respawnIn = 0.28;
    renderHud(true);
  }

  function onMiss() {
    G.lives -= 1; G.streak = 0;
    egg.y = L.groundY - L.eggRy * 0.3;
    fx.ground.push({ x: egg.x, t: 2.2, r: L.eggRx * rand(1.1, 1.4), seed: Math.random() * 10 });
    burst(egg.x, L.groundY - 4, 10);
    floatText(egg.x, L.groundY - L.th * 0.6, "Errou", COLORS.paper, 0.9);
    sfx.miss(); buzz(90);
    G.shake = 0.25;
    renderHud(false);
    if (G.lives <= 0) { egg.mode = "dead"; G.overIn = 0.7; }
    else { egg.mode = "wait"; egg.respawnIn = 0.45; }
  }

  // ------------------------------------------------------------ Efeitos
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), s = rand(0.25, 0.7) * L.unit;
      fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(2, 5) * (L.unit / 380), t: rand(0.4, 0.8), c: Math.random() < 0.6 ? COLORS.yolk : COLORS.shell });
    }
  }
  function floatText(x, y, text, color, scale) {
    fx.texts.push({ x: clamp(x, 60, W - 60), y, text, color, scale, t: 0.9 });
  }
  function updateFx(dt) {
    fx.parts = fx.parts.filter((p) => {
      p.vy += L.unit * 2.2 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      return (p.t -= dt) > 0 && p.y < H;
    });
    fx.texts = fx.texts.filter((t) => { t.y -= L.unit * 0.18 * dt; return (t.t -= dt) > 0; });
    fx.ground = fx.ground.filter((s) => (s.t -= dt) > 0);
    G.shake = Math.max(0, G.shake - dt);
    clouds.forEach((c) => { c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w; });
  }

  function initClouds() {
    clouds = [0.16, 0.42, 0.7].map((f, i) => ({
      x: W * rand(0, 1), y: H * (0.3 + i * 0.13), w: L.unit * rand(0.2, 0.3), v: L.unit * rand(0.01, 0.025) * (i + 1), f,
    }));
  }

  // ------------------------------------------------------------ Update
  function update(dt) {
    G.time += dt;
    updateTarget(dt);
    egg.spawnT = Math.min(1, egg.spawnT + dt * 5);

    if (egg.mode === "aim" || egg.mode === "idle") updateEggAim(dt);
    else if (egg.mode === "fall") updateEggFall(dt);
    else if (egg.mode === "wait") { egg.respawnIn -= dt; if (egg.respawnIn <= 0) spawnEgg(); }
    else if (egg.mode === "dead") { G.overIn -= dt; if (G.overIn <= 0) gameOver(); }
  }

  // ------------------------------------------------------------ Desenho
  function drawBackground() {
    ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, W, H);

    // sol
    ctx.fillStyle = COLORS.sun;
    ctx.beginPath(); ctx.arc(W * 0.18, H * 0.33, L.unit * 0.13, 0, Math.PI * 2); ctx.fill();

    // nuvens
    ctx.fillStyle = COLORS.cloud;
    clouds.forEach((c) => {
      const r = c.w * 0.28;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.arc(c.x + r * 1.1, c.y - r * 0.45, r * 1.2, 0, Math.PI * 2);
      ctx.arc(c.x + r * 2.3, c.y, r * 0.95, 0, Math.PI * 2);
      ctx.rect(c.x, c.y, r * 2.3, r * 0.95);
      ctx.fill();
    });

    // bandeirinhas
    const y0 = L.flagsY, sag = H * 0.035, n = Math.max(8, Math.round(W / 38));
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, y0); ctx.quadraticCurveTo(W / 2, y0 + sag * 2, W + 4, y0); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = t * W;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
      const fw = W / n * 0.38, fh = fw * 1.5, sway = Math.sin(G.time * 2 + i) * 1.5;
      ctx.fillStyle = COLORS.flags[i % COLORS.flags.length];
      ctx.beginPath(); ctx.moveTo(x - fw, y); ctx.lineTo(x + fw, y); ctx.lineTo(x + sway, y + fh); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // palanque
    const gy = L.groundY;
    ctx.fillStyle = COLORS.stage; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = COLORS.stageTop; ctx.fillRect(0, gy, W, Math.max(6, H * 0.012));
    ctx.fillStyle = COLORS.ink; ctx.fillRect(0, gy - 2, W, 3);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 2;
    for (let x = W * 0.12; x < W; x += W * 0.2) {
      ctx.beginPath(); ctx.moveTo(x, gy + H * 0.02); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  function blob(x, y, r, seed, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    const k = 9;
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * Math.PI * 2, rr = r * (0.75 + 0.35 * Math.abs(Math.sin(seed + i * 1.7)));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  function splat(x, y, r, seed, alpha) {
    ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
    blob(x, y, r * 1.3, seed, COLORS.shell);
    blob(x, y, r * 0.6, seed + 3, COLORS.yolk);
    ctx.restore();
  }

  function drawEggShape(x, y, rx, ry) {
    ctx.save();
    ctx.lineWidth = Math.max(2.5, rx * 0.16);
    ctx.strokeStyle = COLORS.ink; ctx.fillStyle = COLORS.shell;
    ctx.beginPath();
    ctx.moveTo(x, y - ry);
    ctx.bezierCurveTo(x + rx * 1.05, y - ry, x + rx * 1.1, y + ry * 0.95, x, y + ry);
    ctx.bezierCurveTo(x - rx * 1.1, y + ry * 0.95, x - rx * 1.05, y - ry, x, y - ry);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(x - rx * 0.35, y - ry * 0.35, rx * 0.18, ry * 0.26, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEgg() {
    if (egg.mode === "wait" || egg.mode === "dead") return;
    const s = 0.4 + 0.6 * egg.spawnT;
    const rx = L.eggRx * s, ry = L.eggRy * s;
    // sombra no chão (mira)
    if (egg.mode !== "fall") {
      ctx.fillStyle = "rgba(31,26,61,.25)";
      ctx.beginPath(); ctx.ellipse(egg.x, L.groundY + 5, L.eggRx * 0.9, L.eggRx * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    }
    let stretch = 1;
    if (egg.mode === "fall") stretch = 1 + clamp(egg.vy / (H * 2.5), 0, 0.25);
    if (sprites.egg) {
      ctx.drawImage(sprites.egg, egg.x - rx, egg.y - ry * stretch, rx * 2, ry * 2 * stretch);
    } else {
      drawEggShape(egg.x, egg.y, rx / Math.sqrt(stretch), ry * stretch);
    }
  }

  function drawTargetShape(x, topY, w, h, hit, dir) {
    const lw = Math.max(2.5, w * 0.035);
    ctx.save();
    ctx.lineWidth = lw; ctx.strokeStyle = COLORS.ink; ctx.lineJoin = "round"; ctx.lineCap = "round";

    const bodyTop = topY + h * 0.44, bodyBot = topY + h, bw = w * 0.84;
    // braços
    const armUp = hit ? -h * 0.18 : 0;
    ctx.fillStyle = COLORS.suit;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.roundRect(x + s * bw * 0.5 - w * 0.07, bodyTop + h * 0.06 + armUp, w * 0.14, h * 0.36, w * 0.07);
      ctx.fill(); ctx.stroke();
    });
    // corpo (terno)
    ctx.beginPath(); ctx.roundRect(x - bw / 2, bodyTop, bw, bodyBot - bodyTop, [w * 0.22, w * 0.22, w * 0.06, w * 0.06]);
    ctx.fill(); ctx.stroke();
    // camisa + gravata
    ctx.fillStyle = COLORS.paper;
    ctx.beginPath(); ctx.moveTo(x - w * 0.16, bodyTop + lw / 2); ctx.lineTo(x + w * 0.16, bodyTop + lw / 2); ctx.lineTo(x, bodyTop + h * 0.24); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.alert;
    ctx.beginPath(); ctx.moveTo(x - w * 0.05, bodyTop + h * 0.03); ctx.lineTo(x + w * 0.05, bodyTop + h * 0.03);
    ctx.lineTo(x + w * 0.06, bodyTop + h * 0.3); ctx.lineTo(x, bodyTop + h * 0.36); ctx.lineTo(x - w * 0.06, bodyTop + h * 0.3); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // cabeça
    const hx = x, hy = topY + h * 0.23, hr = w * 0.24;
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // cabelo
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath(); ctx.arc(hx, hy, hr, Math.PI * 1.05, Math.PI * 1.95); ctx.quadraticCurveTo(hx, hy - hr * 0.35, hx - hr * 0.98, hy - hr * 0.25); ctx.fill();
    // rosto (olha para onde anda)
    const ex = hx + (dir || 0) * hr * 0.12, ey = hy + hr * 0.1, eo = hr * 0.36;
    ctx.fillStyle = COLORS.ink;
    if (hit) {
      ctx.lineWidth = lw * 0.8;
      [-1, 1].forEach((s) => {
        const cx = ex + s * eo, d = hr * 0.12;
        ctx.beginPath(); ctx.moveTo(cx - d, ey - d); ctx.lineTo(cx + d, ey + d); ctx.moveTo(cx + d, ey - d); ctx.lineTo(cx - d, ey + d); ctx.stroke();
      });
      ctx.beginPath(); ctx.ellipse(ex, ey + hr * 0.45, hr * 0.14, hr * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      [-1, 1].forEach((s) => { ctx.beginPath(); ctx.arc(ex + s * eo, ey, hr * 0.1, 0, Math.PI * 2); ctx.fill(); });
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.arc(ex, ey + hr * 0.25, hr * 0.28, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTarget() {
    const topY = tgtTop(), w = L.tw, h = L.th, hit = tgt.hitT > 0;
    // sombra
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(tgt.x, L.groundY + 4, w * 0.5, w * 0.1, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    const bob = Math.abs(Math.sin(G.time * 14)) * h * 0.025;
    const tilt = hit ? Math.sin(tgt.hitT * 30) * 0.08 : tgt.dir * 0.05;
    ctx.translate(tgt.x, L.groundY); ctx.rotate(tilt); ctx.translate(-tgt.x, -L.groundY - bob);

    const img = hit && sprites.targetHit ? sprites.targetHit : sprites.target;
    if (img) ctx.drawImage(img, tgt.x - w / 2, topY, w, h);
    else drawTargetShape(tgt.x, topY, w, h, hit, tgt.dir);

    tgt.splats.forEach((s) => splat(tgt.x + s.dx, topY + s.dy, s.r, s.seed, s.t / 0.5));
    ctx.restore();
  }

  function drawFx() {
    fx.ground.forEach((s) => splat(s.x, L.groundY + 3, s.r, s.seed, s.t / 0.6));
    fx.parts.forEach((p) => {
      ctx.globalAlpha = clamp(p.t / 0.3, 0, 1);
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    fx.texts.forEach((t) => {
      const size = Math.round(L.unit * 0.075 * t.scale);
      ctx.save();
      ctx.globalAlpha = clamp(t.t / 0.3, 0, 1);
      ctx.font = `${size}px "Lilita One", "Arial Black", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = Math.max(4, size * 0.18); ctx.strokeStyle = COLORS.ink;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });
  }

  function render() {
    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-1, 1) * G.shake * 24, rand(-1, 1) * G.shake * 16);
    drawBackground();
    drawTarget();
    if (SHOW_HITBOX) drawHitbox();
    drawEgg();
    drawFx();
    ctx.restore();
  }

  // ------------------------------------------------------------ Loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!G.paused) update(dt);
    updateFx(G.paused ? 0 : dt);
    render();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ HUD / UI
  function renderHud(pop) {
    ui.score.textContent = G.score;
    if (pop) { ui.score.classList.remove("pop"); void ui.score.offsetWidth; ui.score.classList.add("pop"); }
    ui.lives.innerHTML = "";
    for (let i = 0; i < LIVES; i++) {
      const d = document.createElement("span");
      d.className = "life" + (i >= G.lives ? " lost" : "");
      ui.lives.appendChild(d);
    }
    ui.lives.setAttribute("aria-label", `${G.lives} de ${LIVES} ovos restantes`);
  }

  function renderPlays() {
    const txt = totalPlays === null ? "" : `${fmt(totalPlays)} ${totalPlays === 1 ? "partida jogada" : "partidas jogadas"}`;
    $$("[data-plays]").forEach((el) => { el.textContent = txt; });
  }

  function renderBoards() {
    const offline = boardOffline && !top.length;
    $$("[data-board]").forEach((ol) => {
      ol.innerHTML = "";
      if (!top.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = offline ? "Ranking fora do ar agora." : "Ninguém no ranking ainda. Seja o primeiro.";
        ol.appendChild(li);
        return;
      }
      let marked = false;
      top.forEach((row) => {
        const li = document.createElement("li");
        const name = document.createElement("span"); name.className = "name"; name.textContent = row.name;
        const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = fmt(row.score);
        li.append(name, pts);
        if (!marked && lastSaved && row.name === lastSaved.name && row.score === lastSaved.score) { li.classList.add("me"); marked = true; }
        ol.appendChild(li);
      });
    });
  }

  function qualifies(score) {
    if (score <= 0) return false;
    return top.length < TOP_N || score > top[top.length - 1].score;
  }

  function setStatus(msg, isError) {
    ui.status.textContent = msg || "";
    ui.status.classList.toggle("error", !!isError);
  }

  // ------------------------------------------------------------ API
  async function api(path, body, timeout) {
    if (!API) throw new Error("API não configurada.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || 15000);
    try {
      const opts = { signal: ctrl.signal };
      if (body !== undefined) {
        opts.method = "POST";
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(API + path, opts);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || `Erro ${res.status}`);
      return json;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("O servidor demorou para responder.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadLeaderboard() {
    try {
      const j = await api("/api/leaderboard", undefined, 60000);
      top = j.top || [];
      totalPlays = j.total_plays;
      boardOffline = false;
      renderBoards(); renderPlays();
    } catch (e) {
      boardOffline = true;
      renderBoards();
    }
  }

  // ------------------------------------------------------------ Fluxo
  function startGame() {
    audio();
    Object.assign(G, { state: "playing", paused: false, score: 0, lives: LIVES, hits: 0, streak: 0, playId: null, submitted: false, shake: 0 });
    fx.parts = []; fx.texts = []; fx.ground = [];
    tgt.splats = []; tgt.hitT = 0; tgt.x = W / 2; tgt.dir = sign(); tgt.mul = 1; tgt.flipIn = rand(1.2, 2.2);
    spawnEgg();
    renderHud(false);
    ui.menu.hidden = true; ui.over.hidden = true; ui.pause.hidden = true; ui.hud.hidden = false;
    stage.classList.add("playing");

    // Conta a jogada em paralelo; o jogo não espera a rede.
    G.playPromise = api("/api/play", {}, 60000)
      .then((j) => {
        totalPlays = j.total_plays; renderPlays();
        G.playId = j.play_id;
        return j.play_id;
      })
      .catch(() => null);
  }

  function gameOver() {
    G.state = "over";
    egg.mode = "idle"; spawnEgg();
    stage.classList.remove("playing");
    sfx.over();

    const best = Math.max(Number(store.get("best", 0)) || 0, G.score);
    const isRecord = G.score > 0 && G.score >= best && G.score > (Number(store.get("best", 0)) || 0);
    store.set("best", best);

    ui.finalScore.textContent = fmt(G.score);
    ui.best.textContent = isRecord ? "Novo recorde pessoal." : `Seu recorde: ${fmt(best)}`;
    setStatus("");
    renderBoards();

    if (qualifies(G.score)) {
      ui.form.hidden = false;
      ui.name.value = store.get("name", "");
      ui.save.disabled = false;
    } else {
      ui.form.hidden = true;
      if (G.score === 0) setStatus("Solte o ovo um pouco antes do alvo passar embaixo.");
      else if (top.length >= TOP_N) setStatus(`Faça mais de ${fmt(top[top.length - 1].score)} pontos para entrar no top 5.`);
    }

    ui.hud.hidden = true;
    ui.over.hidden = false;
    ui.again.focus({ preventScroll: true });
  }

  async function submitScore(ev) {
    ev.preventDefault();
    if (G.submitted) return;
    const name = ui.name.value.replace(/\s+/g, " ").trim().slice(0, 16);
    if (!name) { setStatus("Digite um nome.", true); ui.name.focus(); return; }
    store.set("name", name);
    ui.save.disabled = true;
    setStatus("Salvando…");

    const playId = await G.playPromise;
    if (!playId) {
      setStatus("Sem conexão com o ranking. Esta partida não foi registrada.", true);
      ui.save.disabled = false;
      return;
    }
    try {
      G.submitted = true;
      const j = await api("/api/score", { play_id: playId, name, score: G.score });
      top = j.top || top;
      lastSaved = { name, score: G.score };
      renderBoards();
      ui.form.hidden = true;
      setStatus(j.in_top ? "Salvo. Seu nome está no top 5." : "Salvo.");
    } catch (e) {
      G.submitted = false;
      ui.save.disabled = false;
      setStatus(e.message || "Não foi possível salvar.", true);
    }
  }

  function pauseGame() {
    if (G.state === "playing" && !G.paused) { G.paused = true; ui.pause.hidden = false; }
  }
  function resumeGame() {
    G.paused = false; ui.pause.hidden = true; last = performance.now();
  }

  // ------------------------------------------------------------ Eventos
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); dropEgg(); });
  ui.play.addEventListener("click", startGame);
  ui.again.addEventListener("click", startGame);
  ui.form.addEventListener("submit", submitScore);
  ui.pause.addEventListener("pointerdown", (e) => { e.preventDefault(); resumeGame(); });
  ui.mute.addEventListener("click", () => {
    muted = !muted; store.set("mute", muted ? "1" : "0"); renderMute();
    if (muted) stopVoice(); else audio();
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;
    if (e.code === "Space" || e.code === "ArrowDown" || e.code === "Enter") {
      e.preventDefault();
      if (G.paused) resumeGame();
      else if (G.state === "playing") dropEgg();
      else if (G.state === "menu") startGame();
    }
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", pauseGame);
  window.addEventListener("resize", resize);
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  // ------------------------------------------------------------ PWA
  const installBtn = $("#btn-install");
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* cancelado */ }
    installEvt = null;
    installBtn.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installBtn.hidden = true; });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* sem PWA, o jogo segue normal */ });
    });
  }

  // ------------------------------------------------------------ Boot
  resize();
  spawnEgg();
  renderHud(false);
  renderMute();
  renderBoards();
  loadLeaderboard();                 // também acorda o Render (plano free)
  requestAnimationFrame(frame);

  // Ganchos de teste / exportação de sprites (usados só em desenvolvimento)
  window.MYEGGS = {
    G, egg, tgt, L, voices, playVoice,
    exportSprite(kind, w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const main = ctx; ctx = c.getContext("2d");
      try {
        if (kind === "egg") drawEggShape(w / 2, h / 2, w * 0.44, h * 0.45);
        else { const tw = w * 0.92, th = tw * 1.3; drawTargetShape(w / 2, (h - th) / 2, tw, th, kind === "targetHit", 0); }
      } finally { ctx = main; }
      return c.toDataURL("image/png");
    },
  };
})();
