// Il cavo tra la cimice e CUTX: l'unico file della cimice che conosce il resto dell'app.
// Legge (mai scrive) i livelli live, il clock, le note che suonano, il fader e la scena; dà alla cimice parole e battute.
import { creaCimice, OPZIONI } from './cimice.js';
import { creaLettore } from './dom.js';
import { creaSensore, eBasso } from './sensore.js';
import { creaMangia } from './mangia.js';
import { patternDi } from '../renderer/evidenzia.js';
import { statoBeat, suona } from '../renderer/stato-live.js';

// Il codice che vede il pubblico, nella finestra dell'uscita (il proiettore): solo lì vive la cimice, mai nell'interfaccia di lavoro.
const RADICI = '#scorri pre.codice';
const NOTE = '#scorri pre.codice .nota';

// Cosa suona in questa battuta di un livello: quante note e quante basse (dal pattern, come l'evidenziatore).
function misuraLivello(l, ciclo) {
  const p = patternDi(l.codice);
  if (!p) return { note: 0, basso: 0 };
  let note = 0;
  let basso = 0;
  try {
    const da = Math.floor(ciclo);
    for (const hap of p.queryArc(da, da + 1)) {
      if (!hap.whole || hap.whole.begin.valueOf() < da) continue;
      note++;
      if (eBasso(hap.value)) basso++;
    }
  } catch { /* un pattern strano non deve mai disturbare */ }
  return { note, basso };
}

// preferenze(): le impostazioni CIMICE · livelli(): i livelli del live · fader(): quanto è chiuso il fader (0..1) o null
// livelloDi(radice) → nome del livello a cui appartiene quel riquadro di codice · suTocco(nome) → avvisa l'interfaccia di lavoro (i dispetti)
export function creaAggancio({ preferenze: leggiPreferenze, livelli, fader, livelloDi = null, suTocco = null }) {
  // la firma non si spegne: qualunque `senzaFirma` scritto nelle preferenze si butta
  const preferenze = () => { const { senzaFirma, ...p } = leggiPreferenze() ?? {}; return p; };
  const lettore = creaLettore({ radici: RADICI, note: NOTE });
  const sensore = creaSensore();
  let cimice = null;
  let ultimoK = null;
  let impronta = '';
  let ultima = null; // l'ultima lettura del sensore (per le prove)
  // Il finale HACK (messaggi dall'interfaccia di lavoro): più cimici, codice mangiato, poi lo schermo nero.
  let hackAttivo = false;
  let mangiaF = 0;
  let figlie = [];
  const mangia = creaMangia({ radici: RADICI, frazioneDi: () => mangiaF });

  const sporca = () => cimice?.ricalcola();
  const ascolta = () => {
    addEventListener('scroll', sporca, { capture: true, passive: true });
    addEventListener('resize', sporca, { passive: true });
  };
  const smetti = () => {
    removeEventListener('scroll', sporca, { capture: true });
    removeEventListener('resize', sporca);
  };

  function chiudiFiglie() { for (const f of figlie) f.spegni(); figlie = []; }

  function spegni() {
    smetti();
    chiudiFiglie();
    mangia.ferma();
    cimice?.spegni();
    cimice = null;
    ultimoK = null;
  }

  // Dopo ogni cambio delle impostazioni. Spenta = sparisce subito (e il canvas non c'è più).
  function ricarica() {
    try {
      const pref = { ...OPZIONI, ...preferenze() };
      if (!pref.acceso && !hackAttivo) { spegni(); return; }
      if (!cimice) {
        cimice = creaCimice({
          contenitore: document.body, leggiParole: () => lettore.parole(), opzioni: { ...pref, fisso: true },
          suTocco: (parola, entra) => { const nome = livelloDi?.(parola.radice); if (nome) suTocco?.(nome, entra === true); },
        });
        cimice.avvia();
        if (!cimice.acceso) { cimice = null; return; }
        ascolta();
        sensore.azzera();
        ultimoK = null;
      }
      cimice.imposta(pref);
    } catch { spegni(); }
  }

  // Dall'interfaccia di lavoro: { fase: 'on' | 'vanno' | 'stop' | 'nero', cimici, mangia }.
  function hack(msg) {
    try {
      if (msg.fase === 'on') {
        hackAttivo = true;
        ricarica(); // la cimice c'è anche se nelle impostazioni è spenta: l'HACK l'ho voluto io
        if (!cimice) return;
        mangiaF = msg.mangia ?? 0;
        if (mangiaF > 0) mangia.avvia();
        const pref = { ...OPZIONI, ...preferenze() };
        while (figlie.length < (msg.cimici ?? 1) - 1) {
          const f = creaCimice({ contenitore: document.body, leggiParole: () => lettore.parole(), opzioni: { ...pref, acceso: true, fisso: true, senzaFirma: true, folle: true, scala: (pref.scala || 1) * 0.7 } });
          f.avvia();
          f.evoca();
          figlie.push(f);
        }
      } else if (msg.fase === 'vanno') {
        // il suono è finito: le cimici se ne vanno di corsa dal bordo (il codice resta mangiato fino al nero)
        cimice?.congeda();
        for (const f of figlie) f.congeda();
      } else {
        hackAttivo = false;
        mangiaF = 0;
        mangia.ferma();
        chiudiFiglie();
        if (msg.fase === 'nero') spegni(); // lo schermo nero: niente cimice
        else ricarica(); // fermato: com'era (la cimice resta solo se è accesa nelle impostazioni)
      }
    } catch { spegni(); }
  }

  // Misura i livelli veri: energia (volume × densità), basso, chi suona + scena.
  function leggiLive(ciclo) {
    const vivi = (livelli() ?? []).filter((l) => suona(l, ciclo) && l.a === null);
    let energia = 0;
    let basso = 0;
    for (const l of vivi) {
      const m = misuraLivello(l, ciclo);
      if (!l.muto) energia += (l.volume ?? 1) * (0.4 + 0.6 * Math.min(1, m.note / 8));
      if (!l.muto) basso += m.basso * Math.min(1, l.volume ?? 1);
    }
    const beat = statoBeat(livelli() ?? [], ciclo).suona;
    const scena = beat?.beat ? beat.beat.scene[beat.beat.indice]?.nome ?? '' : '';
    const firma = `${vivi.map((l) => l.id).sort().join(',')}#${beat?.beat?.indice ?? ''}`;
    return { energia, basso, firma, scenaDrop: /drop/i.test(scena) };
  }

  // Una volta per fotogramma (dal clock dell'app): scatta quando cambia il sedicesimo.
  function tic(ciclo) {
    if (!cimice) return;
    try {
      const k = Math.floor(ciclo * 16);
      if (k === ultimoK) return;
      const salto = ultimoK === null || k < ultimoK || k - ultimoK > 4;
      ultimoK = k;
      if (salto) { sensore.azzera(); }
      const ora = performance.now();
      const f = fader?.();
      if (typeof f === 'number') sensore.campionaFader(f, ora);
      if (cimice.presente || figlie.length) {
        const ip = lettore.impronta();
        if (ip !== impronta) { impronta = ip; cimice.ricalcola(); for (const f of figlie) f.ricalcola(); }
        const note = lettore.rettangoliNote();
        cimice.segna(note);
        for (const f of figlie) f.segna(note);
      }
      cimice.passo(k);
      for (const f of figlie) f.passo(k);
      if (hackAttivo) {
        // nel finale la cimice è sempre impazzita
        if (k % 16 === 0) { cimice.battuta({ drop: true }); for (const f of figlie) f.battuta({ drop: true }); }
      } else if (k % 16 === 0 && !salto) {
        const lettura = leggiLive(ciclo);
        const esito = sensore.battuta({ ...lettura, sensibilita: preferenze()?.sensibilitaDrop ?? OPZIONI.sensibilitaDrop });
        ultima = { ...lettura, ...esito };
        cimice.battuta(esito);
      }
    } catch { spegni(); }
  }

  // Il messaggio dell'interfaccia: un dispetto è partito (o finito).
  function dispetto(msg) { if (msg?.attivo) cimice?.reagisci(); }

  return { ricarica, tic, spegni, dispetto, hack, get acceso() { return !!cimice; }, get interno() { return cimice; }, get nFiglie() { return figlie.length; }, get ultima() { return ultima; } };
}
