// Motore cuffia: gira in un processo suo, nascosto. Insegue il live: riceve eventi
// con l'orario assoluto in cui il live li suona e li suona allo stesso istante.
import { getAudioContext, initAudio, registerSynthSounds, samples, superdough } from '@strudel/webaudio';
import { Orologio } from './tempo.js';
import { impostaUscita } from './uscite.js';

// Un evento che arriva con meno margine di così è perso: meglio saltarlo che suonarlo in ritardo.
const MARGINE_MIN = 0.005;

const ac = getAudioContext();
const orologio = new Orologio(ac);
const pronto = (async () => {
  await registerSynthSounds();
  await initAudio();
})();

let porta = null;
let offsetMs = 0;
let tardi = 0;
let errore = null;

async function configura({ uscita, suoni, offset }) {
  await pronto;
  if (offset !== undefined) offsetMs = offset;
  try {
    if (uscita !== undefined) await impostaUscita(ac, uscita);
    if (suoni) await samples(suoni);
    errore = null;
  } catch (e) {
    errore = String(e.message ?? e);
  }
  porta.postMessage({ tipo: 'configurata', errore });
}

function suona({ valore, epoca, durata, cps, ciclo, id }) {
  const t = orologio.tempo(epoca + offsetMs);
  if (!(t > ac.currentTime + MARGINE_MIN)) {
    tardi++;
    return;
  }
  superdough(valore, t, durata, cps, ciclo).catch((e) => console.warn('[cuffia]', e));
  // Per il misuratore: a suono avvenuto, quando dice questo motore di averlo suonato.
  if (id !== undefined) {
    setTimeout(() => porta?.postMessage({ tipo: 'eco', id, epoca: orologio.epoca(t) }), (t - ac.currentTime) * 1000 + 50);
  }
}

function ricevi({ data }) {
  switch (data.tipo) {
    case 'config':
      return configura(data);
    case 'evento':
      return suona(data);
    case 'ping':
      return porta.postMessage({ tipo: 'pong', tardi, errore });
    case 'blocca': {
      // Solo per il test: blocca questo processo come farebbe un motore impallato.
      const fine = performance.now() + data.ms;
      while (performance.now() < fine);
      return;
    }
  }
}

window.addEventListener('message', (e) => {
  if (e.data !== 'porta-cuffia' || !e.ports[0]) return;
  porta = e.ports[0];
  porta.onmessage = ricevi;
});
