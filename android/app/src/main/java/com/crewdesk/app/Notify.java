package com.crewdesk.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;

/** Notification channels and plain notifications. People can tune each channel in Android settings. */
final class Notify {
    static final String GENERAL = "general", CHECKIN = "checkin", EMERGENCY = "emergency", SESSION = "session";
    private Notify() {}

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel g = new NotificationChannel(GENERAL, "Messages and updates", NotificationManager.IMPORTANCE_HIGH);
        g.setDescription("Chat messages, pings and things for you");
        nm.createNotificationChannel(g);

        NotificationChannel ck = new NotificationChannel(CHECKIN, "Check-in reminders", NotificationManager.IMPORTANCE_HIGH);
        ck.setDescription("Asks you to confirm you're safe while working alone");
        ck.enableVibration(true); ck.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 500 });
        ck.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());
        nm.createNotificationChannel(ck);

        // The siren itself is played by SirenService on the alarm stream (so it keeps going until someone responds);
        // the channel is silent to avoid a second sound, but high priority, lights, lock-screen and Do Not Disturb bypass.
        NotificationChannel em = new NotificationChannel(EMERGENCY, "Emergency alerts", NotificationManager.IMPORTANCE_HIGH);
        em.setDescription("Someone working alone needs help or missed a check-in. Plays a siren until you respond.");
        em.setSound(null, null); em.enableVibration(false);
        em.enableLights(true); em.setLightColor(Color.RED);
        em.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        em.setBypassDnd(true);
        nm.createNotificationChannel(em);

        NotificationChannel s = new NotificationChannel(SESSION, "Working alone (ongoing)", NotificationManager.IMPORTANCE_LOW);
        s.setDescription("Shown while a Stay safe session is running");
        s.setShowBadge(false);
        nm.createNotificationChannel(s);
    }

    static PendingIntent openApp(Context c, String link, int req) {
        Intent i = new Intent(c, MainActivity.class).putExtra("link", link == null ? "" : link)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Notification.Builder base(Context c, String channel, String title, String body, String link, int req) {
        return new Notification.Builder(c, channel).setSmallIcon(R.drawable.ic_stat).setColor(0xFF18693F)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true).setContentIntent(openApp(c, link, req));
    }

    static void show(Context c, int id, Notification n) { c.getSystemService(NotificationManager.class).notify(id, n); }
    static void cancel(Context c, int id) { c.getSystemService(NotificationManager.class).cancel(id); }
}
