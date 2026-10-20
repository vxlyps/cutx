// Il gatto nella barra in alto: cambia posa da solo, a scatti, senza transizioni.
// Disegni © Michele Ciavarella (DCBstudio), fuori dall'AGPL: vedi design/LICENSE.
import seduto from '../../design/risorse/gatti/gatto_seduto_logo_marcio.svg';
import lecca from '../../design/risorse/gatti/gatto_lecca_logo_marcio.svg';
import dorme from '../../design/risorse/gatti/gatto_dorme_logo_marcio.svg';
import inPiedi from '../../design/risorse/gatti/gatto_in_piedi_logo_marcio.svg';

// Sotto i 120 px si usa sempre la versione _logo_, col tratto spesso.
const POSE = {
  seduto: { src: seduto, altezza: 42 },
  lecca: { src: lecca, altezza: 34 },
  dorme: { src: dorme, altezza: 34 },
  inPiedi: { src: inPiedi, altezza: 42 },
};

const SEQUENZA = [
  ['seduto', 7000],
  ['lecca', 3500],
  ['seduto', 6000],
  ['dorme', 5000],
  ['seduto', 5000],
  ['inPiedi', 2000],
];

export function avviaGatto(img, { animato = true } = {}) {
  // Le immagini si caricano tutte subito, così il cambio di posa è secco.
  for (const p of Object.values(POSE)) new Image().src = p.src;
  let i = 0;
  const mostra = (nome) => {
    img.src = POSE[nome].src;
    img.style.height = `${POSE[nome].altezza}px`;
  };
  if (!animato) {
    mostra('seduto');
    return mostra;
  }
  const passo = () => {
    const [nome, ms] = SEQUENZA[i];
    mostra(nome);
    i = (i + 1) % SEQUENZA.length;
    setTimeout(passo, ms);
  };
  passo();
  return mostra;
}
