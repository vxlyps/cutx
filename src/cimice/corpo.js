// Il corpo della cimice: geometria, zampe, antenne, movimento a scatti. Niente DOM e niente disegno:
// lavora su un "mondo" `m` (parole, misure, caso, effetti) che gli passa cimice.js, così si prova senza finestra.
//
// m = { parole, W, H, g (geom), opz, ridotto, rnd(a,b), pick(arr), folle(), filo(), barra(), trema(), lampeggia(p,v), corrompi(p,ms) }
// parola = { x, y, w, h, cx, cy, vis, salta, hl, held, ... }  (salta = punteggiatura: i piedi non ci stanno)

export const SEGS = 6;
// 7 zampe, non equilibrato apposta: 3 a sinistra, 4 a destra (la quarta, più indietro, ci mette un po' a stare al passo).
const ZAMPE = {
  '-1': [
    { seg: 0, ang: 48, fwd: 1 },
    { seg: 1, ang: 90, fwd: -1 },
    { seg: 2, ang: 132, fwd: -1 },
  ],
  '1': [
    { seg: 0, ang: 44, fwd: 1 },
    { seg: 1, ang: 80, fwd: -1 },
    { seg: 2, ang: 114, fwd: -1 },
    { seg: 3, ang: 146, fwd: -1 },
  ],
};

// Tutte le misure insieme: la grandezza (scala) le moltiplica, le proporzioni restano.
export function geom(k = 1) {
  const reach = 96 * k; // zampe lunghe e sottili, come un ragno di linee
  return { k, gap: 10 * k, reach, legA: reach * 0.5, legB: reach * 0.56, feelRest: 40 * k, feelReach: 150 * k, feelCrazy: 260 * k };
}

export const suonano = (m) => m.parole.filter((t) => t.vis && t.hl > 0.5);

export function angoloSeg(b, i) {
  if (i === 0) return b.h;
  const p = b.segs[i - 1];
  const s = b.segs[i];
  return Math.atan2(p.y - s.y, p.x - s.x);
}

export function anca(m, b, leg) {
  const s = b.segs[leg.seg];
  const a = angoloSeg(b, leg.seg) + (leg.side * Math.PI) / 2;
  return { x: s.x + Math.cos(a) * 4 * m.g.k, y: s.y + Math.sin(a) * 4 * m.g.k };
}

export function pieIdeale(m, b, leg, avanti) {
  const hp = anca(m, b, leg);
  const sa = angoloSeg(b, leg.seg);
  const a = sa + leg.side * leg.ang;
  const R = m.g.reach;
  return { x: hp.x + Math.cos(a) * R * 0.72 + Math.cos(sa) * avanti, y: hp.y + Math.sin(a) * R * 0.72 + Math.sin(sa) * avanti };
}

// Il piede si appoggia solo su parole a distanza simile dall'anca: le zampe restano tutte uguali.
export function scegliPiede(m, b, leg) {
  const R = m.g.reach;
  const hp = anca(m, b, leg);
  const id = pieIdeale(m, b, leg, R * 0.3);
  let best = null;
  let bs = Infinity;
  for (const t of m.parole) {
    if (!t.vis || t.held > 0 || t.salta) continue;
    const dh = Math.hypot(t.cx - hp.x, t.cy - hp.y);
    if (dh < R * 0.6 || dh > R * 0.88) continue;
    const d2 = (t.cx - id.x) ** 2 + (t.cy - id.y) ** 2;
    if (d2 > (R * 0.55) ** 2) continue;
    const sc = d2 + m.rnd(0, 120);
    if (sc < bs) { bs = sc; best = t; }
  }
  return best ? { x: best.cx, y: best.cy, tok: best } : { x: id.x, y: id.y, tok: null };
}

export function iniziaPasso(leg, target, dur) {
  if (leg.tok) { leg.tok.held--; leg.tok = null; }
  if (target.tok) target.tok.held++;
  leg.from = { x: leg.foot.x, y: leg.foot.y };
  leg.to = target;
  leg.t = 0;
  leg.dur = dur;
}

// Il ginocchio: due segmenti uguali tra anca e piede.
export function ginocchio(hx, hy, fx, fy, a, b, bend) {
  const dx = fx - hx;
  const dy = fy - hy;
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base + bend * A;
  return [hx + Math.cos(ang) * a, hy + Math.sin(ang) * a];
}

export function creaCorpo(m, x, y, h, appoggia, now = performance.now()) {
  const b = {
    x, y, h, segs: [], legs: [], ants: [], state: 'walk', target: null, pulse: 0,
    age: 0, maxBars: 6, tag: 0, tagOn: false, tagOffAge: 0,
    mode: 'creep', modeUntil: now + m.rnd(1200, 2600), armed: false, redUntil: 0, blink: false,
  };
  for (let i = 0; i < SEGS; i++) b.segs.push({ x: x - Math.cos(h) * m.g.gap * i, y: y - Math.sin(h) * m.g.gap * i });
  for (const side of [-1, 1]) {
    ZAMPE[side].forEach((p, i) => {
      b.legs.push({
        side, seg: p.seg, ang: (p.ang * Math.PI) / 180, fwd: p.fwd, group: (i + (side > 0 ? 1 : 0)) % 2,
        foot: { x: 0, y: 0 }, from: null, to: null, t: 1, dur: 0.09, tok: null,
      });
    });
  }
  for (const leg of b.legs) {
    const tg = appoggia ? scegliPiede(m, b, leg) : (() => { const p = pieIdeale(m, b, leg, 0); return { x: p.x, y: p.y, tok: null }; })();
    leg.foot = { x: tg.x, y: tg.y };
    if (tg.tok) { tg.tok.held++; leg.tok = tg.tok; }
  }
  for (const side of [-1, 1]) {
    b.ants.push({ side, tip: { x: x + Math.cos(h) * 30 * m.g.k, y: y + Math.sin(h) * 30 * m.g.k }, tok: null, phase: m.rnd(0, 6), base: null });
  }
  return b;
}

export function scegliBersaglio(m, b) {
  const pool = suonano(m).filter((t) => t.cx > 40 && t.cx < m.W - 40 && t.cy > 30 && t.cy < m.H - 30);
  const tutte = m.parole.filter((t) => t.vis && !t.salta && t.cx > 40 && t.cx < m.W - 40);
  const t = m.pick(pool.length && m.rnd(0, 1) < 0.6 ? pool : tutte);
  const off = m.rnd(12, 36) * m.g.k;
  const a = m.rnd(0, Math.PI * 2);
  b.target = t ? { x: t.cx + Math.cos(a) * off, y: t.cy + Math.sin(a) * off } : { x: m.W / 2, y: m.H / 2 };
}

// Se ne va dal bordo più vicino, di corsa.
export function congedo(m, b) {
  if (b.state === 'exit') return;
  b.state = 'exit';
  b.mode = 'dart';
  b.armed = false;
  const dl = b.x, dr = m.W - b.x, dt = b.y, db = m.H - b.y;
  const mn = Math.min(dl, dr, dt, db);
  b.target = mn === dl ? { x: -160, y: b.y } : mn === dr ? { x: m.W + 160, y: b.y } : mn === dt ? { x: b.x, y: -160 } : { x: b.x, y: m.H + 160 };
}

// Movimento da insetto: entra piano, scatto veloce, si blocca, altro scatto.
export function iniziaScatto(m, b, now, folle) {
  scegliBersaglio(m, b);
  b.mode = 'dart';
  b.armed = false;
  b.modeUntil = now + m.rnd(130, folle ? 260 : 420) / m.opz.velocita;
  b.h = Math.atan2(b.target.y - b.y, b.target.x - b.x) + m.rnd(-0.25, 0.25);
  if (m.opz.lampi && m.rnd(0, 1) < 0.25) b.redUntil = now + m.rnd(150, 500);
}

export function fineScatto(m, b, now, folle) {
  b.mode = 'freeze';
  b.armed = false;
  b.modeUntil = now + (folle ? m.rnd(50, 220) : m.rnd(250, 1100));
}

// Ogni frame. Ritorna true quando è uscita del tutto dallo schermo.
export function aggiorna(m, b, dt, now) {
  const c = m.folle();
  const G = m.g;
  if (!b.target) scegliBersaglio(m, b);
  if (b.state === 'walk' && Math.hypot(b.target.x - b.x, b.target.y - b.y) < 20 * G.k) {
    if (b.mode === 'dart') fineScatto(m, b, now, c); else scegliBersaglio(m, b);
  }
  if (b.state === 'exit') b.mode = 'dart';
  else if (b.mode === 'dart' && now >= b.modeUntil) fineScatto(m, b, now, c);
  else if (b.mode !== 'dart' && now >= b.modeUntil) b.armed = true;

  let diff = Math.atan2(b.target.y - b.y, b.target.x - b.x) - b.h;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const turn = (b.mode === 'dart' ? 14 : c ? 5 : 2.4) * dt;
  b.h += Math.max(-turn, Math.min(turn, diff));
  if (c && !m.ridotto) b.h += m.rnd(-0.06, 0.06);
  const vel = b.mode === 'dart' ? (b.state === 'exit' ? 340 : c ? 380 : 270) * m.opz.velocita : b.mode === 'creep' ? 22 : 0;
  const v = vel * G.k * (m.ridotto ? 0.5 : 1);
  b.x += Math.cos(b.h) * v * dt;
  b.y += Math.sin(b.h) * v * dt;
  b.pulse *= Math.exp(-dt * 8);

  // le vertebre seguono la testa come un cavo
  b.segs[0].x = b.x;
  b.segs[0].y = b.y;
  for (let i = 1; i < SEGS; i++) {
    const p = b.segs[i - 1];
    const s = b.segs[i];
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    const wob = c ? m.rnd(-1.5, 1.5) : 0;
    s.x = p.x + (dx / d) * G.gap + wob;
    s.y = p.y + (dy / d) * G.gap + wob;
  }

  for (const leg of b.legs) {
    if (leg.t < 1) {
      leg.t = Math.min(1, leg.t + dt / leg.dur);
      const e = leg.t < 0.5 ? 2 * leg.t * leg.t : 1 - Math.pow(-2 * leg.t + 2, 2) / 2;
      leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * e;
      leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * e;
      if (leg.t >= 1 && leg.to.tok) { leg.tok = leg.to.tok; m.lampeggia(leg.tok, 0.4); }
    } else {
      const hp = anca(m, b, leg);
      if (Math.hypot(leg.foot.x - hp.x, leg.foot.y - hp.y) > G.reach * 0.97) {
        if (b.state === 'exit') { const p = pieIdeale(m, b, leg, G.reach * 0.3); iniziaPasso(leg, { x: p.x, y: p.y, tok: null }, 0.035); }
        else iniziaPasso(leg, scegliPiede(m, b, leg), b.mode === 'dart' ? 0.035 : 0.07);
      }
    }
  }

  // antenne: toccano solo quello che sta suonando
  const reach = c ? G.feelCrazy : G.feelReach;
  const pl = suonano(m);
  const hc = Math.cos(b.h), hs = Math.sin(b.h);
  for (const an of b.ants) {
    const base = { x: b.x + hc * 7 * G.k - hs * an.side * 2.5 * G.k, y: b.y + hs * 7 * G.k + hc * an.side * 2.5 * G.k };
    if (an.tok && (an.tok.hl < 0.35 || !an.tok.vis || Math.hypot(an.tok.cx - base.x, an.tok.cy - base.y) > reach)) an.tok = null;
    if (!an.tok || an.tok.hl < 0.9) {
      let best = null;
      let bs = Infinity;
      for (const t of pl) {
        if (pl.length > 1 && b.ants.some((o) => o !== an && o.tok === t)) continue;
        const d = Math.hypot(t.cx - base.x, t.cy - base.y);
        if (d > reach) continue;
        const cross = hc * (t.cy - b.y) - hs * (t.cx - b.x);
        const sc = d - (Math.sign(cross) === an.side ? 25 : 0) - (t.hl > 0.9 ? 30 : 0);
        if (sc < bs) { bs = sc; best = t; }
      }
      if (best && best !== an.tok) { an.tok = best; if (c) m.corrompi(best, 90); }
    }
    an.phase += dt * (c ? 18 : b.mode === 'freeze' ? 9 : 4) + (b.mode === 'freeze' && m.rnd(0, 1) < 0.04 ? m.rnd(-2, 2) : 0);
    let gx, gy;
    if (an.tok) { gx = an.tok.cx; gy = an.tok.cy; }
    else {
      const a = b.h + an.side * (0.4 + Math.sin(an.phase) * 0.2);
      gx = base.x + Math.cos(a) * G.feelRest; gy = base.y + Math.sin(a) * G.feelRest;
    }
    const k = Math.min(1, dt * (c ? 40 : 22));
    an.tip.x += (gx - an.tip.x) * k;
    an.tip.y += (gy - an.tip.y) * k;
    an.base = base;
  }

  b.tag += ((b.tagOn && b.state === 'walk' ? 1 : 0) - b.tag) * Math.min(1, dt * 3);
  const f = 150 * G.k;
  return b.state === 'exit' && (b.x < -f || b.x > m.W + f || b.y < -f || b.y > m.H + f);
}

// Un sedicesimo del clock (k = numero del sedicesimo): le zampe, i fili verso le parole, le barre glitch.
export function suSedicesimo(m, b, k, now) {
  const s = ((k % 16) + 16) % 16;
  const c = m.folle();
  const G = m.g;
  if (b.armed && b.state === 'walk') iniziaScatto(m, b, now, c);
  if (m.opz.lampi && s % 4 === 0 && !c && m.rnd(0, 1) < 0.12) b.redUntil = now + m.rnd(200, 700);
  if (b.state !== 'exit') {
    const cands = [];
    for (const leg of b.legs) {
      if (leg.t < 1 || leg.group !== (k & 1)) continue;
      const id = pieIdeale(m, b, leg, 0);
      const st = Math.hypot(leg.foot.x - id.x, leg.foot.y - id.y);
      if (st > G.reach * 0.3) cands.push([st, leg]);
    }
    cands.sort((p, q) => q[0] - p[0]);
    cands.slice(0, c ? 4 : 2).forEach(([, leg]) => iniziaPasso(leg, scegliPiede(m, b, leg), c ? 0.05 : 0.09));
  }
  const tenute = b.legs.filter((l) => l.tok && l.t >= 1).map((l) => l.tok);
  const pl = suonano(m);
  const { ACID, INK, RUST, ROT } = m.col;
  if (s % 4 === 0) {
    b.pulse = 1;
    for (let i = 0; i < (c ? 3 : 1); i++) {
      const t = m.pick(tenute);
      if (t) m.filo(b.x, b.y, t.cx + (t.cx - b.x) * 0.9, t.cy + (t.cy - b.y) * 0.9, m.rnd(0, 1) < 0.3 ? INK : ACID);
    }
    if (c) {
      for (const t of pl) m.filo(b.x, b.y, t.cx, t.cy, m.opz.lampi && m.rnd(0, 1) < 0.5 ? RUST : ACID, 0.3);
      for (let i = 0; i < 3; i++) {
        const t1 = m.pick(pl), t2 = m.pick(pl);
        if (t1 && t2 && t1 !== t2) m.filo(t1.cx, t1.cy, t2.cx, t2.cy, ACID, 0.4);
      }
      m.barra(); m.barra();
      if (m.rnd(0, 1) < 0.7) m.barra();
      m.trema(0.09);
    } else {
      if (pl.length && m.rnd(0, 1) < 0.5) { const t = m.pick(pl); m.filo(b.x, b.y, t.cx, t.cy, RUST, 0.3); }
      if (m.rnd(0, 1) < 0.3) m.barra();
    }
  }
  if (s === 4 || s === 12) {
    const vis = m.parole.filter((t) => t.vis && !t.salta);
    const t1 = m.pick(pl.length ? pl : vis), t2 = m.pick(vis);
    if (t1 && t2) m.filo(t1.cx, t1.cy, t2.cx, t2.cy, c ? RUST : ROT, 0.45);
  }
  // il virus: rovina per un attimo le parole sotto la testa, ingrandisce parole in altri font, strisce oblique (solo disegno)
  if (m.opz.corrompe) {
    m.glitch?.(b, c, s);
    for (const t of m.parole) if (t.vis && Math.abs(t.cx - b.x) < 26 * G.k && Math.abs(t.cy - b.y) < 16 * G.k) m.corrompi(t, 160);
  }
}
