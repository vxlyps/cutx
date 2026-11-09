// Prova dei suoni di Strudel in locale. Uso: node scripts/prova-suoni-strudel.mjs <cartella-suoni> [--wifi-off]
// Volume del Mac al 20% per tutta la prova e poi com'era. Con --wifi-off spegne il wifi e lo riaccende alla fine, anche se la prova fallisce.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const electron = createRequire(import.meta.url)('electron');
const cartella = process.argv[2];
const wifiOff = process.argv.includes('--wifi-off');
if (!cartella) {
  console.error('manca la cartella dei suoni');
  process.exit(2);
}
const osa = (s) => execFileSync('osascript', ['-e', s]).toString().trim();
const sh = (c, a) => execFileSync(c, a).toString().trim();

const volumePrima = osa('output volume of (get volume settings)');
let wifi = null;
let wifiEraAcceso = false;
const ripristina = () => {
  if (wifi && wifiEraAcceso) {
    try {
      sh('networksetup', ['-setairportpower', wifi, 'on']);
      console.log(`[prova] wifi (${wifi}) riacceso`);
    } catch (e) {
      console.error(`[prova] ATTENZIONE: non riesco a riaccendere il wifi: ${e.message}`);
    }
  }
  try {
    osa(`set volume output volume ${volumePrima}`);
    console.log(`[prova] volume rimesso a ${volumePrima}`);
  } catch {
    console.error(`[prova] ATTENZIONE: non riesco a rimettere il volume a ${volumePrima}`);
  }
};
process.on('SIGINT', () => (ripristina(), process.exit(130)));
process.on('SIGTERM', () => (ripristina(), process.exit(143)));

let codice = 1;
try {
  osa('set volume output volume 20');
  console.log(`[prova] volume ${volumePrima} → 20`);
  if (wifiOff) {
    const porte = sh('networksetup', ['-listallhardwareports']);
    wifi = porte.match(/Hardware Port: Wi-Fi\s+Device: (\w+)/)?.[1];
    if (!wifi) throw new Error('non trovo la scheda wifi');
    wifiEraAcceso = /On/.test(sh('networksetup', ['-getairportpower', wifi]));
    sh('networksetup', ['-setairportpower', wifi, 'off']);
    console.log(`[prova] wifi (${wifi}) spento`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  codice = await new Promise((fine) => {
    const cp = spawn(electron, ['.', '--prova=strudel', '--silenzioso'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CUTX_SUONI_PROVA: cartella, CUTX_PROVA_OFFLINE: wifiOff ? '1' : '0' },
    });
    let resto = '';
    cp.stdout.on('data', (d) => {
      resto += d;
      const righe = resto.split('\n');
      resto = righe.pop();
      for (const r of righe) if (r.startsWith('[prova]')) console.log(r);
    });
    cp.on('exit', (c) => fine(c ?? 1));
  });
} catch (e) {
  console.error(`[prova] ERRORE: ${e.message}`);
} finally {
  ripristina();
}
process.exit(codice);
