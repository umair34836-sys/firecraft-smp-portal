package fun.firecraft.earn;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;

/**
 * Handles Firebase Authentication and Firestore REST API calls.
 * Uses the Firebase Identity Toolkit for sign-in and Firestore REST API for reads/writes.
 */
public class FirebaseSync {

    private final JavaPlugin plugin;
    private final String apiKey;
    private final String projectId;
    private final String email;
    private final String password;
    private final boolean debug;

    private final AtomicReference<String> idToken = new AtomicReference<>(null);
    private long tokenExpiry = 0;

    private static final Gson GSON = new Gson();
    private static final String FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/";

    public FirebaseSync(JavaPlugin plugin, String apiKey, String projectId,
                        String email, String password, boolean debug) {
        this.plugin = plugin;
        this.apiKey = apiKey;
        this.projectId = projectId;
        this.email = email;
        this.password = password;
        this.debug = debug;
    }

    // ── Authentication ────────────────────────────────────────────────────────

    public boolean authenticate() {
        try {
            String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + apiKey;
            JsonObject body = new JsonObject();
            body.addProperty("email", email);
            body.addProperty("password", password);
            body.addProperty("returnSecureToken", true);

            JsonObject resp = postJson(url, body.toString(), null);
            if (resp == null || !resp.has("idToken")) {
                plugin.getLogger().severe("[FireCraftEarn] Firebase auth failed — check firebase-email and firebase-password in config.yml");
                return false;
            }
            idToken.set(resp.get("idToken").getAsString());
            // Token expires in ~3600 seconds; refresh at 50 min
            long expiresIn = resp.has("expiresIn") ? resp.get("expiresIn").getAsLong() : 3600L;
            tokenExpiry = System.currentTimeMillis() + (expiresIn - 300) * 1000L;
            if (debug) plugin.getLogger().info("[FireCraftEarn] Authenticated to Firebase successfully.");
            return true;
        } catch (Exception e) {
            plugin.getLogger().log(Level.SEVERE, "[FireCraftEarn] Auth exception", e);
            return false;
        }
    }

    private String getToken() {
        if (idToken.get() == null || System.currentTimeMillis() > tokenExpiry) {
            authenticate();
        }
        return idToken.get();
    }

    // ── Firestore helpers ────────────────────────────────────────────────────

    private String firestoreUrl(String path) {
        return String.format(FIRESTORE_BASE, projectId) + path;
    }

    /** Read a Firestore document. Returns null if not found. */
    public JsonObject getDocument(String path) {
        try {
            String token = getToken();
            if (token == null) return null;
            String url = firestoreUrl(path);
            return getJson(url, token);
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FireCraftEarn] getDocument " + path, e);
            return null;
        }
    }

    /** Create or overwrite a Firestore document (PATCH = upsert). */
    public boolean setDocument(String path, String firestoreJson) {
        try {
            String token = getToken();
            if (token == null) return false;
            String url = firestoreUrl(path);
            JsonObject resp = patchJson(url, firestoreJson, token);
            return resp != null;
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FireCraftEarn] setDocument " + path, e);
            return false;
        }
    }

    /** Delete a Firestore document. */
    public boolean deleteDocument(String path) {
        try {
            String token = getToken();
            if (token == null) return false;
            String url = firestoreUrl(path);
            return deleteHttp(url, token);
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FireCraftEarn] deleteDocument " + path, e);
            return false;
        }
    }

    /** Add a new document to a collection (POST = auto-ID). */
    public boolean addDocument(String collectionPath, String firestoreJson) {
        try {
            String token = getToken();
            if (token == null) return false;
            String url = firestoreUrl(collectionPath);
            JsonObject resp = postJson(url, firestoreJson, token);
            return resp != null;
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FireCraftEarn] addDocument " + collectionPath, e);
            return false;
        }
    }

    // ── Firestore JSON builders ───────────────────────────────────────────────

    /** Build a Firestore REST document from simple key-value pairs. */
    public static String buildDocument(Object... kvPairs) {
        if (kvPairs.length % 2 != 0) throw new IllegalArgumentException("Must be key-value pairs");
        StringBuilder sb = new StringBuilder("{\"fields\":{");
        for (int i = 0; i < kvPairs.length; i += 2) {
            String key = String.valueOf(kvPairs[i]);
            Object val = kvPairs[i + 1];
            if (i > 0) sb.append(",");
            sb.append("\"").append(key).append("\":");
            sb.append(toFirestoreValue(val));
        }
        sb.append("}}");
        return sb.toString();
    }

    private static String toFirestoreValue(Object val) {
        if (val == null) return "{\"nullValue\":null}";
        if (val instanceof Boolean) return "{\"booleanValue\":" + val + "}";
        if (val instanceof Long || val instanceof Integer) return "{\"integerValue\":\"" + val + "\"}";
        if (val instanceof Double || val instanceof Float) return "{\"doubleValue\":" + val + "}";
        // String
        String s = String.valueOf(val).replace("\\","\\\\").replace("\"","\\\"");
        return "{\"stringValue\":\"" + s + "\"}";
    }

    /** Extract a string field from a Firestore REST document. */
    public static String getString(JsonObject doc, String field) {
        try {
            return doc.getAsJsonObject("fields")
                      .getAsJsonObject(field)
                      .get("stringValue").getAsString();
        } catch (Exception e) { return null; }
    }

    /** Extract a boolean field from a Firestore REST document. */
    public static boolean getBool(JsonObject doc, String field, boolean defaultValue) {
        try {
            return doc.getAsJsonObject("fields")
                      .getAsJsonObject(field)
                      .get("booleanValue").getAsBoolean();
        } catch (Exception e) { return defaultValue; }
    }

    // ── HTTP helpers ─────────────────────────────────────────────────────────

    private JsonObject getJson(String urlStr, String bearerToken) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        int status = conn.getResponseCode();
        if (status == 404) return null;
        String response = readStream(conn);
        return GSON.fromJson(response, JsonObject.class);
    }

    private JsonObject postJson(String urlStr, String body, String bearerToken) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        conn.setDoOutput(true);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        String response = readStream(conn);
        return GSON.fromJson(response, JsonObject.class);
    }

    private JsonObject patchJson(String urlStr, String body, String bearerToken) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("PATCH");
        conn.setRequestProperty("Content-Type", "application/json");
        if (bearerToken != null) conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        conn.setDoOutput(true);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        String response = readStream(conn);
        return GSON.fromJson(response, JsonObject.class);
    }

    private boolean deleteHttp(String urlStr, String bearerToken) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("DELETE");
        if (bearerToken != null) conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        int status = conn.getResponseCode();
        return status == 200 || status == 204;
    }

    private String readStream(HttpURLConnection conn) throws Exception {
        Scanner scanner;
        try {
            scanner = new Scanner(conn.getInputStream(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            scanner = new Scanner(conn.getErrorStream(), StandardCharsets.UTF_8);
        }
        StringBuilder sb = new StringBuilder();
        while (scanner.hasNextLine()) sb.append(scanner.nextLine());
        scanner.close();
        return sb.toString();
    }
}
