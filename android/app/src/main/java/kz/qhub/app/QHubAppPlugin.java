package kz.qhub.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QHubApp")
public class QHubAppPlugin extends Plugin {

    @PluginMethod
    public void getNativeCapabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("pushConfigured", BuildConfig.HAS_GOOGLE_SERVICES);
        call.resolve(ret);
    }
}
