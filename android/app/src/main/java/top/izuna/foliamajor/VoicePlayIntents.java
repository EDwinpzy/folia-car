package top.izuna.foliamajor;

import android.app.SearchManager;
import android.content.Intent;
import android.provider.MediaStore;

/** Standard and app-specific media-search intents accepted from voice assistants and helpers. */
final class VoicePlayIntents {
    static final String ACTION_VOICE_PLAY = "top.izuna.foliamajor.action.VOICE_PLAY";
    static final String EXTRA_QUERY = "query";
    private static final int MAX_QUERY_LENGTH = 80;

    static final class Request {
        final String query;

        Request(String query) {
            this.query = query;
        }
    }

    static Request readRequest(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (ACTION_VOICE_PLAY.equals(action)) {
            return new Request(normalize(intent.getStringExtra(EXTRA_QUERY)));
        }
        if (MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH.equals(action)
            || MediaStore.INTENT_ACTION_MEDIA_SEARCH.equals(action)) {
            String query = intent.getStringExtra(SearchManager.QUERY);
            if (query == null) query = intent.getStringExtra(Intent.EXTRA_TEXT);
            return new Request(normalize(query));
        }
        return null;
    }

    static String normalize(String query) {
        if (query == null) return null;
        String normalized = query.trim();
        if (normalized.isEmpty()) return null;
        return normalized.length() > MAX_QUERY_LENGTH
            ? normalized.substring(0, MAX_QUERY_LENGTH)
            : normalized;
    }

    static void clear(Intent intent) {
        if (intent == null) return;
        intent.removeExtra(EXTRA_QUERY);
        intent.removeExtra(SearchManager.QUERY);
        intent.removeExtra(Intent.EXTRA_TEXT);
    }

    private VoicePlayIntents() {}
}
