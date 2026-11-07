package com.crewdesk.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.widget.Toast;

import org.json.JSONObject;

/** Notification buttons: "I'm safe" (check in) and "I'm responding" (to someone's alert), without opening the app. */
public class ActionReceiver extends BroadcastReceiver {
    static final String CHECKIN = "com.crewdesk.app.CHECKIN", ACK = "com.crewdesk.app.ACK";

    @Override public void onReceive(Context c, Intent in) {
        String cid = in.getStringExtra("cid"), session = in.getStringExtra("session");
        if (cid == null || session == null || cid.isEmpty() || session.isEmpty()) return;
        boolean checkin = CHECKIN.equals(in.getAction());
        SirenService.stop(c); // either way, the siren has done its job
        int notif = in.getIntExtra("notif", 0);
        PendingResult pr = goAsync();
        new Thread(() -> {
            String msg;
            try {
                JSONObject b = new JSONObject();
                Location l = LoneService.last;
                if (checkin && l != null) b.put("platform", "android").put("loc", new JSONObject().put("lat", l.getLatitude()).put("lng", l.getLongitude()).put("acc", l.getAccuracy()));
                int code = Net.post(c, "/api/c/" + cid + "/lone/" + session + (checkin ? "/checkin" : "/ack"), b.toString());
                msg = code < 300 ? (checkin ? "Checked in. Stay safe." : "They've been told you're responding") : "Couldn't reach Crewdesk — open the app";
                if (code < 300 && notif != 0) Notify.cancel(c, notif);
            } catch (Exception e) { msg = "Couldn't reach Crewdesk — open the app"; }
            final String m = msg;
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> { Toast.makeText(c, m, Toast.LENGTH_LONG).show(); pr.finish(); });
        }).start();
    }
}
