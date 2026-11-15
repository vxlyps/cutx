// L'esecuzione dei dispetti, nell'interfaccia di lavoro: decide e manda al motore live (stesso messaggio `coda` delle mie modifiche),
// tiene l'annulla in cronologia, riporta tutto com'era sul cambio di griglia e si ferma con lo stop o con il paracadute.
// La cimice (sul proiettore) si limita a dire «ho toccato questo livello». Tutto è iniettato: si prova senza finestre.
import { creaDispetti } from './dispetti.js';

// env: { livelli() → livelli live, prefs() → preferenze.cimice, manda(msg) → motore live, pattern(codice), limiterDb() → dB,
//        inModifica(nome), cps() → cicli al secondo, cronologia (registra/passi), avviso(testo), scrivi(tipo, dati) → MOVIOLA,
//        alProiettore(msg) → messaggio alla finestra dell'uscita, caso,
//        condiviso: Set (righe già usate da altri dispetti insieme a questo, nel finale HACK) }
export function creaDispettiApp(env) {
  const d = creaDispetti({ caso: env.caso });
  let voceCronologia = null;
  let ultimoErrore = '';
  let timerSicurezza = null; // se per qualunque motivo il ritorno normale non parte (finestra ferma), tutto torna com'era comunque
  const imposta = env.imposta ?? ((f, ms) => { const t = setTimeout(f, ms); t.unref?.(); return t; });
  const togliTimer = env.togliTimer ?? ((t) => clearTimeout(t));

  const condiviso = env.condiviso ?? new Set();
  const occupate = (a) => a.chiavi.map((k) => `${a.livelloId}:${k}`);
  const livelloDi = (id) => (env.livelli() ?? []).find((l) => l.id === id && l.a === null) ?? null;
  const righeAttive = () => {
    const a = d.attivo;
    return a ? { [a.livelloNome]: new Set(a.righe) } : {};
  };

  function chiudi(ciclo, motivo, subito = false) {
    const a = d.attivo;
    if (!a) return;
    togliTimer(timerSicurezza);
    timerSicurezza = null;
    const l = livelloDi(a.livelloId);
    const msg = l ? d.messaggioRitorno(l.coda ?? [], subito) : null;
    if (msg) env.manda(msg);
    // la voce in cronologia sparisce: un dispetto finito non deve occupare un posto dell'annulla
    const i = voceCronologia ? env.cronologia.passi.indexOf(voceCronologia) : -1;
    if (i >= 0) env.cronologia.passi.splice(i, 1);
    voceCronologia = null;
    for (const k of occupate(a)) condiviso.delete(k);
    env.scrivi('dispetto-fine', { id: a.id, livello: a.livelloNome, motivo, ritorno: !!msg });
    env.alProiettore({ tipo: 'dispetto', attivo: false, livello: a.livelloNome });
    d.finito(ciclo);
  }

  return {
    get attivo() { return d.attivo; },
    get motivo() { return d.motivo; },
    get errore() { return ultimoErrore; },
    get vede() { return (env.livelli() ?? []).map((l) => `${l.nome}:${l.a}:${typeof l.codice}`).join(','); }, // per le prove
    righeAttive,

    // La cimice ha toccato una nota di questo livello (dal proiettore). forza: solo per le prove.
    // senzaTraccia: nel finale HACK niente voce in cronologia e niente avviso (sarebbero decine)
    suTocco({ livello: nome, ciclo, forza = false, maxSecondi = 2, senzaTraccia = false }) {
      try {
        const l = (env.livelli() ?? []).find((x) => x.nome === nome && x.a === null);
        if (!l) return null;
        const piano = d.proponi({
          livello: l, ciclo, cps: env.cps(), prefs: env.prefs(), pattern: env.pattern, limiterDb: env.limiterDb(), inModifica: env.inModifica, forza, maxSecondi,
          occupato: (id, k) => condiviso.has(`${id}:${k}`),
        });
        if (!piano) {
          if (!['spenti', 'uno-alla-volta', 'pausa', 'caso'].includes(d.motivo)) env.scrivi('dispetto-no', { livello: nome, perche: d.motivo }); // solo i rifiuti che meritano una riga
          return null;
        }
        env.manda(d.messaggioInizio());
        for (const k of occupate(piano)) condiviso.add(k);
        if (!senzaTraccia) {
        voceCronologia = {
          etichetta: `dispetto: ${piano.nome} su «${piano.livelloNome}»`,
          annulla: () => (d.attivo === piano ? (chiudi(ciclo, 'annulla', true), true) : false),
        };
        env.cronologia.registra(voceCronologia);
        }
        timerSicurezza = imposta(() => chiudi(ciclo, 'sicurezza', true), (maxSecondi + 1.5) * 1000);
        env.scrivi('dispetto', { id: piano.id, livello: piano.livelloNome, righe: piano.righe, griglia: piano.g, cicli: piano.cicli });
        env.alProiettore({ tipo: 'dispetto', attivo: true, livello: piano.livelloNome, righe: piano.righe });
        if (!senzaTraccia) env.avviso(`dispetto: ${piano.nome} su «${piano.livelloNome}» · ${piano.righe.join(' ')}`);
        return piano;
      } catch (e) {
        ultimoErrore = String(e?.stack ?? e);
        env.scrivi('dispetto-errore', { errore: String(e?.message ?? e) });
        return null;
      }
    },

    // A ogni fotogramma: riporta com'era quando è il momento; si ferma da solo se il limiter fatica o il livello non c'è più.
    tic(ciclo) {
      const a = d.attivo;
      if (!a) return;
      if (!livelloDi(a.livelloId)) return chiudi(ciclo, 'livello-uscito', true);
      if (Math.abs(env.limiterDb() ?? 0) > 3) return chiudi(ciclo, 'limiter', true);
      if (d.scaduto(ciclo)) chiudi(ciclo, 'fine');
    },

    // Lo stop (tasto, paracadute): tutto com'era, subito.
    fermaTutti(ciclo, motivo = 'stop') {
      if (d.attivo) chiudi(ciclo, motivo, true);
    },
  };
}
