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
    private String pendingMessengerAction;
    private String pendingMessengerUrl;
    private String pendingCallId;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(QHubAppPlugin.class);
        super.onCreate(savedInstanceState);
        captureFamilyLocateIntent(getIntent());
        captureMessengerIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureFamilyLocateIntent(intent);
        captureMessengerIntent(intent);
        deliverPendingFamilyLocateIntent();
        deliverPendingMessengerIntent();
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
        deliverPendingMessengerIntent();
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

    private void captureMessengerIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getStringExtra("messenger_action");
        if (action == null || action.isEmpty()) {
            String url = intent.getStringExtra("messenger_url");
            if (url != null && !url.isEmpty()) {
                pendingMessengerAction = "open";
                pendingMessengerUrl = url;
                intent.removeExtra("messenger_url");
            }
            return;
        }
        pendingMessengerAction = action;
        pendingMessengerUrl = intent.getStringExtra("messenger_url");
        pendingCallId = intent.getStringExtra("call_id");
        intent.removeExtra("messenger_action");
        intent.removeExtra("messenger_url");
        intent.removeExtra("call_id");
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

    private void deliverPendingMessengerIntent() {
        if (pendingMessengerAction == null || pendingMessengerAction.isEmpty()) {
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

        String action = pendingMessengerAction;
        String url = pendingMessengerUrl == null ? "" : pendingMessengerUrl.replace("'", "");
        String callId = pendingCallId == null ? "" : pendingCallId.replace("'", "");
        pendingMessengerAction = null;
        pendingMessengerUrl = null;
        pendingCallId = null;

        String js =
            "window.dispatchEvent(new CustomEvent('qhub-messenger-push-native', { detail: { action: '"
                + action
                + "', url: '"
                + url
                + "', callId: '"
                + callId
                + "' } }));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
