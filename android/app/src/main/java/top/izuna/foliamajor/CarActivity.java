package top.izuna.foliamajor;

import android.media.AudioManager;
import android.os.Bundle;
import android.view.KeyEvent;

/**
 * Automotive entry point. It shares the TV WebView, focus and playback-safe window behavior while
 * loading the car-specific renderer and routing hardware volume keys to media playback.
 */
public class CarActivity extends TvActivity {
    @Override
    protected String getStartPath() {
        return "/car.html";
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }

    /**
     * Some DiLink head units deliver media keys to the foreground Activity instead of the active
     * MediaSession. Route those keys through the same playback bridge and consume both down/up so
     * the focused WebView cannot handle or duplicate the press.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String action = mediaActionFor(event.getKeyCode());
        if (action == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            FoliaNativePlugin.emitMediaAction(action);
        }
        return true;
    }

    private static String mediaActionFor(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                return "toggle";
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return "pause";
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return "next";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "previous";
            case KeyEvent.KEYCODE_MEDIA_STOP:
                return "stop";
            default:
                return null;
        }
    }
}
