// Uscita audio finta per le prove: un dispositivo aggregato che passa dalle casse del Mac. Vive finché vive questo processo.
import CoreAudio
import Foundation

func uidUscitaInterna() -> String? {
  var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids)
  for id in ids {
    var t = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyTransportType, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var tipo: UInt32 = 0; var s = UInt32(MemoryLayout<UInt32>.size)
    AudioObjectGetPropertyData(id, &t, 0, nil, &s, &tipo)
    var o = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioDevicePropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
    var os: UInt32 = 0
    AudioObjectGetPropertyDataSize(id, &o, 0, nil, &os)
    if tipo == kAudioDeviceTransportTypeBuiltIn && os > 0 {
      var u = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyDeviceUID, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
      var uid: Unmanaged<CFString>?; var us = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
      AudioObjectGetPropertyData(id, &u, 0, nil, &us, &uid)
      return uid?.takeRetainedValue() as String?
    }
  }
  return nil
}

guard let interna = uidUscitaInterna() else { print("ERRORE nessuna uscita interna"); exit(1) }
let nome = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "CUTX Prova Uscita"
let desc: [String: Any] = [
  kAudioAggregateDeviceNameKey: nome,
  kAudioAggregateDeviceUIDKey: "cutx.prova.uscita.\(getpid())",
  kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: interna]],
  kAudioAggregateDeviceMainSubDeviceKey: interna,
  kAudioAggregateDeviceIsPrivateKey: 0,
]
var agg: AudioDeviceID = 0
let st = AudioHardwareCreateAggregateDevice(desc as CFDictionary, &agg)
guard st == noErr else { print("ERRORE creazione \(st)"); exit(1) }
print("CREATA \(agg) \(nome)"); fflush(stdout)
func chiudi() { AudioHardwareDestroyAggregateDevice(agg); print("TOLTA"); fflush(stdout); exit(0) }
signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN)
let a = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main); a.setEventHandler { chiudi() }; a.resume()
let b = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main); b.setEventHandler { chiudi() }; b.resume()
RunLoop.main.run()
