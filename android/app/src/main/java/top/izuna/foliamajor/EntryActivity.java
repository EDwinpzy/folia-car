package top.izuna.foliamajor;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import java.util.Locale;

/**
 * Single launcher entry that selects the phone or automotive renderer before Capacitor starts.
 * Keeping one exported launcher activity avoids duplicate icons while still exposing APP_MUSIC.
 */
public class EntryActivity extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent source = getIntent();
        Class<?> target = isAutomotiveSurface(this) ? CarActivity.class : MainActivity.class;
        Intent launch = new Intent(this, target);
        if (source != null) {
            launch.putExtras(source);
            launch.setData(source.getData());
            launch.setAction(source.getAction());
        }
        startActivity(launch);
        finish();
    }

    static boolean isAutomotiveSurface(Context context) {
        if (context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
            return true;
        }
        UiModeManager uiModeManager = context.getSystemService(UiModeManager.class);
        if (uiModeManager != null
            && uiModeManager.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_CAR) {
            return true;
        }
        // DiLink head units on BYD/Fangchengbao vehicles do not always advertise the AAOS
        // automotive feature or report UI_MODE_TYPE_CAR. Route those units to the car surface.
        String identity = (
            Build.MANUFACTURER + " "
                + Build.BRAND + " "
                + Build.PRODUCT + " "
                + Build.DEVICE + " "
                + Build.MODEL
        ).toLowerCase(Locale.ROOT);
        return identity.contains("byd")
            || identity.contains("fangchengbao")
            || identity.contains("方程豹");
    }
}
