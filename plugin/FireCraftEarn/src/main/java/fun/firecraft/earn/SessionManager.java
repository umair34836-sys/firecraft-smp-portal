package fun.firecraft.earn;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Tracks per-player session start times and handles start/end logic.
 * All Firebase calls run async to avoid blocking the main thread.
 */
public class SessionManager {

    private final JavaPlugin plugin;
    private final FirebaseSync firebase;
    private final String serverId;
    private final String serverName;
    private final int minSessionMinutes;
    private final boolean debug;

    /** playerUUID → session start epoch-second */
    private final Map<UUID, Long> sessions = new HashMap<>();

    public SessionManager(JavaPlugin plugin, FirebaseSync firebase,
                          String serverId, String serverName,
                          int minSessionMinutes, boolean debug) {
        this.plugin = plugin;
        this.firebase = firebase;
        this.serverId = serverId;
        this.serverName = serverName;
        this.minSessionMinutes = minSessionMinutes;
        this.debug = debug;
    }

    // ── Session lifecycle ────────────────────────────────────────────────────

    public void onPlayerJoin(Player player) {
        String ign = player.getName();
        UUID uuid = player.getUniqueId();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            // Look up player's website UID via their IGN
            String uid = lookupUid(ign);
            if (uid == null) {
                if (debug) plugin.getLogger().info("[FireCraftEarn] " + ign + " has no website account — not tracking.");
                return;
            }

            // Check if player already has an active session on another server
            JsonObject activeDoc = firebase.getDocument("activeSessions/" + uid);
            if (activeDoc != null) {
                String existingServer = FirebaseSync.getString(activeDoc, "serverId");
                if (existingServer != null && !existingServer.equals(serverId)) {
                    if (debug) plugin.getLogger().info("[FireCraftEarn] " + ign + " already active on " + existingServer + " — skipping.");
                    return;
                }
            }

            long startEpoch = Instant.now().getEpochSecond();
            sessions.put(uuid, startEpoch);

            // Write activeSessions/{uid}
            String activeJson = FirebaseSync.buildDocument(
                "uid", uid,
                "ign", ign,
                "serverId", serverId,
                "serverName", serverName,
                "sessionStart", String.valueOf(startEpoch),
                "lastHeartbeat", String.valueOf(startEpoch)
            );
            boolean ok = firebase.setDocument("activeSessions/" + uid, activeJson);
            if (debug) plugin.getLogger().info("[FireCraftEarn] Session started for " + ign + " (uid=" + uid + ") — " + (ok ? "OK" : "FAILED"));
        });
    }

    public void onPlayerQuit(Player player) {
        String ign = player.getName();
        UUID uuid = player.getUniqueId();
        Long startEpoch = sessions.remove(uuid);
        if (startEpoch == null) return; // not tracked

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            String uid = lookupUid(ign);
            if (uid == null) return;

            long endEpoch = Instant.now().getEpochSecond();
            long durationSeconds = endEpoch - startEpoch;
            int minutesPlayed = (int)(durationSeconds / 60);

            // Delete active session
            firebase.deleteDocument("activeSessions/" + uid);

            // Only log if above minimum
            if (minutesPlayed < minSessionMinutes) {
                if (debug) plugin.getLogger().info("[FireCraftEarn] " + ign + " played " + minutesPlayed + " min (below minimum " + minSessionMinutes + ") — not recording.");
                return;
            }

            // Fetch partner server rate from Firestore
            double ratePerHour = fetchRate();
            double earned = (minutesPlayed / 60.0) * ratePerHour;

            String logJson = FirebaseSync.buildDocument(
                "uid", uid,
                "ign", ign,
                "serverId", serverId,
                "serverName", serverName,
                "sessionStart", String.valueOf(startEpoch),
                "sessionEnd", String.valueOf(endEpoch),
                "minutesPlayed", minutesPlayed,
                "ratePerHour", ratePerHour,
                "earned", earned
            );
            boolean ok = firebase.addDocument("playtimeLogs", logJson);
            if (debug || ok) plugin.getLogger().info(
                "[FireCraftEarn] Logged " + minutesPlayed + "min for " + ign + " — earned PKR " + String.format("%.2f", earned) + " — " + (ok ? "OK" : "FAILED"));
        });
    }

    /** Send heartbeat for all online tracked players (called by scheduled task). */
    public void sendHeartbeats() {
        if (sessions.isEmpty()) return;
        long now = Instant.now().getEpochSecond();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            for (Map.Entry<UUID, Long> entry : Map.copyOf(sessions).entrySet()) {
                Player p = plugin.getServer().getPlayer(entry.getKey());
                if (p == null) continue;
                String uid = lookupUid(p.getName());
                if (uid == null) continue;
                String heartbeatJson = FirebaseSync.buildDocument(
                    "lastHeartbeat", String.valueOf(now),
                    "serverId", serverId
                );
                firebase.setDocument("activeSessions/" + uid, heartbeatJson);
            }
        });
    }

    /** Clean up all sessions on plugin disable. */
    public void shutdown() {
        for (UUID uuid : Map.copyOf(sessions).keySet()) {
            Player p = plugin.getServer().getPlayer(uuid);
            if (p != null) onPlayerQuit(p);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private String lookupUid(String ign) {
        String ignLower = ign.toLowerCase();
        try {
            JsonObject doc = firebase.getDocument("usernames/" + ignLower);
            if (doc == null) return null;
            return FirebaseSync.getString(doc, "uid");
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FireCraftEarn] lookupUid failed for " + ign, e);
            return null;
        }
    }

    private double fetchRate() {
        try {
            JsonObject doc = firebase.getDocument("partnerServers/" + serverId);
            if (doc == null) return 0;
            JsonObject fields = doc.getAsJsonObject("fields");
            if (fields == null || !fields.has("ratePerHour")) return 0;
            JsonObject rateField = fields.getAsJsonObject("ratePerHour");
            if (rateField.has("doubleValue")) return rateField.get("doubleValue").getAsDouble();
            if (rateField.has("integerValue")) return rateField.get("integerValue").getAsDouble();
            return 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
