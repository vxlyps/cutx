// L'esecuzione del finale HACK nell'interfaccia di lavoro: segue la curva (hack.js), manda i dispetti (fino a 3 insieme, via coda), abbassa i
// volumi uno a uno, dice al proiettore cosa fare (cimici, codice mangiato, schermo nero) e alla fine chiude il set. Tutto in memoria:
// nessun file si tocca. Fermato (paracadute, tasto, bottone) rimette i volumi come erano e i dispetti tornano com'erano.
import { creaDispettiApp } from './dispetti-app.js';
import { curva, livelloUscito, volumeLivello } from './hack.js';

// env: { livelli(), manda(msg), cps(), limiterDb(), pattern(codice), scrivi(tipo, dati), alProiettore(msg), avviso(testo), fermaTutto(),
//        inModifica(nome), caso, imposta?, togliTimer? }
export function creaHackApp(env) {
  let s = null; // lo stato mentre l'HACK gira
  const caso = env.caso ?? Math.random;
  const vivi = () => (env.livelli() ?? []).filter((l) => l.a === null && l.nome !== 'paracadute');
  const finta = { passi: [], registra() {} };

  function ferma(ciclo, motivo = 'stop') {
    if (!s) return false;
    for (const slot of s.slot) slot.fermaTutti(ciclo, motivo);
    // i volumi tornano com'erano (sono innocui e immediati)
    for (const x of s.snap) if (vivi().some((l) => l.id === x.id)) env.manda({ tipo: 'livello', livello: x.id, volume: x.volume });
    env.alProiettore({ tipo: 'hack', fase: 'stop' });
    env.scrivi('hack-stop', { motivo, f: s.ultimoF });
    s = null;
    return true;
  }

  return {
    get attivo() { return !!s; },
    get stato() { return s ? { f: s.ultimoF, mangia: s.mangia, usciti: s.usciti } : null; },

    // minuti: 1–3. Ritorna false (e dice perché) se non può partire.
    avvia({ minuti = 2, ciclo, ms, durataMs = null }) { // durataMs: solo per le prove
      if (s) return false;
      const lista = vivi();
      if (!lista.length) { env.avviso('HACK: non c\'è niente live da chiudere'); return false; }
      const condiviso = new Set();
      const slot = [0, 1, 2].map(() => creaDispettiApp({
        livelli: env.livelli, prefs: () => ({ dispetti: true }), manda: env.manda, pattern: env.pattern, limiterDb: env.limiterDb, inModifica: env.inModifica,
        cps: env.cps, cronologia: finta, avviso: () => {}, scrivi: env.scrivi, alProiettore: env.alProiettore, caso: env.caso, condiviso,
        imposta: env.imposta, togliTimer: env.togliTimer,
      }));
      s = {
        t0: ms, durata: durataMs ?? Math.max(1, Math.min(3, minuti)) * 60000, slot, ultimoF: 0, mangia: 0, usciti: new Set(),
        snap: lista.map((l) => ({ id: l.id, nome: l.nome, volume: l.volume ?? 1 })),
        prossimo: ciclo, ultimoVolume: -1e9, ultimoProiettore: -1e9, ultimiVolumi: new Map(),
      };
      env.scrivi('hack-avvio', { minuti, livelli: s.snap.map((x) => x.nome) });
      env.alProiettore({ tipo: 'hack', fase: 'on', f: 0, cimici: 1, mangia: 0 });
      return true;
    },

    ferma,

    // A ogni fotogramma.
    tic(ciclo, ms) {
      if (!s) return;
      try {
        const f = (ms - s.t0) / s.durata;
        s.ultimoF = f;
        if (f >= 1) return this.finale(ciclo);
        const c = curva(f);
        s.mangia = c.mangia;
        const n = s.snap.length;
        s.usciti = new Set(s.snap.filter((x, i) => livelloUscito(f, i, n)).map((x) => x.nome));
        for (const slot of s.slot) slot.tic(ciclo);
        // un tentativo di dispetto ogni `ogni` battute, finché ce n'è meno del massimo della fase
        if (c.ogni && ciclo >= s.prossimo) {
          s.prossimo = ciclo + c.ogni;
          const attivi = s.slot.filter((x) => x.attivo).length;
          const libero = s.slot.find((x) => !x.attivo);
          const candidati = vivi().filter((l) => !s.usciti.has(l.nome));
          if (libero && attivi < c.insieme && candidati.length) {
            const l = candidati[Math.floor(caso() * candidati.length)];
            libero.suTocco({ livello: l.nome, ciclo, forza: true, maxSecondi: c.secondi, senzaTraccia: true });
          }
        }
        // i volumi: scendono, mai su
        if (ms - s.ultimoVolume > 200) {
          s.ultimoVolume = ms;
          s.snap.forEach((x, i) => {
            if (!vivi().some((l) => l.id === x.id)) return;
            const v = volumeLivello(x.volume, f, i, n);
            const prima = s.ultimiVolumi.get(x.id) ?? x.volume;
            if (Math.abs(v - prima) > 0.01 || (v === 0 && prima !== 0)) {
              s.ultimiVolumi.set(x.id, v);
              env.manda({ tipo: 'livello', livello: x.id, volume: v });
            }
          });
        }
        if (ms - s.ultimoProiettore > 250) {
          s.ultimoProiettore = ms;
          env.alProiettore({ tipo: 'hack', fase: 'on', f, cimici: c.cimici, mangia: c.mangia });
        }
      } catch (e) {
        env.scrivi('hack-errore', { errore: String(e?.message ?? e) });
        ferma(ciclo, 'errore'); // se qualcosa va storto: tutto com'era
      }
    },

    // La fine: i dispetti tornano com'erano, il set si chiude da solo nel silenzio, il proiettore va a nero.
    finale(ciclo) {
      if (!s) return;
      for (const slot of s.slot) slot.fermaTutti(ciclo, 'finale');
      env.scrivi('hack-fine', {});
      s = null;
      env.fermaTutto();
      env.alProiettore({ tipo: 'hack', fase: 'nero' });
    },
  };
}
