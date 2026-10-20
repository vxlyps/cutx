// Il lettore dei progetti Ableton: un .als è XML compresso con gzip. Qui diventa un modello semplice
// e serializzabile (tempo, tracce, clip con note o audio, pad dei Drum Rack), senza interpretare niente:
// il convertitore (converti.js) è puro e lavora solo su questo modello.
// Gira nel processo principale (node). Riferimento per la logica: docs/ableton/als2cutx.py.
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

// Tag che possono ripetersi: sempre array, anche quando ce n'è uno solo.
const ARRAY = new Set(['MidiTrack', 'AudioTrack', 'ReturnTrack', 'MidiClip', 'AudioClip', 'KeyTrack', 'MidiNoteEvent', 'WarpMarker', 'DrumBranch', 'ClipSlot', 'RelativePathElement']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (nome) => ARRAY.has(nome),
});

const num = (x, predefinito = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : predefinito;
};
// Il valore di <Tag Value="…" />
const val = (el) => el?.['@Value'];

// Tutti i nodi con quel nome, in profondità.
function* trova(el, nome) {
  if (!el || typeof el !== 'object') return;
  for (const [k, v] of Object.entries(el)) {
    if (k.startsWith('@')) continue;
    if (k === nome) yield* [v].flat();
    if (v && typeof v === 'object') for (const x of [v].flat()) yield* trova(x, nome);
  }
}
const primo = (el, nome) => trova(el, nome).next().value;

// Strumenti che si possono riconoscere, col nome che vede Valerio.
const STRUMENTI = {
  InstrumentGroupDevice: 'Instrument Rack',
  DrumGroupDevice: 'Drum Rack',
  OriginalSimpler: 'Simpler',
  MultiSampler: 'Sampler',
  InstrumentVector: 'Wavetable',
  Drift: 'Drift',
  Operator: 'Operator',
  UltraAnalog: 'Analog',
  Collision: 'Collision',
  Tension: 'Tension',
  Electric: 'Electric',
  LoungeLizard: 'Electric',
  StringStudio: 'Tension',
};
const PLUGIN = new Set(['PluginDevice', 'AuPluginDevice', 'Vst3PluginDevice']);

function strumento(traccia) {
  const dispositivi = traccia.DeviceChain?.DeviceChain?.Devices ?? {};
  for (const [tag, v] of Object.entries(dispositivi)) {
    for (const d of [v].flat()) {
      if (!d || typeof d !== 'object') continue;
      const utente = val(d.UserName);
      if (tag in STRUMENTI) return { tipo: STRUMENTI[tag], nome: utente || null };
      if (PLUGIN.has(tag)) {
        const info = primo(d.PluginDesc, 'PlugName') ?? primo(d.PluginDesc, 'Name');
        if (val(info)) return { tipo: `plugin ${val(info)}`, nome: utente || null };
      }
    }
  }
  return null;
}

// RelativePath: un attributo Value (Live 11–12), o un elenco di RelativePathElement (versioni vecchie).
function relativo(fileRef) {
  const r = fileRef?.RelativePath;
  if (!r) return '';
  if (val(r) !== undefined) return val(r) ?? '';
  return [r.RelativePathElement ?? []].flat().map((e) => (e['@Dir'] === '' ? '..' : e['@Dir'])).filter(Boolean).join('/') + (val(fileRef.Name) ? `/${val(fileRef.Name)}` : '');
}

function clipMidi(c, origine, scena) {
  const ls = num(val(c.Loop?.LoopStart));
  const le = num(val(c.Loop?.LoopEnd));
  const note = [];
  for (const kt of [c.Notes?.KeyTracks?.KeyTrack ?? []].flat()) {
    const tasto = num(val(kt.MidiKey));
    for (const n of [kt.Notes?.MidiNoteEvent ?? []].flat()) {
      if (n['@IsEnabled'] === 'false' || n['@IsEnabled'] === false) continue;
      const t = num(n['@Time']);
      if (t >= ls - 1e-6 && t < le) note.push([Math.round((t - ls) * 1e4) / 1e4, num(n['@Duration']), tasto, num(n['@Velocity'], 100)]);
    }
  }
  note.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  return { tipo: 'midi', origine, scena, inizio: num(val(c.CurrentStart), num(c['@Time'])), fine: num(val(c.CurrentEnd)), nome: val(c.Name) || '', lunghezza: le - ls, note };
}

function clipAudio(c, origine, scena) {
  const ref = c.SampleRef ?? {};
  const fileRef = ref.FileRef ?? {};
  const campioni = num(val(ref.DefaultDuration));
  const frequenza = num(val(ref.DefaultSampleRate), 44100) || 44100;
  return {
    tipo: 'audio',
    origine,
    scena,
    inizio: num(val(c.CurrentStart), num(c['@Time'])),
    fine: num(val(c.CurrentEnd)),
    nome: val(c.Name) || '',
    loop: { inizio: num(val(c.Loop?.LoopStart)), fine: num(val(c.Loop?.LoopEnd)) },
    warp: val(c.IsWarped) !== 'false',
    marcatori: [c.WarpMarkers?.WarpMarker ?? []].flat().map((w) => [num(w['@BeatTime']), num(w['@SecTime'])]).sort((a, b) => a[0] - b[0]),
    file: { relativo: relativo(fileRef), assoluto: val(fileRef.Path) ?? '', durata: campioni ? campioni / frequenza : 0 },
  };
}

function leggiClip(traccia) {
  const clip = [];
  const eventi = traccia.DeviceChain?.MainSequencer?.ClipTimeable?.ArrangerAutomation?.Events ?? primo(traccia, 'ArrangerAutomation')?.Events ?? {};
  for (const c of [eventi.MidiClip ?? []].flat()) clip.push(clipMidi(c, 'arrangiamento', null));
  for (const c of [eventi.AudioClip ?? []].flat()) clip.push(clipAudio(c, 'arrangiamento', null));
  // Session: ogni slot è una scena. Il nodo interno ha lo stesso nome (ClipSlot/ClipSlot/Value).
  const slots = [primo(traccia, 'ClipSlotList')?.ClipSlot ?? []].flat();
  slots.forEach((s, i) => {
    const v = [s.ClipSlot].flat()[0]?.Value; // il nodo interno si chiama ClipSlot come l'esterno: anche lui è un array
    if (!v || typeof v !== 'object') return;
    const scena = num(s['@Id'], i);
    for (const c of [v.MidiClip ?? []].flat()) clip.push(clipMidi(c, 'sessione', scena));
    for (const c of [v.AudioClip ?? []].flat()) clip.push(clipAudio(c, 'sessione', scena));
  });
  return clip;
}

function leggiTraccia(t, tipo, ordine) {
  const nomeOriginale = val(t.Name?.EffectiveName) ?? 'traccia';
  const numero = /^(\d+)-/.exec(nomeOriginale);
  const pad = [];
  const rack = tipo === 'midi' ? primo(t.DeviceChain, 'DrumGroupDevice') : null;
  if (rack) {
    for (const b of trova(rack, 'DrumBranch')) {
      const ricezione = val(primo(b, 'ReceivingNote'));
      if (ricezione === undefined) continue;
      // Ableton salva la nota di ricezione "al contrario": la nota vera è 128 meno il valore
      // (verificato sui progetti x1 e Mayia: il pad Kick ha 92 → nota 36, la cassa GM).
      pad.push({ nome: val(b.Name?.EffectiveName) ?? '', nota: 128 - num(ricezione) });
    }
  }
  return {
    ordine,
    tipo,
    nome: nomeOriginale,
    numero: numero ? Number(numero[1]) : null,
    strumento: tipo === 'midi' ? strumento(t) : null,
    drum: !!rack,
    pad,
    clip: leggiClip(t),
  };
}

// Il modello di un progetto, dai byte del file .als.
export function leggiAls(byte) {
  const xml = gunzipSync(byte).toString('utf8');
  const radice = parser.parse(xml).Ableton;
  const ls = radice?.LiveSet;
  if (!ls) throw new Error('non sembra un progetto Ableton');
  const principale = ls.MainTrack ?? ls.MasterTrack;
  const bpm = num(val(primo(principale, 'Tempo')?.Manual), 120) || 120;
  const tracce = [];
  // l'ordine delle tracce nel progetto: i tag sono separati, ma l'Id cresce con la creazione; si ordina per il numero nel nome
  for (const t of [ls.Tracks?.MidiTrack ?? []].flat()) tracce.push(leggiTraccia(t, 'midi', 0));
  for (const t of [ls.Tracks?.AudioTrack ?? []].flat()) tracce.push(leggiTraccia(t, 'audio', 0));
  tracce.sort((a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9));
  tracce.forEach((t, i) => (t.ordine = i));
  let fine = 0;
  for (const t of tracce) for (const c of t.clip) if (c.origine === 'arrangiamento') fine = Math.max(fine, c.fine);
  return { versione: radice['@Creator'] ?? '', bpm, battute: Math.ceil(fine / 4), tracce };
}

export async function leggiAlsFile(percorso) {
  return leggiAls(await readFile(percorso));
}
