import AVFoundation
import Capacitor

@objc(CallAudioPlugin)
public class CallAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallAudioPlugin"
    public let jsName = "CallAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise),
    ]

    @objc func prepare(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            call.resolve()
        } catch {
            call.reject("prepare_failed", error.localizedDescription, error)
        }
    }

    @objc func setSpeaker(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
            call.resolve()
        } catch {
            call.reject("set_speaker_failed", error.localizedDescription, error)
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.overrideOutputAudioPort(.none)
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        } catch {
            call.reject("release_failed", error.localizedDescription, error)
        }
    }
}
