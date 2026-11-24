// Impostazioni → canali: gli 8 CH del LIVE (nome, tipi, FREE). Ogni modifica valida si salva subito; a live acceso la pagina è di sola lettura.
import { TIPI, validaCanali } from './canali.js';
import it from './testi/it.json';

const $ = (id) => document.getElementById(id);
const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};
const T = it.canali;

export class PaginaCanali {
  // dati: { config(), salva(config), ripristina(), vivo(), errori() }
  constructor(dati) {
    this.dati = dati;
    $('can-aiuto').textContent = T.aiuto;
    $('can-predefinito').textContent = T.predefinito;
    $('can-predefinito').onclick = () => !this.dati.vivo() && this.dati.ripristina();
    this.disegna();
  }

  // Tocca un solo CH alla volta: copia profonda, modifica, controlla, salva.
  cambia(i, modifica) {
    if (this.dati.vivo()) return;
    const nuova = this.dati.config().map((c) => ({ ...c, tipi: [...c.tipi] }));
    modifica(nuova, nuova[i]);
    const errori = validaCanali(nuova);
    if (errori.length) return this.mostraErrore(errori[0]);
    this.dati.salva(nuova);
  }

  mostraErrore(testo) {
    $('can-errore').textContent = testo;
  }

  disegna() {
    const config = this.dati.config();
    const fermo = !this.dati.vivo();
    const errori = this.dati.errori();
    const firma = JSON.stringify([config, fermo, errori]);
    if (firma === this.firma) return; // il live manda lo stato di continuo: ridisegno solo se qualcosa è cambiato
    $('can-avviso').textContent = fermo ? '' : T.fermo;
    $('can-errore').textContent = errori.length ? T.letto.replace('{motivo}', errori[0]) : '';
    $('can-predefinito').disabled = !fermo;
    const righe = $('can-righe');
    if (righe.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // non rovinare quello che sto scrivendo
    this.firma = firma;
    righe.replaceChildren(
      ...config.map((c, i) => {
        const riga = crea('div', 'imp-riga can-riga');
        const num = crea('span', 'lbl can-num', T.ch.replace('{n}', i + 1));
        const nome = crea('input', 'can-nome');
        nome.value = c.nome;
        nome.maxLength = 14;
        nome.disabled = !fermo;
        nome.setAttribute('aria-label', T.nome);
        nome.onchange = () => {
          if (!nome.value.trim()) return this.mostraErrore(T.errNome.replace('{n}', i + 1)), this.disegna();
          this.cambia(i, (_, ch) => { ch.nome = nome.value.trim(); });
        };
        const tipi = crea('div', 'segmenti can-tipi');
        for (const t of TIPI) {
          const b = crea('button', 'key', T.tipi[t]);
          b.classList.toggle('acid', c.tipi.includes(t));
          b.disabled = !fermo;
          b.onclick = () => this.cambia(i, (tutti, ch) => {
            const c0 = ch.tipi.includes(t);
            for (const x of tutti) x.tipi = x.tipi.filter((y) => y !== t); // un tipo sta in un CH solo: toccarlo qui lo porta qui
            if (!c0) ch.tipi.push(t);
          });
          tipi.append(b);
        }
        const free = crea('button', 'key', T.free);
        free.title = T.freeAiuto;
        free.classList.toggle('acid', c.free);
        free.disabled = !fermo;
        free.onclick = () => this.cambia(i, (tutti, ch) => { for (const x of tutti) x.free = false; ch.free = true; });
        riga.append(num, nome, tipi, free);
        return riga;
      }),
    );
  }
}
