package fun.firecraft.partner;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public class FireCraftPartner extends JavaPlugin implements Listener {

    private FirebaseSync firebase;
    private SessionManager sessionManager;
    private PromotionManager promotionManager;
    private BukkitTask heartbeatTask;
    private BukkitTask tokenRefreshTask;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        if (!loadPlugin()) {
            getLogger().severe("[FCPartner] Failed to initialize — check config.yml and disable the plugin.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("[FCPartner] Enabled. Server ID: " + getConfig().getString("server-id"));
    }

    private boolean loadPlugin() {
        String apiKey    = getConfig().getString("firebase-api-key", "");
        String projectId = getConfig().getString("firebase-project-id", "");
        String email     = getConfig().getString("firebase-email", "");
        String password  = getConfig().getString("firebase-password", "");
        String serverId  = getConfig().getString("server-id", "");
        boolean debug    = getConfig().getBoolean("debug", false);

        if (apiKey.isEmpty() || projectId.isEmpty() || email.isEmpty() || password.isEmpty() || serverId.isEmpty()) {
            getLogger().severe("[FCPartner] Incomplete config.yml — fill in all firebase-* and server-id values.");
            return false;
        }

        firebase = new FirebaseSync(this, apiKey, projectId, email, password, debug);
        if (!firebase.authenticate()) {
            getLogger().severe("[FCPartner] Could not authenticate to Firebase. Check credentials.");
            return false;
        }

        int minSession = getConfig().getInt("tracking.min-session-minutes", 5);
        sessionManager = new SessionManager(this, firebase, serverId, minSession, debug);

        String websiteUrl = getConfig().getString("website-url", "https://www.firecraft.fun");
        String discordUrl = getConfig().getString("discord-url", "https://discord.gg/k3wmWeBsmD");
        promotionManager = new PromotionManager(this, websiteUrl, discordUrl, serverId);
        promotionManager.start();

        int heartbeatTicks = getConfig().getInt("tracking.heartbeat-interval", 300) * 20;
        heartbeatTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this, () -> sessionManager.sendHeartbeats(), heartbeatTicks, heartbeatTicks);

        tokenRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this, () -> firebase.authenticate(), 50 * 60 * 20L, 50 * 60 * 20L);

        return true;
    }

    @Override
    public void onDisable() {
        if (heartbeatTask != null) heartbeatTask.cancel();
        if (tokenRefreshTask != null) tokenRefreshTask.cancel();
        if (promotionManager != null) promotionManager.stop();
        if (sessionManager != null) sessionManager.shutdown();
        getLogger().info("[FCPartner] Disabled. All sessions saved.");
    }

    // ── Events ───────────────────────────────────────────────────────────────

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        sessionManager.onPlayerJoin(player);
        promotionManager.onPlayerJoin(player);
        // Apply tab-list on next tick so the client is fully loaded
        getServer().getScheduler().runTaskLater(this, () -> {
            if (player.isOnline()) promotionManager.applyTabListToPlayer(player);
        }, 5L);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        promotionManager.onPlayerQuit(player);
        sessionManager.onPlayerQuit(player);
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {

        if (command.getName().equalsIgnoreCase("firecraft")) {
            promotionManager.sendInfoCommand(sender);
            return true;
        }

        if (command.getName().equalsIgnoreCase("fcadmin")) {
            if (!sender.hasPermission("firecraft.partner.admin")) {
                sender.sendMessage("§cYou do not have permission.");
                return true;
            }
            if (args.length == 0 || args[0].equalsIgnoreCase("status")) {
                sender.sendMessage("§6[FCPartner] §fRunning. Server ID: §e" + getConfig().getString("server-id"));
                return true;
            }
            if (args[0].equalsIgnoreCase("reload")) {
                if (heartbeatTask != null) heartbeatTask.cancel();
                if (tokenRefreshTask != null) tokenRefreshTask.cancel();
                if (promotionManager != null) promotionManager.stop();
                reloadConfig();
                if (loadPlugin()) sender.sendMessage("§a[FCPartner] Reloaded and re-authenticated.");
                else sender.sendMessage("§c[FCPartner] Reload failed — check console.");
                return true;
            }
            if (args[0].equalsIgnoreCase("broadcast")) {
                promotionManager.updateTabList();
                sender.sendMessage("§a[FCPartner] Tab list refreshed.");
                return true;
            }
            sender.sendMessage("§6Usage: §f/fcadmin [status|reload|broadcast]");
            return true;
        }

        return false;
    }
}
