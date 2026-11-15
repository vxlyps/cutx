// Il disegno della cimice e degli effetti sul canvas. Tutto solo disegno: non tocca mai il testo dell'editor.
import { SEGS, angoloSeg, anca, ginocchio } from './corpo.js';

const GLIFI = '01#%&/\\<>[]{}=+*!?$@XZKQ_';
export const glifo = (caso) => GLIFI[Math.floor(caso() * GLIFI.length)];

// Cornice a quattro angoli (non un rettangolo pieno): si legge anche sopra il testo.
function cornice(g, x, y, w, h, ang) {
  g.beginPath();
  g.moveTo(x, y + ang); g.lineTo(x, y); g.lineTo(x + ang, y);
  g.moveTo(x + w - ang, y); g.lineTo(x + w, y); g.lineTo(x + w, y + ang);
  g.moveTo(x + w, y + h - ang); g.lineTo(x + w, y + h); g.lineTo(x + w - ang, y + h);
  g.moveTo(x + ang, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - ang);
  g.stroke();
}

function rombo(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
}

// Sotto la cimice: barre glitch, note che suonano (se serve), fili.
export function disegnaSotto(g, m, fx, now) {
  const { ACID } = m.col;
  for (const b of fx.barre) { g.globalAlpha = 0.85; g.fillStyle = b.color; g.fillRect(b.x, b.y, b.w, b.h); }
  if (m.opz.disegnaNote) {
    for (const t of m.parole) {
      if (t.hl <= 0.02 || !t.vis) continue;
      const rgb = m.folle() && m.opz.lampi && now - fx.ultimoBattito < 90 && !m.ridotto;
      const col = rgb ? m.col.RUST : ACID;
      g.globalAlpha = t.hl * 0.16; g.fillStyle = col; g.fillRect(t.x - 2, t.y, t.w + 4, t.h);
      g.globalAlpha = t.hl; g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(t.x - 2, t.y - 1, t.w + 4, t.h + 2);
    }
  }
  for (const th of fx.fili) {
    const k = 1 - th.life / th.max;
    g.globalAlpha = k * 0.8; g.strokeStyle = th.color; g.lineWidth = 1;
    g.beginPath(); g.moveTo(th.x1, th.y1); g.lineTo(th.x2, th.y2); g.stroke();
    g.fillStyle = th.color; g.fillRect(th.x2 - 1.5, th.y2 - 1.5, 3, 3);
  }
  g.globalAlpha = 1;
}

// Le parole "corrotte": si coprono con lo sfondo e si riscrivono con glifi a caso. L'editor sotto non cambia.
export function disegnaCorrotte(g, m, now) {
  for (const t of m.parole) {
    if (!t.scrUntil || now > t.scrUntil || !t.scrTesto || !t.font) continue;
    g.globalAlpha = 1; g.fillStyle = m.col.BG; g.fillRect(t.x - 1, t.y, t.w + 2, t.h);
    g.fillStyle = m.col.ACID; g.font = t.font; g.textBaseline = 'middle';
    g.fillText(t.scrTesto, t.x, t.y + t.h / 2 + 0.5);
  }
  g.globalAlpha = 1;
}

export function disegnaCimice(g, m, b, now) {
  const { ACID, ROT, INK, RUST, BG } = m.col;
  const G = m.g;
  const k = G.k;
  const c = m.folle();
  const rosso = m.opz.lampi && (c ? Math.floor(now / 110) % 2 === 0 : now < b.redUntil);
  const col = rosso ? RUST : ACID;
  const ant = rosso ? INK : RUST;
  const lampo = rosso ? 'rgba(255,91,31,.75)' : 'rgba(182,240,0,.7)';

  // scia: l'immagine residua della testa quando scatta
  for (let i = 0; i < b.scia.length; i++) {
    const s = b.scia[i];
    g.save(); g.translate(s.x, s.y); g.rotate(s.h);
    g.globalAlpha = 0.05 + (i / b.scia.length) * 0.18; g.strokeStyle = col; g.lineWidth = 1;
    g.strokeRect(-6 * k, -5 * k, 13 * k, 10 * k);
    g.restore();
  }

  // parole su cui poggia: cornice
  for (const leg of b.legs) {
    const t = leg.tok;
    if (!t || leg.t < 1 || !t.vis) continue;
    g.globalAlpha = 0.9; g.strokeStyle = col; g.lineWidth = 1.1;
    cornice(g, t.x - 3, t.y - 1.5, t.w + 6, t.h + 3, 3);
  }

  // antenne: tre tratti dritti con i giunti, sulle note che suonano
  for (const an of b.ants) {
    if (!an.base) continue;
    const dx = an.tip.x - an.base.x, dy = an.tip.y - an.base.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const kk = an.side * (5 + Math.sin(an.phase * 1.3) * 4) * k;
    const j = [[0.28, 1], [0.62, -0.55]].map(([u, s]) => [an.base.x + dx * u + nx * kk * s, an.base.y + dy * u + ny * kk * s]);
    g.globalAlpha = 0.95; g.strokeStyle = ant; g.lineWidth = 1;
    g.beginPath(); g.moveTo(an.base.x, an.base.y);
    for (const [x, y] of j) g.lineTo(x, y);
    g.lineTo(an.tip.x, an.tip.y); g.stroke();
    g.fillStyle = INK;
    for (const [x, y] of j) g.fillRect(x - 1, y - 1, 2, 2);
    g.fillStyle = ant; rombo(g, an.tip.x, an.tip.y, an.tok ? 2.8 : 1.8);
    if (an.tok) { const t = an.tok; g.strokeStyle = ant; g.lineWidth = 1.3; cornice(g, t.x - 4, t.y - 2, t.w + 8, t.h + 4, 3.5); }
  }

  const pts = b.legs.map((leg) => {
    const hp = anca(m, b, leg);
    const [kx, ky] = ginocchio(hp.x, hp.y, leg.foot.x, leg.foot.y, G.legA, G.legB, -leg.side * leg.fwd);
    return { leg, hp, kx, ky };
  });

  g.save();
  g.shadowColor = lampo; g.shadowBlur = 7;
  // rete tra le ginocchia
  g.globalAlpha = 0.3; g.strokeStyle = col; g.lineWidth = 1;
  for (const side of [-1, 1]) {
    const sp = pts.filter((p) => p.leg.side === side);
    g.beginPath(); sp.forEach((p, i) => (i ? g.lineTo(p.kx, p.ky) : g.moveTo(p.kx, p.ky))); g.stroke();
  }
  // zampe: due segmenti dritti
  g.globalAlpha = 1; g.lineWidth = 1.2; g.strokeStyle = col;
  for (const p of pts) { g.beginPath(); g.moveTo(p.hp.x, p.hp.y); g.lineTo(p.kx, p.ky); g.lineTo(p.leg.foot.x, p.leg.foot.y); g.stroke(); }
  // colonna: un filo che unisce le vertebre
  g.beginPath(); b.segs.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.stroke();
  g.shadowBlur = 0;
  for (const p of pts) {
    g.fillStyle = INK; rombo(g, p.kx, p.ky, 2.1);
    const piantato = p.leg.tok && p.leg.t >= 1;
    g.fillStyle = piantato ? ACID : ROT;
    g.fillRect(p.leg.foot.x - 2, p.leg.foot.y - 2, 4, 4);
  }
  // vertebre dalla coda alla testa: placche che si restringono, con le costole
  for (let i = SEGS - 1; i >= 1; i--) {
    const s = b.segs[i];
    const a = angoloSeg(b, i);
    const w = (11 - i * 1.3) * k, h = (7.5 - i * 0.9) * k;
    g.save(); g.translate(s.x, s.y); g.rotate(a);
    g.fillStyle = BG; g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = col; g.lineWidth = 1.1; g.strokeRect(-w / 2, -h / 2, w, h);
    g.beginPath();
    g.moveTo(0, -h / 2 - 2.5 * k); g.lineTo(0, -h / 2); g.moveTo(0, h / 2); g.lineTo(0, h / 2 + 2.5 * k);
    g.moveTo(-w / 2 + 1.5, 0); g.lineTo(-w / 2 + 3.5, 0);
    g.stroke();
    g.fillStyle = i % 2 ? INK : col; g.fillRect(-1, -1, 2, 2);
    g.restore();
  }
  // testa: quadrata, col nucleo che pulsa sul beat
  g.translate(b.x, b.y); g.rotate(b.h);
  const sc = k * (1 + b.pulse * 0.18); g.scale(sc, sc);
  g.fillStyle = BG; g.fillRect(-6, -5, 13, 10);
  g.shadowColor = rosso ? 'rgba(255,91,31,.8)' : 'rgba(182,240,0,.8)'; g.shadowBlur = 9;
  g.strokeStyle = col; g.lineWidth = 1.4; g.strokeRect(-6, -5, 13, 10);
  g.shadowBlur = 0;
  g.lineWidth = 1; g.beginPath(); g.moveTo(7, -5); g.lineTo(9.5, -3); g.moveTo(7, 5); g.lineTo(9.5, 3); g.stroke(); // gli angoli avanti
  g.globalAlpha = 0.45 + 0.55 * b.pulse; g.fillStyle = rosso ? INK : ACID; g.fillRect(-3.5, -2.5, 5, 5);
  g.globalAlpha = 1; g.fillStyle = INK; g.fillRect(4, -1, 2, 2);
  g.restore();

  // firma, vicino alla coda: piccola e scura
  if (b.tag > 0.02) {
    const tail = b.segs[SEGS - 1];
    g.globalAlpha = b.tag * 0.8; g.fillStyle = ROT; g.font = `500 ${Math.max(8, 9 * k)}px ${m.fontFirma}`; g.textBaseline = 'top';
    g.fillText('idea by @rybinfx', tail.x - 30 * k, tail.y + 14 * k);
  }
  g.globalAlpha = 1;
}
