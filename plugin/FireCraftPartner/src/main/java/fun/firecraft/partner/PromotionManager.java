package fun.firecraft.partner;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.List;

public class PromotionManager {

    private final JavaPlugin plugin;
    private final String websiteUrl;
    private final String discordUrl;
    private final String serverId;

    private BukkitTask broadcastTask;
    private int broadcastIndex = 0;

    public PromotionManager(JavaPlugin plugin, String websiteUrl, String discordUrl, String serverId) {
        this.plugin = plugin;
        this.websiteUrl = websiteUrl;
        this.discordUrl = discordUrl;
        this.serverId = serverId;
    }

    public void start() {
        boolean broadcastEnabled = plugin.getConfig().getBoolean("promotion.broadcast-enabled", true);
        if (broadcastEnabled) {
            int intervalTicks = plugin.getConfig().getInt("promotion.broadcast-interval", 600) * 20;
            broadcastTask = plugin.getServer().getScheduler().runTaskTimer(plugin, this::sendNextBroadcast,
                    intervalTicks, intervalTicks);
        }

        boolean tabEnabled = plugin.getConfig().getBoolean("promotion.tab-list-enabled", true);
        if (tabEnabled) updateTabList();
    }

    public void stop() {
        if (broadcastTask != null) broadcastTask.cancel();
    }

    public void onPlayerJoin(Player player) {
        boolean joinEnabled = plugin.getConfig().getBoolean("promotion.join-message-enabled", true);
        if (!joinEnabled) return;
        if (player.hasPermission("firecraft.partner.silent")) return;

        int delayTicks = plugin.getConfig().getInt("promotion.join-message-delay", 3) * 20;
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (!player.isOnline()) return;
            List<String> lines = plugin.getConfig().getStringList("messages.join");
            for (String line : lines) player.sendMessage(colorize(line, player));
        }, delayTicks);
    }

    public void onPlayerQuit(Player player) {
        boolean quitEnabled = plugin.getConfig().getBoolean("promotion.quit-reminder-enabled", true);
        if (!quitEnabled) return;
        if (player.hasPermission("firecraft.partner.silent")) return;

        String msg = plugin.getConfig().getString("messages.quit-reminder", "");
        if (!msg.isEmpty()) player.sendMessage(colorize(msg, player));
    }

    public void sendInfoCommand(org.bukkit.command.CommandSender sender) {
        List<String> lines = plugin.getConfig().getStringList("messages.info-command");
        String playerName = (sender instanceof Player p) ? p.getName() : "Console";
        for (String line : lines) sender.sendMessage(colorize(line, playerName));
    }

    private void sendNextBroadcast() {
        List<String> broadcasts = plugin.getConfig().getStringList("messages.broadcasts");
        if (broadcasts.isEmpty()) return;

        String msg = broadcasts.get(broadcastIndex % broadcasts.size());
        broadcastIndex++;

        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!p.hasPermission("firecraft.partner.silent")) {
                p.sendMessage(colorize(msg, p));
            }
        }
    }

    public void updateTabList() {
        List<String> headers = plugin.getConfig().getStringList("messages.tab-header");
        List<String> footers = plugin.getConfig().getStringList("messages.tab-footer");

        String header = String.join("\n", headers.stream().map(s -> colorize(s, (String) null)).toList());
        String footer = String.join("\n", footers.stream().map(s -> colorize(s, (String) null)).toList());

        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setPlayerListHeaderFooter(header, footer);
        }
    }

    public void applyTabListToPlayer(Player player) {
        boolean tabEnabled = plugin.getConfig().getBoolean("promotion.tab-list-enabled", true);
        if (!tabEnabled) return;

        List<String> headers = plugin.getConfig().getStringList("messages.tab-header");
        List<String> footers = plugin.getConfig().getStringList("messages.tab-footer");

        String header = String.join("\n", headers.stream().map(s -> colorize(s, player)).toList());
        String footer = String.join("\n", footers.stream().map(s -> colorize(s, player)).toList());
        player.setPlayerListHeaderFooter(header, footer);
    }

    // ── Placeholder replacement ───────────────────────────────────────────────

    private String colorize(String s, Player player) {
        return colorize(s, player != null ? player.getName() : null);
    }

    private String colorize(String s, String playerName) {
        if (s == null) return "";
        s = s.replace("{url}", websiteUrl)
             .replace("{discord}", discordUrl)
             .replace("{server}", serverId);
        if (playerName != null) s = s.replace("{player}", playerName);
        return org.bukkit.ChatColor.translateAlternateColorCodes('&', s);
    }
}
