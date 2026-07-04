package kz.qhub.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {

    private PowerManager.WakeLock proximityWakeLock;

    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        AudioManager am = audioManager();
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        routeToEarpiece(am);
        setProximityEnabledInternal(true);
        call.resolve();
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        AudioManager am = audioManager();
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (enabled) {
                if (!setCommunicationDevice(am, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)) {
                    am.setSpeakerphoneOn(true);
                }
            } else {
                routeToEarpiece(am);
            }
        } else {
            am.setSpeakerphoneOn(enabled);
        }

        setProximityEnabledInternal(!enabled);
        call.resolve();
    }

    @PluginMethod
    public void setProximity(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        setProximityEnabledInternal(enabled);
        call.resolve();
    }

    @PluginMethod
    public void release(PluginCall call) {
        releaseProximityWakeLock();
        AudioManager am = audioManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice();
        } else {
            am.setSpeakerphoneOn(false);
        }
        am.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }

    private void setProximityEnabledInternal(boolean enabled) {
        if (enabled) {
            acquireProximityWakeLock();
        } else {
            releaseProximityWakeLock();
        }
    }

    private void acquireProximityWakeLock() {
        if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
            return;
        }
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm == null) {
            return;
        }
        proximityWakeLock = pm.newWakeLock(
            PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
            "qhub:call-proximity"
        );
        proximityWakeLock.acquire();
    }

    private void releaseProximityWakeLock() {
        if (proximityWakeLock == null) {
            return;
        }
        if (proximityWakeLock.isHeld()) {
            proximityWakeLock.release();
        }
        proximityWakeLock = null;
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

    private void routeToEarpiece(AudioManager am) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!setCommunicationDevice(am, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)) {
                am.setSpeakerphoneOn(false);
            }
        } else {
            am.setSpeakerphoneOn(false);
        }
    }
}
