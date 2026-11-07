package com.crewdesk.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * The emergency siren. Runs as a foreground service so it keeps going with the screen off and the app closed, on the
 * alarm volume (turned to maximum while it plays, then put back), with continuous vibration and a full-screen alert,
 * until someone taps Stop siren or I'm responding — or 30 minutes pass.
 */
public class SirenService extends Service {
    static final String STOP = "com.crewdesk.app.STOP_SIREN";
    static final int NOTIF = 911;
    static volatile String currentSession = "";
    static volatile boolean playing = false;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wake;
    private int oldVolume = -1;
    private final Handler handler = new Handler(Looper.getMainLooper());

    static void alarm(Context c, String title, String body, String link, String session, String cid, boolean own) {
        Intent i = new Intent(c, SirenService.class).putExtra("title", title).putExtra("body", body).putExtra("link", link)
            .putExtra("session", session).putExtra("cid", cid).putExtra("own", own);
        c.startForegroundService(i);
    }
    static void stop(Context c) { if (!playing) return; try { c.startService(new Intent(c, SirenService.class).setAction(STOP)); } catch (Exception ignored) {} }
    static void stopFor(Context c, String session) { if (playing && session != null && session.equals(currentSession)) stop(c); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) { shutDown(); return START_NOT_STICKY; }
        String title = intent.getStringExtra("title"), body = intent.getStringExtra("body");
        String session = intent.getStringExtra("session"), cid = intent.getStringExtra("cid");
        boolean own = intent.getBooleanExtra("own", false);
        currentSession = session == null ? "" : session;

        Intent full = new Intent(this, EmergencyActivity.class).putExtras(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(this, 1, full, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stopPi = PendingIntent.getService(this, 2, new Intent(this, SirenService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(this, Notify.EMERGENCY).setSmallIcon(R.drawable.ic_stat).setColor(0xFFC92A2A)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC).setOngoing(true)
            .setFullScreenIntent(fullPi, true).setContentIntent(fullPi)
            .addAction(new Notification.Action.Builder(null, "Stop siren", stopPi).build());
        if (own && session != null && !session.isEmpty()) { // the worker's own missed check-in: one tap checks in and stops the siren
            Intent ok = new Intent(this, ActionReceiver.class).setAction(ActionReceiver.CHECKIN).putExtra("cid", cid).putExtra("session", session);
            b.addAction(new Notification.Action.Builder(null, "✓ Check in", PendingIntent.getBroadcast(this, 4, ok, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build());
        }
        if (!own && session != null && !session.isEmpty() && !"test".equals(session)) {
            Intent ack = new Intent(this, ActionReceiver.class).setAction(ActionReceiver.ACK).putExtra("cid", cid).putExtra("session", session);
            b.addAction(new Notification.Action.Builder(null, "I'm responding", PendingIntent.getBroadcast(this, 3, ack, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build());
        }
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIF, b.build());

        if (!playing) startSiren();
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::shutDown, 30 * 60 * 1000L); // never longer than 30 minutes
        return START_NOT_STICKY;
    }

    private void startSiren() {
        playing = true;
        AudioManager am = getSystemService(AudioManager.class);
        try { oldVolume = am.getStreamVolume(AudioManager.STREAM_ALARM); am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0); } catch (Exception ignored) {}
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            // The phone's own stock alarm sound (what people already know as "alarm"); Crewdesk's siren only if there isn't one.
            Uri sound = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            try { player.setDataSource(this, sound != null ? sound : Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.siren)); }
            catch (Exception e) { player.reset(); player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.siren)); }
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {}
        vibrator = getSystemService(Vibrator.class);
        try {
            AudioAttributes va = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
            vibrator.vibrate(VibrationEffect.createWaveform(new long[] { 0, 900, 300 }, 0), va); // repeats until cancelled
        } catch (Exception ignored) {}
        PowerManager pm = getSystemService(PowerManager.class);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "crewdesk:siren");
        wake.acquire(31 * 60 * 1000L);
    }

    private void shutDown() {
        playing = false; currentSession = "";
        handler.removeCallbacksAndMessages(null);
        if (player != null) { try { player.stop(); } catch (Exception ignored) {} player.release(); player = null; }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
        if (oldVolume >= 0) { try { getSystemService(AudioManager.class).setStreamVolume(AudioManager.STREAM_ALARM, oldVolume, 0); } catch (Exception ignored) {} oldVolume = -1; }
        if (wake != null && wake.isHeld()) wake.release();
        sendBroadcast(new Intent(EmergencyActivity.CLOSE).setPackage(getPackageName()));
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() { if (playing) shutDown(); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
