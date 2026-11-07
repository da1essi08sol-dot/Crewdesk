package com.crewdesk.app;

import android.content.Context;
import android.webkit.CookieManager;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Talks to the Crewdesk server as the signed-in person (using the app's own sign-in cookie). Call off the main thread. */
final class Net {
    private Net() {}

    static String base(Context c) {
        String u = CrewdeskApp.prefs(c).getString("url", "");
        return (u.isEmpty() ? BuildConfig.DEFAULT_URL : u).replaceAll("/+$", "");
    }

    static String get(Context c, String path) throws Exception { return call(c, "GET", path, null)[1]; }

    /** Returns the HTTP status code. */
    static int post(Context c, String path, String json) throws Exception { return Integer.parseInt(call(c, "POST", path, json)[0]); }

    private static String[] call(Context c, String method, String path, String json) throws Exception {
        String base = base(c);
        HttpURLConnection h = (HttpURLConnection) new URL(base + path).openConnection();
        h.setRequestMethod(method);
        h.setConnectTimeout(15000); h.setReadTimeout(15000);
        String cookie = CookieManager.getInstance().getCookie(base);
        if (cookie != null) h.setRequestProperty("Cookie", cookie);
        h.setRequestProperty("X-Crewdesk", "1");
        h.setRequestProperty("User-Agent", "CrewdeskAndroid/" + BuildConfig.VERSION_NAME);
        if (json != null) {
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = h.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = h.getResponseCode();
        InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); in.close(); }
        h.disconnect();
        return new String[] { String.valueOf(code), out.toString("UTF-8") };
    }
}
