package science.gg.breeding.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI

class ApiException(val status: Int, message: String) : Exception(message)

class GgApi(private val baseUrl: String, private val token: String?) {
    fun health(): JSONObject = get("api/v1/health")
    fun version(): JSONObject = get("api/v1/version")
    fun dashboard(): JSONObject = get("api/v1/dashboard")
    fun knowledge(): JSONObject = get("api/v1/knowledge/status")
    fun quality(): JSONObject = get("api/v1/knowledge/quality")
    fun walk(query: String): JSONObject = get("api/v1/knowledge/walk?q=${enc(query)}")
    fun patterns(): JSONObject = get("api/v1/patterns")
    fun evidence(): JSONObject = get("api/v1/evidence")
    fun targets(): JSONObject = get("api/v1/targets")
    fun snapshots(): JSONObject = get("api/v1/snapshots")
    fun evaluatePrediction(targetId: String, query: String): JSONObject =
        post("api/v1/predictions/evaluate", JSONObject().put("target_id", targetId).put("query", query).put("features", JSONArray()))
    fun search(query: String): JSONObject = post("api/v1/strains/search", JSONObject().put("q", query))
    fun research(query: String): JSONObject = post("api/v1/research", JSONObject().put("q", query))
    fun semantic(query: String): JSONObject = post("api/v1/semantic/search", JSONObject().put("q", query))
    fun chat(message: String, context: JSONObject?): JSONObject {
        val body = JSONObject().put("message", message)
        if (context != null) body.put("context", context)
        return post("api/v1/conversation/message", body)
    }
    fun strain(id: String): JSONObject = get("api/v1/strains/${enc(id)}")
    fun pedigree(id: String): JSONObject = get("api/v1/strains/${enc(id)}/pedigree")
    fun predictions(): JSONObject = get("api/v1/predictions")
    fun prediction(id: String): JSONObject = get("api/v1/predictions/${enc(id)}")

    fun cross(body: JSONObject): JSONObject = post("api/v1/crosses", body)

    fun observation(predictionId: String, trait: String, note: String): JSONObject =
        post(
            "api/v1/observations",
            JSONObject().put("prediction_id", predictionId).put("trait", trait).put("note", note),
        )

    fun entitlements(): JSONObject = get("api/v1/entitlements")

    fun reportContent(kind: String, detail: String, targetId: String): JSONObject =
        post(
            "api/v1/content-reports",
            JSONObject().put("kind", kind).put("detail", detail).put("target_id", targetId),
        )

    fun exportAccount(): JSONObject = get("api/v1/account/export")
    fun deleteAccount(): JSONObject = post("api/v1/account/delete", JSONObject())

    fun signIn(email: String, password: String): String = auth("api/auth/sign-in/email", email, password, null)

    fun signUp(name: String, email: String, password: String): String =
        auth("api/auth/sign-up/email", email, password, name)

    private fun auth(path: String, email: String, password: String, name: String?): String {
        val body = JSONObject().put("email", email).put("password", password)
        if (name != null) body.put("name", name)
        val (code, json, headerToken) = call("POST", path, body, false)
        if (code !in 200..299) {
            throw ApiException(code, json.optString("message", json.optString("error", "Accesso rifiutato")))
        }
        val token = headerToken ?: json.optString("token").ifBlank { null }
        return token ?: throw ApiException(code, "Il server non ha restituito un token di sessione.")
    }

    private fun get(path: String) = call("GET", path, null, true).also { check(it) }.second

    private fun post(path: String, body: JSONObject) = call("POST", path, body, true).also { check(it) }.second

    private fun check(result: Triple<Int, JSONObject, String?>) {
        if (result.first !in 200..299) {
            throw ApiException(result.first, explainStatus(result.first, result.second))
        }
    }

    private fun explainStatus(status: Int, body: JSONObject): String {
        val detail = body.optString("error", body.optString("message", ""))
        return when (status) {
            503 -> body.optString("reply").ifBlank {
                body.optString("reason").ifBlank { "Database scientifico non disponibile. Nessun dato è stato inventato." }
            }
            502 -> "Ricerca fallita. Nessuna misura e nessun pedigree sono stati scritti."
            422 -> "Risposta del provider non valida. Non è stata salvata come conoscenza."
            401, 403 -> if (detail.isBlank()) "Accesso negato." else detail
            else -> if (detail.isBlank()) "Errore $status" else detail
        }
    }

    private fun call(method: String, path: String, body: JSONObject?, withAuth: Boolean): Triple<Int, JSONObject, String?> {
        val root = baseUrl.trim().trimEnd('/')
        val connection = (URI("$root/$path").toURL().openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20000
            readTimeout = 90000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Origin", root)
            if (withAuth && !token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        if (body != null) {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
        }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        val json = if (text.trim().startsWith("{")) JSONObject(text) else JSONObject().put("error", text.ifBlank { "Risposta vuota" })
        val header = connection.getHeaderField("set-auth-token")
        connection.disconnect()
        return Triple(code, json, header)
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}

fun JSONArray.objects(): List<JSONObject> = List(length()) { getJSONObject(it) }
