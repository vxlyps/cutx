// La scheda DRUM: dalla griglia a passi al codice Strudel, e ritorno. Modulo puro (lo provano i test), scritto da Codex.
// Il codice è lo `stack(` di una riga per suono: s("bd ~ ~ ~ bd …").gain(".8 ~ ~ ~ .8 …"), con .slow(2|4) per più cicli.
// Quello che non si legge (ritmi euclidei, `*`, `[ ]`, altri effetti, commenti scritti a mano) resta com'è come riga `testo`: mai cancellato.
// Il numero di passi persi dal cambio di formato (passiPersi) conta come persi solo quelli che nel nuovo formato non hanno un posto uguale.
export const MARCA = '// @drum';
export const PASSI = [16, 32];
export const CICLI = [1, 2, 4];
export const RIGHE_MAX = 16;
export const VEL_DI_SERIE = 0.8;
export const VEL_MIN = 0.05;

const statoValido = (s) => s && Array.isArray(s.righe) && PASSI.includes(s.passi) && CICLI.includes(s.cicli);

export function iniziale() {
  return { passi: 16, cicli: 1, righe: [] };
}

export function slot(stato) {
  return stato?.passi * stato?.cicli || 0;
}

export function suonoValido(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_]{1,40}(:[0-9]{1,3})?$/.test(s);
}

export function bancoValido(b) {
  return typeof b === 'string' && (b === '' || /^[A-Za-z0-9_]{1,40}$/.test(b));
}

export function numero(v) {
  const n = Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  return String(n).replace(/^(-?)0\./, '$1.');
}

function tokenVel(vel) {
  return vel > 0 ? numero(vel) : '~';
}

function scriviGriglia(riga, stato) {
  if (!suonoValido(riga.suono) || !bancoValido(riga.banco)) return null;
  const totale = slot(stato);
  const vel = Array.from({ length: totale }, (_, i) => Number(riga.vel?.[i]) || 0);
  const vuota = vel.every((v) => !(v > 0));
  const note = vuota ? Array(totale).fill('~') : vel.map((v) => v > 0 ? riga.suono : '~');
  let testo = `s("${note.join(' ')}")`;
  if (!vuota) testo += `.gain("${vel.map(tokenVel).join(' ')}")`;
  if (riga.banco) testo += `.bank("${riga.banco}")`;
  if (vuota) testo += ` // ${riga.suono}`;
  return testo;
}

function commentoIndice(testo) {
  let q = '';
  let esc = false;
  for (let i = 0; i < testo.length - 1; i++) {
    const c = testo[i];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '/' && testo[i + 1] === '/') return i;
  }
  return -1;
}

function virgole(testo) {
  const parti = [];
  let inizio = 0;
  let q = '';
  let esc = false;
  let commento = false;
  const pila = [];
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (commento) {
      if (c === '\n') commento = false;
      continue;
    }
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = '';
      continue;
    }
    if (c === '/' && testo[i + 1] === '/') { commento = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) pila.push(c);
    else if (')]}'.includes(c)) pila.pop();
    else if (c === ',' && pila.length === 0) {
      let fine = i + 1;
      while (fine < testo.length && /[ \t]/.test(testo[fine])) fine++;
      if (testo.slice(fine, fine + 2) === '//') {
        const nl = testo.indexOf('\n', fine);
        const fineCommento = nl < 0 ? testo.length : nl;
        parti.push(pulisciArgomento(`${testo.slice(inizio, i)} ${testo.slice(fine, fineCommento)}`));
        inizio = nl < 0 ? testo.length : nl + 1;
        i = fineCommento;
        continue;
      }
      parti.push(pulisciArgomento(testo.slice(inizio, i)));
      inizio = i + 1;
    }
  }
  const ultima = pulisciArgomento(testo.slice(inizio));
  if (ultima) parti.push(ultima);
  else if (parti.length && /,\s*$/.test(testo)) parti.push('');
  return parti;
}

function pulisciArgomento(testo) {
  const righe = testo.trim().split('\n');
  // I due spazi esterni sono rientro del codice generato, non testo della riga.
  return righe.map((r, i) => i === 0 ? r.trimStart() : r.replace(/^ {1,2}/, '')).join('\n').trimEnd();
}

function estraiStack(testo) {
  const inizio = /^stack\s*\(/.exec(testo);
  if (!inizio) return null;
  let profondita = 1;
  let q = '';
  let esc = false;
  let commento = false;
  const pila = ['('];
  for (let i = inizio[0].length; i < testo.length; i++) {
    const c = testo[i];
    if (commento) { if (c === '\n') commento = false; continue; }
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = '';
      continue;
    }
    if (c === '/' && testo[i + 1] === '/') { commento = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) pila.push(c);
    else if (')]}'.includes(c)) {
      const aperta = pila.pop();
      if (!aperta || { ')': '(', ']': '[', '}': '{' }[c] !== aperta) return null;
      profondita--;
      if (profondita === 0) return { interno: testo.slice(inizio[0].length, i), dopo: testo.slice(i + 1).trim() };
    }
    if (pila.length > 1 && '([{'.includes(c)) profondita++;
  }
  return null;
}

function commentoFuori(testo) {
  const i = commentoIndice(testo);
  return i < 0 ? { codice: testo.trim(), commento: '' } : { codice: testo.slice(0, i).trim(), commento: testo.slice(i + 2).trim() };
}

function leggiGriglia(crudo) {
  const { codice: corpo, commento } = commentoFuori(crudo);
  if (/[\r\n]/.test(corpo)) return null;
  const m = /^s\s*\(\s*(["'])(.*?)\1\s*\)(.*)$/s.exec(corpo);
  if (!m) return null;
  const token = m[2].trim() ? m[2].trim().split(/\s+/) : [];
  if (!token.length || token.some((t) => t !== '~' && !suonoValido(t))) return null;
  let resto = m[3].trim();
  let gain = null;
  let banco = '';
  let haBanco = false;
  while (resto) {
    const chiamata = /^\.\s*(gain|bank)\s*\(\s*(["'])(.*?)\2\s*\)/s.exec(resto);
    if (!chiamata) return null;
    if (chiamata[1] === 'gain') {
      if (gain !== null) return null;
      gain = chiamata[3].trim() ? chiamata[3].trim().split(/\s+/) : [];
    } else {
      if (haBanco) return null;
      banco = chiamata[3];
      if (!bancoValido(banco)) return null;
      haBanco = true;
    }
    resto = resto.slice(chiamata[0].length).trim();
  }
  if (gain && gain.length !== token.length) return null;
  const suoni = token.filter((t) => t !== '~');
  const unici = [...new Set(suoni)];
  if (unici.length > 1) return null;
  let suono = unici[0];
  if (suono && commento) return null; // un commento scritto a mano su una riga con passi accesi non si può perdere: resta come testo
  if (!suono) {
    if (!suonoValido(commento)) return null;
    suono = commento;
  }
  const vel = [];
  for (let i = 0; i < token.length; i++) {
    if (gain) {
      const g = gain[i];
      if (token[i] === '~') {
        if (g !== '~') return null;
        vel.push(0);
      } else {
        if (g === '~' || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(g)) return null;
        const n = Number(g);
        if (!(n > 0 && n <= 1)) return null;
        vel.push(n);
      }
    } else vel.push(token[i] === '~' ? 0 : VEL_DI_SERIE);
  }
  return { tipo: 'griglia', suono, banco, vel };
}

export function codice(stato) {
  if (!statoValido(stato)) return 'stack()';
  const argomenti = [];
  for (const riga of stato.righe) {
    if (riga?.tipo === 'griglia') {
      const testo = scriviGriglia(riga, stato);
      if (testo !== null) argomenti.push(testo.split('\n'));
    } else if (riga?.tipo === 'testo' && typeof riga.testo === 'string') {
      argomenti.push(riga.testo.split('\n'));
    }
  }
  const indentate = argomenti.map((righe) => righe.map((r) => `  ${r}`));
  // La virgola va prima del commento finale dell'argomento.
  for (let i = 0; i < indentate.length - 1; i++) {
    const ultime = indentate[i];
    const indice = ultime.length - 1;
    const c = commentoIndice(ultime[indice]);
    if (c < 0) ultime[indice] += ',';
    else ultime[indice] = `${ultime[indice].slice(0, c).trimEnd()}, ${ultime[indice].slice(c)}`;
  }
  const piatte = indentate.flat();
  return `stack(${piatte.length ? `\n${piatte.join('\n')}\n` : ''})${stato.cicli > 1 ? `.slow(${stato.cicli})` : ''}`;
}

export function clip(stato) {
  return `${MARCA}\n${codice(stato)}\n`;
}

export function haMarca(testo) {
  return typeof testo === 'string' && testo.split(/\r?\n/).some((r) => r.trim() === MARCA);
}

export function leggiCodice(testo) {
  if (typeof testo !== 'string' || !testo.trim()) return { errore: 'non è una griglia DRUM' };
  const righe = testo.split(/\r?\n/);
  while (righe.length && (!righe[0].trim() || /^\s*\/\//.test(righe[0]))) righe.shift();
  const sorgente = righe.join('\n').trim().replace(/;\s*$/, '');
  const estratto = estraiStack(sorgente);
  if (!estratto) return { errore: 'non è una griglia DRUM' };
  const lento = /^\.slow\s*\(\s*([24])\s*\)$/.exec(estratto.dopo);
  if (estratto.dopo && !lento) return { errore: 'non è una griglia DRUM' };
  const cicli = Number(lento?.[1] || 1);
  const crudi = virgole(estratto.interno);
  if (crudi.length > RIGHE_MAX) return { errore: 'troppe righe' };
  const letture = crudi.map(leggiGriglia);
  let formato = null;
  for (const r of letture) {
    if (!r) continue;
    const n = r.vel.length;
    if (n === 16 * cicli || n === 32 * cicli) { formato = n / cicli; break; }
  }
  const passi = formato || 16;
  const attesi = passi * cicli;
  const avvisi = [];
  const righeStato = crudi.map((crudo, i) => {
    const r = letture[i];
    if (r && r.vel.length === attesi) return r;
    avvisi.push(`riga ${i + 1}: non si legge, resta nel testo`);
    return { tipo: 'testo', testo: crudo };
  });
  return { stato: { passi, cicli, righe: righeStato }, avvisi };
}

export function aggiungiRiga(stato, suono, banco = '') {
  if (!statoValido(stato) || stato.righe.length >= RIGHE_MAX || !suonoValido(suono) || !bancoValido(banco)) return stato;
  return { ...stato, righe: [...stato.righe, { tipo: 'griglia', suono, banco, vel: Array(slot(stato)).fill(0) }] };
}

export function togliRiga(stato, indice) {
  if (!statoValido(stato) || !Number.isInteger(indice) || indice < 0 || indice >= stato.righe.length) return stato;
  return { ...stato, righe: stato.righe.filter((_, i) => i !== indice) };
}

export function spostaRiga(stato, da, a) {
  if (!statoValido(stato) || !Number.isInteger(da) || !Number.isInteger(a) || da < 0 || a < 0 || da >= stato.righe.length || a >= stato.righe.length) return stato;
  const righe = [...stato.righe];
  righe.splice(a, 0, righe.splice(da, 1)[0]);
  return { ...stato, righe };
}

export function cambiaSuono(stato, indice, suono, banco = '') {
  const r = stato?.righe?.[indice];
  if (!statoValido(stato) || r?.tipo !== 'griglia' || !suonoValido(suono) || !bancoValido(banco)) return stato;
  return { ...stato, righe: stato.righe.map((x, i) => i === indice ? { ...x, suono, banco } : x) };
}

export function impostaPasso(stato, riga, passo, vel) {
  const r = stato?.righe?.[riga];
  if (!statoValido(stato) || r?.tipo !== 'griglia' || !Number.isInteger(passo) || passo < 0 || passo >= slot(stato)) return stato;
  const n = typeof vel === 'number' && Number.isFinite(vel) && vel > 0 ? Math.min(1, Math.max(VEL_MIN, vel)) : 0;
  const righe = [...stato.righe];
  const valori = [...r.vel];
  valori[passo] = n ? Math.round(n * 100) / 100 : 0;
  righe[riga] = { ...r, vel: valori };
  return { ...stato, righe };
}

export function ridimensiona(stato, passi, cicli) {
  if (!statoValido(stato) || !PASSI.includes(passi) || !CICLI.includes(cicli)) return stato;
  const vecchiPassi = stato.passi;
  const vecchiCicli = stato.cicli;
  const righe = stato.righe.map((r) => {
    if (r?.tipo !== 'griglia') return r;
    const vel = Array(passi * cicli).fill(0);
    for (let c = 0; c < cicli; c++) {
      const cv = c % vecchiCicli;
      for (let s = 0; s < passi; s++) {
        const vecchio = cv * vecchiPassi + (passi >= vecchiPassi ? s / (passi / vecchiPassi) : s * (vecchiPassi / passi));
        if (passi === vecchiPassi) vel[c * passi + s] = r.vel[vecchio] || 0;
        else if (passi > vecchiPassi) vel[c * passi + s] = s % 2 === 0 ? (r.vel[cv * vecchiPassi + s / 2] || 0) : 0;
        else {
          const pari = r.vel[cv * vecchiPassi + s * 2] || 0;
          vel[c * passi + s] = pari > 0 ? pari : (r.vel[cv * vecchiPassi + s * 2 + 1] || 0);
        }
      }
    }
    return { ...r, vel };
  });
  return { passi, cicli, righe };
}

export function passiPersi(stato, passi, cicli) {
  if (!statoValido(stato) || !PASSI.includes(passi) || !CICLI.includes(cicli)) return 0;
  const nuovo = ridimensiona(stato, passi, cicli);
  let persi = 0;
  for (let indice = 0; indice < stato.righe.length; indice++) {
    const r = stato.righe[indice];
    if (r?.tipo !== 'griglia') continue;
    for (let i = 0; i < slot(stato); i++) {
      if (!(r.vel?.[i] > 0)) continue;
      const ci = Math.floor(i / stato.passi);
      const si = i % stato.passi;
      const sn = passi >= stato.passi ? si * (passi / stato.passi) : Math.floor(si / (stato.passi / passi));
      // I cicli in più si confrontano col ciclo che li sostituisce nel nuovo formato.
      const cicloNuovo = ci % cicli;
      if (nuovo.righe[indice]?.vel[cicloNuovo * passi + sn] !== r.vel[i]) persi++;
    }
  }
  return persi;
}
