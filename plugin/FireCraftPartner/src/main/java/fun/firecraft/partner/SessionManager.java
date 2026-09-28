package fun.firecraft.partner;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

public class SessionManager {

    private final JavaPlugin plugin;
    private final FirebaseSync firebase;
    private final String serverId;
    private final int minSessionMinutes;
    private final boolean debug;

    private final Map<UUID, Long> joinTimes = new ConcurrentHashMap<>();

    public SessionManager(JavaPlugin plugin, FirebaseSync firebase,
                          String serverId, int minSessionMinutes, boolean debug) {
        this.plugin = plugin;
        this.firebase = firebase;
        this.serverId = serverId;
        this.minSessionMinutes = minSessionMinutes;
        this.debug = debug;
    }

    public void onPlayerJoin(Player player) {
        UUID uid = player.getUniqueId();
        joinTimes.put(uid, System.currentTimeMillis());

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            String path = "activeSessions/" + uid;
            // Block if already in an active session on another server
            JsonObject existing = firebase.getDocument(path);
            if (existing != null) {
                String activeServer = FirebaseSync.getString(existing, "serverId");
                if (activeServer != null && !activeServer.equals(serverId)) {
                    if (debug) plugin.getLogger().info("[FCPartner] " + player.getName() +
                            " already in active session on " + activeServer + " — not creating new session.");
                    joinTimes.remove(uid);
                    return;
                }
            }

            String sessionDoc = FirebaseSync.doc(
                    "serverId", serverId,
                    "playerUUID", uid.toString(),
                    "playerName", player.getName(),
                    "joinedAt", System.currentTimeMillis()
            );
            firebase.setDocument(path, sessionDoc);
            if (debug) plugin.getLogger().info("[FCPartner] Session started for " + player.getName());
        });
    }

    public void onPlayerQuit(Player player) {
        UUID uid = player.getUniqueId();
        Long joinTime = joinTimes.remove(uid);
        if (joinTime == null) return;

        long elapsed = System.currentTimeMillis() - joinTime;
        long minutes = elapsed / 60_000L;

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            firebase.deleteDocument("activeSessions/" + uid);

            if (minutes < minSessionMinutes) {
                if (debug) plugin.getLogger().info("[FCPartner] " + player.getName() +
                        " session too short (" + minutes + " min) — not logged.");
                return;
            }

            // Fetch server rate
            JsonObject serverDoc = firebase.getDocument("partnerServers/" + serverId);
            double ratePerHour = serverDoc != null
                    ? FirebaseSync.getDouble(serverDoc, "ratePerHour", 0.0)
                    : 0.0;

            double hours = minutes / 60.0;
            double earned = Math.round(hours * ratePerHour * 100.0) / 100.0;

            String logId = serverId + "_" + uid + "_" + System.currentTimeMillis();
            String logDoc = FirebaseSync.doc(
                    "playerUUID", uid.toString(),
                    "playerName", player.getName(),
                    "serverId", serverId,
                    "minutes", (long) minutes,
                    "earned", earned,
                    "ratePerHour", ratePerHour,
                    "timestamp", System.currentTimeMillis()
            );

            if (firebase.setDocument("playtimeLogs/" + logId, logDoc)) {
                if (debug) plugin.getLogger().info("[FCPartner] Log saved for " +
                        player.getName() + ": " + minutes + " min, PKR " + earned);
            } else {
                plugin.getLogger().warning("[FCPartner] Failed to save playtime log for " + player.getName());
            }
        });
    }

    public void sendHeartbeats() {
        long now = System.currentTimeMillis();
        for (Map.Entry<UUID, Long> entry : joinTimes.entrySet()) {
            UUID uid = entry.getKey();
            String path = "activeSessions/" + uid;
            String update = FirebaseSync.doc("lastHeartbeat", now);
            firebase.setDocument(path, update);
        }
        if (debug && !joinTimes.isEmpty())
            plugin.getLogger().info("[FCPartner] Heartbeat sent for " + joinTimes.size() + " session(s).");
    }

    public void shutdown() {
        for (UUID uid : joinTimes.keySet()) {
            Player player = plugin.getServer().getPlayer(uid);
            if (player != null) onPlayerQuit(player);
        }
    }
}
