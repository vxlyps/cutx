// Il lato «processo principale» dei suoni di Strudel: dove stanno (preferenza cartellaSuoni), scarico in corso, spostamento.
// La logica dei file è in suoni-strudel.js (senza Electron, si prova con test puri).
import { app, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { cp, rm, mkdir } from 'node:fs/promises';
import * as suoni from './suoni-strudel.js';

export const NOME_CARTELLA = 'Suoni di Strudel';

export function registra({ preferenze, salvaPreferenze, padre, avvisaMotori, ev, perProve }) {
  let scarico = null; // { avanza, annulla } mentre scarica
  let occupato = null; // 'sposta' mentre sposta

  const cartella = () => preferenze.leggi().cartellaSuoni || null;
  const proposta = () => path.join(app.getPath('userData'), NOME_CARTELLA);

  const stato = async () => ({
    cartella: cartella(),
    proposta: proposta(),
    perProve,
    scaricando: scarico?.avanza ?? null,
    occupato,
    ...(await suoni.verifica(cartella())),
  });

  // Percorso scelto → cartella dedicata dentro (così spostare/cancellare non tocca mai altro che i suoni)
  const dedicata = (scelta) => (path.basename(scelta) === NOME_CARTELLA ? scelta : path.join(scelta, NOME_CARTELLA));

  async function scegliPosto(titolo) {
    const r = await dialog.showOpenDialog(padre(), {
      title: titolo,
      message: titolo,
      buttonLabel: 'Scegli',
      defaultPath: path.dirname(cartella() || proposta()),
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled || !r.filePaths[0] ? null : dedicata(r.filePaths[0]);
  }

  ipcMain.handle('suoni:stato', stato);

  // Mappe pronte per samples() nei motori. La firma cambia quando cambia la cartella o il suo stato: i motori ricaricano solo allora.
  ipcMain.handle('suoni:mappe', async () => {
    const st = await suoni.verifica(cartella());
    if (st.stato === 'assente' || st.stato === 'vuota') return { firma: `${st.stato}`, mappe: [], alias: null };
    return { firma: `${cartella()}|${st.stato}|${st.mancanti}`, ...(await suoni.leggiMappe(cartella())) };
  });

  // Primo avvio e «cambia cartella» senza spostare niente: sceglie il posto e basta.
  ipcMain.handle('suoni:scegli', async () => {
    const dove = await scegliPosto('Dove metto i suoni di Strudel?');
    if (dove) await salvaPreferenze({ cartellaSuoni: dove });
    return stato();
  });

  // Scarica (o ripara) nella cartella scelta. Avanzamento al chiamante con 'suoni:avanza'.
  ipcMain.handle('suoni:scarica', async (e) => {
    if (scarico) return { errore: 'lo scarico è già in corso' };
    if (!cartella()) return { errore: 'nessuna cartella scelta' };
    const ctl = new AbortController();
    scarico = { avanza: { fase: 'liste', fatti: 0, totale: 0, errori: 0 }, annulla: () => ctl.abort() };
    try {
      const r = await suoni.scarica(
        cartella(),
        (p) => {
          scarico.avanza = p;
          if (!e.sender.isDestroyed()) e.sender.send('suoni:avanza', p);
        },
        ctl.signal,
      );
      ev(r.ok ? 'info' : 'avviso', 'suoni', r.ok ? `suoni di Strudel: ${r.totale} file in ${cartella()}` : `suoni di Strudel: scarico non finito (${r.annullato ? 'annullato' : `${r.errori.length} errori, il primo: ${r.errori[0]}`})`);
      return { ok: r.ok, annullato: !!r.annullato, errori: r.errori.slice(0, 3) };
    } catch (err) {
      ev('errore', 'suoni', `scarico dei suoni di Strudel: ${err.message}`);
      return { ok: false, errori: [String(err.message ?? err)] };
    } finally {
      scarico = null;
      avvisaMotori();
    }
  });
  ipcMain.handle('suoni:annulla', () => scarico?.annulla());

  // Sposta i suoni in un'altra cartella: copia, controlla, poi cambia la preferenza e solo alla fine toglie la vecchia.
  ipcMain.handle('suoni:sposta', async () => {
    if (occupato || scarico) return { errore: 'un altro lavoro è in corso' };
    const vecchia = cartella();
    const nuova = await scegliPosto('In quale cartella sposto i suoni di Strudel?');
    if (!nuova || nuova === vecchia) return { annullato: true };
    occupato = 'sposta';
    try {
      if (vecchia && (await suoni.verifica(vecchia)).stato !== 'assente') {
        await mkdir(nuova, { recursive: true });
        await cp(vecchia, nuova, { recursive: true });
        const v = await suoni.verifica(nuova);
        if (v.stato !== 'ok') {
          await rm(nuova, { recursive: true, force: true });
          return { errore: `la copia non è venuta intera (${v.mancanti} file mancanti): non ho cambiato niente` };
        }
      }
      await salvaPreferenze({ cartellaSuoni: nuova });
      if (vecchia) await rm(vecchia, { recursive: true, force: true }); // è la nostra cartella dedicata, lo sappiamo da dedicata()
      ev('info', 'suoni', `suoni di Strudel spostati in ${nuova}`);
      avvisaMotori();
      return { ok: true };
    } catch (err) {
      ev('errore', 'suoni', `spostamento dei suoni: ${err.message}`);
      return { errore: String(err.message ?? err) };
    } finally {
      occupato = null;
    }
  });

  return { cartella, stato };
}
