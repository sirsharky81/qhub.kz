package kz.qhub.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {

    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        AudioManager am = audioManager();
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        call.resolve();
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        AudioManager am = audioManager();
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (enabled) {
                if (!setCommunicationDevice(am, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)) {
                    am.setSpeakerphoneOn(true);
                }
            } else {
                if (!setCommunicationDevice(am, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)) {
                    am.setSpeakerphoneOn(false);
                }
            }
        } else {
            am.setSpeakerphoneOn(enabled);
        }

        call.resolve();
    }

    @PluginMethod
    public void release(PluginCall call) {
        AudioManager am = audioManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice();
        } else {
            am.setSpeakerphoneOn(false);
        }
        am.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }

    private boolean setCommunicationDevice(AudioManager am, int type) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return false;
        }
        for (AudioDeviceInfo device : am.getAvailableCommunicationDevices()) {
            if (device.getType() == type) {
                return am.setCommunicationDevice(device);
            }
        }
        return false;
    }
}
