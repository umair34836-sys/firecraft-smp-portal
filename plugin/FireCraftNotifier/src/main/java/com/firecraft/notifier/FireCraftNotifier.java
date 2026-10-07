package com.firecraft.notifier;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerLoginEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

public class FireCraftNotifier extends JavaPlugin implements Listener, CommandExecutor, TabCompleter {

    private final CopyOnWriteArrayList<String> cachedTitles = new CopyOnWriteArrayList<>();
    private final Random random = new Random();
    private final MiniMessage mm = MiniMessage.miniMessage();
    private HttpClient httpClient;

    // Session tracking: UUID → join time (ms)
    private final Map<UUID, Long> playerJoinTimes = new ConcurrentHashMap<>();

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

        var reportCmd = getCommand("report");
        if (reportCmd != null) {
            reportCmd.setExecutor(this);
            reportCmd.setTabCompleter(this);
        }

        var voteCmd = getCommand("vote");
        if (voteCmd != null) voteCmd.setExecutor(this);

        // Stagger startup: announcements after 30s, poll after 90s, status after 60s
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

        // Push server status to Firestore every 5 minutes (start after 60s)
        long statusPeriod = 20L * 60 * 5;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::pushServerStatus, 20L * 60, statusPeriod);

        // Vote reminders every 30 minutes (start after 30 min)
        long voteTicks = 20L * 60 * 30;
        Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                this::sendVoteReminder, voteTicks, voteTicks);

        getLogger().info("[FireCraftNotifier] v1.5.0 Enabled — reminders every " + reminderIntervalMinutes + " min.");
    }

    @Override
    public void onDisable() {
        // Push a final "server offline" status
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            pushServerOffline();
        });
        getLogger().info("[FireCraftNotifier] Disabled.");
    }

    private void loadConfigValues() {
        projectId               = getConfig().getString("firebase-project-id", "firecraft-smp-portal");
        websiteUrl              = getConfig().getString("website-url", "https://firecraft-smp-portal.web.app");
        reminderIntervalMinutes = getConfig().getLong("reminder-interval-minutes", 10);
        pollIntervalMinutes     = getConfig().getLong("poll-interval-minutes", 5);
        showJoinTitle           = getConfig().getBoolean("show-join-title", true);
    }

    // ─── Admin + Report command ───────────────────────────────────────────────

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {

        // ── /report <message> — player command ───────────────────────────────
        if (command.getName().equalsIgnoreCase("report")) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(mm.deserialize(PREFIX + "<red>Only in-game players can use /report."));
                return true;
            }
            if (args.length == 0) {
                player.sendMessage(mm.deserialize(PREFIX + "<red>Usage: /report <message>  (describe what's wrong)"));
                return true;
            }
            String message = String.join(" ", args);
            Bukkit.getScheduler().runTaskAsynchronously(this, () ->
                    pushPlayerReport(player.getName(), message));
            player.sendMessage(mm.deserialize(
                    "<gradient:#ff3b30:#ff8a00><bold>[FireCraft]</bold></gradient> "
                    + "<green>Your report has been sent to staff. Thank you!</green>"));
            getLogger().info("[FCN] Player report from " + player.getName() + ": " + message);
            return true;
        }

        // ── /vote — player command ────────────────────────────────────────────
        if (command.getName().equalsIgnoreCase("vote")) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(mm.deserialize(PREFIX + "<red>Only in-game players can use /vote."));
                return true;
            }
            openVoteGui(player);
            return true;
        }

        // ── /fcn — admin command ──────────────────────────────────────────────
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

            case "status" -> {
                sender.sendMessage(mm.deserialize(PREFIX + "<yellow>Pushing server status to Firestore..."));
                Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                    pushServerStatus();
                    sender.sendMessage(mm.deserialize(PREFIX + "<green>Status pushed."));
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
        if (command.getName().equalsIgnoreCase("report")) return Collections.emptyList();
        if (!sender.hasPermission(PERM)) return Collections.emptyList();

        if (args.length == 1) {
            List<String> subs = Arrays.asList("help", "info", "reload", "fetch", "poll", "status", "list", "remind", "announce", "whitelist");
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
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn status</white> — Push server status to Firestore now"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn list</white> — List cached announcements"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn remind [player]</white> — Send reminder to all or one player"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn announce <message></white> — Broadcast a custom message"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist add <ign></white> — Manually whitelist a player"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist reset <ign></white> — Remove IGN from tracking"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist list</white> — List all tracked whitelisted IGNs"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/fcn whitelist sync</white> — Whitelist all tracked IGNs missing from server whitelist"));
        sender.sendMessage(mm.deserialize("<gray>  <white>/report <message></white> — (Player) Report an issue to staff"));
    }

    // ─── Server status push ────────────────────────────────────────────────────

    private void pushServerStatus() {
        if (System.currentTimeMillis() < rateLimitBackoffUntil) return;
        try {
            double[] tps = Bukkit.getTPS();
            Runtime rt = Runtime.getRuntime();
            long usedMb  = (rt.totalMemory() - rt.freeMemory()) / 1024 / 1024;
            long maxMb   = rt.maxMemory() / 1024 / 1024;
            int  online  = Bukkit.getOnlinePlayers().size();
            int  maxSlots = Bukkit.getMaxPlayers();

            // Collect online player names
            StringBuilder players = new StringBuilder();
            for (Player p : Bukkit.getOnlinePlayers()) {
                if (players.length() > 0) players.append(",");
                players.append(p.getName());
            }

            String body = "{"
                + "\"fields\":{"
                + "\"tps1m\":{\"doubleValue\":"  + String.format("%.2f", Math.min(tps[0], 20.0)) + "},"
                + "\"tps5m\":{\"doubleValue\":"  + String.format("%.2f", Math.min(tps[1], 20.0)) + "},"
                + "\"tps15m\":{\"doubleValue\":" + String.format("%.2f", Math.min(tps[2], 20.0)) + "},"
                + "\"ramUsedMb\":{\"integerValue\":\"" + usedMb  + "\"},"
                + "\"ramMaxMb\":{\"integerValue\":\""  + maxMb   + "\"},"
                + "\"playersOnline\":{\"integerValue\":\"" + online   + "\"},"
                + "\"maxPlayers\":{\"integerValue\":\""   + maxSlots + "\"},"
                + "\"onlinePlayerNames\":{\"stringValue\":\"" + safeJson(players.toString()) + "\"},"
                + "\"serverVersion\":{\"stringValue\":\"" + safeJson(Bukkit.getVersion()) + "\"},"
                + "\"status\":{\"stringValue\":\"online\"},"
                + "\"updatedAt\":{\"timestampValue\":\"" + Instant.now() + "\"}"
                + "}"
                + "}";

            firestorePatch("serverStatus/latest", body);
        } catch (Exception e) {
            getLogger().warning("[FCN] pushServerStatus error: " + e.getMessage());
        }
    }

    private void pushServerOffline() {
        try {
            String body = "{"
                + "\"fields\":{"
                + "\"status\":{\"stringValue\":\"offline\"},"
                + "\"playersOnline\":{\"integerValue\":\"0\"},"
                + "\"updatedAt\":{\"timestampValue\":\"" + Instant.now() + "\"}"
                + "}"
                + "}";
            firestorePatch("serverStatus/latest", body);
        } catch (Exception e) {
            getLogger().warning("[FCN] pushServerOffline error: " + e.getMessage());
        }
    }

    // ─── Player report ─────────────────────────────────────────────────────────

    private void pushPlayerReport(String ign, String message) {
        try {
            String body = "{"
                + "\"fields\":{"
                + "\"ign\":{\"stringValue\":\""     + safeJson(ign)     + "\"},"
                + "\"message\":{\"stringValue\":\""  + safeJson(message) + "\"},"
                + "\"status\":{\"stringValue\":\"open\"},"
                + "\"timestamp\":{\"timestampValue\":\"" + Instant.now() + "\"}"
                + "}"
                + "}";
            int code = firestorePost("playerReports", body);
            if (code != 200) {
                getLogger().warning("[FCN] pushPlayerReport returned HTTP " + code);
            }
        } catch (Exception e) {
            getLogger().warning("[FCN] pushPlayerReport error: " + e.getMessage());
        }
    }

    // ─── Player session tracking ───────────────────────────────────────────────

    private void pushPlayerSession(String ign, String uuid, long minutesPlayed) {
        try {
            String body = "{"
                + "\"fields\":{"
                + "\"ign\":{\"stringValue\":\""           + safeJson(ign) + "\"},"
                + "\"uuid\":{\"stringValue\":\""          + uuid           + "\"},"
                + "\"minutesPlayed\":{\"integerValue\":\"" + minutesPlayed + "\"},"
                + "\"timestamp\":{\"timestampValue\":\""  + Instant.now() + "\"}"
                + "}"
                + "}";
            firestorePost("playerSessions", body);
        } catch (Exception e) {
            getLogger().warning("[FCN] pushPlayerSession error: " + e.getMessage());
        }
    }

    // ─── Firestore REST helpers ────────────────────────────────────────────────

    private void firestorePatch(String path, String body) throws Exception {
        String url = "https://firestore.googleapis.com/v1/projects/" + projectId
                + "/databases/(default)/documents/" + path;
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 429) {
            rateLimitBackoffUntil = System.currentTimeMillis() + 5 * 60 * 1000L;
            getLogger().warning("[FCN] Firestore rate-limited. Backing off 5 min.");
        } else if (res.statusCode() != 200) {
            getLogger().warning("[FCN] Firestore PATCH " + path + " → HTTP " + res.statusCode());
        }
    }

    private int firestorePost(String collection, String body) throws Exception {
        String url = "https://firestore.googleapis.com/v1/projects/" + projectId
                + "/databases/(default)/documents/" + collection;
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 429) {
            rateLimitBackoffUntil = System.currentTimeMillis() + 5 * 60 * 1000L;
            getLogger().warning("[FCN] Firestore rate-limited. Backing off 5 min.");
        }
        return res.statusCode();
    }

    private String safeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
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

            JsonArray results = JsonParser.parseString(res.body()).getAsJsonArray();
            List<String> toWhitelist = new ArrayList<>();

            for (JsonElement el : results) {
                JsonObject row = el.getAsJsonObject();
                if (!row.has("document")) continue;

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

    // ─── Event handlers ───────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH)
    public void onLogin(PlayerLoginEvent event) {
        if (event.getResult() != PlayerLoginEvent.Result.KICK_WHITELIST) return;

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

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        // Track session start time
        playerJoinTimes.put(player.getUniqueId(), System.currentTimeMillis());

        if (!showJoinTitle) return;
        Bukkit.getScheduler().runTaskLater(this, () -> {
            if (!player.isOnline()) return;
            player.showTitle(Title.title(
                    mm.deserialize("<gradient:#ff3b30:#ff8a00><bold>Welcome to FireCraft!</bold></gradient>"),
                    mm.deserialize("<white>Use <gold>/report <msg></gold> to report issues to staff</white>"),
                    Title.Times.times(
                            Duration.ofMillis(500),
                            Duration.ofSeconds(4),
                            Duration.ofMillis(500)
                    )
            ));
        }, 60L);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        Long joinTime = playerJoinTimes.remove(player.getUniqueId());
        if (joinTime == null) return;
        long minutesPlayed = (System.currentTimeMillis() - joinTime) / 60000;
        // Only log sessions >= 1 minute
        if (minutesPlayed < 1) return;
        final long mins = minutesPlayed;
        Bukkit.getScheduler().runTaskAsynchronously(this, () ->
                pushPlayerSession(player.getName(), player.getUniqueId().toString(), mins));
    }

    // ─── Vote GUI ─────────────────────────────────────────────────────────────

    private static class VoteGuiHolder implements InventoryHolder {
        @Override public Inventory getInventory() { return null; }
    }

    private void openVoteGui(Player player) {
        Component title = mm.deserialize("<dark_gray>» <white>Vote for FireCraft SMP</white> <dark_gray>«");
        Inventory inv = Bukkit.createInventory(new VoteGuiHolder(), 27, title);

        // Background filler
        ItemStack pane = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta paneMeta = pane.getItemMeta();
        paneMeta.displayName(Component.empty());
        pane.setItemMeta(paneMeta);
        for (int i = 0; i < 27; i++) inv.setItem(i, pane);

        // Slot 11 — Emerald: MinecraftServers.org
        ItemStack emerald = new ItemStack(Material.EMERALD);
        ItemMeta eMeta = emerald.getItemMeta();
        eMeta.displayName(mm.deserialize("<green><bold>⬡ MinecraftServers.org"));
        eMeta.lore(List.of(
            mm.deserialize("<dark_gray>▶ <gray>Vote for FireCraft SMP"),
            mm.deserialize("<dark_gray>▶ <gray>Username: <white>" + player.getName()),
            mm.deserialize("<yellow>» Click to get vote link «")
        ));
        emerald.setItemMeta(eMeta);
        inv.setItem(11, emerald);

        // Slot 15 — Diamond: MinecraftIPList.com
        ItemStack diamond = new ItemStack(Material.DIAMOND);
        ItemMeta dMeta = diamond.getItemMeta();
        dMeta.displayName(mm.deserialize("<aqua><bold>⬡ MinecraftIPList.com"));
        dMeta.lore(List.of(
            mm.deserialize("<dark_gray>▶ <gray>Vote for FireCraft SMP"),
            mm.deserialize("<dark_gray>▶ <gray>Username: <white>" + player.getName()),
            mm.deserialize("<yellow>» Click to get vote link «")
        ));
        diamond.setItemMeta(dMeta);
        inv.setItem(15, diamond);

        player.openInventory(inv);
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (!(event.getInventory().getHolder() instanceof VoteGuiHolder)) return;
        event.setCancelled(true);
        if (event.getClickedInventory() == null) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;
        int slot = event.getSlot();
        if (slot == 11) {
            player.closeInventory();
            sendVoteLink(player, "MinecraftServers.org", "https://minecraftservers.org/vote/694221");
        } else if (slot == 15) {
            player.closeInventory();
            sendVoteLink(player, "MinecraftIPList.com", "https://www.minecraftiplist.com/server/FireCraftSMP-44868");
        }
    }

    private void sendVoteLink(Player player, String siteName, String url) {
        String border = "<dark_gray><strikethrough>+-----------------------------------------+</strikethrough>";
        String siteColor = siteName.contains("Servers") ? "<green>" : "<aqua>";
        Component linkLine = mm.deserialize("<gray>  Link: ")
                .append(mm.deserialize(siteColor + "<underlined>" + url)
                        .clickEvent(ClickEvent.openUrl(url)));
        player.sendMessage(mm.deserialize(border));
        player.sendMessage(mm.deserialize("<gold><bold>  🗳 Vote: " + siteColor + siteName + "</bold></gold>"));
        player.sendMessage(mm.deserialize(border));
        player.sendMessage(mm.deserialize("<gray>  Site: " + siteColor + siteName));
        player.sendMessage(mm.deserialize("<gray>  Enter username: <white>" + player.getName()));
        player.sendMessage(Component.empty());
        player.sendMessage(linkLine);
        player.sendMessage(mm.deserialize(border));
    }

    private void sendVoteReminder() {
        if (Bukkit.getOnlinePlayers().isEmpty()) return;
        Component line1 = mm.deserialize("<gold><bold>[✦] Vote for FireCraft SMP! [✦]</bold></gold>");
        Component line2 = mm.deserialize("<yellow>Voting is free and takes only 30 seconds!");
        Component line3 = mm.deserialize("<white>Type <gold>/vote</gold> to get voting links and support us!");
        Bukkit.getScheduler().runTask(this, () -> {
            for (Player p : Bukkit.getOnlinePlayers()) {
                p.sendMessage(line1);
                p.sendMessage(line2);
                p.sendMessage(line3);
            }
        });
    }

    // ─── Utility ─────────────────────────────────────────────────────────────

    private String escapeForMM(String input) {
        return input.replace("<", "\\<").replace(">", "\\>");
    }
}
