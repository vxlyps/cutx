// Lo specchio del controller, nel riquadro in basso a sinistra: la fotografia dell'X-Touch Mini. Le otto manopole in UNA riga, nello
// stesso ordine del controller (così la mano non va nel posto sbagliato), ognuna con il suo anello, un nome corto (al massimo 6 lettere)
// e il valore; la toccata in evidenza; in testata la pagina (A/B accesi come sul controller) e, della manopola toccata per ultima,
// il nome intero e il valore («BASSO · FILTRO 800 Hz»). Compare solo con il controller collegato.
import it from './testi/it.json';

const NS = 'http://www.w3.org/2000/svg';
const A0 = (135 * Math.PI) / 180;
const A1 = (405 * Math.PI) / 180;
const R = 14;
const punto = (a) => ({ x: 20 + R * Math.cos(a), y: 20 + R * Math.sin(a) });
const EVIDENZA_MS = 2500;

function arco(da, a, classe) {
  const p = punto(da);
  const q = punto(a);
  const e = document.createElementNS(NS, 'path');
  e.setAttribute('d', `M${p.x.toFixed(2)} ${p.y.toFixed(2)} A${R} ${R} 0 ${a - da > Math.PI ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`);
  e.setAttribute('class', classe);
  return e;
}

// L'anello di una manopola: libera = solo la traccia scura; fan = si riempie; punto = un puntino sulla traccia.
export function disegnaAnello(m) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', 'spec-anello');
  svg.append(arco(A0, A1 - 0.001, m ? 'traccia' : 'traccia libera'));
  if (!m || m.valore === null) return svg;
  const v = Math.max(0, Math.min(1, m.valore));
  if (m.stile === 'fan') {
    if (v > 0.01) svg.append(arco(A0, A0 + (A1 - A0) * v, 'valore'));
  } else if (m.stile === 'pan') {
    // parte dal centro: un valore col segno
    const centro = A0 + (A1 - A0) / 2;
    const punta = A0 + (A1 - A0) * v;
    if (Math.abs(punta - centro) > 0.02) svg.append(arco(Math.min(centro, punta), Math.max(centro, punta), 'valore'));
  } else {
    const p = punto(A0 + (A1 - A0) * v);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', p.x.toFixed(2));
    c.setAttribute('cy', p.y.toFixed(2));
    c.setAttribute('r', '3.4');
    c.setAttribute('class', 'punto-valore');
    svg.append(c);
  }
  return svg;
}

export class Specchio {
  // synth: lo specchio dentro la vista SYNTH (in ambra), che mostra il gruppo di parametri; l'altro è quello del LIVE.
  constructor(contenitore, { synth = false } = {}) {
    this.el = contenitore;
    this.synth = synth;
    this.firma = '';
    this.el.hidden = true;
  }

  // Lo specchio del SYNTH: i cinque gruppi (quello scelto acceso, con la pagina), l'ultima cosa toccata, e se il controller sta comandando il synth o il live.
  aggiornaSynth(controller, ora) {
    const T = it.synth.controller;
    const visibile = controller.collegato && controller.modo !== 'standard';
    this.el.hidden = !visibile;
    if (!visibile) return;
    const segue = controller.nelSynth;
    const manopole = segue ? controller.manopole() : [];
    const toccata = segue && controller.toccata && ora - controller.toccata.quando < EVIDENZA_MS ? controller.toccata.n : null;
    const t = controller.testataSynth();
    const info = segue ? controller.toccata?.testo ?? controller.nomeGruppoSynth() : '';
    const firma = JSON.stringify([segue, t, manopole, toccata, info]);
    if (firma === this.firma) return;
    this.firma = firma;
    this.el.classList.toggle('attivo', segue);
    const testata = document.createElement('div');
    testata.className = 'spec-testa';
    const stato = document.createElement('span');
    stato.className = 'spec-stato';
    stato.textContent = segue ? T.segue : T.live;
    testata.append(stato);
    if (!segue) return this.el.replaceChildren(testata);
    for (const [g, nome] of Object.entries(T.gruppi)) {
      const b = document.createElement('span');
      b.className = `pag${t.gruppo === g ? ' on' : ''}`;
      b.textContent = t.gruppo === g && t.pagine > 1 ? `${nome} ${T.pagina.replace('{n}', t.pagina + 1).replace('{tot}', t.pagine)}` : nome;
      testata.append(b);
    }
    const nome = document.createElement('span');
    nome.className = 'spec-info';
    nome.textContent = info;
    testata.append(nome);
    const riga = document.createElement('div');
    riga.className = 'spec-riga';
    manopole.forEach((m, i) => {
      const e = document.createElement('div');
      e.className = `spec-m${m ? '' : ' libera'}${m?.spenta ? ' muta' : ''}${toccata === i + 1 ? ' toccata' : ''}`;
      const num = document.createElement('span');
      num.className = 'n';
      num.textContent = String(i + 1);
      e.append(num, disegnaAnello(m));
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = m ? m.corto : '–';
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = m ? m.testo : '';
      e.append(nm, v);
      riga.append(e);
    });
    this.el.replaceChildren(testata, riga);
  }

  // controller: il Controller; ora: performance.now()
  aggiorna(controller, ora = performance.now()) {
    if (this.synth) return this.aggiornaSynth(controller, ora);
    if (controller.nelSynth) return; // sotto la vista SYNTH: lo specchio vero è quello del synth
    const visibile = controller.collegato && controller.modo !== 'standard';
    this.el.hidden = !visibile;
    this.el.parentElement?.classList.toggle('con-specchio', visibile);
    if (!visibile) return;
    const manopole = controller.manopole();
    const toccata = controller.toccata && ora - controller.toccata.quando < EVIDENZA_MS ? controller.toccata.n : null;
    const info = controller.toccata?.testo ?? (controller.pagina === 'A' ? 'SUONA' : `SCOLPISCI · ${controller.nomeBersaglio().toUpperCase()}`);
    const globale = controller.pagina === 'B' && controller.bersaglio === 'globale';
    const firma = JSON.stringify([controller.pagina, manopole, toccata, info, globale]);
    if (firma === this.firma) return;
    this.firma = firma;
    const testata = document.createElement('div');
    testata.className = 'spec-testa';
    for (const p of ['A', 'B']) {
      const b = document.createElement('span');
      b.className = `pag${controller.pagina === p ? ' on' : ''}`;
      b.textContent = p;
      testata.append(b);
    }
    const nome = document.createElement('span');
    nome.className = 'spec-info';
    nome.textContent = info;
    if (globale) nome.classList.add('globale');
    testata.append(nome);
    const riga = document.createElement('div');
    riga.className = 'spec-riga';
    manopole.forEach((m, i) => {
      const e = document.createElement('div');
      e.className = `spec-m${m ? '' : ' libera'}${m?.scelta ? ' scelta' : ''}${m?.muto ? ' muta' : ''}${toccata === i + 1 ? ' toccata' : ''}`;
      const num = document.createElement('span');
      num.className = 'n';
      num.textContent = String(i + 1);
      e.append(num, disegnaAnello(m));
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = m ? m.corto : controller.pagina === 'A' && i === 1 ? 'beat' : '–'; // la manopola 2 libera dice di che cosa è il posto
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = m ? m.testo : '';
      e.append(nm, v);
      riga.append(e);
    });
    this.el.replaceChildren(testata, riga);
  }
}
