// Il convertitore: dal modello di un progetto Ableton (leggi.js) alle sezioni di un brano CUTX.
// Puro, senza disco né DOM: lo provano i test e lo usa il pannello di importazione.
// Riferimento per la logica: docs/ableton/als2cutx.py (non è una copia).
//
// Concetti:
// - una *variante* è un contenuto di clip diverso su una traccia (le clip uguali sono la stessa variante);
//   ogni variante diventa una sezione;
// - una traccia si importa come *codice* (le note diventano codice Strudel con un synth di CUTX) o come
//   *audio* (un file: quello della clip, o per una traccia MIDI uno stem esportato da Ableton);
// - `scelte` dice cosa importare; senza scelte si importa tutto con le impostazioni predefinite.
import * as B from '../renderer/brano.js';

const NOMI = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
export const nota = (midi) => `${NOMI[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// --- nomi ---

export function pulisci(nome) {
  return (
    nome
      .replace(/^\d+-/, '')
      .trim()
      .toLowerCase()
      .replace(/\s*\[.*?\]/g, '')
      .replace(/[^a-z0-9àèéìòù ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 28) || 'traccia'
  );
}

const slug = (nome) => nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Il nome di una traccia come sezione: pulito; "audio" e "midi" da soli prendono il loro numero.
export function nomeTraccia(t) {
  const nome = pulisci(t.nome);
  return ['audio', 'midi', 'traccia'].includes(nome) && t.numero !== null ? `${nome} ${t.numero}` : nome;
}

// --- strumenti: che suono di CUTX al posto di quello di Ableton ---

export const SYNTH = {
  pad: '.s("supersaw").attack(.8).release(2).lpf(1800).room(.7).gain(.3)',
  basso: '.s("sawtooth").lpf(500).lpq(4).release(.2).gain(.45)',
  arp: '.s("triangle").decay(.2).sustain(0).delay(.4).delaytime(.375).gain(.4)',
  lead: '.s("square").lpf(2400).release(.3).gain(.3)',
  tasti: '.s("triangle").release(.6).room(.4).gain(.4)',
  synth: '.s("triangle").release(.4).gain(.4)',
};
export const NOMI_SYNTH = Object.keys(SYNTH);

const RUOLI_NOME = [
  ['pad', 'pad'], ['swell', 'pad'], ['sub', 'basso'], ['bass', 'basso'], ['basso', 'basso'], ['arp', 'arp'], ['pluck', 'arp'],
  ['lead', 'lead'], ['key', 'tasti'], ['piano', 'tasti'], ['tape', 'tasti'],
];

// Il synth proposto: dal nome della traccia e dello strumento.
export function synthProposto(t) {
  const n = `${t.nome} ${t.strumento?.nome ?? ''}`.toLowerCase();
  for (const [k, r] of RUOLI_NOME) if (n.includes(k)) return r;
  return 'synth';
}

export const DRUM = {
  kick: 's("sine").note("c2").penv(36).pdecay(.05).decay(.35).sustain(0).gain(1.2)',
  snare: 's("white").hpf(1200).decay(.14).sustain(0).gain(.6)',
  clap: 's("white").hpf(900).lpf(4000).decay(.12).sustain(0).room(.3).gain(.5)',
  hat: 's("white").hpf(8000).decay(.04).sustain(0).gain(.3)',
  perc: 's("triangle").note("c5").decay(.06).sustain(0).gain(.4)',
};

const RUOLI_PAD = [
  ['kick', 'kick'], ['bd', 'kick'], ['bass drum', 'kick'], ['snare', 'snare'], ['sd', 'snare'], ['rim', 'perc'], ['clap', 'clap'],
  ['hat', 'hat'], ['hh', 'hat'], ['shaker', 'hat'], ['ride', 'hat'], ['cymbal', 'hat'], ['crash', 'hat'], ['splash', 'hat'], ['tom', 'perc'], ['perc', 'perc'],
];
const GM = { 36: 'kick', 38: 'snare', 40: 'snare', 39: 'clap', 42: 'hat', 44: 'hat', 46: 'hat' };

// Il ruolo di un pad: dal suo nome, o dalla nota General MIDI se il nome non dice niente.
export function ruoloPad(nome, nota) {
  const n = nome.toLowerCase();
  for (const [k, r] of RUOLI_PAD) if (n.includes(k)) return r;
  return GM[nota] ?? 'perc';
}

// --- ritmo: da note con tempo a mini-notazione ---

const mcd = (a, b) => (b ? mcd(b, a % b) : a);
// i tempi sono in quarti: ×4 = sedicesimi
const sedicesimi = (x) => Math.round(x * 4);

// La risoluzione più larga che contiene tutti gli inizi e le fini: una nota a battuta resta una nota a battuta.
function passoGriglia(eventi, lunghezza) {
  const punti = [...eventi.map(([t]) => sedicesimi(t)), ...eventi.map(([t, d]) => sedicesimi(t + d)), sedicesimi(lunghezza)];
  return Math.max(1, punti.filter((p) => p > 0).reduce(mcd, 0) || 4);
}

// eventi: [tempo, durata, chiave]; formatta(chiave) → testo. `_` prolunga, `~` è una pausa.
export function mini(eventi, lunghezza, formatta) {
  const passo = passoGriglia(eventi, lunghezza);
  const n = Math.floor(sedicesimi(lunghezza) / passo);
  const celle = Array(n).fill(null);
  const fine = Array(n).fill(0);
  for (const [t, d, k] of eventi) {
    const i = Math.floor(sedicesimi(t) / passo);
    if (i < 0 || i >= n) continue;
    (celle[i] ??= []).push(k);
    fine[i] = Math.max(fine[i], Math.floor(sedicesimi(t + d) / passo));
  }
  const out = [];
  let attivo = -1;
  for (let i = 0; i < n; i++) {
    if (celle[i]) {
      const ks = [...new Set(celle[i])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      out.push(ks.length === 1 ? formatta(ks[0]) : `[${ks.map(formatta).join(',')}]`);
      attivo = fine[i];
    } else out.push(i < attivo ? '_' : '~');
  }
  return out.join(' ');
}

export const battute = (lunghezza) => Math.max(1, Math.ceil(lunghezza / 4 - 1e-6));

// Una battuta alla volta (la batteria cambia ogni battuta): <[x ~ x ~] [~] …>
function perBattuta(eventi, lunghezza) {
  const b = battute(lunghezza);
  const pezzi = [];
  for (let k = 0; k < b; k++) {
    const ev = eventi.filter(([t]) => t >= 4 * k && t < 4 * (k + 1)).map(([t, d, x]) => [t - 4 * k, d, x]);
    pezzi.push(ev.length ? mini(ev, 4, (y) => y) : '~');
  }
  return b === 1 ? pezzi[0] : `<${pezzi.map((p) => `[${p}]`).join(' ')}>`;
}

// Note fuori dalla griglia dei sedicesimi (terzine…): vengono arrotondate.
const fuoriGriglia = (note) => note.some(([t, d]) => Math.abs(t * 4 - Math.round(t * 4)) > 0.02 || Math.abs(d * 4 - Math.round(d * 4)) > 0.02);

// --- audio: dal loop in battute alle frazioni del file ---

// I secondi corrispondenti a un tempo in battute, dai marcatori di warp (interpolando tra i due più vicini).
export function secondiDaBattute(marcatori, battuta) {
  if (marcatori.length < 2) return null;
  for (let i = 0; i + 1 < marcatori.length; i++) {
    const [b0, s0] = marcatori[i];
    const [b1, s1] = marcatori[i + 1];
    if (battuta <= b1 || i + 2 === marcatori.length) return s0 + ((battuta - b0) * (s1 - s0)) / (b1 - b0);
  }
  return null;
}

const quattro = (x) => x.toFixed(4);

// --- varianti ---

function hash(testo) {
  let h = 5381;
  for (let i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const firmaClip = (c) =>
  c.tipo === 'midi'
    ? `m|${c.lunghezza}|${c.note.map((n) => n.slice(0, 3).join(',')).join(';')}`
    : `a|${c.file.relativo || c.file.assoluto}|${c.loop.inizio.toFixed(3)}|${c.loop.fine.toFixed(3)}`;

// Le varianti di una traccia, nell'ordine in cui compaiono: prima l'arrangiamento (per posizione),
// poi le clip che stanno solo nella Session (per scena).
export function varianti(traccia) {
  const per = new Map();
  for (const c of traccia.clip) {
    if (c.tipo === 'midi' && !c.note.length) continue;
    const f = firmaClip(c);
    const v = per.get(f) ?? { id: hash(`${traccia.ordine}|${f}`), firma: f, tipo: c.tipo, usi: 0, inizio: null, scena: null, clip: c };
    v.usi++;
    if (c.origine === 'arrangiamento' && (v.inizio === null || c.inizio < v.inizio)) {
      v.inizio = c.inizio;
      v.clip = c;
    }
    if (c.origine === 'sessione' && (v.scena === null || c.scena < v.scena)) v.scena = c.scena;
    per.set(f, v);
  }
  const lista = [...per.values()];
  const chiave = (v) => (v.inizio !== null ? [0, v.inizio, 0] : [1, v.scena ?? 0, 0]);
  lista.sort((a, b) => {
    const [x, y] = [chiave(a), chiave(b)];
    return x[0] - y[0] || x[1] - y[1];
  });
  return lista;
}

const LETTERE = 'abcdefghijklmnopqrstuvwxyz';

// --- le scelte ---

// Cosa si importa se Valerio non cambia niente: tutte le tracce; per le tracce con più di due varianti
// (montaggi di registrazioni) solo le due più usate; MIDI come codice, audio come audio.
export function sceltePredefinite(modello) {
  const tracce = {};
  for (const t of modello.tracce) {
    const vs = varianti(t);
    const scelte = {};
    let incluse = vs;
    if (t.tipo === 'audio' && vs.length > 2) {
      const lung = (v) => v.clip.loop.fine - v.clip.loop.inizio;
      const migliori = [...vs].sort((a, b) => b.usi - a.usi || lung(b) - lung(a)).slice(0, 2);
      incluse = migliori.filter((v) => v.usi >= 2);
      if (!incluse.length && vs.length) incluse = [[...vs].sort((a, b) => lung(b) - lung(a))[0]];
    }
    for (const v of vs) scelte[v.id] = { includi: incluse.includes(v) };
    tracce[t.ordine] = { includi: vs.length > 0, modalita: t.tipo === 'audio' ? 'audio' : 'codice', synth: synthProposto(t), varianti: scelte };
  }
  return { tracce };
}

// --- il cuore: tutte le sezioni possibili, con il flag `incluso` ---

// opzioni: { titolo }. Ritorna { sezioni: [{ id, traccia, nome, etichetta, codice, incluso, inizio, scena, usi, battute,
// suoni, avvisi }], suoni }. Le sezioni non incluse ci sono lo stesso (servono per ascoltarle in cuffia prima di sceglierle):
// il loro audio ha un nome provvisorio `ant_…` e finisce in `provvisori`, non in `suoni`. Con `anteprima: true` lo hanno tutte.
export function costruisci(modello, scelte = sceltePredefinite(modello), { titolo = 'brano', anteprima = false } = {}) {
  const bpm = modello.bpm;
  const prima = slug(pulisci(titolo).split(' ')[0]) || 'brano';
  const suoni = new Map(); // chiave del file → { nome, relativo, assoluto, durata }
  const provvisori = new Map(); // i suoni solo da ascoltare
  const chiaveFile = (file) => file.relativo || file.assoluto;
  const nomeBreve = (file) => chiaveFile(file).split('/').pop().replace(/\.[^.]+$/, '').slice(0, 14);
  // i suoni veri si numerano nell'ordine in cui compaiono; quelli solo da ascoltare hanno un nome provvisorio
  const nomeSuono = (file, incluso) => {
    const chiave = chiaveFile(file);
    if (!incluso || anteprima) {
      if (!provvisori.has(chiave)) provvisori.set(chiave, { nome: `ant_${hash(chiave)}`, relativo: file.relativo, assoluto: file.assoluto, durata: file.durata ?? 0 });
      return provvisori.get(chiave);
    }
    if (!suoni.has(chiave)) {
      suoni.set(chiave, { nome: slug(`${prima} ${String(suoni.size + 1).padStart(2, '0')} ${nomeBreve(file)}`).slice(0, 32), relativo: file.relativo, assoluto: file.assoluto, durata: file.durata ?? 0 });
    }
    return suoni.get(chiave);
  };

  // 1. cosa è incluso e come si chiama: le lettere (a, b, c) contano le varianti incluse, come nel prototipo
  const lavoro = [];
  for (const t of modello.tracce) {
    const vs = varianti(t);
    if (!vs.length) continue;
    const sc = scelte.tracce?.[t.ordine] ?? {};
    const base = nomeTraccia(t);
    const inclusa = (v) => sc.includi !== false && sc.varianti?.[v.id]?.includi !== false;
    const incluse = vs.filter(inclusa);
    vs.forEach((v, i) => {
      const ordine = inclusa(v) ? incluse.indexOf(v) : i;
      const quante = inclusa(v) ? incluse.length : vs.length;
      const auto = quante <= 1 ? base : `${base} ${LETTERE[ordine] ?? ordine + 1}`;
      // la sigla non cambia se si spunta o no: sempre la lettera tra tutte le varianti della traccia
      const sigla = vs.length <= 1 ? base : `${base} ${LETTERE[i] ?? i + 1}`;
      lavoro.push({ t, v, sc, incluso: inclusa(v), auto, base, sigla });
    });
  }

  // 2. il codice di ogni sezione
  const tutte = [];
  for (const { t, v, sc, incluso, auto, sigla } of lavoro) {
    const modalita = sc.modalita ?? (t.tipo === 'audio' ? 'audio' : 'codice');
    const synth = SYNTH[sc.synth] ? sc.synth : synthProposto(t);
    const padNota = new Map(t.pad.map((p) => [p.nota, p.nome]));
    const nome = sc.varianti?.[v.id]?.nome?.trim() || auto;
    const avvisiSezione = [];
    const usati = [];
    let codice;
    let durataS = null; // quanto dura l'audio della sezione, se è audio
    if (v.tipo === 'midi') {
      const { note, lunghezza } = v.clip;
      const b = battute(lunghezza);
      const lento = b > 1 ? `.slow(${b})` : '';
      if (modalita === 'audio' && sc.stem) {
        // uno stem esportato da Ableton (dalla battuta `battuta`): la sezione è il suo pezzo
        if (v.inizio === null) avvisiSezione.push("sta solo nella Session, senza posizione nell'arrangiamento: niente stem, resta il codice");
        else if (!sc.stem.file?.durata) avvisiSezione.push('di questo stem non si conosce la durata: resta il codice');
        else {
          const f = sc.stem.file;
          const s = nomeSuono(f, incluso);
          usati.push(s.nome);
          const da = ((v.inizio - ((sc.stem.battuta ?? 1) - 1) * 4) * 60) / bpm;
          const dur = (lunghezza * 60) / bpm;
          const beg = Math.max(0, Math.min(1, da / f.durata));
          const end = Math.max(0, Math.min(1, (da + dur) / f.durata));
          codice = `s("${s.nome}").begin(${quattro(beg)}).end(${quattro(end)})${lento}\n  .gain(.8)`;
          durataS = Math.max(0, (end - beg) * f.durata);
        }
      }
      if (codice === undefined) {
        if (fuoriGriglia(note)) avvisiSezione.push('note fuori dalla griglia dei sedicesimi (terzine?): arrotondate');
        if (t.drum) {
          const perRuolo = new Map();
          for (const [tempo, d, k] of note) {
            const r = ruoloPad(padNota.get(k) ?? '', k);
            perRuolo.set(r, [...(perRuolo.get(r) ?? []), [tempo, Math.min(d, 0.25), 'x']]);
          }
          const righe = [...perRuolo].sort(([x], [y]) => (x < y ? -1 : 1)).map(([r, ev]) => `  ${DRUM[r]}\n    .struct("${perBattuta(ev, lunghezza)}")`);
          codice = `stack(\n${righe.join(',\n')}\n)`;
        } else codice = `note("${mini(note, lunghezza, nota)}")${lento}\n  ${SYNTH[synth]}`;
      }
    } else {
      const c = v.clip;
      const s = nomeSuono(c.file, incluso);
      usati.push(s.nome);
      const dur = c.file.durata;
      // warpato: i marcatori portano dalle battute ai secondi; altrimenti il loop è già in secondi (ipotesi)
      let s0;
      let s1;
      if (c.warp) {
        s0 = secondiDaBattute(c.marcatori, c.loop.inizio);
        s1 = secondiDaBattute(c.marcatori, c.loop.fine);
        if (s0 === null) [s0, s1] = [(c.loop.inizio * 60) / bpm, (c.loop.fine * 60) / bpm];
      } else [s0, s1] = [c.loop.inizio, c.loop.fine];
      const b = battute(c.loop.fine - c.loop.inizio);
      const [beg, end] = dur ? [Math.max(0, s0 / dur), Math.min(1, s1 / dur)] : [0, 1];
      codice = `s("${s.nome}").begin(${quattro(beg)}).end(${quattro(end)})${b > 1 ? `.slow(${b})` : ''}\n  .gain(.8)`;
      durataS = dur ? Math.max(0, (end - beg) * dur) : Math.max(0, s1 - s0);
      if (c.warp && c.marcatori.length >= 2) {
        // un loop il cui tempo è lontano da quello del progetto cambierà altezza (niente time-stretch)
        const [m0, m1] = [c.marcatori[0], c.marcatori.at(-1)];
        const bpmClip = ((m1[0] - m0[0]) * 60) / (m1[1] - m0[1] || 1);
        if (Math.abs(bpmClip - bpm) / bpm > 0.05) avvisiSezione.push(`audio a ${Math.round(bpmClip)} BPM in un progetto a ${bpm}: cambia altezza (Strudel non fa time-stretch)`);
      }
    }
    tutte.push({
      id: v.id,
      traccia: t.ordine,
      nome,
      etichetta: auto,
      sigla,
      codice,
      incluso,
      tipo: v.tipo,
      inizio: v.inizio,
      scena: v.scena,
      usi: v.usi,
      battute: battute(v.tipo === 'midi' ? v.clip.lunghezza : v.clip.loop.fine - v.clip.loop.inizio),
      suoni: usati,
      durataS,
      avvisi: avvisiSezione,
    });
  }
  // nell'ordine dell'arrangiamento; quelle solo della Session dopo, per scena
  const chiave = (s) => (s.inizio !== null ? [0, s.inizio] : [1, s.scena ?? 0]);
  tutte.sort((a, b) => {
    const [x, y] = [chiave(a), chiave(b)];
    return x[0] - y[0] || x[1] - y[1] || a.traccia - b.traccia;
  });
  return { sezioni: tutte, suoni: [...suoni.values()], provvisori: [...provvisori.values()] };
}

// Il brano finito: testa, preambolo col tempo, una sezione per ogni variante scelta.
export function converti(modello, scelte, { titolo, data, origine } = {}) {
  const r = costruisci(modello, scelte, { titolo });
  const incluse = r.sezioni.filter((s) => s.incluso);
  const usati = new Set(incluse.flatMap((s) => s.suoni));
  const suoni = r.suoni.filter((s) => usati.has(s.nome));
  const visti = new Map();
  const sezioni = incluse.map((s) => {
    visti.set(s.nome, (visti.get(s.nome) ?? 0) + 1);
    const nome = visti.get(s.nome) > 1 ? `${s.nome} ${visti.get(s.nome)}` : s.nome;
    return { ...s, nome, riga: B.rigaSezione(nome), corpo: [...s.codice.split('\n'), ''] };
  });
  const bpm = Number(modello.bpm.toFixed(3));
  const valori = { brano: titolo, bpm, data };
  if (origine) valori.origine = origine;
  if (suoni.length) valori.suoni = suoni.map((s) => s.nome).sort();
  const brano = B.conTesta({ testa: [], preambolo: ['', `setcpm(${bpm}/4)`, ''], sezioni }, valori);
  const testo = B.scrivi(brano).replace(/\n*$/, '\n');
  return { testo, sezioni, suoni, avvisi: incluse.flatMap((s) => s.avvisi.map((a) => `${s.nome}: ${a}`)) };
}
