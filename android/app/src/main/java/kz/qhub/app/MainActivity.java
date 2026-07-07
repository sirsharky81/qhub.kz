package kz.qhub.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean pendingFamilyLocate;
    private String pendingLocateRequestId;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(QHubAppPlugin.class);
        super.onCreate(savedInstanceState);
        captureFamilyLocateIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureFamilyLocateIntent(intent);
        deliverPendingFamilyLocateIntent();
    }

    @Override
    public void onStart() {
        super.onStart();
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        Bridge bridge = getBridge();
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                cookieManager.setAcceptThirdPartyCookies(webView, true);
            }
        }
        deliverPendingFamilyLocateIntent();
    }

    private void captureFamilyLocateIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getStringExtra("fcm_action");
        if (!"family:locate".equals(action)) {
            return;
        }
        pendingFamilyLocate = true;
        pendingLocateRequestId = intent.getStringExtra("request_id");
        intent.removeExtra("fcm_action");
        intent.removeExtra("request_id");
    }

    private void deliverPendingFamilyLocateIntent() {
        if (!pendingFamilyLocate) {
            return;
        }

        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }

        String safeRequestId =
            pendingLocateRequestId == null
                ? "undefined"
                : "'" + pendingLocateRequestId.replace("'", "") + "'";
        pendingFamilyLocate = false;
        pendingLocateRequestId = null;

        String js =
            "window.dispatchEvent(new CustomEvent('qhub-family-locate-native', { detail: { action: 'family:locate', requestId: "
                + safeRequestId
                + " } }));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
