// Dialoghi piccoli dentro la postazione: un nome da scrivere (con suggerimenti) o un sì/no.
// Tutto da tastiera: frecce per scegliere, invio conferma, esc annulla.

let aperto = null;

export const dialogoAperto = () => !!aperto;

function crea(titolo) {
  const fondo = document.createElement('div');
  fondo.className = 'dialogo-fondo';
  const box = document.createElement('div');
  box.className = 'dialogo';
  const t = document.createElement('div');
  t.className = 'lbl';
  t.textContent = titolo;
  box.append(t);
  fondo.append(box);
  document.body.append(fondo);
  return { fondo, box };
}

// suggerimenti: nomi da scegliere al volo. Ritorna il nome, o null se annullato.
export function chiediNome({ titolo, valore = '', suggerimenti = [], conferma = 'ok' }) {
  aperto?.(null);
  return new Promise((resolve) => {
    const prima = document.activeElement;
    const { fondo, box } = crea(titolo);
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.value = valore;
    campo.spellcheck = false;
    campo.placeholder = suggerimenti.length ? 'scegli o scrivi un nome' : 'nome';
    const lista = document.createElement('div');
    lista.className = 'dialogo-lista';
    const piede = document.createElement('div');
    piede.className = 'lbl dialogo-piede';
    piede.textContent = `↵ ${conferma} · esc annulla`;
    box.append(campo, lista, piede);

    let scelto = -1;
    let voci = [];
    const mostra = () => {
      const filtro = campo.value.trim().toLowerCase();
      voci = suggerimenti.filter((s) => !filtro || s.toLowerCase().startsWith(filtro));
      scelto = Math.min(scelto, voci.length - 1);
      lista.replaceChildren(
        ...voci.map((s, i) => {
          const b = document.createElement('button');
          b.className = `key${i === scelto ? ' on' : ''}`;
          b.textContent = s;
          b.onmousedown = (e) => {
            e.preventDefault();
            chiudi(s);
          };
          return b;
        }),
      );
    };
    const chiudi = (risultato) => {
      aperto = null;
      fondo.remove();
      prima?.focus?.();
      resolve(risultato ? risultato.trim() || null : null);
    };
    campo.oninput = () => {
      scelto = -1;
      mostra();
    };
    campo.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') chiudi(null);
      else if (e.key === 'Enter') chiudi(scelto >= 0 ? voci[scelto] : campo.value);
      else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        scelto = voci.length ? (scelto + 1) % voci.length : -1;
        mostra();
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        scelto = voci.length ? (scelto - 1 + voci.length) % voci.length : -1;
        mostra();
      }
    };
    fondo.onmousedown = (e) => e.target === fondo && chiudi(null);
    aperto = chiudi;
    mostra();
    campo.focus();
    campo.select();
  });
}

export function conferma({ titolo, testo, si = 'sì', no = 'no' }) {
  aperto?.(null);
  return new Promise((resolve) => {
    const prima = document.activeElement;
    const { fondo, box } = crea(titolo);
    const p = document.createElement('p');
    p.className = 'secondario';
    p.textContent = testo;
    const fila = document.createElement('div');
    fila.className = 'fila';
    const bSi = document.createElement('button');
    bSi.className = 'key on';
    bSi.innerHTML = `${si} <i>↵</i>`;
    const bNo = document.createElement('button');
    bNo.className = 'key';
    bNo.innerHTML = `${no} <i>esc</i>`;
    fila.append(bSi, bNo);
    box.append(p, fila);
    const chiudi = (r) => {
      aperto = null;
      fondo.remove();
      document.removeEventListener('keydown', tasti, true);
      prima?.focus?.();
      resolve(!!r);
    };
    const tasti = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        chiudi(e.key === 'Enter');
      }
    };
    document.addEventListener('keydown', tasti, true);
    bSi.onclick = () => chiudi(true);
    bNo.onclick = () => chiudi(false);
    fondo.onmousedown = (e) => e.target === fondo && chiudi(false);
    aperto = chiudi;
    bSi.focus();
  });
}
