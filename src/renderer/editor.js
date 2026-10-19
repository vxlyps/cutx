// Editor Strudel (codemirror). L'uscita degli eventi la decide chi lo crea.
import { StrudelMirror } from '@strudel/codemirror';
import { evalScope } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import { getAudioContext, initAudio, registerSynthSounds } from '@strudel/webaudio';

export function creaEditor({ root, codice, uscita, suToggle }) {
  const editor = new StrudelMirror({
    root,
    initialCode: codice,
    defaultOutput: uscita,
    getTime: () => getAudioContext().currentTime,
    transpiler,
    onToggle: suToggle,
    prebake: async () => {
      await evalScope(
        import('@strudel/core'),
        import('@strudel/mini'),
        import('@strudel/tonal'),
        import('@strudel/webaudio'),
        import('@strudel/codemirror'),
        import('@strudel/draw'),
      );
      await registerSynthSounds();
      await initAudio();
    },
  });
  editor.setTheme('blackscreen');
  return editor;
}
