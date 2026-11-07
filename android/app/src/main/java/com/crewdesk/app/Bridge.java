package com.crewdesk.app;

import android.location.Location;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/** What the Crewdesk web app can ask the phone to do (window.CrewdeskAndroid). Only Crewdesk's own pages are loaded in the app. */
public class Bridge {
    private final MainActivity a;
    Bridge(MainActivity a) { this.a = a; }

    @JavascriptInterface public String status() { return a.status().toString(); }
    @JavascriptInterface public void request(String what) { a.runOnUiThread(() -> a.request(what)); }
    @JavascriptInterface public String token() { return CrewdeskApp.prefs(a).getString("token", ""); }

    /** Start (or update) the working-alone service. Returns false if location isn't allowed yet. */
    @JavascriptInterface public boolean startSession(String cid, String session, double nextAt, double endsAt, String where) {
        return LoneService.start(a, cid, session, (long) nextAt, (long) endsAt, where);
    }
    @JavascriptInterface public void stopSession() { LoneService.stop(a); }

    @JavascriptInterface public String lastLoc() {
        Location l = LoneService.last; if (l == null) return "";
        try { return new JSONObject().put("lat", l.getLatitude()).put("lng", l.getLongitude()).put("acc", l.getAccuracy()).toString(); } catch (Exception e) { return ""; }
    }

    /** The phone's own siren (alarm volume, keeps going with the screen off) for the person raising an alert. */
    @JavascriptInterface public void siren(boolean on, String title, String body) {
        if (on) SirenService.alarm(a, title == null || title.isEmpty() ? "Alert sent" : title, body == null ? "" : body, "#/lone", "", "", true);
        else SirenService.stop(a);
    }
    @JavascriptInterface public boolean sirenOn() { return SirenService.playing; }
}
