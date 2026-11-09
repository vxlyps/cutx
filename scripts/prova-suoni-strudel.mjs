// Prova dei suoni di Strudel in locale. Uso: node scripts/prova-suoni-strudel.mjs <cartella-suoni> [--wifi-off]
// Volume del Mac al 20% per tutta la prova e poi com'era. Con --rete-off spegne la connessione che il Mac usa davvero (Wi-Fi o cavo, più il Wi-Fi se acceso) e la riaccende alla fine, anche se la prova fallisce.
// Se lo script viene ucciso di brutto la rete resta spenta: rimetterla con  networksetup -setnetworkserviceenabled "<servizio>" on  (il nome è scritto all'inizio).
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const electron = createRequire(import.meta.url)('electron');
const cartella = process.argv[2];
const reteOff = process.argv.includes('--rete-off') || process.argv.includes('--wifi-off'); // spegne la rete del Mac: serve la password di amministratore
const senzaRete = process.argv.includes('--senza-rete'); // l'app di prova non vede internet (Chromium non risolve indirizzi), il Mac resta in rete
if (!cartella) {
  console.error('manca la cartella dei suoni');
  process.exit(2);
}
const osa = (s) => execFileSync('osascript', ['-e', s]).toString().trim();
const NS = '/usr/sbin/networksetup';
const sh = (c, a) => execFileSync(c, a).toString().trim();

// Il servizio di rete della connessione in uso: interfaccia della rotta predefinita → nome del servizio
function servizioInUso() {
  const dev = sh('/sbin/route', ['get', 'default']).match(/interface: (\w+)/)?.[1];
  if (!dev) return null;
  const ordine = sh(NS, ['-listnetworkserviceorder']);
  const m = [...ordine.matchAll(/\(\d+\) (.+)\n\(Hardware Port: .+?, Device: (\w+)\)/g)].find((x) => x[2] === dev);
  return m ? { nome: m[1], dev } : null;
}

const volumePrima = osa('output volume of (get volume settings)');
let servizio = null; // { nome, dev } se l'ho spento io
let wifi = null;
let wifiEraAcceso = false;
const ripristina = () => {
  if (servizio) {
    try {
      sh(NS, ['-setnetworkserviceenabled', servizio.nome, 'on']);
      console.log(`[prova] rete «${servizio.nome}» riaccesa`);
    } catch (e) {
      console.error(`[prova] ATTENZIONE: non riesco a riaccendere la rete «${servizio.nome}»: ${e.message}`);
    }
  }
  if (wifi && wifiEraAcceso) {
    try {
      sh(NS, ['-setairportpower', wifi, 'on']);
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
  if (reteOff) {
    const s = servizioInUso();
    if (!s) throw new Error('non capisco quale connessione di rete sta usando il Mac: non spengo niente');
    console.log(`[prova] spengo la rete in uso: «${s.nome}» (${s.dev}); per rimetterla a mano: networksetup -setnetworkserviceenabled "${s.nome}" on`);
    sh(NS, ['-setnetworkserviceenabled', s.nome, 'off']);
    servizio = s;
    wifi = sh(NS, ['-listallhardwareports']).match(/Hardware Port: Wi-Fi\s+Device: (\w+)/)?.[1] ?? null;
    if (wifi) {
      wifiEraAcceso = /On/.test(sh(NS, ['-getairportpower', wifi]));
      if (wifiEraAcceso) sh(NS, ['-setairportpower', wifi, 'off']);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  codice = await new Promise((fine) => {
    const cp = spawn(electron, ['.', '--prova=strudel', '--silenzioso'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CUTX_SUONI_PROVA: cartella, CUTX_PROVA_OFFLINE: reteOff || senzaRete ? '1' : '0', CUTX_PROVA_SENZA_RETE: senzaRete ? '1' : '0' },
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
