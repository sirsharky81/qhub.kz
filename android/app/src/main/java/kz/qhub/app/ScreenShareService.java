package kz.qhub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class ScreenShareService extends Service {
    private static final String CHANNEL_ID = "qhub_screen_share";
    private static final int NOTIFICATION_ID = 4102;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Демонстрация экрана",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Активная демонстрация экрана в видеозвонке QHub");
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("QHub — демонстрация экрана")
            .setContentText("Экран транслируется собеседнику")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
