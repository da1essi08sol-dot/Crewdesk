package com.crewdesk.app;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

/** Starts up: notification channels, and Firebase (configured from the Crewdesk server, so no google-services.json is baked in). */
public class CrewdeskApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Notify.channels(this);
        String cfg = prefs(this).getString("firebase", "");
        if (!cfg.isEmpty()) try { initFirebase(this, new JSONObject(cfg)); } catch (Exception ignored) {}
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("crewdesk", MODE_PRIVATE); }

    static synchronized boolean initFirebase(Context c, JSONObject cfg) {
        if (!FirebaseApp.getApps(c).isEmpty()) return true;
        try {
            FirebaseOptions o = new FirebaseOptions.Builder()
                .setProjectId(cfg.getString("projectId")).setApplicationId(cfg.getString("appId"))
                .setApiKey(cfg.getString("apiKey")).setGcmSenderId(cfg.getString("senderId")).build();
            FirebaseApp.initializeApp(c, o);
            return true;
        } catch (Exception e) { return false; }
    }

    /** Fetch the Firebase settings from the server, sign this phone up for alerts and register it with the signed-in account. */
    static void setUpPush(Context c) {
        Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                String r = Net.get(app, "/api/android/config");
                JSONObject j = new JSONObject(r);
                if (j.isNull("firebase")) return; // not set up on the server yet
                JSONObject cfg = j.getJSONObject("firebase");
                prefs(app).edit().putString("firebase", cfg.toString()).apply();
                if (!initFirebase(app, cfg)) return;
                FirebaseMessaging.getInstance().getToken().addOnSuccessListener(tok -> {
                    prefs(app).edit().putString("token", tok).apply();
                    registerToken(app);
                });
            } catch (Exception ignored) {}
        }).start();
    }

    static void registerToken(Context c) {
        String tok = prefs(c).getString("token", "");
        if (tok.isEmpty()) return;
        new Thread(() -> {
            try {
                JSONObject b = new JSONObject().put("token", tok).put("device", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
                Net.post(c, "/api/fcm", b.toString());
            } catch (Exception ignored) {}
        }).start();
    }
}
