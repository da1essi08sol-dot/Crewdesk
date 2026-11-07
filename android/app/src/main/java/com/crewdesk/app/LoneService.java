package com.crewdesk.app;

import android.Manifest;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Runs while someone is working alone: an ongoing "Working alone" notification with an I'm safe button, and their
 * location sent to the server. Battery: updates at most every 2 minutes or 25 metres, from the fused (Wi-Fi/cell/GPS)
 * provider where available. Started from the app while it's on screen, so Android treats location as "while in use".
 */
public class LoneService extends Service implements LocationListener {
    static final String STOP = "com.crewdesk.app.STOP_LONE";
    static final int NOTIF = 77;
    static volatile Location last;
    private String cid = "", session = "", where = "";
    private long nextAt, endsAt, lastSent;
    private boolean listening;

    static boolean start(Context c, String cid, String session, long nextAt, long endsAt, String where) {
        // Needs location permission: the service's whole job is sharing location (Android won't run it as a location service otherwise).
        if (c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return false;
        c.startForegroundService(new Intent(c, LoneService.class).putExtra("cid", cid).putExtra("session", session)
            .putExtra("nextAt", nextAt).putExtra("endsAt", endsAt).putExtra("where", where));
        return true;
    }
    static void stop(Context c) { try { c.startService(new Intent(c, LoneService.class).setAction(STOP)); } catch (Exception ignored) {} }

    @Override public int onStartCommand(Intent in, int flags, int startId) {
        if (in == null || STOP.equals(in.getAction())) { finish(); return START_NOT_STICKY; }
        cid = in.getStringExtra("cid"); session = in.getStringExtra("session"); where = in.getStringExtra("where");
        nextAt = in.getLongExtra("nextAt", 0); endsAt = in.getLongExtra("endsAt", 0);
        Notification n = note();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIF, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; } // location permission was taken away
        listen();
        return START_REDELIVER_INTENT;
    }

    private Notification note() {
        String t = new SimpleDateFormat("HH:mm", Locale.UK).format(new Date(nextAt));
        String f = new SimpleDateFormat("HH:mm", Locale.UK).format(new Date(endsAt));
        Intent ok = new Intent(this, ActionReceiver.class).setAction(ActionReceiver.CHECKIN).putExtra("cid", cid).putExtra("session", session);
        PendingIntent okPi = PendingIntent.getBroadcast(this, 70, ok, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return Notify.base(this, Notify.SESSION, "Working alone" + (where == null || where.isEmpty() ? "" : " · " + where),
                "Next check-in " + t + " · finish by " + f + (hasLocation() ? " · location shared" : ""), "#/lone", 71)
            .setOngoing(true).setAutoCancel(false).setCategory(Notification.CATEGORY_SERVICE)
            .addAction(new Notification.Action.Builder(null, "I'm safe", okPi).build()).build();
    }

    private boolean hasLocation() { return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED; }

    private void listen() {
        if (listening || !hasLocation()) return;
        LocationManager lm = getSystemService(LocationManager.class);
        String p = Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER) ? LocationManager.FUSED_PROVIDER
            : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
        try { lm.requestLocationUpdates(p, 120_000L, 25f, this, Looper.getMainLooper()); listening = true; } catch (SecurityException | IllegalArgumentException ignored) {}
    }

    @Override public void onLocationChanged(Location l) {
        last = l;
        if (System.currentTimeMillis() - lastSent < 110_000L) return;
        lastSent = System.currentTimeMillis();
        final String path = "/api/c/" + cid + "/lone/" + session + "/loc";
        new Thread(() -> {
            try {
                JSONObject b = new JSONObject().put("platform", "android").put("loc", new JSONObject().put("lat", l.getLatitude()).put("lng", l.getLongitude()).put("acc", l.getAccuracy()));
                int code = Net.post(this, path, b.toString());
                if (code == 400 || code == 404) stop(this); // the session has finished
            } catch (Exception ignored) {}
        }).start();
    }

    private void finish() {
        if (listening) { try { getSystemService(LocationManager.class).removeUpdates(this); } catch (Exception ignored) {} listening = false; }
        last = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() { if (listening) try { getSystemService(LocationManager.class).removeUpdates(this); } catch (Exception ignored) {} super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
