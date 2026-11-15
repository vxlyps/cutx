// La finestra «mani» (sperimentale): una pagina nascosta, in un processo suo, che apre la camera e riconosce la mano con MediaPipe.
// Separata dai motori audio: se pesa o si blocca, il suono non lo sente. Esiste solo finché il riconoscimento è acceso
// (da spento la camera è chiusa del tutto: la finestra viene distrutta dal processo principale).
//
// Al controllo manda (canale diretto, come i motori): { tipo: 'mano', visibile, y, punti } a ogni fotogramma riconosciuto,
// { tipo: 'immagine', jpeg } (piccola, ~15 al secondo, solo se la finestrella è aperta) e { tipo: 'stato', … } una volta al secondo.
// Il significato di y (altezza → filtro) lo decide il controllo (mani-filtro.js): qui solo la misura.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const BASE = 'cutx://app/mani';
const FPS = { bassa: 15, normale: 24, alta: 30 };
const video = document.getElementById('v');
let porta = null;
let config = null;
let flusso = null;
let landmarker = null;
let timer = null;
let avviata = false;
let ultimoTempoVideo = -1;
let fotogrammi = 0;
let tempoRiconoscimento = 0;
let errore = '';
let anteprima = true;
let ultimaImmagine = 0;
const canvas = new OffscreenCanvas(160, 120);
const g2d = canvas.getContext('2d');

const manda = (m, trasferibili) => porta?.postMessage(m, trasferibili ?? []);

window.addEventListener('message', (e) => {
  if (e.data?.porta !== 'controllo' || !e.ports[0]) return;
  porta = e.ports[0];
  porta.onmessage = ({ data }) => {
    if (data.tipo === 'config') {
      config = data;
      anteprima = data.anteprima !== false;
      if (!avviata) avvia();
    }
  };
  manda({ tipo: 'pronta' });
});

async function avvia() {
  avviata = true;
  try {
    const vincoli = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
    if (config.camera) vincoli.deviceId = { exact: config.camera };
    flusso = await navigator.mediaDevices.getUserMedia({ video: vincoli, audio: false });
    video.srcObject = flusso;
    await video.play();
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/hand_landmarker.task`, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const fps = FPS[config.fps] ?? FPS.normale;
    timer = setInterval(giro, 1000 / fps);
    setInterval(riferisci, 1000);
    riferisci();
  } catch (e) {
    errore = String(e?.message ?? e);
    manda({ tipo: 'stato', errore });
  }
}

function giro() {
  if (!landmarker || video.readyState < 2) return;
  if (video.currentTime === ultimoTempoVideo) return; // la camera non ha dato un fotogramma nuovo
  ultimoTempoVideo = video.currentTime;
  const t0 = performance.now();
  let r;
  try {
    r = landmarker.detectForVideo(video, t0);
  } catch (e) {
    errore = String(e?.message ?? e);
    return;
  }
  tempoRiconoscimento += performance.now() - t0;
  fotogrammi++;
  const mano = r.landmarks?.[0];
  if (!mano) manda({ tipo: 'mano', visibile: false });
  else {
    // il centro del palmo (polso e base delle dita): più stabile della punta di un dito. y = 0 in alto, 1 in basso.
    const palmo = [0, 5, 9, 13, 17].map((i) => mano[i]);
    const y = palmo.reduce((s, p) => s + p.y, 0) / palmo.length;
    manda({ tipo: 'mano', visibile: true, y, punti: mano.map((p) => [p.x, p.y]) });
  }
  if (anteprima && t0 - ultimaImmagine > 66) {
    ultimaImmagine = t0;
    g2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 }).then((b) => b.arrayBuffer()).then((buf) => manda({ tipo: 'immagine', jpeg: buf }, [buf]));
  }
}

function riferisci() {
  manda({ tipo: 'stato', fps: fotogrammi, ms: fotogrammi ? tempoRiconoscimento / fotogrammi : 0, errore });
  fotogrammi = 0;
  tempoRiconoscimento = 0;
}

// Chiusa la finestra la camera si ferma da sola, ma lo si fa esplicito (la luce verde si spegne subito).
window.addEventListener('beforeunload', () => {
  clearInterval(timer);
  for (const t of flusso?.getTracks() ?? []) t.stop();
});
