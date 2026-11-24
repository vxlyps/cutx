// Le 29 schermate del libretto, una dopo l'altra (vedi libretto.js). Ogni gruppo prepara lo stato che gli serve e scatta.
const A = 'libretto_notte_acida.cutx';
const B = 'libretto_ferro.cutx';

export async function schermate(c) {
  const { voluto, riquadro, riquadroEspr, finestraIntera, js, jsLive, nano, tocca, sceglie, aspetta, aspettaChe, fatte, brani, PLAY, STOP, CYCLE } = c;
  const R = async (ch) => (await nano(64 + ch, 127), await nano(64 + ch, 0));
  const cicloLive = async () => (await jsLive('globalThis.cutxStato?.()'))?.ciclo ?? 0;
  const dopoCiclo = async (n, max = 30) => {
    const fine = Date.now() + max * 1000;
    while ((await cicloLive()) < n && Date.now() < fine) await aspetta(0.2);
  };
  const passo = (t) => console.log(`[libretto] · ${t}`);
  const scatta = async (n, f) => {
    if (!voluto(n.slice(0, 2))) return;
    if (await f()) fatte.push(n);
  };

  // --- A nel CUE, e nel LIVE la serata a metà ---
  await js(`cutxProva.cue.apriModello(${JSON.stringify(A)}, ${JSON.stringify(brani.libretto_notte_acida)}, 'attivo'); cutxProva.cue.cambiaModo('brano')`);
  await aspetta(1);
  passo('A nel CUE');
  // CH1: il beat, scena «main»; CH3: reese
  await sceglie(0, 2);
  await R(0);
  await sceglie(2, 1);
  await R(2);
  await dopoCiclo((await cicloLive()) + 2);
  passo('CH1 e CH3 entrati');
  // 17: R sul CH2 con niente in NEXT: l'avviso «gira la manopola per scegliere»
  await scatta('17-avviso', async () => {
    await R(1);
    await aspetta(0.5);
    const testo = await js(`document.getElementById('cue-avviso')?.textContent ?? ''`);
    console.log(`[libretto] 17: avviso = «${testo}»`);
    return riquadro('17-avviso', '#cue-avviso', 8);
  });
  await aspetta(2.5);
  // CH2: armato (NEXT scelto, non entrato)
  await sceglie(1, 1);
  // CH8: un'apertura scritta
  await js(`(() => { const a = cutxProva.cue.carte.find((c) => c.apertura); if (a) { a.editor.codice = 's("sine*2").gain(.0001)'; cutxProva.cue.attiva(a); } })()`);
  await js('cutxProva.goLive()');
  await aspetta(1);
  passo('CH2 armato, apertura live');
  // CH5: in attesa, «entra tra 8» che scende fino a «entra tra 2»
  await js('cutxProva.scegliEntraTra(8)');
  await sceglie(4, 1);
  await R(4);
  const arrivato = await aspettaChe(async () => (await js(`document.querySelectorAll('.ch-riga')[4]?.querySelector('.ch-conto')?.textContent`)) === 'entra tra 2', 25);
  if (!arrivato) console.log('[libretto] 01: il CH5 non è arrivato a «entra tra 2»');

  await scatta('01-postazione', () => finestraIntera('01-postazione'));
  await scatta('02-barra', () => riquadro('02-barra', '.barra'));

  const rettDi = (selettore) => `(() => { const e = document.querySelector(${JSON.stringify(selettore)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`;
  const scheda = (n) => js(`cutxProva.browser.vai(${JSON.stringify(n)})`);

  // 03: la schermata dei PROJ, con due PROJ finti (la lista vera non si tocca)
  await scatta('03-proj', async () => {
    const giorno = 86400000;
    const finti = [
      { numero: 1, sottotitolo: 'prima serata al circolo', modificato: Date.now() - 40 * giorno, brani: 6 },
      { numero: 2, sottotitolo: 'notte acida', modificato: Date.now() - 2 * giorno, brani: 4 },
    ];
    await js(`(() => { const s = cutxProva.schermataProj; s._elenco = s.azioni.elenco; s.azioni.elenco = async () => ${JSON.stringify(finti)}; return s.mostra({ ultimo: 2 }); })()`);
    await aspetta(1);
    const ok = await riquadro('03-proj', '#proj-schermata');
    await js(`(() => { const s = cutxProva.schermataProj; s.azioni.elenco = s._elenco; s.radice.hidden = true; document.body.classList.remove('con-proj'); })()`);
    await aspetta(0.5);
    return ok;
  });

  // 04-06: la colonna di sinistra
  await scatta('04-browser-suoni', async () => (await scheda('suoni'), await aspetta(0.6), riquadro('04-browser-suoni', '.browser')));
  await scatta('05-browser-libreria', async () => (await scheda('libreria'), await aspetta(0.8), riquadro('05-browser-libreria', '.browser')));
  await scatta('06-browser-help', async () => {
    await js(`cutxProva.browser.helpAperti.add('lpf()'); cutxProva.browser.vai('help')`);
    await aspetta(0.8);
    return riquadro('06-browser-help', '.browser');
  });
  await scheda('suoni');

  if (process.env.CUTX_LIBRETTO_DEBUG) console.log('[libretto] DEBUG carte: ' + (await js(`JSON.stringify([...document.getElementById('carte').children].map((e) => [e.className.slice(0, 40), (e.textContent || '').slice(0, 30), Math.round(e.getBoundingClientRect().height)]))`)));
  // 07: la colonna del CUE
  await scatta('07-cue', async () => {
    await js(`(() => { const c = document.getElementById('carte'); const b = c.querySelector('.beat-card'); c.scrollTop = b ? b.offsetTop - c.offsetTop - 8 : 0; })()`);
    await aspetta(0.5);
    return riquadro('07-cue', '.colonna.cue');
  });
  // 08: il gruppo DA ASSEGNARE (la testata e le sue card)
  await scatta('08-da-assegnare', async () => {
    await js(`(() => { const t = document.querySelector('.gruppo-da-assegnare'); t?.scrollIntoView({ block: 'center' }); })()`);
    await aspetta(0.5);
    return riquadroEspr('08-da-assegnare', `(() => {
      const t = document.querySelector('.gruppo-da-assegnare'); if (!t) return null;
      let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
      for (let e = t; e && (e === t || !e.classList.contains('gruppo-clip')); e = e.nextElementSibling) { const b = e.getBoundingClientRect(); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
      const lim = document.getElementById('carte').getBoundingClientRect(); y1 = Math.min(y1, lim.bottom);
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    })()`, 6);
  });
  // 09: il menu del canale aperto su una card (quella di «melodia», senza tipo)
  await scatta('09-menu-canale', async () => {
    await js(`(() => { const t = [...document.querySelectorAll('.card')].find((c) => /da assegnare/i.test(c.querySelector('.tasto-ch')?.textContent ?? '')); t?.scrollIntoView({ block: 'center' }); t?.querySelector('.tasto-ch')?.click(); })()`);
    await aspetta(0.6);
    const ok = await riquadroEspr('09-menu-canale', `(() => {
      const m = document.querySelector('.menu-ch'); if (!m) return null;
      const card = [...document.querySelectorAll('.card')].find((c) => /da assegnare/i.test(c.querySelector('.tasto-ch')?.textContent ?? '')) ?? m;
      const a = m.getBoundingClientRect(), b = card.getBoundingClientRect();
      const x0 = Math.min(a.left, b.left), y0 = Math.min(a.top, b.top), x1 = Math.max(a.right, b.right), y1 = Math.max(a.bottom, b.bottom);
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    })()`, 6);
    await js(`document.querySelector('.menu-ch')?.remove()`);
    return ok;
  });

  // 10-11: la griglia dei canali, una riga ingrandita (CH3: fader finto non agganciato: la tacca dice dove portarlo)
  await scatta('10-griglia', () => riquadro('10-griglia', '#canali-griglia'));
  await scatta('11-riga', async () => {
    await nano(2, 20); // il fader fisico del CH3 è lontano dal valore vero e non si è mai agganciato
    await aspetta(0.6);
    return riquadroEspr('11-riga', rettDi('#canali-griglia .ch-riga:nth-child(3)'), 4);
  });

  // 12: la vista pila
  await scatta('12-pila', async () => {
    await js(`document.querySelector('#vista-live [data-vista="pila"]').click()`);
    await aspetta(0.8);
    const ok = await riquadro('12-pila', '#colonna-live');
    await js(`document.querySelector('#vista-live [data-vista="canali"]').click()`);
    await aspetta(0.5);
    return ok;
  });

  const MIDI = (...b) => js(`cutxProva.controllerMidi.riceve(${JSON.stringify(b)})`);

  // 13: CYCLE: «entra tra 4» a tutto schermo
  await scatta('13-cycle', async () => {
    await js('cutxProva.scegliEntraTra(2)');
    await tocca(CYCLE);
    await aspetta(0.15);
    const ok = await riquadro('13-cycle', '#grande-nano');
    await aspetta(1.5);
    await js('cutxProva.scegliEntraTra(1)');
    return ok;
  });

  // 14-15: l'X-Touch in MANI: FOCUS sul CH3, poi SWEEP a sinistra
  await js(`cutxProva.controllerMidi.modo = 'MC'; cutxProva.controllerMidi.pagina = 'A'; cutxProva.controllerMidi.porta.ingresso = { state: 'connected', name: 'X-TOUCH MINI' }`);
  await scatta('14-focus', async () => {
    await js(`cutxProva.controllerMidi.riceve([0x90, cutxProva.controllerMidi.tab.tasti[2], 127]); cutxProva.controllerMidi.riceve([0x90, cutxProva.controllerMidi.tab.tasti[2], 0])`);
    await aspetta(0.15);
    const ok = await riquadro('14-focus', '#grande-nano');
    await aspetta(1.5);
    return ok;
  });
  await scatta('15-specchio-mani', async () => {
    await MIDI(0xb0, 16, 0x40 | 25); // SWEEP a sinistra
    await aspetta(1.2);
    return riquadro('15-specchio-mani', '#specchio', 6);
  });

  // 18: B nel PROSSIMO (170 → 174: rampa) e il CH1 armato su una scena di B
  await scatta('18-passaggio', async () => {
    await js(`cutxProva.cue.apriModello(${JSON.stringify(B)}, ${JSON.stringify(brani.libretto_ferro)}, 'prossimo')`);
    await aspetta(1);
    await sceglie(0, 2); // la scena «drop» di B
    await aspetta(1);
    console.log(`[libretto] 18: passaggio = «${await js(`document.getElementById('passaggio')?.textContent ?? ''`)}»`);
    return finestraIntera('18-passaggio');
  });

  // 16: il paracadute: STOP tenuto, il gatto si riempie (si lascia prima della fine: il live non si ferma)
  await scatta('16-paracadute', async () => {
    await nano(STOP, 127);
    await aspetta(0.9);
    const ok = await riquadroEspr('16-paracadute', `(() => { const e = document.getElementById('paracadute')?.parentElement; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`, 4);
    await nano(STOP, 0);
    await aspetta(0.6);
    return ok;
  });

  // 19-23: il SYNTH (una clip del brano aperta nel pannello; arpeggio e MOD sono due gruppi della scheda suono)
  const nelSynth = (codice, nome) => js(`cutxProva.apriNelSynth(${JSON.stringify(codice)}, ${JSON.stringify(nome)})`);
  const gruppi = ['19', '20', '21', '22', '23'].filter(voluto);
  if (gruppi.length) {
    await nelSynth('note("g4 bb4 c5 ~ d5 c5 bb4 g4").s("sawtooth")', 'hook');
    await aspetta(1.2);
    console.log(`[libretto] · synth aperto: ${await js(`document.body.dataset.vista`)}`);
    await scatta('19-synth-suono', async () => (await js(`cutxProva.synth.mostraScheda('suono')`), await aspetta(0.8), riquadro('19-synth-suono', '#vista-synth')));
    await scatta('20-synth-note', async () => (await js(`cutxProva.synth.mostraScheda('note')`), await aspetta(0.8), riquadro('20-synth-note', '#vista-synth')));
    const inVista = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`);
    await scatta('22-synth-arpeggio', async () => (await js(`cutxProva.synth.mostraScheda('suono')`), await aspetta(0.6), await inVista('.synth-arp'), await aspetta(0.5), riquadro('22-synth-arpeggio', '.synth-arp', 6)));
    await scatta('23-synth-mod', async () => (await inVista('.synth-mod'), await aspetta(0.5), riquadro('23-synth-mod', '.synth-mod', 6)));
    await scatta('21-synth-drum', async () => {
      await nelSynth('s("bd*4, ~ sd ~ sd, hh*8")', 'colpi');
      await aspetta(1.2);
      await js(`cutxProva.synth.mostraScheda('drum')`);
      await aspetta(0.8);
      return riquadro('21-synth-drum', '#vista-synth');
    });
    await js(`document.getElementById('vista-live').click()`);
    await aspetta(0.8);
  }

  // 24-27: le impostazioni (il pannello intero, con la sezione aperta)
  const impostazioni = async (n, nome, sez, prima = '') => scatta(n, async () => {
    if (!(await js(`!document.getElementById('impostazioni').hidden`))) {
      c.wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
      await aspetta(1);
    }
    await js(`document.querySelector('#imp-nav [data-sez="${sez}"]').click()`);
    if (prima) await js(prima);
    await aspetta(0.8);
    return riquadro(nome, '#impostazioni');
  });
  await impostazioni('24', '24-imp-canali', 'canali');
  await impostazioni('25', '25-imp-controller', 'controller');
  await impostazioni('26', '26-imp-cimice', 'stash', `document.getElementById('imp-titolo-cimice')?.scrollIntoView({ block: 'start' })`);
  await impostazioni('27', '27-imp-proiezione', 'proiezione');
  if (await js(`!document.getElementById('impostazioni').hidden`)) {
    c.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await aspetta(0.6);
  }

  // 28-29: il proiettore (la finestra dell'uscita): codice live e cimice; poi la scena finale dell'HACK
  if (['28', '29'].some(voluto)) {
    const eraAperta = await js('window.cutx.uscitaAperta()');
    if (!eraAperta) await js('window.cutx.uscitaOnOff()');
    await aspettaChe(() => c.finestre.uscita && !c.finestre.uscita.isDestroyed(), 15);
    await aspetta(2);
    const uscita = c.finestre.uscita;
    const cattura = async (nome) => {
      const img = await Promise.race([uscita.webContents.capturePage(), aspetta(15).then(() => null)]);
      if (!img) return false;
      await c.scriviPng(nome, img);
      return true;
    };
    await scatta('28-proiettore', async () => {
      await uscita.webContents.executeJavaScript('cutxCimice().interno.evoca()').catch(() => null);
      await aspetta(4.5); // la cimice entra e cammina sul codice
      console.log(`[libretto] 28: cimice presente = ${await uscita.webContents.executeJavaScript('cutxCimice().interno.presente').catch(() => '?')}`);
      return cattura('28-proiettore');
    });
    await scatta('29-proiettore-hack', async () => {
      const parte = await js(`cutxProva.hack().avvia({ durataMs: 14000, ciclo: cutxProva.cicloAdesso(), ms: performance.now() })`);
      if (!parte) return false;
      const nero = await aspettaChe(async () => (await uscita.webContents.executeJavaScript(`document.body.classList.contains('hack-nero')`).catch(() => false)), 40);
      await aspetta(1.5);
      const ok = nero && (await cattura('29-proiettore-hack'));
      await js(`cutxProva.hack().ferma(cutxProva.cicloAdesso(), 'libretto')`);
      return ok;
    });
    if (!eraAperta) await js('window.cutx.uscitaOnOff()');
  }
}
