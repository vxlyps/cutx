// La schermata dei PROJ: all'avvio (come Ableton) e dal tasto PROJ della barra. Schede col numero grande, il sottotitolo,
// l'ultima modifica e quanti brani; «apri» e «+ nuovo PROJ». Il gatto e il logo vengono da design/ (fuori dall'AGPL: design/LICENSE).
import wordmark from '../../design/risorse/logo/cutx_bianco.svg';
import gatto from '../../design/risorse/gatti/gatto_seduto_marcio.svg';
import it from './testi/it.json';

const T = it.proj;
const $ = (id) => document.getElementById(id);
const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};
export const numeroProj = (n) => String(n).padStart(2, '0');
export const etichettaProj = (p) => (p ? `PROJ ${numeroProj(p.numero)}${p.sottotitolo ? ` · ${p.sottotitolo}` : ''}` : T.nessuno);

const data = (ms) => {
  if (!ms) return '–';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export class SchermataProj {
  // azioni: { apri(numero), nuovo(sottotitolo), rinomina(numero, sottotitolo), elenco(), liveSuona() }
  constructor(azioni) {
    this.azioni = azioni;
    this.radice = $('proj-schermata');
    this.griglia = $('proj-griglia');
    this.elenco = [];
    this.aperto = null; // il PROJ aperto ora (null all'avvio)
    this.ultimo = null;
    this.scelto = null; // la scheda col fuoco (frecce, invio)
    this.armato = null; // live che suona: il primo «apri» chiede conferma, il secondo apre
    $('proj-wordmark').src = wordmark;
    $('proj-gatto').src = gatto;
    $('proj-titolo').textContent = T.titolo;
    $('proj-chiudi').textContent = T.chiudi;
    $('proj-chiudi').onclick = () => this.chiudi();
    this.radice.addEventListener('keydown', (e) => this.tasto(e));
  }

  get visibile() {
    return !this.radice.hidden;
  }

  async mostra({ aperto = null, ultimo = null } = {}) {
    this.aperto = aperto;
    this.ultimo = ultimo;
    this.armato = null;
    this.elenco = await this.azioni.elenco();
    this.scelto = aperto ?? ultimo ?? this.elenco.at(-1)?.numero ?? 'nuovo';
    this.radice.hidden = false;
    document.body.classList.add('con-proj');
    $('proj-chiudi').hidden = !aperto;
    this.disegna();
    this.fuoco();
  }

  chiudi() {
    if (!this.aperto) return; // all'avvio si esce solo aprendo un PROJ
    this.radice.hidden = true;
    document.body.classList.remove('con-proj');
  }

  disegna() {
    const avviso = $('proj-avviso');
    avviso.textContent = this.armato ? T.confermaLive : this.aperto && this.azioni.liveSuona() ? T.liveSuona : '';
    this.griglia.replaceChildren(...this.elenco.map((p) => this.scheda(p)), this.schedaNuovo());
  }

  scheda(p) {
    const s = el('div', 'proj-scheda');
    s.dataset.numero = p.numero;
    s.tabIndex = 0;
    if (p.numero === this.scelto) s.classList.add('scelta');
    if (p.numero === this.aperto) s.classList.add('aperta');
    const testa = el('div', 'proj-testa');
    testa.append(el('span', 'proj-sigla', 'PROJ'), el('span', 'proj-numero', numeroProj(p.numero)));
    if (p.numero === this.aperto) testa.append(el('span', 'proj-segno', T.aperto));
    else if (p.numero === this.ultimo) testa.append(el('span', 'proj-segno', T.ultimo));
    const sotto = el('input', 'proj-sottotitolo');
    sotto.value = p.sottotitolo;
    sotto.placeholder = T.sottotitoloVuoto;
    sotto.maxLength = 60;
    sotto.spellcheck = false;
    sotto.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') sotto.blur();
      if (e.key === 'Escape') {
        sotto.value = p.sottotitolo;
        sotto.blur();
      }
    };
    sotto.onchange = async () => {
      await this.azioni.rinomina(p.numero, sotto.value);
      this.elenco = await this.azioni.elenco();
    };
    const info = el('div', 'proj-info', `${data(p.modificato)} · ${p.brani} ${p.brani === 1 ? T.brano : T.brani}`);
    const apri = el('button', 'key proj-apri', p.numero === this.aperto ? T.torna : this.armato === p.numero ? T.apriComunque : T.apri);
    apri.onclick = () => this.apri(p.numero);
    s.onclick = (e) => {
      if (e.target === sotto) return;
      this.scelto = p.numero;
      this.segnaScelta();
    };
    s.ondblclick = (e) => e.target !== sotto && this.apri(p.numero);
    s.append(testa, sotto, info, apri);
    return s;
  }

  schedaNuovo() {
    const s = el('div', 'proj-scheda proj-nuovo');
    s.dataset.numero = 'nuovo';
    s.tabIndex = 0;
    if (this.scelto === 'nuovo') s.classList.add('scelta');
    const prossimo = (this.elenco.at(-1)?.numero ?? 0) + 1;
    const testa = el('div', 'proj-testa');
    testa.append(el('span', 'proj-sigla', 'PROJ'), el('span', 'proj-numero', numeroProj(prossimo)));
    const sotto = el('input', 'proj-sottotitolo');
    sotto.placeholder = T.sottotitoloNuovo;
    sotto.maxLength = 60;
    sotto.spellcheck = false;
    sotto.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.nuovo(sotto.value);
    };
    const kit = this.aperto ?? this.ultimo;
    const info = el('div', 'proj-info', kit ? `${T.kitDa} PROJ ${numeroProj(kit)}` : T.kitVuoto);
    const crea = el('button', 'key proj-apri', T.nuovo);
    crea.onclick = () => this.nuovo(sotto.value);
    s.onclick = () => {
      this.scelto = 'nuovo';
      this.segnaScelta();
      sotto.focus();
    };
    s.append(testa, sotto, info, crea);
    return s;
  }

  segnaScelta() {
    for (const s of this.griglia.children) s.classList.toggle('scelta', String(this.scelto) === s.dataset.numero);
  }

  fuoco() {
    const s = [...this.griglia.children].find((x) => x.dataset.numero === String(this.scelto));
    s?.focus();
  }

  // Col live che suona si cambia PROJ solo confermando: il live continua, cambiano libreria, set e kit.
  async apri(numero) {
    if (numero === this.aperto) return this.chiudi();
    if (this.aperto && this.azioni.liveSuona() && this.armato !== numero) {
      this.armato = numero;
      this.disegna();
      return;
    }
    await this.azioni.apri(numero);
    this.aperto = numero;
    this.chiudi();
  }

  async nuovo(sottotitolo) {
    if (this.aperto && this.azioni.liveSuona() && this.armato !== 'nuovo') {
      this.armato = 'nuovo';
      this.disegna();
      return;
    }
    const info = await this.azioni.nuovo(sottotitolo);
    this.aperto = info?.aperto?.numero ?? null;
    this.chiudi();
  }

  // Frecce per scegliere, invio per aprire, esc per tornare alla postazione (se un PROJ è aperto).
  tasto(e) {
    if (e.target.tagName === 'INPUT') return;
    const numeri = [...this.griglia.children].map((s) => s.dataset.numero);
    const i = numeri.indexOf(String(this.scelto));
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.scelto = numeri[Math.min(numeri.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.scelto = numeri[Math.max(0, i - 1)];
    else if (e.key === 'Enter') return void (this.scelto === 'nuovo' ? this.nuovo('') : this.apri(Number(this.scelto)));
    else if (e.key === 'Escape') return this.chiudi();
    else return;
    e.preventDefault();
    if (this.scelto !== 'nuovo') this.scelto = Number(this.scelto);
    this.segnaScelta();
    this.fuoco();
  }
}
