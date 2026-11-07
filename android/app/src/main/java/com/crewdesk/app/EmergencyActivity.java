package com.crewdesk.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen emergency alert, shown over the lock screen while the siren plays. */
public class EmergencyActivity extends Activity {
    static final String CLOSE = "com.crewdesk.app.CLOSE_EMERGENCY";
    private final BroadcastReceiver closer = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { finish(); } };

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        build(getIntent());
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(closer, new IntentFilter(CLOSE), Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(closer, new IntentFilter(CLOSE));
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); build(i); }
    @Override protected void onDestroy() { try { unregisterReceiver(closer); } catch (Exception ignored) {} super.onDestroy(); }

    private void build(Intent in) {
        String title = in.getStringExtra("title"), body = in.getStringExtra("body"), link = in.getStringExtra("link");
        String session = in.getStringExtra("session"), cid = in.getStringExtra("cid");
        boolean own = in.getBooleanExtra("own", false);
        float dp = getResources().getDisplayMetrics().density;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER);
        root.setPadding((int) (28 * dp), (int) (40 * dp), (int) (28 * dp), (int) (40 * dp));
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xFFE03131, 0xFF8F1717 }));

        TextView icon = text("🚨", 64, false); root.addView(icon);
        root.addView(text(title == null ? "Emergency alert" : title, 30, true));
        TextView b = text(body == null ? "" : body, 18, false); b.setAlpha(0.92f); root.addView(b);

        if (own && session != null && !session.isEmpty()) {
            root.addView(button("I'm safe — check in", Color.WHITE, 0xFF2B8A3E, v -> {
                sendBroadcast(new Intent(this, ActionReceiver.class).setAction(ActionReceiver.CHECKIN).putExtra("cid", cid).putExtra("session", session));
                finish();
            }, dp));
        }
        if (!own && session != null && !session.isEmpty() && !"test".equals(session)) {
            root.addView(button("I'm responding", Color.WHITE, 0xFF9C1C1C, v -> {
                sendBroadcast(new Intent(this, ActionReceiver.class).setAction(ActionReceiver.ACK).putExtra("cid", cid).putExtra("session", session));
                openApp(link);
            }, dp));
        }
        root.addView(button("Stop siren", 0x33FFFFFF, Color.WHITE, v -> { SirenService.stop(this); finish(); }, dp));
        root.addView(button("Open Crewdesk", 0x00000000, Color.WHITE, v -> openApp(link), dp));
        setContentView(root);
    }

    private void openApp(String link) {
        startActivity(new Intent(this, MainActivity.class).putExtra("link", link == null ? "#/lone" : link).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.WHITE); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, 0, 0, (int) (12 * getResources().getDisplayMetrics().density));
        return t;
    }

    private Button button(String label, int bg, int fg, android.view.View.OnClickListener l, float dp) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(18); b.setTextColor(fg); b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable g = new GradientDrawable(); g.setColor(bg); g.setCornerRadius(16 * dp); b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (58 * dp));
        lp.topMargin = (int) (12 * dp); b.setLayoutParams(lp); b.setOnClickListener(l);
        return b;
    }
}
