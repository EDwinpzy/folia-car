package top.izuna.foliamajor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.service.media.MediaBrowserService;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

import org.json.JSONArray;
import org.json.JSONObject;

import top.izuna.foliamajor.coloros.ColorOsLyricBridge;

public class FoliaPlaybackService extends MediaBrowserService {
    private static final String CHANNEL_ID = "folia_playback";
    private static final int NOTIFICATION_ID = 31009;
    private static final String BROWSER_ROOT_ID = "__ROOT__";
    private static final String BROWSER_CURRENT_ID = "current";
    private static final String BROWSER_QUEUE_ID = "queue";
    private static final String BROWSER_QUEUE_ITEM_PREFIX = "queue:";
    private static final int MAX_BROWSER_QUEUE_ITEMS = 300;
    public static final String ACTION_REFRESH_METADATA = "top.izuna.foliamajor.action.REFRESH_METADATA";
    private MediaSession mediaSession;
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient artworkClient = new OkHttpClient();
    private final Map<String, Bitmap> artworkCache = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile String currentArtworkUrl = "";
    private volatile String appliedArtworkUrl = "";
    private volatile Bitmap appliedArtworkBitmap = null;
    private volatile String lastRequestedCoverUrl = "";
    private volatile String cachedTitle = "";
    private volatile String cachedArtist = "";
    private volatile String cachedAlbum = "";
    private volatile String cachedCoverUrl = "";
    private volatile String cachedSongKey = "";
    private volatile String cachedLaunchTarget = "auto";
    private volatile long cachedDurationMs = 0L;
    private volatile long cachedPositionMs = 0L;
    private volatile boolean cachedPlaying = false;
    private volatile List<QueuedTrack> cachedQueue = Collections.emptyList();
    private static volatile boolean running = false;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private static volatile String powerDiagnostic = "inactive";
    private static final long SERVICE_HEARTBEAT_INTERVAL_MS = 10_000L;
    /**
     * `service-start` 的重复记录间隔。前台服务每次收到播放状态推送都会走一遍 `onStartCommand`，
     * 崩溃历史只留 20 条，不节流的话这些重复记录会把真正的退出原因挤掉。
     */
    private static final long SERVICE_START_RECORD_INTERVAL_MS = 5_000L;
    private volatile boolean lastPlaying = false;
    private volatile long lastServiceStartRecordAt = 0L;
    private volatile boolean lastServiceStartPlaying = false;
    private volatile String lastServiceStartSongKey = "";
    private final Runnable serviceHeartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            recordServiceHeartbeat();
            mainHandler.postDelayed(this, SERVICE_HEARTBEAT_INTERVAL_MS);
        }
    };

    private static final class QueuedTrack {
        final int sourceIndex;
        final String title;
        final String artist;
        final String album;
        final String coverUrl;
        final String songKey;
        final long durationMs;

        QueuedTrack(
            int sourceIndex,
            String title,
            String artist,
            String album,
            String coverUrl,
            String songKey,
            long durationMs
        ) {
            this.sourceIndex = sourceIndex;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.coverUrl = coverUrl;
            this.songKey = songKey;
            this.durationMs = durationMs;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createNotificationChannel();
        mediaSession = new MediaSession(this, "FoliaPlayback");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("previous"); }
            @Override public void onStop() { emit("stop"); }
            @Override public void onSeekTo(long position) { emitSeek(position); }
            @Override public void onSkipToQueueItem(long id) { handleQueueSelection((int) id); }
            @Override public void onPlayFromSearch(String query, Bundle extras) {
                handlePlayFromSearch(query);
            }
            @Override public void onPlayFromMediaId(String mediaId, Bundle extras) {
                handlePlayFromMediaId(mediaId);
            }
        });
        mediaSession.setFlags(
            MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setSessionActivity(buildSessionActivityIntent());
        setSessionToken(mediaSession.getSessionToken());
        mediaSession.setActive(true);
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Folia:Playback");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wifiManager != null) {
            int lockMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifiManager.createWifiLock(lockMode, "Folia:Playback");
            wifiLock.setReferenceCounted(false);
        }
        recordServiceLifecycle("service-create", "Foreground playback service created");
        mainHandler.post(serviceHeartbeatRunnable);
    }

    /** ColorOS lyric bridge uses this to decide whether a metadata refresh intent is worth sending. */
    public static boolean isRunning() {
        return running;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "clear".equals(intent.getAction())) {
            recordServiceLifecycle("service-stop-command", "Stop command received");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_REFRESH_METADATA.equals(intent.getAction())) {
            applyCachedMetadata();
            return START_STICKY;
        }

        cachedTitle = intent.getStringExtra("title");
        cachedArtist = intent.getStringExtra("artist");
        cachedAlbum = intent.getStringExtra("album");
        cachedCoverUrl = intent.getStringExtra("coverUrl");
        cachedSongKey = intent.getStringExtra("songKey");
        String launchTarget = intent.getStringExtra("launchTarget");
        if (launchTarget != null && !launchTarget.isEmpty()) cachedLaunchTarget = launchTarget;
        if (mediaSession != null) mediaSession.setSessionActivity(buildSessionActivityIntent());
        String queueJson = intent.getStringExtra("queue");
        if (queueJson != null) updateBrowseQueue(queueJson);
        cachedPlaying = intent.getBooleanExtra("playing", false);
        cachedPositionMs = intent.getLongExtra("position", 0);
        cachedDurationMs = intent.getLongExtra("duration", 0);
        if (cachedTitle == null) cachedTitle = "";
        if (cachedArtist == null) cachedArtist = "";
        if (cachedAlbum == null) cachedAlbum = "";
        if (cachedCoverUrl == null) cachedCoverUrl = "";
        if (cachedSongKey == null) cachedSongKey = "";
        lastPlaying = cachedPlaying;
        recordServiceStartIfNoteworthy();
        currentArtworkUrl = cachedCoverUrl.trim();
        Bitmap retainedArtwork = appliedArtworkBitmap;
        if (currentArtworkUrl.isEmpty()) {
            appliedArtworkUrl = "";
            appliedArtworkBitmap = null;
            retainedArtwork = null;
        }
        if (!currentArtworkUrl.equals(lastRequestedCoverUrl)) {
            lastRequestedCoverUrl = currentArtworkUrl;
            FoliaNativePlugin.notePlaybackArtwork(
                currentArtworkUrl,
                currentArtworkUrl.isEmpty() ? "none" : "queued",
                ""
            );
        }

        // The notification goes on right below via startForeground; building it twice here was
        // one of the two writes per start command (the other is the lifecycle record).
        applyCachedMetadata(false);
        FoliaNativePlugin.notePlaybackArtworkApplied(retainedArtwork != null);

        Notification notification = buildNotification(cachedTitle, cachedArtist, cachedPlaying, retainedArtwork);
        startForeground(NOTIFICATION_ID, notification);
        updatePlaybackLocks(cachedPlaying);
        String requestedCover = currentArtworkUrl;
        loadArtwork(requestedCover, bitmap -> {
            if (!requestedCover.equals(currentArtworkUrl)) return;
            mediaSession.setMetadata(buildMetadata(cachedTitle, cachedArtist, cachedAlbum, cachedDurationMs, bitmap, cachedCoverUrl, cachedSongKey));
            FoliaNativePlugin.notePlaybackArtworkApplied(bitmap != null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, bitmap));
            }
        });
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "service",
            "task-removed",
            "Task removed from recents",
            "FoliaPlaybackService.onTaskRemoved"
        );
        super.onTaskRemoved(rootIntent);
        // The audio owner is the Activity's WebView. Once its task is gone there is nothing left
        // to decode, so leaving the foreground service alive would only leave a ghost notification.
        stopSelf();
    }

    private MediaMetadata buildMetadata(
        String title,
        String artist,
        String album,
        long duration,
        Bitmap artwork,
        String coverUrl,
        String songKey
    ) {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title == null ? "Folia" : title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist == null ? "" : artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, album == null ? "" : album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        if (artwork == null && coverUrl != null && !coverUrl.isEmpty()) {
            metadata.putString(MediaMetadata.METADATA_KEY_ART_URI, coverUrl);
            metadata.putString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI, coverUrl);
        }
        if (artwork != null) {
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }
        ColorOsLyricBridge.attach(metadata, songKey);
        return metadata.build();
    }

    private void applyCachedMetadata() {
        applyCachedMetadata(true);
    }

    /** `notify=false`：紧接着就要 `startForeground` 的路径，不再重复构建一次通知。 */
    private void applyCachedMetadata(boolean notify) {
        if (mediaSession == null) return;
        Bitmap retained = appliedArtworkBitmap;
        mediaSession.setMetadata(buildMetadata(
            cachedTitle,
            cachedArtist,
            cachedAlbum,
            cachedDurationMs,
            retained,
            cachedCoverUrl,
            cachedSongKey
        ));
        mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
        if (notify) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null && running) {
                manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, retained));
            }
        }
    }

    private PlaybackState buildPlaybackState(boolean playing, long position, String songKey) {
        PlaybackState.Builder builder = new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_PLAY_FROM_MEDIA_ID
                    | PlaybackState.ACTION_PLAY_FROM_SEARCH
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SKIP_TO_QUEUE_ITEM
                    | PlaybackState.ACTION_SEEK_TO
                    | PlaybackState.ACTION_STOP
            )
            .setState(
                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                position,
                playing ? 1f : 0f,
                SystemClock.elapsedRealtime()
            );
        if (ColorOsLyricBridge.hasTranslationFor(songKey)) {
            builder.addCustomAction(new PlaybackState.CustomAction.Builder(
                ColorOsLyricBridge.ACTION_TOGGLE_TRANSLATION,
                "翻译",
                translationActionIcon()
            ).build());
        }
        return builder.build();
    }

    private int translationActionIcon() {
        int icon = getApplicationInfo().icon;
        return icon != 0 ? icon : android.R.drawable.ic_menu_info_details;
    }

    private Notification buildNotification(
        String title,
        String artist,
        boolean playing,
        Bitmap artwork
    ) {
        Class<?> activityClass = activityClassForTarget(cachedLaunchTarget);
        Intent activityIntent = new Intent(this, activityClass)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        int playPauseIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        PendingIntent playPauseIntent = PendingIntent.getBroadcast(
            this,
            1,
            new Intent(this, PlaybackActionReceiver.class).setAction(playing ? "pause" : "play"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent previousIntent = PendingIntent.getBroadcast(
            this,
            2,
            new Intent(this, PlaybackActionReceiver.class).setAction("previous"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent nextIntent = PendingIntent.getBroadcast(
            this,
            3,
            new Intent(this, PlaybackActionReceiver.class).setAction("next"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title == null ? "Folia" : title)
            .setContentText(artist == null ? "" : artist)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", previousIntent)
            .addAction(playPauseIcon, playing ? "Pause" : "Play", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "Next", nextIntent)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        if (artwork != null) builder.setLargeIcon(artwork);
        return builder.build();
    }

    private Class<?> activityClassForTarget(String target) {
        if ("car".equals(target)) return CarActivity.class;
        if ("tv".equals(target)) return TvActivity.class;
        if (EntryActivity.isAutomotiveSurface(this)) return CarActivity.class;
        if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)) {
            return TvActivity.class;
        }
        return MainActivity.class;
    }

    private PendingIntent buildSessionActivityIntent() {
        Intent activityIntent = new Intent(this, activityClassForTarget(cachedLaunchTarget))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this,
            4,
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /**
     * The WebView owns audio decoding, but it publishes its queue snapshot through the same
     * foreground-service start command as the current metadata. Keeping that snapshot here lets
     * Android media browser clients enumerate and select queue items without a second queue state.
     */
    private void updateBrowseQueue(String rawQueue) {
        List<QueuedTrack> parsed = new ArrayList<>();
        if (rawQueue != null && !rawQueue.isEmpty()) {
            try {
                JSONArray rows = new JSONArray(rawQueue);
                int limit = Math.min(rows.length(), MAX_BROWSER_QUEUE_ITEMS);
                for (int rowIndex = 0; rowIndex < limit; rowIndex += 1) {
                    JSONObject row = rows.optJSONObject(rowIndex);
                    if (row == null) continue;
                    String title = row.optString("title", "").trim();
                    if (title.isEmpty()) continue;
                    parsed.add(new QueuedTrack(
                        row.optInt("index", rowIndex),
                        title,
                        row.optString("artist", ""),
                        row.optString("album", ""),
                        row.optString("coverUrl", ""),
                        row.optString("songKey", ""),
                        Math.max(0L, row.optLong("duration", 0L))
                    ));
                }
            } catch (Exception error) {
                recordServiceLifecycle(
                    "browser-queue-error",
                    error.getClass().getSimpleName() + ": " + error.getMessage()
                );
            }
        }
        cachedQueue = Collections.unmodifiableList(parsed);
        if (mediaSession != null) mediaSession.setQueue(buildSessionQueue());
        notifyChildrenChanged(BROWSER_ROOT_ID);
        notifyChildrenChanged(BROWSER_QUEUE_ID);
    }

    private List<MediaSession.QueueItem> buildSessionQueue() {
        List<MediaSession.QueueItem> items = new ArrayList<>();
        for (QueuedTrack track : cachedQueue) {
            items.add(new MediaSession.QueueItem(
                buildTrackDescription(track, BROWSER_QUEUE_ITEM_PREFIX + track.sourceIndex),
                track.sourceIndex
            ));
        }
        return items;
    }

    private MediaDescription buildTrackDescription(QueuedTrack track, String mediaId) {
        Bundle extras = new Bundle();
        extras.putString(MediaMetadata.METADATA_KEY_TITLE, track.title);
        extras.putString(MediaMetadata.METADATA_KEY_ARTIST, track.artist);
        extras.putString(MediaMetadata.METADATA_KEY_ALBUM, track.album);
        extras.putLong(MediaMetadata.METADATA_KEY_DURATION, track.durationMs);
        MediaDescription.Builder builder = new MediaDescription.Builder()
            .setMediaId(mediaId)
            .setTitle(track.title)
            .setSubtitle(track.artist)
            .setExtras(extras);
        if (track.coverUrl.startsWith("http://") || track.coverUrl.startsWith("https://")) {
            builder.setIconUri(Uri.parse(track.coverUrl));
        }
        return builder.build();
    }

    private MediaDescription buildCurrentDescription() {
        Bundle extras = new Bundle();
        extras.putString(MediaMetadata.METADATA_KEY_TITLE, cachedTitle);
        extras.putString(MediaMetadata.METADATA_KEY_ARTIST, cachedArtist);
        extras.putString(MediaMetadata.METADATA_KEY_ALBUM, cachedAlbum);
        extras.putLong(MediaMetadata.METADATA_KEY_DURATION, cachedDurationMs);
        MediaDescription.Builder builder = new MediaDescription.Builder()
            .setMediaId(BROWSER_CURRENT_ID)
            .setTitle(cachedTitle)
            .setSubtitle(cachedArtist)
            .setExtras(extras);
        if (cachedCoverUrl.startsWith("http://") || cachedCoverUrl.startsWith("https://")) {
            builder.setIconUri(Uri.parse(cachedCoverUrl));
        }
        return builder.build();
    }

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        return new BrowserRoot(BROWSER_ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(
        String parentId,
        Result<List<MediaBrowser.MediaItem>> result
    ) {
        if (BROWSER_ROOT_ID.equals(parentId)) {
            List<MediaBrowser.MediaItem> children = new ArrayList<>();
            if (!cachedTitle.trim().isEmpty()) {
                children.add(new MediaBrowser.MediaItem(
                    buildCurrentDescription(),
                    MediaBrowser.MediaItem.FLAG_PLAYABLE
                ));
            }
            Bundle queueExtras = new Bundle();
            queueExtras.putLong(
                MediaMetadata.METADATA_KEY_DURATION,
                cachedQueue.isEmpty() ? 0L : cachedDurationMs
            );
            children.add(new MediaBrowser.MediaItem(
                new MediaDescription.Builder()
                    .setMediaId(BROWSER_QUEUE_ID)
                    .setTitle("Play queue")
                    .setSubtitle(cachedQueue.size() + " tracks")
                    .setExtras(queueExtras)
                    .build(),
                MediaBrowser.MediaItem.FLAG_BROWSABLE
            ));
            result.sendResult(children);
            return;
        }

        if (BROWSER_QUEUE_ID.equals(parentId)) {
            List<MediaBrowser.MediaItem> children = new ArrayList<>();
            for (QueuedTrack track : cachedQueue) {
                children.add(new MediaBrowser.MediaItem(
                    buildTrackDescription(track, BROWSER_QUEUE_ITEM_PREFIX + track.sourceIndex),
                    MediaBrowser.MediaItem.FLAG_PLAYABLE
                ));
            }
            result.sendResult(children);
            return;
        }

        result.sendResult(Collections.emptyList());
    }

    private void handlePlayFromSearch(String query) {
        String normalized = VoicePlayIntents.normalize(query);
        if (normalized == null) {
            FoliaNativePlugin.offerVoiceResumeRequest();
        } else {
            FoliaNativePlugin.offerVoicePlayRequest(normalized);
        }
        openTargetActivity(cachedLaunchTarget);
    }

    private void handlePlayFromMediaId(String mediaId) {
        if (mediaId == null) return;
        if (BROWSER_CURRENT_ID.equals(mediaId)) {
            emit("play");
            openTargetActivity(cachedLaunchTarget);
            return;
        }
        if (mediaId.startsWith(BROWSER_QUEUE_ITEM_PREFIX)) {
            try {
                int sourceIndex = Integer.parseInt(
                    mediaId.substring(BROWSER_QUEUE_ITEM_PREFIX.length())
                );
                handleQueueSelection(sourceIndex);
            } catch (NumberFormatException ignored) {
                // Media IDs are app-owned; ignore malformed IDs from stale browser sessions.
            }
            return;
        }
        if (BROWSER_QUEUE_ID.equals(mediaId)) openTargetActivity(cachedLaunchTarget);
    }

    private void handleQueueSelection(int sourceIndex) {
        if (sourceIndex < 0) return;
        FoliaNativePlugin.offerQueuePlayRequest(sourceIndex);
        openTargetActivity(cachedLaunchTarget);
    }

    private void emitSeek(long position) {
        if (position < 0L) return;
        FoliaNativePlugin.emitMediaAction("seek", position);
    }

    private void openTargetActivity(String target) {
        Class<?> activityClass = activityClassForTarget(target);
        mainHandler.post(() -> {
            try {
                startActivity(new Intent(this, activityClass)
                    .addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    ));
            } catch (Exception error) {
                recordServiceLifecycle(
                    "browser-open-error",
                    error.getClass().getSimpleName() + ": " + error.getMessage()
                );
            }
        });
    }

    private void loadArtwork(String value, ArtworkCallback callback) {
        if (value == null || value.isEmpty()) return;
        if (value.equals(appliedArtworkUrl)) return;
        Bitmap cached = artworkCache.get(value);
        if (cached != null) {
            mainHandler.post(() -> {
                if (value.equals(currentArtworkUrl)) {
                    appliedArtworkUrl = value;
                    appliedArtworkBitmap = cached;
                    FoliaNativePlugin.notePlaybackArtwork(
                        value,
                        "loaded",
                        "cached " + cached.getWidth() + "x" + cached.getHeight()
                    );
                }
                callback.onLoaded(cached);
            });
            return;
        }
        if (!(value.startsWith("http://") || value.startsWith("https://"))) {
            FoliaNativePlugin.notePlaybackArtwork(value, "error", "unsupported-cover-url");
            return;
        }
        artworkExecutor.execute(() -> {
            Bitmap bitmap = null;
            String failure = "";
            try (Response response = artworkClient.newCall(new Request.Builder()
                .url(value)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
                .build()).execute()) {
                ResponseBody body = response.body();
                if (response.isSuccessful() && body != null) {
                    try (InputStream input = body.byteStream()) {
                        bitmap = BitmapFactory.decodeStream(input);
                    }
                    if (bitmap == null) failure = "decode-failed";
                } else {
                    failure = "http-" + response.code();
                }
            } catch (Exception error) {
                failure = error.getClass().getSimpleName();
            }
            if (bitmap != null) artworkCache.put(value, bitmap);
            Bitmap resolved = bitmap;
            if (resolved != null) {
                mainHandler.post(() -> {
                    if (value.equals(currentArtworkUrl)) {
                        appliedArtworkUrl = value;
                        appliedArtworkBitmap = resolved;
                        FoliaNativePlugin.notePlaybackArtwork(
                            value,
                            "loaded",
                            resolved.getWidth() + "x" + resolved.getHeight()
                        );
                    }
                    callback.onLoaded(resolved);
                });
            } else {
                FoliaNativePlugin.notePlaybackArtwork(value, "error", failure.isEmpty() ? "unknown" : failure);
            }
        });
    }

    private interface ArtworkCallback {
        void onLoaded(Bitmap bitmap);
    }

    /**
     * Keeps the remote-audio proxy alive in the background.
     *
     * A foreground service keeps the process visible, but it does not stop Doze from throttling
     * the CPU or the Wi-Fi radio. Playback pulls the stream through LocalAudioServer, so losing
     * either one shows up as intermittent audio while the screen is off.
     */
    private void updatePlaybackLocks(boolean playing) {
        try {
            if (playing) {
                if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=none";
        } catch (Exception error) {
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=" + error.getClass().getSimpleName();
        }
    }

    static String getPowerDiagnostic() {
        return powerDiagnostic;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Folia playback",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void emit(String action) {
        FoliaNativePlugin.emitMediaAction(action);
    }

    private void recordServiceLifecycle(String type, String message) {
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "service-lifecycle",
            "service",
            type,
            message,
            "FoliaPlaybackService"
        );
    }

    /**
     * 只在播放状态或曲目真的变了、或距上次记录已满 {@link #SERVICE_START_RECORD_INTERVAL_MS}
     * 时记一条 `service-start`。推送本身仍然每次都处理，只是不再每次都写诊断。
     */
    private void recordServiceStartIfNoteworthy() {
        long now = SystemClock.elapsedRealtime();
        boolean stateChanged = cachedPlaying != lastServiceStartPlaying
            || !cachedSongKey.equals(lastServiceStartSongKey);
        if (!stateChanged && now - lastServiceStartRecordAt < SERVICE_START_RECORD_INTERVAL_MS) {
            return;
        }
        lastServiceStartRecordAt = now;
        lastServiceStartPlaying = cachedPlaying;
        lastServiceStartSongKey = cachedSongKey;
        recordServiceLifecycle("service-start", "playing=" + cachedPlaying);
    }

    private void recordServiceHeartbeat() {
        try {
            JSONObject payload = new JSONObject();
            payload.put("at", System.currentTimeMillis());
            payload.put("playing", lastPlaying);
            payload.put("wakeLock", wakeLock != null && wakeLock.isHeld() ? "held" : "released");
            payload.put("wifiLock", wifiLock != null && wifiLock.isHeld() ? "held" : "released");
            payload.put("foreground", true);
            CrashDiagnostics.recordServiceHeartbeat(getApplicationContext(), payload.toString());
        } catch (Exception ignored) {
            // A missed heartbeat is harmless; the next one is 10 seconds away.
        }
    }

    @Override
    public void onDestroy() {
        recordServiceLifecycle("service-destroy", "Foreground playback service destroyed");
        running = false;
        mainHandler.removeCallbacks(serviceHeartbeatRunnable);
        updatePlaybackLocks(false);
        artworkExecutor.shutdownNow();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

}
