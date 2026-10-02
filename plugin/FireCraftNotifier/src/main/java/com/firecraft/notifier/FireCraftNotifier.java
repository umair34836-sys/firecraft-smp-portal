package com.firecraft.notifier;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerLoginEvent;
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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

public class FireCraftNotifier extends JavaPlugin implements Listener, CommandExecutor, TabCompleter {

    private final CopyOnWriteArrayList<String> cachedTitles = new CopyOnWriteArrayList<>();
    private final Random random = new Random();
    private final MiniMessage mm = MiniMessage.miniMessage();
    private HttpClient httpClient;

    private String projectId;
    private String websiteUrl;
    private long reminderIntervalMinutes;
    private long pollIntervalMinutes;
    private boolean showJoinTitle;

    // Tracks when a 429 was last received so we can back off
    private volatile long rateLimitBackoffUntil = 0;

    private final Set<String> processedIgns = new HashSet<>();
    private File processedIgnsFile;

    private static final String[] DISPLAY_TYPES = {"CHAT", "ACTIONBAR", "TITLE"};
    private static final String PERM = "firecraftnotifier.admin";
    private static final String PREFIX = "<gradient:#ff3b30:#ff8a00><bold>[FCN]</bold></gradient> ";

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadConfigValues();

        httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();

        loadProcessedIgns();

        getServer().getPluginManager().registerEvents(this, this);

        var cmd = getCommand("fcn");
        if (cmd != null) {
            cmd.setExecutor(this);
            cmd.setTabCompleter(this);
        }

        // Stagger startup: announcements after 30 s, poll after 90 s, reminders after interval
        // This avoids hammering Firestore on every server restart and hitting 429 rate limits.
        long announceTicks  = 20L * 30;
        long announcePeriod = 20L * 60 * 10;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::fetchAnnouncements, announceTicks, announcePeriod);

        long intervalTicks = reminderIntervalMinutes * 60 * 20;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::triggerReminder, intervalTicks, intervalTicks);

        long pollTicks = 20L * 90;
        long pollPeriod = pollIntervalMinutes * 60 * 20;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::pollApprovedPlayers, pollTicks, pollPeriod);

        getLogger().info("[FireCraftNotifier] Enabled — reminders every " + reminderIntervalMinutes + " min.");
    }

    @Override
    public void onDisable() {
        getLogger().info("[FireCraftNotifier] Disabled.");
    }

    private void loadConfigValues() {
        projectId               = getConfig().getString("firebase-project-id", "firecraft-smp-portal");
        websiteUrl              = getConfig().getString("website-url", "https://firecraft-smp-portal.web.app");
        reminderIntervalMinutes = getConfig().getLong("reminder-interval-minutes", 10);
        pollIntervalMinutes     = getConfig().getLong("poll-interval-minutes", 5);
        showJoinTitle           = getConfig().getBoolean("show-join-title", true);
    }

    // ─── Admin command ────────────────────────────────────────────────────────

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission(PERM)) {
            sender.sendMessage(mm.deserialize(PREFIX + "<red>You don't have permission to use this command."));
            return true;
        }

        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }

        switch (args[0].toLowerCase()) {

            case "help" -> sendHelp(sender);

            case "info" -> {
                sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Plugin Info:"));
                sender.sendMessage(mm.deserialize("<gray>  Project ID: <white>" + projectId));
                sender.sendMessage(mm.deserialize("<gray>  Website URL: <white>" + websiteUrl));
                sender.sendMessage(mm.deserialize("<gray>  Reminder Interval: <white>" + reminderIntervalMinutes + " min"));
                sender.sendMessage(mm.deserialize("<gray>  Show Join Title: <white>" + showJoinTitle));
                sender.sendMessage(mm.deserialize("<gray>  Cached Announcements: <white>" + cachedTitles.size()));
                sender.sendMessage(mm.deserialize("<gray>  Whitelisted IGNs Tracked: <white>" + processedIgns.size()));
                sender.sendMessage(mm.deserialize("<gray>  Online Players: <white>" + Bukkit.getOnlinePlayers().size()));
            }

            case "reload" -> {
                reloadConfig();
                loadConfigValues();
                sender.sendMessage(mm.deserialize(PREFIX + "<green>Config reloaded."));
                getLogger().info("[FireCraftNotifier] Config reloaded by " + sender.getName());
            }

            case "fetch" -> {
                sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Fetching announcements..."));
                Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                    fetchAnnouncements();
                    sender.sendMessage(mm.deserialize(PREFIX + "<green>Done. Cached <white>" + cachedTitles.size() + "<green> announcement(s)."));
                });
            }

            case "poll" -> {
                sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Polling approvedPlayers..."));
                Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                    pollApprovedPlayers();
                    sender.sendMessage(mm.deserialize(PREFIX + "<green>Poll complete."));
                });
            }

            case "list" -> {
                if (cachedTitles.isEmpty()) {
                    sender.sendMessage(mm.deserialize(PREFIX + "<gray>No cached announcements. Use <white>/fcn fetch</white> to load them."));
                } else {
                    sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Cached Announcements <gray>(" + cachedTitles.size() + "):"));
                    for (int i = 0; i < cachedTitles.size(); i++) {
                        sender.sendMessage(mm.deserialize("<gray>  " + (i + 1) + ". <white>" + escapeForMM(cachedTitles.get(i))));
                    }
                }
            }

            case "remind" -> {
                if (args.length >= 2) {
                    // remind a specific player
                    Player target = Bukkit.getPlayerExact(args[1]);
                    if (target == null) {
                        sender.sendMessage(mm.deserialize(PREFIX + "<red>Player <white>" + args[1] + "<red> is not online."));
                    } else {
                        String snippet = cachedTitles.isEmpty() ? "" : cachedTitles.get(random.nextInt(cachedTitles.size()));
                        String type = DISPLAY_TYPES[random.nextInt(DISPLAY_TYPES.length)];
                        Bukkit.getScheduler().runTask(this, () -> {
                            switch (type) {
                                case "CHAT"      -> sendChat(target, snippet);
                                case "ACTIONBAR" -> sendActionBar(target, snippet);
                                case "TITLE"     -> sendTitleReminder(target, snippet);
                            }
                        });
                        sender.sendMessage(mm.deserialize(PREFIX + "<green>Reminder sent to <white>" + target.getName() + "<green>."));
                    }
                } else {
                    // remind all online players
                    if (Bukkit.getOnlinePlayers().isEmpty()) {
                        sender.sendMessage(mm.deserialize(PREFIX + "<gray>No players online."));
                    } else {
                        triggerReminder();
                        sender.sendMessage(mm.deserialize(PREFIX + "<green>Reminder sent to all <white>"
                                + Bukkit.getOnlinePlayers().size() + "<green> online player(s)."));
                    }
                }
            }

            case "announce" -> {
                if (args.length < 2) {
                    sender.sendMessage(mm.deserialize(PREFIX + "<red>Usage: /fcn announce <message>"));
                    return true;
                }
                String message = String.join(" ", Arrays.copyOfRange(args, 1, args.length));
                Component formatted = mm.deserialize(
                        "<gradient:#ff3b30:#ff8a00><bold>[🔥 FIRECRAFT]</bold></gradient> <white>" + escapeForMM(message) + "</white>"
                );
                Bukkit.getScheduler().runTask(this, () -> {
                    for (Player p : Bukkit.getOnlinePlayers()) {
                        p.sendMessage(formatted);
                    }
                });
                sender.sendMessage(mm.deserialize(PREFIX + "<green>Announcement sent to <white>"
                        + Bukkit.getOnlinePlayers().size() + "<green> player(s)."));
                getLogger().info("[FireCraftNotifier] Manual announce by " + sender.getName() + ": " + message);
            }

            case "whitelist" -> {
                if (args.length < 2) {
                    sender.sendMessage(mm.deserialize(PREFIX + "<red>Usage: /fcn whitelist <add|reset|list|sync> [ign]"));
                    return true;
                }
                String sub = args[1].toLowerCase();

                switch (sub) {
                    case "sync" -> {
                        // Scan whitelisted.txt and run whitelist add for any IGN not yet on the Minecraft whitelist
                        Set<String> currentWhitelist = getServer().getWhitelistedPlayers()
                                .stream()
                                .map(p -> p.getName().toLowerCase())
                                .collect(Collectors.toSet());

                        List<String> toAdd = new ArrayList<>();
                        int alreadyCount = 0;

                        for (String trackedIgn : processedIgns) {
                            if (currentWhitelist.contains(trackedIgn.toLowerCase())) {
                                alreadyCount++;
                            } else {
                                toAdd.add(trackedIgn);
                            }
                        }

                        if (toAdd.isEmpty()) {
                            sender.sendMessage(mm.deserialize(PREFIX + "<green>All <white>" + alreadyCount
                                    + "<green> tracked players are already whitelisted. Nothing to sync."));
                        } else {
                            final int already = alreadyCount;
                            Bukkit.getScheduler().runTask(this, () -> {
                                for (String ign : toAdd) {
                                    Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "whitelist add " + ign);
                                    getLogger().info("[FireCraftNotifier] Sync whitelist add: " + ign);
                                }
                                sender.sendMessage(mm.deserialize(PREFIX + "<green>Sync complete! Added <white>" + toAdd.size()
                                        + "<green>, already whitelisted: <white>" + already
                                        + "<green>, total tracked: <white>" + processedIgns.size() + "<green>."));
                            });
                        }
                    }
                    case "add" -> {
                        if (args.length < 3 || args[2].trim().isEmpty()) {
                            sender.sendMessage(mm.deserialize(PREFIX + "<red>Usage: /fcn whitelist add <ign>"));
                            return true;
                        }
                        String ign = args[2].trim();
                        Bukkit.getScheduler().runTask(this, () -> {
                            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "whitelist add " + ign);
                            processedIgns.add(ign.toLowerCase());
                            saveProcessedIgn(ign.toLowerCase());
                            sender.sendMessage(mm.deserialize(PREFIX + "<green>Whitelisted <white>" + ign + "<green> and added to tracking."));
                            getLogger().info("[FireCraftNotifier] Manual whitelist add: " + ign + " by " + sender.getName());
                        });
                    }
                    case "reset" -> {
                        if (args.length < 3 || args[2].trim().isEmpty()) {
                            sender.sendMessage(mm.deserialize(PREFIX + "<red>Usage: /fcn whitelist reset <ign>"));
                            return true;
                        }
                        String ign = args[2].trim();
                        boolean removed = processedIgns.remove(ign.toLowerCase());
                        if (removed) {
                            sender.sendMessage(mm.deserialize(PREFIX + "<green>Removed <white>" + ign + "<green> from tracking. Next poll will re-process them."));
                        } else {
                            sender.sendMessage(mm.deserialize(PREFIX + "<yellow>" + ign + " was not in the tracking list."));
                        }
                    }
                    case "list" -> {
                        if (processedIgns.isEmpty()) {
                            sender.sendMessage(mm.deserialize(PREFIX + "<gray>No IGNs in tracking list."));
                        } else {
                            sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Tracked Whitelisted IGNs <gray>(" + processedIgns.size() + "):"));
                            List<String> sorted = new ArrayList<>(processedIgns);
                            Collections.sort(sorted);
                            for (String entry : sorted) {
                                sender.sendMessage(mm.deserialize("<gray>  • <white>" + entry));
                            }
                        }
                    }
                    default -> sender.sendMessage(mm.deserialize(PREFIX + "<red>Unknown sub-command. Use: add, reset, list, sync"));
                }
            }

            default -> {
                sender.sendMessage(mm.deserialize(PREFIX + "<red>Unknown sub-command. Use <white>/fcn help</white> for a list."));
            }
        }

        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (!sender.hasPermission(PERM)) return Collections.emptyList();

        if (args.length == 1) {
            List<String> subs = Arrays.asList("help", "info", "reload", "fetch", "poll", "list", "remind", "announce", "whitelist");
            return subs.stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .collect(Collectors.toList());
        }

        if (args.length == 2) {
            switch (args[0].toLowerCase()) {
                case "remind" -> {
                    return Bukkit.getOnlinePlayers().stream()
                            .map(Player::getName)
                            .filter(n -> n.toLowerCase().startsWith(args[1].toLowerCase()))
                            .collect(Collectors.toList());
                }
                case "whitelist" -> {
                    return Arrays.asList("add", "reset", "list", "sync").stream()
                            .filter(s -> s.startsWith(args[1].toLowerCase()))
                            .collect(Collectors.toList());
                }
            }
        }

        if (args.length == 3 && args[0].equalsIgnoreCase("whitelist")) {
            String sub = args[1].toLowerCase();
            if (sub.equals("add") || sub.equals("reset")) {
                return Bukkit.getOnlinePlayers().stream()
                        .map(Player::getName)
                        .filter(n -> n.toLowerCase().startsWith(args[2].toLowerCase()))
                        .collect(Collectors.toList());
            }
        }

        return Collections.emptyList();
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Admin Commands:"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn info</white> — Plugin status & config values"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn reload</white> — Reload config.yml"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn fetch</white> — Re-fetch announcements from Firestore"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn poll</white> — Poll approvedPlayers & auto-whitelist"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn list</white> — List cached announcements"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn remind [player]</white> — Send reminder to all or one player"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn announce <message></white> — Broadcast a custom message"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist add <ign></white> — Manually whitelist a player"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist reset <ign></white> — Remove IGN from tracking"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist list</white> — List all tracked whitelisted IGNs"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist sync</white> — Whitelist all tracked IGNs missing from server whitelist"));
    }

    // ─── Announcement fetch ───────────────────────────────────────────────────

    private void fetchAnnouncements() {
        if (System.currentTimeMillis() < rateLimitBackoffUntil) return;
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
            } else if (res.statusCode() == 429) {
                rateLimitBackoffUntil = System.currentTimeMillis() + 5 * 60 * 1000L;
                getLogger().warning("[FireCraftNotifier] Firestore rate-limited (429). Backing off for 5 minutes.");
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
        if (System.currentTimeMillis() < rateLimitBackoffUntil) return;
        try {
            // Query applications collection where status == "approved" via Firestore runQuery
            String url = "https://firestore.googleapis.com/v1/projects/" + projectId
                    + "/databases/(default)/documents:runQuery";

            String body = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"applications\"}],"
                    + "\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"status\"},"
                    + "\"op\":\"EQUAL\",\"value\":{\"stringValue\":\"approved\"}}}}}";

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (res.statusCode() == 429) {
                rateLimitBackoffUntil = System.currentTimeMillis() + 5 * 60 * 1000L;
                getLogger().warning("[FireCraftNotifier] Firestore rate-limited (429). Backing off for 5 minutes.");
                return;
            }
            if (res.statusCode() != 200) {
                getLogger().warning("[FireCraftNotifier] approvedPlayers poll HTTP " + res.statusCode());
                return;
            }

            // runQuery returns a JSON array; each element is a result row or an end-of-query marker
            JsonArray results = JsonParser.parseString(res.body()).getAsJsonArray();
            List<String> toWhitelist = new ArrayList<>();

            for (JsonElement el : results) {
                JsonObject row = el.getAsJsonObject();
                if (!row.has("document")) continue; // end-of-query marker has no "document" key

                JsonObject fields = row.getAsJsonObject("document").getAsJsonObject("fields");
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

    // ─── Whitelist kick message ───────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH)
    public void onLogin(PlayerLoginEvent event) {
        if (event.getResult() != PlayerLoginEvent.Result.KICK_WHITELIST) return;

        // Only replace the kick message when the Minecraft whitelist is the actual cause.
        // Other plugins (LifeStealZ, Maintenance, etc.) also use KICK_WHITELIST for their
        // own purposes — if the player IS whitelisted, another plugin is kicking them and
        // we must not overwrite their message with a misleading "apply for whitelist" prompt.
        if (getServer().hasWhitelist()) {
            UUID uid = event.getPlayer().getUniqueId();
            boolean onWhitelist = getServer().getWhitelistedPlayers()
                    .stream().anyMatch(p -> uid.equals(p.getUniqueId()));
            if (onWhitelist) return;
        }

        String applyUrl = getConfig().getString("apply-url", "https://www.firecraft.fun");
        String discord  = getConfig().getString("discord-url", "https://discord.firecraft.fun");

        String msg =
            "\n" +
            "<gold><bold>⚠ You are not whitelisted on FireCraft SMP!</bold></gold>" +
            "\n\n" +
            "<white>To join, you must first apply for whitelist.</white>" +
            "\n\n" +
            "<yellow>📋 How to apply:</yellow>" +
            "\n<gray>  1. Register on the website: <gold><underlined>" + applyUrl + "</underlined></gold></gray>" +
            "\n<gray>  2. Click <white>Apply</white> in the menu & fill the form</gray>" +
            "\n<gray>  3. Wait for admin approval <dark_gray>(usually within 24 hours)</dark_gray></gray>" +
            "\n<gray>  4. You will be whitelisted automatically!</gray>" +
            "\n\n" +
            "<aqua>🔗 Apply now: <underlined>" + applyUrl + "</underlined></aqua>" +
            "\n" +
            "<dark_gray>Need help? Discord: " + discord + "</dark_gray>" +
            "\n";

        event.disallow(PlayerLoginEvent.Result.KICK_WHITELIST,
                MiniMessage.miniMessage().deserialize(msg));
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
