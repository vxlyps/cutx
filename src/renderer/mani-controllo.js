// Le mani (sperimentale): la macchina che decide quando la mano comanda e che valore dà. Modulo puro: lo provano i test.
//
//   libera ──(aperta e ferma ~½ s)──▶ agganciata ──(mano sparita)──▶ persa (valore fermo 2 s) ──▶ rilascio (torna a neutro piano) ──▶ libera
//                                          │                              └─(rientra, aperta e ferma ¼ s)─▶ agganciata, riparte da dov'era
//                                          └─(pugno)──▶ bloccata (il valore resta lì finché non riaggancio)
//
// - niente salto: all'aggancio il valore resta dov'è e la mano lo sposta da lì (come una manopola già girata). Il percorso della mano
//   sopra e sotto il punto di aggancio è scalato, così tutta la manopola resta raggiungibile;
// - il valore è ammorbidito (niente tremolio) con una piccola zona morta: la riga globale cambia solo se è cambiato davvero, ≤15 al secondo;
// - col pugno il valore torna a un attimo prima (chiudere la mano lo sposta un po'), poi resta fermo;
// - ferma()/cambiaModo(): niente più riga, subito; il chiamante rimette com'era.
import { analizza, ZONA_TUTTA } from './mani-gesto.js';
import { MODI, MODO_DI_SERIE, altezzaDaY, modoValido, valoreDaX } from './mani-modi.js';

const TAU_MS = 120; // l'ammorbidimento: in circa mezzo secondo il valore segue la mano
const ZONA_MORTA = 0.012; // quanto deve muoversi un valore (0..1) per riscrivere la riga
const OGNI_MS = 66; // al massimo ~15 righe al secondo: ogni riga globale fa rifare i pattern del live
const AGGANCIO_MS = 500; // aperta e ferma così a lungo per agganciare (tarabile)
const RIAGGANCIO_MS = 250; // dopo una mano persa: riaggancio al volo
const SOGLIA_FERMA = 0.3; // quanto può muoversi il palmo (in «palmi») restando «fermo»
const ATTESA_PERSA_MS = 150; // la mano manca da meno di così: un fotogramma saltato, non è persa
const TENUTA_PERSA_MS = 2000; // da persa il valore resta fermo
const CICLI_RILASCIO = 2;
const RILASCIO_MIN_MS = 500;
const PUGNO_MS = 200; // il pugno conta se dura così a lungo
const STORIA_MS = 700;
const RIAVVOLGI_MS = 120; // col pugno il valore torna a così tanto prima che iniziasse a chiudersi

const limita = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const distanza = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

// Dalla posizione p della mano (0..1) al valore, con la mano che aggancia in p0 dove il valore era v0.
const mappa = (p, p0, v0) => (p >= p0 ? v0 + (1 - v0) * limita((p - p0) / Math.max(1 - p0, 0.08)) : v0 * limita(p / Math.max(p0, 0.08)));

export class ControlloMano {
  // aggancioMs: quanto tenere la mano ferma; zona: { x, y, w, h } a specchio; cicloMs: () => durata di un ciclo in ms (dal BPM del live)
  constructor({ modo = MODO_DI_SERIE, sensibilita = 0.5, aggancioMs = AGGANCIO_MS, zona = ZONA_TUTTA, cicloMs = () => 2000 } = {}) {
    this.modoId = modoValido(modo);
    this.sensibilita = sensibilita;
    this.aggancioMs = aggancioMs;
    this.zona = zona;
    this.cicloMs = cicloMs;
    this.azzera();
  }

  get modo() {
    return MODI[this.modoId];
  }

  neutri() {
    return this.modo.params.map((p) => p.neutro);
  }

  azzera() {
    this.fase = 'libera';
    this.valori = this.neutri();
    this.inviati = null; // i valori dell'ultima riga scritta (null = nessuna riga nel live)
    this.riga = null;
    this.voci = []; // le stesse cose della riga, una per una (per il livello scelto)
    this.ultimaOra = null;
    this.ultimoInvio = -Infinity;
    this.ultimaVista = -Infinity; // l'ultima volta che ho visto la mano
    this.ancora = null; // dove e da quando la mano sta ferma (per l'aggancio)
    this.progresso = 0;
    this.pivot = null; // { p, v }[] per parametro, fissato all'aggancio
    this.pugnoDa = null;
    this.persaDa = null;
    this.rilascio = null; // { t0, v0 }
    this.storia = [];
    this.forza = false; // riscrivere la riga com'è (un live rinato non la sa)
  }

  // Le posizioni (0..1) della mano per ogni parametro del modo.
  posizioni(a) {
    const z = this.zona;
    const xr = (a.centro[0] - z.x) / z.w;
    const yr = (a.centro[1] - z.y) / z.h;
    return this.modo.params.map((p) => (p.fonte === 'y' ? altezzaDaY(yr, this.sensibilita) : p.fonte === 'x' ? valoreDaX(xr, this.sensibilita) : a.dita));
  }

  stato(cambia) {
    return {
      fase: this.fase,
      progresso: this.progresso,
      controlla: this.riga !== null,
      riga: this.riga,
      voci: [...this.voci],
      cambia,
      valori: [...this.valori],
      altezza: this.valori[0],
      modo: this.modoId,
      nomeModo: this.modo.nome,
      testo: this.modo.testo(this.valori),
      breve: this.modo.breve(this.valori), // solo i numeri (per il proiettore)
      rilascio: this.fase === 'rilascio' || this.fase === 'persa',
      agganciata: this.fase === 'agganciata',
      bloccata: this.fase === 'bloccata',
    };
  }

  // Un passo: { mano: { punti, ar? } | null, ora (ms) } → lo stato (vedi stato()). `cambia` dice se la riga globale va riscritta o tolta.
  aggiorna({ mano, ora, ar = mano?.ar ?? 4 / 3 }) {
    const dt = this.ultimaOra === null ? 0 : Math.max(0, ora - this.ultimaOra);
    this.ultimaOra = ora;
    const a = mano ? analizza(mano.punti, ar) : null;
    if (a) this.ultimaVista = ora;
    const sparita = !a && ora - this.ultimaVista >= ATTESA_PERSA_MS;

    // il pugno sostenuto blocca (da agganciata, o se la mano rientra a pugno mentre il valore aspetta)
    if (['agganciata', 'persa', 'rilascio'].includes(this.fase)) {
      if (a?.forma === 'pugno') {
        this.pugnoDa ??= ora;
        if (ora - this.pugnoDa >= PUGNO_MS) this.blocca();
      } else this.pugnoDa = null;
    }

    if (this.fase === 'agganciata') {
      if (sparita) {
        this.fase = 'persa';
        this.persaDa = this.ultimaVista;
        this.ancora = null;
        this.progresso = 0;
      } else if (a) {
        const pos = this.posizioni(a);
        const k = dt ? 1 - Math.exp(-dt / TAU_MS) : 1;
        this.valori = this.valori.map((v, i) => v + (mappa(pos[i], this.pivot[i].p, this.pivot[i].v) - v) * k);
        this.storia.push({ ora, valori: [...this.valori] });
        while (this.storia.length > 1 && ora - this.storia[0].ora > STORIA_MS) this.storia.shift();
      }
    } else if (this.fase === 'persa' || this.fase === 'rilascio') {
      if (this.fase === 'persa' && ora - this.persaDa >= TENUTA_PERSA_MS) {
        this.fase = 'rilascio';
        this.rilascio = { t0: ora, v0: [...this.valori] };
      }
      if (this.fase === 'rilascio') {
        const durata = Math.max(RILASCIO_MIN_MS, CICLI_RILASCIO * this.cicloMs());
        const p = (ora - this.rilascio.t0) / durata;
        if (p >= 1) return this.finisciRilascio();
        const n = this.neutri();
        this.valori = this.rilascio.v0.map((v, i) => v + (n[i] - v) * p);
      }
      if (this.tentaAggancio(a, ora, sparita, ar, RIAGGANCIO_MS)) this.agganciaIn(a);
    } else if (this.tentaAggancio(a, ora, sparita, ar, this.aggancioMs)) this.agganciaIn(a); // libera o bloccata

    return this.stato(this.decidiRiga(ora));
  }

  // La mano è aperta e ferma da abbastanza? Aggiorna l'anello (progresso). La ferma/aperta si perde se si muove o si chiude.
  tentaAggancio(a, ora, sparita, ar, durata) {
    if (!a) {
      if (sparita) this.ancora = null;
      if (sparita) this.progresso = 0;
      return false;
    }
    if (a.forma !== 'aperta') {
      this.ancora = null;
      this.progresso = 0;
      return false;
    }
    const mosso = this.ancora && Math.hypot((a.centro[0] - this.ancora.c[0]) * ar, a.centro[1] - this.ancora.c[1]) / a.dim > SOGLIA_FERMA;
    if (!this.ancora || mosso) this.ancora = { c: a.centro, t: ora };
    this.progresso = limita((ora - this.ancora.t) / durata);
    return this.progresso >= 1;
  }

  agganciaIn(a) {
    const pos = this.posizioni(a);
    this.pivot = pos.map((p, i) => ({ p, v: this.valori[i] }));
    this.fase = 'agganciata';
    this.progresso = 1;
    this.ancora = null;
    this.pugnoDa = null;
    this.persaDa = null;
    this.rilascio = null;
    this.storia = [];
  }

  blocca() {
    const da = this.pugnoDa - RIAVVOLGI_MS;
    if (this.fase === 'agganciata') {
      const prima = [...this.storia].reverse().find((s) => s.ora <= da) ?? this.storia[0];
      if (prima) this.valori = [...prima.valori];
    }
    this.fase = 'bloccata';
    this.pugnoDa = null;
    this.persaDa = null;
    this.rilascio = null;
    this.ancora = null;
    this.progresso = 0;
    this.ultimoInvio = -Infinity; // il valore riavvolto si scrive subito
  }

  finisciRilascio() {
    const c = this.riga !== null;
    const modoId = this.modoId;
    this.azzera();
    this.modoId = modoId;
    this.valori = this.neutri();
    return { ...this.stato(c), cambia: c };
  }

  // La riga globale va riscritta? Solo se un valore si è mosso oltre la zona morta (e al massimo ogni OGNI_MS).
  decidiRiga(ora) {
    if (this.forza) {
      this.forza = false;
      if (this.riga !== null) {
        this.ultimoInvio = ora;
        return true;
      }
    }
    const riferimento = this.inviati ?? this.neutri();
    if (distanza(this.valori, riferimento) < ZONA_MORTA) return false;
    if (ora - this.ultimoInvio < OGNI_MS) return false;
    this.ultimoInvio = ora;
    const voci = this.modo.voci(this.valori);
    const nuova = this.modo.riga(this.valori);
    this.inviati = nuova === null ? null : [...this.valori];
    if (nuova === this.riga) return false; // la riga è uguale (valori diversi ma stesso testo, o ancora tutto spento)
    this.riga = nuova;
    this.voci = voci;
    return true;
  }

  // Il live è rinato e non ha più la riga: al prossimo passo la riscrivo com'è.
  riscrivi() {
    this.forza = true;
  }

  // Il tasto M (o la camera che si ferma): niente più riga, subito. cambia: true solo se c'era una riga da togliere.
  ferma() {
    const c = this.riga !== null;
    const modoId = this.modoId;
    this.azzera();
    this.modoId = modoId;
    this.valori = this.neutri();
    return { ...this.stato(c), cambia: c };
  }

  // ⇧M: un altro modo. Si riparte da neutro (la riga del modo vecchio va tolta dal chiamante, se cambia è true).
  cambiaModo(id) {
    const c = this.riga !== null;
    this.azzera();
    this.modoId = modoValido(id);
    this.valori = this.neutri();
    return { ...this.stato(c), cambia: c };
  }
}
