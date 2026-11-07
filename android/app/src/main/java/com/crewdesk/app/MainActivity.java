package com.crewdesk.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import org.json.JSONObject;

/** Crewdesk in a native shell: the web app, plus emergency alerts, the siren and location sharing it can't do on its own. */
public class MainActivity extends Activity {
    WebView web;
    private ValueCallback<Uri[]> fileCb;
    private static final int FILES = 10, PERMS = 11;

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " CrewdeskAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(this), "CrewdeskAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (u.getHost() != null && u.getHost().equals(Uri.parse(Net.base(MainActivity.this)).getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) {} // phone, maps, email, other sites
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) { CookieManager.getInstance().flush(); CrewdeskApp.registerToken(MainActivity.this); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), FILES); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {} });
        setContentView(web);

        if (CrewdeskApp.prefs(this).getString("url", "").isEmpty()) askAddress(); else open(getIntent());
        CrewdeskApp.setUpPush(this);
    }

    /** First run: which Crewdesk site to open (remembered). */
    private void askAddress() {
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_TEXT_VARIATION_URI); in.setText(BuildConfig.DEFAULT_URL); in.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this).setTitle("Crewdesk web address").setMessage("The address you use for Crewdesk in your browser.")
            .setView(in).setCancelable(false).setPositiveButton("Open", (d, w) -> {
                String u = in.getText().toString().trim();
                if (!u.startsWith("http")) u = "https://" + u;
                CrewdeskApp.prefs(this).edit().putString("url", u.replaceAll("/+$", "")).apply();
                open(getIntent()); CrewdeskApp.setUpPush(this);
            }).show();
    }

    private void open(Intent i) {
        String link = i == null ? null : i.getStringExtra("link");
        String base = Net.base(this);
        if (web.getUrl() == null) web.loadUrl(base + "/" + (link == null || link.isEmpty() ? "" : link));
        else if (link != null && !link.isEmpty()) web.evaluateJavascript("location.hash=" + JSONObject.quote(link.replaceFirst("^#", "")), null);
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); open(i); }
    @Override protected void onResume() { super.onResume(); tellWeb("status"); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    void tellWeb(String type) { if (web != null) web.post(() -> web.evaluateJavascript("window.crewdeskNative&&window.crewdeskNative({type:" + JSONObject.quote(type) + "})", null)); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == FILES && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; }
        tellWeb("status");
    }
    @Override public void onRequestPermissionsResult(int req, String[] p, int[] r) { super.onRequestPermissionsResult(req, p, r); tellWeb("status"); }

    // ---- permissions, asked one at a time from the Stay safe setup list in the web app
    JSONObject status() {
        JSONObject j = new JSONObject();
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            PowerManager pm = getSystemService(PowerManager.class);
            j.put("app", BuildConfig.VERSION_NAME);
            j.put("notifications", nm.areNotificationsEnabled());
            j.put("location", checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            j.put("fullScreen", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent());
            j.put("battery", pm.isIgnoringBatteryOptimizations(getPackageName()));
            j.put("dnd", nm.isNotificationPolicyAccessGranted());
            j.put("token", CrewdeskApp.prefs(this).getString("token", ""));
        } catch (Exception ignored) {}
        return j;
    }

    void request(String what) {
        try {
            switch (what) {
                case "notifications":
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && !CrewdeskApp.prefs(this).getBoolean("askedNotif", false)) {
                        CrewdeskApp.prefs(this).edit().putBoolean("askedNotif", true).apply();
                        requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PERMS);
                    } else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                    break;
                case "location":
                    if (shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) || !CrewdeskApp.prefs(this).getBoolean("askedLoc", false)) {
                        CrewdeskApp.prefs(this).edit().putBoolean("askedLoc", true).apply();
                        requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, PERMS);
                    } else startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                    break;
                case "fullScreen":
                    if (Build.VERSION.SDK_INT >= 34) startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName())));
                    break;
                case "battery":
                    startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                    break;
                case "dnd":
                    startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
                    break;
                case "channel":
                    startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID, Notify.EMERGENCY));
                    break;
                case "address":
                    askAddress();
                    break;
            }
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }
}
