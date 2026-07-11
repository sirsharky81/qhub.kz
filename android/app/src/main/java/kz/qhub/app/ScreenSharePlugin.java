package kz.qhub.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.DataChannel;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoCapturer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "ScreenShare")
public class ScreenSharePlugin extends Plugin {
    private PeerConnectionFactory factory;
    private PeerConnection peerConnection;
    private EglBase eglBase;
    private SurfaceTextureHelper surfaceTextureHelper;
    private VideoCapturer capturer;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private boolean stopping;
    private boolean remoteDescriptionSet;
    private final List<IceCandidate> pendingRemoteCandidates = new ArrayList<>();
    private List<PeerConnection.IceServer> pendingIceServers = Collections.emptyList();

    @PluginMethod
    public void start(PluginCall call) {
        if (peerConnection != null) {
            call.reject("screen_share_already_active");
            return;
        }
        try {
            pendingIceServers = parseIceServers(call.getString("iceServersJson", "[]"));
        } catch (Exception err) {
            call.reject("invalid_ice_servers", err);
            return;
        }

        MediaProjectionManager manager =
            (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("media_projection_unavailable");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "projectionResult");
    }

    @ActivityCallback
    private void projectionResult(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("screen_share_cancelled");
            return;
        }

        Intent serviceIntent = new Intent(getContext(), ScreenShareService.class);
        ContextCompat.startForegroundService(getContext(), serviceIntent);

        // The foreground service must enter startForeground before WebRTC asks
        // MediaProjectionManager for the one-shot token (Android 14+).
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                startCapture(data);
                call.resolve();
            } catch (Exception err) {
                stopInternal(false);
                call.reject("screen_share_start_failed", err);
                emitError(err.getMessage());
            }
        }, 250);
    }

    @PluginMethod
    public void applyAnswer(PluginCall call) {
        if (peerConnection == null) {
            call.reject("screen_peer_missing");
            return;
        }
        try {
            JSONObject description = new JSONObject(call.getString("sdp", ""));
            SessionDescription answer = new SessionDescription(
                SessionDescription.Type.ANSWER,
                description.getString("sdp")
            );
            peerConnection.setRemoteDescription(new SdpObserver() {
                @Override
                public void onSetSuccess() {
                    remoteDescriptionSet = true;
                    if (peerConnection != null) {
                        for (IceCandidate candidate : pendingRemoteCandidates) {
                            peerConnection.addIceCandidate(candidate);
                        }
                    }
                    pendingRemoteCandidates.clear();
                    call.resolve();
                }

                @Override public void onSetFailure(String error) { call.reject(error); }
                @Override public void onCreateSuccess(SessionDescription description) {}
                @Override public void onCreateFailure(String error) { call.reject(error); }
            }, answer);
        } catch (Exception err) {
            call.reject("invalid_screen_answer", err);
        }
    }

    @PluginMethod
    public void addIceCandidate(PluginCall call) {
        if (peerConnection == null) {
            call.reject("screen_peer_missing");
            return;
        }
        String candidate = call.getString("candidate", "");
        String sdpMid = call.getString("sdpMid", "0");
        int sdpMLineIndex = call.getInt("sdpMLineIndex", 0);
        IceCandidate parsed = new IceCandidate(sdpMid, sdpMLineIndex, candidate);
        if (remoteDescriptionSet) {
            peerConnection.addIceCandidate(parsed);
        } else {
            pendingRemoteCandidates.add(parsed);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal(false);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal(false);
        if (factory != null) {
            factory.dispose();
            factory = null;
        }
        if (eglBase != null) {
            eglBase.release();
            eglBase = null;
        }
    }

    private void startCapture(Intent projectionData) throws Exception {
        stopping = false;
        remoteDescriptionSet = false;
        pendingRemoteCandidates.clear();
        ensureFactory();

        capturer = new ScreenCapturerAndroid(
            projectionData,
            new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    if (stopping) return;
                    stopInternal(true);
                }
            }
        );
        videoSource = factory.createVideoSource(true);
        surfaceTextureHelper = SurfaceTextureHelper.create("QHubScreenCapture", eglBase.getEglBaseContext());
        capturer.initialize(surfaceTextureHelper, getContext(), videoSource.getCapturerObserver());

        DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
        int sourceWidth = Math.max(metrics.widthPixels, metrics.heightPixels);
        int sourceHeight = Math.min(metrics.widthPixels, metrics.heightPixels);
        int width = Math.min(1280, sourceWidth);
        int height = Math.max(360, Math.round(sourceHeight * (width / (float) sourceWidth)));
        capturer.startCapture(width, height, 15);

        videoTrack = factory.createVideoTrack("qhub-screen-video", videoSource);
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(pendingIceServers);
        config.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE;
        config.rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE;
        peerConnection = factory.createPeerConnection(config, peerObserver);
        if (peerConnection == null) throw new IllegalStateException("screen_peer_create_failed");
        peerConnection.addTrack(videoTrack, Collections.singletonList("qhub-screen-stream"));

        MediaConstraints constraints = new MediaConstraints();
        constraints.mandatory.add(new MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"));
        constraints.mandatory.add(new MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"));
        peerConnection.createOffer(new SdpObserver() {
            @Override
            public void onCreateSuccess(SessionDescription description) {
                if (peerConnection == null) return;
                peerConnection.setLocalDescription(new SdpObserver() {
                    @Override
                    public void onSetSuccess() {
                        JSObject payload = new JSObject();
                        payload.put("type", "offer");
                        payload.put("sdp", description.description);
                        emitSignal("offer", payload.toString());
                    }

                    @Override public void onSetFailure(String error) { emitError(error); }
                    @Override public void onCreateSuccess(SessionDescription ignored) {}
                    @Override public void onCreateFailure(String error) { emitError(error); }
                }, description);
            }

            @Override public void onCreateFailure(String error) { emitError(error); }
            @Override public void onSetSuccess() {}
            @Override public void onSetFailure(String error) { emitError(error); }
        }, constraints);
    }

    private void ensureFactory() {
        if (factory != null) return;
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(getContext())
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        );
        eglBase = EglBase.create();
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory();
    }

    private final PeerConnection.Observer peerObserver = new PeerConnection.Observer() {
        @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {
            if (state == PeerConnection.IceConnectionState.FAILED) {
                emitError("screen_ice_failed");
            }
        }
        @Override public void onIceConnectionReceivingChange(boolean receiving) {}
        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) {}
        @Override public void onIceCandidate(IceCandidate candidate) {
            try {
                JSONObject payload = new JSONObject();
                payload.put("candidate", candidate.sdp);
                payload.put("sdpMid", candidate.sdpMid);
                payload.put("sdpMLineIndex", candidate.sdpMLineIndex);
                emitSignal("ice", payload.toString());
            } catch (Exception err) {
                emitError(err.getMessage());
            }
        }
        @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
        @Override public void onAddStream(MediaStream stream) {}
        @Override public void onRemoveStream(MediaStream stream) {}
        @Override public void onDataChannel(DataChannel channel) {}
        @Override public void onRenegotiationNeeded() {}
        @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) {}
    };

    private List<PeerConnection.IceServer> parseIceServers(String raw) throws Exception {
        JSONArray servers = new JSONArray(raw);
        List<PeerConnection.IceServer> result = new ArrayList<>();
        for (int index = 0; index < servers.length(); index++) {
            JSONObject server = servers.getJSONObject(index);
            Object urlsValue = server.get("urls");
            List<String> urls = new ArrayList<>();
            if (urlsValue instanceof JSONArray) {
                JSONArray urlArray = (JSONArray) urlsValue;
                for (int i = 0; i < urlArray.length(); i++) urls.add(urlArray.getString(i));
            } else {
                urls.add(String.valueOf(urlsValue));
            }
            PeerConnection.IceServer.Builder builder = PeerConnection.IceServer.builder(urls);
            if (server.has("username")) builder.setUsername(server.optString("username"));
            if (server.has("credential")) builder.setPassword(server.optString("credential"));
            result.add(builder.createIceServer());
        }
        return result;
    }

    private void stopInternal(boolean notifyWeb) {
        if (stopping) return;
        stopping = true;
        try {
            if (capturer != null) capturer.stopCapture();
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        if (capturer != null) capturer.dispose();
        capturer = null;
        if (surfaceTextureHelper != null) surfaceTextureHelper.dispose();
        surfaceTextureHelper = null;
        if (videoTrack != null) videoTrack.dispose();
        videoTrack = null;
        if (videoSource != null) videoSource.dispose();
        videoSource = null;
        if (peerConnection != null) peerConnection.close();
        if (peerConnection != null) peerConnection.dispose();
        peerConnection = null;
        remoteDescriptionSet = false;
        pendingRemoteCandidates.clear();
        getContext().stopService(new Intent(getContext(), ScreenShareService.class));
        if (notifyWeb) emitSignal("stopped", null);
        stopping = false;
    }

    private void emitSignal(String type, String payload) {
        JSObject event = new JSObject();
        event.put("type", type);
        if (payload != null) event.put("payload", payload);
        notifyListeners("signal", event, true);
    }

    private void emitError(String message) {
        JSObject event = new JSObject();
        event.put("type", "error");
        event.put("message", message == null ? "screen_share_error" : message);
        notifyListeners("signal", event, true);
    }

}
