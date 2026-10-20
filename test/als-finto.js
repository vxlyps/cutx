// Piccoli progetti Ableton finti, costruiti per i test (mai progetti veri): la stessa struttura
// dei .als di Live 12, ridotta a quello che il lettore guarda.
import { gzipSync } from 'node:zlib';

const v = (x) => `<Value Value="${x}" />`;

export function note(tempo, durata, tasto, velocita = 100) {
  return { tempo, durata, tasto, velocita };
}

function xmlNote(n) {
  return `<MidiNoteEvent Time="${n.tempo}" Duration="${n.durata}" Velocity="${n.velocita}" IsEnabled="${n.attiva === false ? 'false' : 'true'}" />`;
}

export function clipMidi({ inizio = 0, loop = [0, 4], note: ns = [], nome = '' }) {
  const perTasto = new Map();
  for (const n of ns) perTasto.set(n.tasto, [...(perTasto.get(n.tasto) ?? []), n]);
  const tracks = [...perTasto].map(([k, l]) => `<KeyTrack><Notes>${l.map(xmlNote).join('')}</Notes><MidiKey Value="${k}" /></KeyTrack>`).join('');
  return `<MidiClip Id="1" Time="${inizio}"><CurrentStart Value="${inizio}" /><CurrentEnd Value="${inizio + loop[1] - loop[0]}" />
    <Loop><LoopStart Value="${loop[0]}" /><LoopEnd Value="${loop[1]}" /></Loop><Name Value="${nome}" />
    <Notes><KeyTracks>${tracks}</KeyTracks></Notes></MidiClip>`;
}

export function clipAudio({ inizio = 0, fine = 8, loop = [0, 8], file = 'Samples/Imported/loop.wav', assoluto = '', marcatori = [[0, 0], [8, 4]], durata = 5, frequenza = 44100, warp = true, nome = '' }) {
  return `<AudioClip Id="2" Time="${inizio}"><CurrentStart Value="${inizio}" /><CurrentEnd Value="${fine}" />
    <Loop><LoopStart Value="${loop[0]}" /><LoopEnd Value="${loop[1]}" /></Loop><Name Value="${nome}" />
    <IsWarped Value="${warp}" />
    <SampleRef><FileRef><RelativePath Value="${file}" /><Path Value="${assoluto}" /></FileRef>
      <DefaultDuration Value="${Math.round(durata * frequenza)}" /><DefaultSampleRate Value="${frequenza}" /></SampleRef>
    <WarpMarkers>${marcatori.map(([b, s], i) => `<WarpMarker Id="${i}" SecTime="${s}" BeatTime="${b}" />`).join('')}</WarpMarkers></AudioClip>`;
}

const traccia = (tag, nome, dispositivi, arrangiamento, slots) => `<${tag} Id="1"><Name><EffectiveName Value="${nome}" /></Name>
  <DeviceChain><DeviceChain><Devices>${dispositivi}</Devices></DeviceChain>
  <MainSequencer><ClipTimeable><ArrangerAutomation><Events>${arrangiamento}</Events></ArrangerAutomation></ClipTimeable>
  <ClipSlotList>${slots}</ClipSlotList></MainSequencer></DeviceChain></${tag}>`;

export const tracciaMidi = ({ nome, strumento = '<OriginalSimpler><UserName Value="" /></OriginalSimpler>', clip = [], sessione = [] }) =>
  traccia('MidiTrack', nome, strumento, clip.join(''), sessione.map((c, i) => `<ClipSlot Id="${i}"><ClipSlot><Value>${c ?? ''}</Value></ClipSlot></ClipSlot>`).join(''));

export const tracciaAudio = ({ nome, clip = [], sessione = [] }) =>
  traccia('AudioTrack', nome, '', clip.join(''), sessione.map((c, i) => `<ClipSlot Id="${i}"><ClipSlot><Value>${c ?? ''}</Value></ClipSlot></ClipSlot>`).join(''));

// pad: [{ nome, ricezione }] con la ricezione come la salva Ableton (128 − nota)
export function drumRack(pad, utente = '') {
  return `<DrumGroupDevice><UserName Value="${utente}" /><Branches>${pad
    .map((p, i) => `<DrumBranch Id="${i}"><Name><EffectiveName Value="${p.nome}" /></Name><BranchInfo><ReceivingNote Value="${p.ricezione}" /></BranchInfo></DrumBranch>`)
    .join('')}</Branches></DrumGroupDevice>`;
}

export function als({ bpm = 120, tracce = [], principale = 'MainTrack' }) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" Creator="Ableton Live 12.3.2"><LiveSet><Tracks>${tracce.join('')}</Tracks>
<${principale}><DeviceChain><Mixer><Tempo><Manual Value="${bpm}" /></Tempo></Mixer></DeviceChain></${principale}></LiveSet></Ableton>`;
  return gzipSync(Buffer.from(xml));
}
