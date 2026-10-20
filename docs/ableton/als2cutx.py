import gzip, sys, os, re, math, json, datetime
import xml.etree.ElementTree as ET
from functools import reduce

NOMI = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']

def nota(midi):
    return f"{NOMI[midi % 12]}{midi // 12 - 1}"

def v(el, path, default=None):
    x = el.find(path)
    return x.attrib.get('Value', default) if x is not None else default

def pulisci(nome):
    nome = re.sub(r'^\d+-', '', nome).strip().lower()
    nome = re.sub(r'\s*\[.*?\]', '', nome)
    nome = re.sub(r'[^a-z0-9àèéìòù ]+', ' ', nome)
    return re.sub(r'\s+', ' ', nome).strip()[:28] or 'traccia'

def slug(nome):
    return re.sub(r'[^a-z0-9]+', '_', nome.lower()).strip('_')

def ruolo_strumento(nome, tags):
    n = nome.lower()
    if 'DrumGroupDevice' in tags:
        return 'drum'
    for k, r in (('pad', 'pad'), ('swell', 'pad'), ('sub', 'basso'), ('bass', 'basso'), ('basso', 'basso'),
                 ('arp', 'arp'), ('pluck', 'arp'), ('lead', 'lead'), ('key', 'tasti'), ('piano', 'tasti'), ('tape', 'tasti')):
        if k in n:
            return r
    return 'synth'

SUONO = {
    'pad':   '.s("supersaw").attack(.8).release(2).lpf(1800).room(.7).gain(.3)',
    'basso': '.s("sawtooth").lpf(500).lpq(4).release(.2).gain(.45)',
    'arp':   '.s("triangle").decay(.2).sustain(0).delay(.4).delaytime(.375).gain(.4)',
    'lead':  '.s("square").lpf(2400).release(.3).gain(.3)',
    'tasti': '.s("triangle").release(.6).room(.4).gain(.4)',
    'synth': '.s("triangle").release(.4).gain(.4)',
}

DRUM = {
    'kick':  's("sine").note("c2").penv(36).pdecay(.05).decay(.35).sustain(0).gain(1.2)',
    'snare': 's("white").hpf(1200).decay(.14).sustain(0).gain(.6)',
    'clap':  's("white").hpf(900).lpf(4000).decay(.12).sustain(0).room(.3).gain(.5)',
    'hat':   's("white").hpf(8000).decay(.04).sustain(0).gain(.3)',
    'perc':  's("triangle").note("c5").decay(.06).sustain(0).gain(.4)',
}

def ruolo_pad(nome, key):
    n = nome.lower()
    for k, r in (('kick', 'kick'), ('bd', 'kick'), ('bass drum', 'kick'), ('snare', 'snare'), ('sd', 'snare'),
                 ('rim', 'perc'), ('clap', 'clap'), ('hat', 'hat'), ('hh', 'hat'), ('shaker', 'hat'), ('ride', 'hat'),
                 ('cymbal', 'hat'), ('crash', 'hat'), ('tom', 'perc'), ('perc', 'perc')):
        if k in n:
            return r
    return {36: 'kick', 38: 'snare', 40: 'snare', 39: 'clap', 42: 'hat', 44: 'hat', 46: 'hat'}.get(key, 'perc')

def griglia(eventi, lung):
    punti = [int(round(t * 4)) for t, d, *_ in eventi] + [int(round((t + d) * 4)) for t, d, *_ in eventi] + [int(round(lung * 4))]
    passo = reduce(math.gcd, [p for p in punti if p > 0], 0) or 4
    return max(1, passo)

def mini(eventi, lung, fmt):
    passo = griglia(eventi, lung)
    n = int(round(lung * 4)) // passo
    celle = [None] * n
    fine = [0] * n
    for t, d, k in eventi:
        i = int(round(t * 4)) // passo
        if 0 <= i < n:
            celle[i] = (celle[i] or []) + [k]
            fine[i] = max(fine[i], int(round((t + d) * 4)) // passo)
    out, attivo = [], -1
    for i in range(n):
        if celle[i]:
            ks = sorted(set(celle[i]))
            out.append(fmt(ks[0]) if len(ks) == 1 else '[' + ','.join(fmt(x) for x in ks) + ']')
            attivo = fine[i]
        elif i < attivo:
            out.append('_')
        else:
            out.append('~')
    return ' '.join(out)

def per_battuta(eventi, lung):
    b = battute(lung)
    pezzi = []
    for k in range(b):
        ev = [(t - 4 * k, d, x) for t, d, x in eventi if 4 * k <= t < 4 * (k + 1)]
        pezzi.append('~' if not ev else mini(ev, 4, lambda y: y))
    if b == 1:
        return pezzi[0]
    return '<' + ' '.join(f'[{p}]' for p in pezzi) + '>'

def leggi_note(clip):
    ls, le = float(v(clip, 'Loop/LoopStart', 0)), float(v(clip, 'Loop/LoopEnd', 0))
    note = []
    for kt in clip.findall('Notes/KeyTracks/KeyTrack'):
        key = int(v(kt, 'MidiKey'))
        for n in kt.findall('Notes/MidiNoteEvent'):
            if n.attrib.get('IsEnabled', 'true') == 'false':
                continue
            t = float(n.attrib['Time'])
            if ls - 1e-6 <= t < le:
                note.append((round(t - ls, 4), float(n.attrib['Duration']), key))
    return sorted(note), le - ls

def battute(lung):
    return max(1, int(math.ceil(lung / 4 - 1e-6)))

def sec_da_beat(clip, beat):
    wm = sorted((float(w.attrib['BeatTime']), float(w.attrib['SecTime'])) for w in clip.findall('WarpMarkers/WarpMarker'))
    if len(wm) < 2:
        return None
    for (b0, s0), (b1, s1) in zip(wm, wm[1:]):
        if beat <= b1 or (b1, s1) == wm[-1]:
            return s0 + (beat - b0) * (s1 - s0) / (b1 - b0)

def converti(als, cartella_progetto):
    root = ET.fromstring(gzip.open(als).read())
    ls = root.find('LiveSet')
    bpm = float(v(ls, './/MainTrack//Tempo/Manual') or v(ls, './/MasterTrack//Tempo/Manual') or 120)
    sezioni, suoni, mancanti = [], {}, set()
    file_suono = {}
    titolo_brano = pulisci(os.path.splitext(os.path.basename(als))[0]).split(' ')[0]
    for tr in ls.find('Tracks'):
        if tr.tag not in ('MidiTrack', 'AudioTrack'):
            continue
        nome_orig = v(tr, './/Name/EffectiveName', 'traccia')
        nome = pulisci(nome_orig)
        num = re.match(r'^(\d+)-', nome_orig)
        if nome in ('audio', 'midi', 'traccia') and num:
            nome = f'{nome} {num.group(1)}'
        tags = set(d.tag for d in tr.iter())
        varianti, usi = {}, {}
        clips = tr.findall('.//ArrangerAutomation/Events/MidiClip') + tr.findall('.//ArrangerAutomation/Events/AudioClip')
        clips += tr.findall('.//ClipSlotList/ClipSlot/ClipSlot/Value/MidiClip') + tr.findall('.//ClipSlotList/ClipSlot/ClipSlot/Value/AudioClip')
        for c in clips:
            inizio = float(v(c, 'CurrentStart', 0))
            if c.tag == 'MidiClip':
                note, lung = leggi_note(c)
                if not note:
                    continue
                firma = ('midi', tuple(note), lung)
            else:
                rel = v(c, './/SampleRef/FileRef/RelativePath', '')
                ass = v(c, './/SampleRef/FileRef/Path', '')
                ls_, le_ = float(v(c, 'Loop/LoopStart', 0)), float(v(c, 'Loop/LoopEnd', 0))
                firma = ('audio', rel or ass, round(ls_, 3), round(le_, 3))
            usi[firma] = usi.get(firma, 0) + 1
            if firma not in varianti or inizio < varianti[firma][0]:
                varianti[firma] = (inizio, c)
        ruolo = ruolo_strumento(nome, tags)
        pad = {}
        if ruolo == 'drum':
            for br in tr.iter('DrumBranch'):
                key = v(br, './/BranchInfo/ReceivingNote') or v(br, 'ZoneSettings/ReceivingNote')
                if key is not None:
                    nm = v(br, 'Name/EffectiveName', '') or v(br, 'Name', '')
                    pad[128 - int(key) if int(key) > 127 else int(key)] = nm
        if tr.tag == 'AudioTrack' and len(varianti) > 2:
            lung = lambda f: f[3] - f[2]
            scelte = sorted(varianti, key=lambda f: (-usi[f], -lung(f)))[:2]
            scelte = [f for f in scelte if usi[f] >= 2] or [max(varianti, key=lung)]
            varianti = {f: varianti[f] for f in scelte}
        ordinate = sorted(varianti.items(), key=lambda kv: kv[1][0])
        for i, (firma, (inizio, c)) in enumerate(ordinate):
            nome_sez = nome if len(ordinate) == 1 else f"{nome} {'abcdefghij'[i]}"
            if firma[0] == 'midi':
                note, lung = list(firma[1]), firma[2]
                b = battute(lung)
                lento = f'.slow({b})' if b > 1 else ''
                if ruolo == 'drum':
                    per_ruolo = {}
                    for t, d, k in note:
                        per_ruolo.setdefault(ruolo_pad(pad.get(k, ''), k), []).append((t, min(d, .25), 'x'))
                    righe = [f'  {DRUM[r]}\n    .struct("{per_battuta(ev, lung)}")' for r, ev in sorted(per_ruolo.items())]
                    codice = 'stack(\n' + ',\n'.join(righe) + '\n)'
                else:
                    codice = f'note("{mini(note, lung, nota)}"){lento}\n  {SUONO[ruolo]}'
            else:
                rel = firma[1]
                percorso = os.path.normpath(os.path.join(cartella_progetto, rel))
                chiave = rel or firma[1]
                if chiave not in file_suono:
                    file_suono[chiave] = slug(f"{titolo_brano} {len(file_suono) + 1:02d} {os.path.splitext(os.path.basename(chiave))[0][:14]}")[:32]
                nome_suono = file_suono[chiave]
                dur = float(v(c, './/SampleRef/DefaultDuration', 0)) / float(v(c, './/SampleRef/DefaultSampleRate', 44100) or 44100)
                ls_, le_ = firma[2], firma[3]
                s0, s1 = sec_da_beat(c, ls_), sec_da_beat(c, le_)
                if s0 is None:
                    s0, s1 = ls_ * 60 / bpm, le_ * 60 / bpm
                b = battute(le_ - ls_)
                beg, end = (max(0, s0 / dur), min(1, s1 / dur)) if dur else (0, 1)
                codice = f's("{nome_suono}").begin({beg:.4f}).end({end:.4f})' + (f'.slow({b})' if b > 1 else '') + '\n  .gain(.8)'
                if os.path.exists(percorso):
                    suoni[nome_suono] = rel
                else:
                    suoni.setdefault(nome_suono, rel)
            sezioni.append((inizio, nome_sez, codice))
    sezioni.sort(key=lambda x: x[0])
    titolo = pulisci(os.path.splitext(os.path.basename(als))[0])
    righe = [f'// @brano {titolo}', f'// @bpm {bpm:g}', f'// @data {datetime.date.today()}']
    if suoni:
        righe.append('// @suoni ' + ', '.join(sorted(suoni)))
    righe += ['', f'setcpm({bpm:g}/4)', '']
    visti = set()
    for _, nome_sez, codice in sezioni:
        base, k = nome_sez, 2
        while nome_sez in visti:
            nome_sez, k = f'{base} {k}', k + 1
        visti.add(nome_sez)
        righe += [f'// @sezione {nome_sez}', codice, '']
    return '\n'.join(righe), suoni, mancanti

if __name__ == '__main__':
    als, cartella, uscita = sys.argv[1], sys.argv[2], sys.argv[3]
    testo, suoni, mancanti = converti(als, cartella)
    open(uscita, 'w').write(testo)
    json.dump({'suoni': suoni, 'mancanti': sorted(mancanti)}, open(uscita + '.json', 'w'), indent=1)
    print(testo)
    print('MANCANTI', sorted(mancanti))
