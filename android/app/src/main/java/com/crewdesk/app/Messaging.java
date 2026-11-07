package com.crewdesk.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Intent;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Messages from the Crewdesk server. Emergencies start the siren; check-in reminders get an "I'm safe" button. */
public class Messaging extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        CrewdeskApp.prefs(this).edit().putString("token", token).apply();
        CrewdeskApp.registerToken(this);
    }

    @Override public void onMessageReceived(RemoteMessage m) {
        Map<String, String> d = m.getData();
        String title = val(d, "title", "Crewdesk"), body = val(d, "body", ""), link = val(d, "link", "#/home");
        String kind = val(d, "kind", "normal"), session = val(d, "session", ""), cid = val(d, "cid", "");
        if (!val(d, "company", "").isEmpty()) title = title + " — " + d.get("company");

        // alarm: someone's emergency (buddy/admins) or, with self=1, the worker's own missed check-in
        if ("1".equals(d.get("alarm"))) { SirenService.alarm(this, title, body, link, session, cid, "1".equals(d.get("self"))); return; }
        if ("resolved".equals(kind)) SirenService.stopFor(this, session); // they're safe: stop the siren for that person

        int id = Math.abs((val(d, "tag", title)).hashCode());
        if ("checkin".equals(kind)) {
            Intent ok = new Intent(this, ActionReceiver.class).setAction(ActionReceiver.CHECKIN).putExtra("cid", cid).putExtra("session", session).putExtra("notif", id);
            PendingIntent okPi = PendingIntent.getBroadcast(this, id, ok, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = Notify.base(this, Notify.CHECKIN, title, body, link, id).setCategory(Notification.CATEGORY_REMINDER)
                .addAction(new Notification.Action.Builder(null, "✓ Check in", okPi).build()).build();
            Notify.show(this, id, n);
            return;
        }
        Notify.show(this, id, Notify.base(this, Notify.GENERAL, title, body, link, id)
            .setCategory("urgent".equals(kind) ? Notification.CATEGORY_STATUS : Notification.CATEGORY_MESSAGE).build());
    }

    private static String val(Map<String, String> d, String k, String def) { String v = d.get(k); return v == null || v.isEmpty() ? def : v; }
}
