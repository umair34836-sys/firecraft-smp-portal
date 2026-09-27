package com.firecraft.notifier;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

public class FireCraftNotifier extends JavaPlugin implements Listener {

    private final CopyOnWriteArrayList<String> cachedTitles = new CopyOnWriteArrayList<>();
    private final Random random = new Random();
    private final MiniMessage mm = MiniMessage.miniMessage();
    private HttpClient httpClient;

    private String projectId;
    private String websiteUrl;
    private long reminderIntervalMinutes;
    private boolean showJoinTitle;

    // Tracks IGNs already whitelisted so we never process them twice
    private final Set<String> processedIgns = new HashSet<>();
    private File processedIgnsFile;

    private static final String[] DISPLAY_TYPES = {"CHAT", "ACTIONBAR", "TITLE"};

    @Override
    public void onEnable() {
        saveDefaultConfig();

        projectId               = getConfig().getString("firebase-project-id", "firecraft-smp-portal");
        websiteUrl              = getConfig().getString("website-url", "https://firecraft-smp-portal.web.app");
        reminderIntervalMinutes = getConfig().getLong("reminder-interval-minutes", 10);
        showJoinTitle           = getConfig().getBoolean("show-join-title", true);

        httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();

        loadProcessedIgns();

        getServer().getPluginManager().registerEvents(this, this);

        // Fetch announcements once on startup, then every 5 minutes (async)
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::fetchAnnouncements, 40L, 20L * 60 * 5);

        // Send random reminder at configured interval (async trigger, sync send)
        long intervalTicks = reminderIntervalMinutes * 60 * 20;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::triggerReminder, intervalTicks, intervalTicks);

        // Poll approvedPlayers every 30 seconds for auto-whitelist
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::pollApprovedPlayers, 200L, 20L * 30);

        getLogger().info("[FireCraftNotifier] Enabled — reminders every " + reminderIntervalMinutes + " min.");
    }

    @Override
    public void onDisable() {
        getLogger().info("[FireCraftNotifier] Disabled.");
    }

    // ─── Announcement fetch ───────────────────────────────────────────────────

    private void fetchAnnouncements() {
        try {
            String url = "https://firestore.googleapis.com/v1/projects/" + projectId
                    + "/databases/(default)/documents/announcements?pageSize=20";

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (res.statusCode() == 200) {
                parseAnnouncements(res.body());
            } else {
                getLogger().warning("[FireCraftNotifier] Firestore returned HTTP " + res.statusCode());
            }
        } catch (Exception e) {
            getLogger().warning("[FireCraftNotifier] Could not fetch announcements: " + e.getMessage());
        }
    }

    private void parseAnnouncements(String json) {
        try {
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            if (!root.has("documents")) {
                cachedTitles.clear();
                return;
            }

            JsonArray docs = root.getAsJsonArray("documents");
            List<String> titles = new ArrayList<>();
            long now = System.currentTimeMillis();

            for (JsonElement el : docs) {
                JsonObject fields = el.getAsJsonObject().getAsJsonObject("fields");
                if (fields == null) continue;

                if (fields.has("enabled")) {
                    JsonObject enabledObj = fields.getAsJsonObject("enabled");
                    if (enabledObj.has("booleanValue") && !enabledObj.get("booleanValue").getAsBoolean()) continue;
                }

                if (fields.has("endAt")) {
                    try {
                        String endAt = fields.getAsJsonObject("endAt").get("stringValue").getAsString();
                        if (!endAt.isEmpty() && java.time.Instant.parse(endAt).toEpochMilli() < now) continue;
                    } catch (Exception ignored) {}
                }

                if (!fields.has("title")) continue;
                String title = fields.getAsJsonObject("title").get("stringValue").getAsString().trim();
                if (!title.isEmpty()) titles.add(title);
            }

            cachedTitles.clear();
            cachedTitles.addAll(titles);
            getLogger().info("[FireCraftNotifier] Cached " + titles.size() + " active announcement(s).");

        } catch (Exception e) {
            getLogger().warning("[FireCraftNotifier] Parse error: " + e.getMessage());
        }
    }

    // ─── Auto-whitelist via approvedPlayers collection ────────────────────────

    private void loadProcessedIgns() {
        processedIgnsFile = new File(getDataFolder(), "whitelisted.txt");
        if (!processedIgnsFile.exists()) return;
        try {
            Files.readAllLines(processedIgnsFile.toPath()).stream()
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(processedIgns::add);
        } catch (IOException e) {
            getLogger().warning("[FireCraftNotifier] Could not read whitelisted.txt: " + e.getMessage());
        }
    }

    private void saveProcessedIgn(String ign) {
        try {
            if (!getDataFolder().exists()) getDataFolder().mkdirs();
            Files.writeString(processedIgnsFile.toPath(), ign + System.lineSeparator(),
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            getLogger().warning("[FireCraftNotifier] Could not write whitelisted.txt: " + e.getMessage());
        }
    }

    private void pollApprovedPlayers() {
        try {
            String url = "https://firestore.googleapis.com/v1/projects/" + projectId
                    + "/databases/(default)/documents/approvedPlayers?pageSize=100";

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (res.statusCode() != 200) return;

            JsonObject root = JsonParser.parseString(res.body()).getAsJsonObject();
            if (!root.has("documents")) return;

            JsonArray docs = root.getAsJsonArray("documents");
            List<String> toWhitelist = new ArrayList<>();

            for (JsonElement el : docs) {
                JsonObject fields = el.getAsJsonObject().getAsJsonObject("fields");
                if (fields == null || !fields.has("ign")) continue;

                String ign = fields.getAsJsonObject("ign").get("stringValue").getAsString().trim();
                if (ign.isEmpty()) continue;

                String ignLower = ign.toLowerCase();
                if (!processedIgns.contains(ignLower)) {
                    toWhitelist.add(ign);
                    processedIgns.add(ignLower);
                    saveProcessedIgn(ignLower);
                }
            }

            if (!toWhitelist.isEmpty()) {
                // whitelist commands must run on the main thread
                Bukkit.getScheduler().runTask(this, () -> {
                    for (String ign : toWhitelist) {
                        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "whitelist add " + ign);
                        getLogger().info("[FireCraftNotifier] Auto-whitelisted: " + ign);
                    }
                });
            }

        } catch (Exception e) {
            getLogger().warning("[FireCraftNotifier] approvedPlayers poll error: " + e.getMessage());
        }
    }

    // ─── Reminder logic ───────────────────────────────────────────────────────

    private void triggerReminder() {
        if (Bukkit.getOnlinePlayers().isEmpty()) return;

        String announcementSnippet = "";
        if (!cachedTitles.isEmpty()) {
            announcementSnippet = cachedTitles.get(random.nextInt(cachedTitles.size()));
        }

        String displayType = DISPLAY_TYPES[random.nextInt(DISPLAY_TYPES.length)];
        String finalSnippet = announcementSnippet;

        Bukkit.getScheduler().runTask(this, () -> {
            for (Player player : Bukkit.getOnlinePlayers()) {
                switch (displayType) {
                    case "CHAT"      -> sendChat(player, finalSnippet);
                    case "ACTIONBAR" -> sendActionBar(player, finalSnippet);
                    case "TITLE"     -> sendTitleReminder(player, finalSnippet);
                }
            }
        });
    }

    // ─── Display methods ──────────────────────────────────────────────────────

    private void sendChat(Player p, String snippet) {
        String extra = snippet.isEmpty()
                ? ""
                : " <dark_gray>»</dark_gray> <yellow>" + escapeForMM(snippet) + "</yellow>";

        p.sendMessage(mm.deserialize(
                "<gradient:#ff3b30:#ff8a00><bold>[🔥 FIRECRAFT]</bold></gradient>"
                + extra
                + " <white>— visit</white> <gold><underlined>" + websiteUrl + "</underlined></gold>"
        ));
    }

    private void sendActionBar(Player p, String snippet) {
        String content = snippet.isEmpty()
                ? "<gradient:#ff3b30:#ff8a00>🔥 FireCraft</gradient> <white>| Stay updated:</white> <gold>" + websiteUrl + "</gold>"
                : "<gradient:#ff3b30:#ff8a00>📢 " + escapeForMM(snippet) + "</gradient> <white>|</white> <gold>" + websiteUrl + "</gold>";

        p.sendActionBar(mm.deserialize(content));
    }

    private void sendTitleReminder(Player p, String snippet) {
        Component title = mm.deserialize(
                "<gradient:#ff3b30:#ff8a00><bold>🔥 FireCraft</bold></gradient>"
        );
        Component subtitle = snippet.isEmpty()
                ? mm.deserialize("<white>New updates on the website!</white>")
                : mm.deserialize("<white>" + escapeForMM(snippet) + "</white>");

        p.showTitle(Title.title(title, subtitle,
                Title.Times.times(
                        Duration.ofMillis(400),
                        Duration.ofSeconds(3),
                        Duration.ofMillis(600)
                )
        ));
    }

    // ─── Join event ───────────────────────────────────────────────────────────

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (!showJoinTitle) return;

        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(this, () -> {
            if (!player.isOnline()) return;
            player.showTitle(Title.title(
                    mm.deserialize("<gradient:#ff3b30:#ff8a00><bold>Welcome to FireCraft!</bold></gradient>"),
                    mm.deserialize("<white>Visit <gold><underlined>" + websiteUrl + "</underlined></gold> for news & events</white>"),
                    Title.Times.times(
                            Duration.ofMillis(500),
                            Duration.ofSeconds(4),
                            Duration.ofMillis(500)
                    )
            ));
        }, 60L);
    }

    // ─── Utility ─────────────────────────────────────────────────────────────

    private String escapeForMM(String input) {
        return input.replace("<", "\\<").replace(">", "\\>");
    }
}
