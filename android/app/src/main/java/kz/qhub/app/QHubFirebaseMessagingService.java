package kz.qhub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Native push display for messenger messages/calls and family locate wake. */
public class QHubFirebaseMessagingService extends FirebaseMessagingService {
  private static final String CHANNEL_MESSENGER = "qhub_messenger";
  private static final String CHANNEL_CALLS = "qhub_calls";

  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    Map<String, String> data = remoteMessage.getData();
    if (data == null || data.isEmpty()) {
      return;
    }

    String action = data.get("action");
    if ("family:locate".equals(action)) {
      wakeFamilyLocate(data.get("requestId"));
      return;
    }

    String title = data.get("title");
    String body = data.get("body");
    if (title == null || title.isEmpty()) {
      return;
    }

    showPushNotification(data, title, body == null ? "" : body, action);
  }

  private void wakeFamilyLocate(String requestId) {
    Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra("fcm_action", "family:locate");
    if (requestId != null && !requestId.isEmpty()) {
      intent.putExtra("request_id", requestId);
    }
    startActivity(intent);
  }

  private void showPushNotification(
      Map<String, String> data, String title, String body, String action) {
    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (manager == null) {
      return;
    }
    ensureChannels(manager);

    String url = data.get("url");
    boolean isCall = "messenger:call".equals(action);
    String channelId = isCall ? CHANNEL_CALLS : CHANNEL_MESSENGER;
    String callId = data.get("callId");
    int notificationId =
        isCall && callId != null && !callId.isEmpty()
            ? ("call:" + callId).hashCode()
            : (title + ":" + body).hashCode();

    Intent openIntent = new Intent(this, MainActivity.class);
    openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (url != null && !url.isEmpty()) {
      openIntent.putExtra("messenger_url", url);
    }
    PendingIntent contentIntent =
        PendingIntent.getActivity(
            this,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(isCall ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE);

    if (isCall) {
      builder.setOngoing(true);
      builder.setOnlyAlertOnce(true);
      builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

      Intent acceptIntent = new Intent(this, MainActivity.class);
      acceptIntent.setFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      acceptIntent.putExtra("messenger_action", "call_accept");
      if (url != null && !url.isEmpty()) {
        acceptIntent.putExtra("messenger_url", url);
      }
      if (callId != null && !callId.isEmpty()) {
        acceptIntent.putExtra("call_id", callId);
      }
      PendingIntent acceptPending =
          PendingIntent.getActivity(
              this,
              notificationId + 1,
              acceptIntent,
              PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

      Intent declineIntent = new Intent(this, MainActivity.class);
      declineIntent.setFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      declineIntent.putExtra("messenger_action", "call_decline");
      if (callId != null && !callId.isEmpty()) {
        declineIntent.putExtra("call_id", callId);
      }
      PendingIntent declinePending =
          PendingIntent.getActivity(
              this,
              notificationId + 2,
              declineIntent,
              PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

      builder.addAction(new NotificationCompat.Action.Builder(0, "Принять", acceptPending).build());
      builder.addAction(new NotificationCompat.Action.Builder(0, "Отклонить", declinePending).build());
    }

    manager.notify(notificationId, builder.build());
  }

  private void ensureChannels(NotificationManager manager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return;
    }
    NotificationChannel messenger =
        new NotificationChannel(
            CHANNEL_MESSENGER,
            "Сообщения QHub",
            NotificationManager.IMPORTANCE_HIGH);
    messenger.setDescription("Уведомления мессенджера QHub");
    manager.createNotificationChannel(messenger);

    NotificationChannel calls =
        new NotificationChannel(
            CHANNEL_CALLS,
            "Звонки QHub",
            NotificationManager.IMPORTANCE_HIGH);
    calls.setDescription("Входящие звонки QHub");
    calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    manager.createNotificationChannel(calls);
  }
}
