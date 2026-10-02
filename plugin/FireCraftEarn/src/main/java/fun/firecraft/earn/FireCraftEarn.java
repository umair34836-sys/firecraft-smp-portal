package fun.firecraft.earn;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public class FireCraftEarn extends JavaPlugin implements Listener {

    private FirebaseSync firebase;
    private SessionManager sessionManager;
    private BukkitTask heartbeatTask;
    private BukkitTask tokenRefreshTask;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        if (!loadPlugin()) {
            getLogger().severe("[FireCraftEarn] Failed to initialize — check config.yml and disable the plugin.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("[FireCraftEarn] Enabled. Tracking playtime for server: " + getConfig().getString("server-id"));
    }

    private boolean loadPlugin() {
        String apiKey    = getConfig().getString("firebase-api-key", "");
        String projectId = getConfig().getString("firebase-project-id", "");
        String email     = getConfig().getString("firebase-email", "");
        String password  = getConfig().getString("firebase-password", "");
        String serverId  = getConfig().getString("server-id", "");
        boolean debug    = getConfig().getBoolean("debug", false);

        if (apiKey.isEmpty() || projectId.isEmpty() || email.isEmpty() || password.isEmpty() || serverId.isEmpty()) {
            getLogger().severe("[FireCraftEarn] Incomplete config.yml — fill in all firebase-* and server-id values.");
            return false;
        }

        firebase = new FirebaseSync(this, apiKey, projectId, email, password, debug);

        // Authenticate synchronously on startup (blocking is fine on enable)
        if (!firebase.authenticate()) {
            getLogger().severe("[FireCraftEarn] Could not authenticate to Firebase. Check credentials.");
            return false;
        }

        int minSession = getConfig().getInt("min-session-minutes", 5);
        String serverName = serverId; // Will be fetched from Firestore lazily
        sessionManager = new SessionManager(this, firebase, serverId, serverName, minSession, debug);

        // Schedule heartbeat task (async)
        int heartbeatTicks = getConfig().getInt("heartbeat-interval", 300) * 20;
        heartbeatTask = getServer().getScheduler().runTaskTimerAsynchronously(
            this, () -> sessionManager.sendHeartbeats(), heartbeatTicks, heartbeatTicks
        );

        // Refresh Firebase token every 50 minutes
        tokenRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
            this, () -> firebase.authenticate(), 50 * 60 * 20L, 50 * 60 * 20L
        );

        return true;
    }

    @Override
    public void onDisable() {
        if (heartbeatTask != null) heartbeatTask.cancel();
        if (tokenRefreshTask != null) tokenRefreshTask.cancel();
        if (sessionManager != null) sessionManager.shutdown();
        getLogger().info("[FireCraftEarn] Disabled. All sessions saved.");
    }

    // ── Events ──────────────────────────────────────────────────────────────

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        sessionManager.onPlayerJoin(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        sessionManager.onPlayerQuit(event.getPlayer());
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("fcearnadmin")) {
            if (!sender.hasPermission("firecraft.earn.admin")) {
                sender.sendMessage("§cYou do not have permission.");
                return true;
            }
            if (args.length == 0 || args[0].equalsIgnoreCase("status")) {
                sender.sendMessage("§6[FireCraftEarn] §fPlugin is running. Server ID: §e" + getConfig().getString("server-id"));
                return true;
            }
            if (args[0].equalsIgnoreCase("reload")) {
                if (heartbeatTask != null) heartbeatTask.cancel();
                if (tokenRefreshTask != null) tokenRefreshTask.cancel();
                reloadConfig();
                if (loadPlugin()) sender.sendMessage("§a[FireCraftEarn] Reloaded and re-authenticated.");
                else sender.sendMessage("§c[FireCraftEarn] Reload failed — check console.");
                return true;
            }
            sender.sendMessage("§6Usage: §f/fcearnadmin [status|reload]");
            return true;
        }

        if (command.getName().equalsIgnoreCase("fcwallet")) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("§cOnly players can use this command.");
                return true;
            }
            player.sendMessage("§6[FireCraftEarn] §fCheck your wallet at §ehttps://www.firecraft.fun §f→ My Profile.");
            return true;
        }

        return false;
    }
}
