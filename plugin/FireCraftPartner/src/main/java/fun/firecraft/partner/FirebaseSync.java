package fun.firecraft.partner;

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
    private static final String AUTH_URL  = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
    private static final String FS_BASE   = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/";

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
            JsonObject body = new JsonObject();
            body.addProperty("email", email);
            body.addProperty("password", password);
            body.addProperty("returnSecureToken", true);

            JsonObject resp = postJson(AUTH_URL + apiKey, body.toString(), null);
            if (resp == null || !resp.has("idToken")) {
                plugin.getLogger().severe("[FCPartner] Firebase auth failed — check firebase-email / firebase-password in config.yml");
                return false;
            }
            idToken.set(resp.get("idToken").getAsString());
            long expiresIn = resp.has("expiresIn") ? resp.get("expiresIn").getAsLong() : 3600L;
            tokenExpiry = System.currentTimeMillis() + (expiresIn - 300) * 1000L;
            if (debug) plugin.getLogger().info("[FCPartner] Firebase auth OK.");
            return true;
        } catch (Exception e) {
            plugin.getLogger().log(Level.SEVERE, "[FCPartner] Auth exception", e);
            return false;
        }
    }

    private String token() {
        if (idToken.get() == null || System.currentTimeMillis() > tokenExpiry) authenticate();
        return idToken.get();
    }

    // ── Firestore helpers ─────────────────────────────────────────────────────

    private String fsUrl(String path) { return String.format(FS_BASE, projectId) + path; }

    public JsonObject getDocument(String path) {
        try {
            String t = token(); if (t == null) return null;
            return getJson(fsUrl(path), t);
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FCPartner] getDocument " + path, e);
            return null;
        }
    }

    public boolean setDocument(String path, String json) {
        try {
            String t = token(); if (t == null) return false;
            return patchJson(fsUrl(path), json, t) != null;
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FCPartner] setDocument " + path, e);
            return false;
        }
    }

    public boolean deleteDocument(String path) {
        try {
            String t = token(); if (t == null) return false;
            return deleteHttp(fsUrl(path), t);
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FCPartner] deleteDocument " + path, e);
            return false;
        }
    }

    public boolean addDocument(String collectionPath, String json) {
        try {
            String t = token(); if (t == null) return false;
            return postJson(fsUrl(collectionPath), json, t) != null;
        } catch (Exception e) {
            if (debug) plugin.getLogger().log(Level.WARNING, "[FCPartner] addDocument " + collectionPath, e);
            return false;
        }
    }

    // ── Firestore document builder ────────────────────────────────────────────

    public static String doc(Object... kv) {
        if (kv.length % 2 != 0) throw new IllegalArgumentException("Must be key-value pairs");
        StringBuilder sb = new StringBuilder("{\"fields\":{");
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(kv[i]).append("\":").append(fsValue(kv[i + 1]));
        }
        return sb.append("}}").toString();
    }

    private static String fsValue(Object v) {
        if (v == null)                          return "{\"nullValue\":null}";
        if (v instanceof Boolean)               return "{\"booleanValue\":" + v + "}";
        if (v instanceof Long || v instanceof Integer) return "{\"integerValue\":\"" + v + "\"}";
        if (v instanceof Double || v instanceof Float) return "{\"doubleValue\":" + v + "}";
        String s = String.valueOf(v).replace("\\","\\\\").replace("\"","\\\"");
        return "{\"stringValue\":\"" + s + "\"}";
    }

    public static String getString(JsonObject doc, String field) {
        try { return doc.getAsJsonObject("fields").getAsJsonObject(field).get("stringValue").getAsString(); }
        catch (Exception e) { return null; }
    }

    public static boolean getBool(JsonObject doc, String field, boolean def) {
        try { return doc.getAsJsonObject("fields").getAsJsonObject(field).get("booleanValue").getAsBoolean(); }
        catch (Exception e) { return def; }
    }

    public static double getDouble(JsonObject doc, String field, double def) {
        try {
            JsonObject f = doc.getAsJsonObject("fields").getAsJsonObject(field);
            if (f.has("doubleValue"))  return f.get("doubleValue").getAsDouble();
            if (f.has("integerValue")) return f.get("integerValue").getAsDouble();
            return def;
        } catch (Exception e) { return def; }
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────

    private JsonObject getJson(String url, String bearer) throws Exception {
        HttpURLConnection c = open(url, "GET", bearer, false);
        if (c.getResponseCode() == 404) return null;
        return GSON.fromJson(read(c), JsonObject.class);
    }

    private JsonObject postJson(String url, String body, String bearer) throws Exception {
        HttpURLConnection c = open(url, "POST", bearer, true);
        c.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        return GSON.fromJson(read(c), JsonObject.class);
    }

    private JsonObject patchJson(String url, String body, String bearer) throws Exception {
        HttpURLConnection c = open(url, "PATCH", bearer, true);
        c.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        return GSON.fromJson(read(c), JsonObject.class);
    }

    private boolean deleteHttp(String url, String bearer) throws Exception {
        HttpURLConnection c = open(url, "DELETE", bearer, false);
        int s = c.getResponseCode();
        return s == 200 || s == 204;
    }

    private HttpURLConnection open(String urlStr, String method, String bearer, boolean output) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setRequestMethod(method);
        c.setRequestProperty("Content-Type", "application/json");
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        if (output) c.setDoOutput(true);
        return c;
    }

    private String read(HttpURLConnection c) throws Exception {
        Scanner sc;
        try { sc = new Scanner(c.getInputStream(), StandardCharsets.UTF_8); }
        catch (Exception e) { sc = new Scanner(c.getErrorStream(), StandardCharsets.UTF_8); }
        StringBuilder sb = new StringBuilder();
        while (sc.hasNextLine()) sb.append(sc.nextLine());
        sc.close();
        return sb.toString();
    }
}
