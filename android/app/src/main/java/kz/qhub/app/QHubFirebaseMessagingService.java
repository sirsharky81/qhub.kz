package kz.qhub.app;

import android.content.Intent;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Wakes the app on silent family location requests when the JS process is not running. */
public class QHubFirebaseMessagingService extends FirebaseMessagingService {
  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    Map<String, String> data = remoteMessage.getData();
    if (data == null || data.isEmpty()) {
      return;
    }

    if (!"family:locate".equals(data.get("action"))) {
      return;
    }

    Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra("fcm_action", "family:locate");
    String requestId = data.get("requestId");
    if (requestId != null && !requestId.isEmpty()) {
      intent.putExtra("request_id", requestId);
    }
    startActivity(intent);
  }
}
