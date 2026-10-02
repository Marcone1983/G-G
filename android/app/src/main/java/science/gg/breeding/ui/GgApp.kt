@file:OptIn(ExperimentalMaterial3Api::class)

package science.gg.breeding.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import science.gg.breeding.BuildConfig
import science.gg.breeding.data.ApiException
import science.gg.breeding.data.GgApi
import science.gg.breeding.data.objects
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val Ink = Color(0xFF121410)
private val SurfaceInk = Color(0xFF1C2118)
private val Paper = Color(0xFFE7EFE0)
private val Chlorophyll = Color(0xFFC6E07A)
private val Antho = Color(0xFFE08A9A)
private val Muted = Color(0xFF9AA58F)
private val Line = Color(0xFF343B2E)

class GgModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("gg", Application.MODE_PRIVATE)
    val baseUrl: String = BuildConfig.API_BASE_URL.trim().trimEnd('/')
    var token by mutableStateOf(prefs.getString("token", "") ?: "")
        private set
    var email by mutableStateOf(prefs.getString("email", "") ?: "")
        private set
    var adult by mutableStateOf(prefs.getBoolean("adult", false))
        private set
    var snapshot by mutableStateOf(prefs.getString("snap", "") ?: "")
        private set
    var modelVersion by mutableStateOf(prefs.getString("model", "") ?: "")
        private set
    var lastSync by mutableStateOf(prefs.getLong("synced", 0L))
        private set

    init {
        prefs.edit().remove("base").apply()
    }

    fun saveSession(value: String, account: String) {
        token = value
        email = account.trim()
        prefs.edit().putString("token", value).putString("email", email).apply()
    }

    fun acceptAdult() {
        adult = true
        prefs.edit().putBoolean("adult", true).apply()
    }

    fun rememberSync(snapshotId: String, model: String) {
        snapshot = snapshotId
        modelVersion = model
        lastSync = System.currentTimeMillis()
        prefs.edit().putString("snap", snapshotId).putString("model", model).putLong("synced", lastSync).apply()
    }

    fun signOut() {
        token = ""
        prefs.edit().remove("token").apply()
    }

    fun api() = GgApi(baseUrl, token.ifBlank { null })
}

@Composable
fun GgApp(model: GgModel = viewModel()) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Ink,
            surface = SurfaceInk,
            primary = Chlorophyll,
            onPrimary = Ink,
            secondary = Antho,
            onSurface = Paper,
            onBackground = Paper,
            outline = Line,
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = Ink) {
            val nav = rememberNavController()
            val start = when {
                !model.adult -> "age"
                model.baseUrl.isBlank() -> "offline"
                else -> "connect"
            }
            val back by nav.currentBackStackEntryAsState()
            val route = back?.destination?.route ?: start
            val tabs = route in setOf("home", "strains", "cross", "history", "more")
            Scaffold(
                containerColor = Ink,
                bottomBar = {
                    if (tabs) {
                        NavigationBar(containerColor = SurfaceInk) {
                            listOf(
                                "home" to "Chat",
                                "strains" to "Cultivar",
                                "cross" to "Incrocio",
                                "history" to "Archivio",
                                "more" to "Sistema",
                            ).forEach { (dest, label) ->
                                NavigationBarItem(
                                    selected = route == dest,
                                    onClick = { nav.navigate(dest) { launchSingleTop = true; restoreState = true } },
                                    icon = {
                                        Box(
                                            Modifier
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(if (route == dest) Chlorophyll else Muted),
                                        )
                                    },
                                    label = { Text(label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedTextColor = Chlorophyll,
                                        unselectedTextColor = Muted,
                                        indicatorColor = Color(0xFF2A3324),
                                    ),
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                NavHost(nav, startDestination = start, modifier = Modifier.padding(padding)) {
                    composable("age") {
                        AgeScreen {
                            model.acceptAdult()
                            nav.navigate(if (model.baseUrl.isBlank()) "offline" else "connect") {
                                popUpTo("age") { inclusive = true }
                            }
                        }
                    }
                    composable("connect") {
                        ConnectScreen(model) { state ->
                            val next = when (state) {
                                "available" -> if (model.token.isBlank()) "auth" else "home"
                                "auth" -> "auth"
                                "incompatible" -> "incompatible"
                                else -> "offline"
                            }
                            nav.navigate(next) { popUpTo("connect") { inclusive = true } }
                        }
                    }
                    composable("offline") {
                        OfflineScreen(t("Server G&G non disponibile. Riprova.", "The G&G server is unavailable. Try again.")) {
                            nav.navigate("connect") { popUpTo("offline") { inclusive = true } }
                        }
                    }
                    composable("incompatible") {
                        OfflineScreen(t("È disponibile una nuova versione di G&G.", "A new version of G&G is available.")) {
                            nav.navigate("connect") { popUpTo("incompatible") { inclusive = true } }
                        }
                    }
                    composable("auth") {
                        AuthScreen(model) { nav.navigate("home") { popUpTo("auth") { inclusive = true } } }
                    }
                    composable("home") { HomeScreen(model) }
                    composable("strains") { StrainSearchScreen(model) { id -> nav.navigate("strain/$id") } }
                    composable("strain/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                        val id = entry.arguments?.getString("id").orEmpty()
                        StrainScreen(model, id) { nav.navigate("pedigree/$id") }
                    }
                    composable("pedigree/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                        PedigreeScreen(model, entry.arguments?.getString("id").orEmpty())
                    }
                    composable("cross") { CrossScreen(model) { id -> nav.navigate("report/$id") } }
                    composable("report/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                        ReportScreen(model, entry.arguments?.getString("id").orEmpty())
                    }
                    composable("history") { HistoryScreen(model) { id -> nav.navigate("report/$id") } }
                    composable("more") {
                        MoreScreen(
                            model,
                            onPatterns = { nav.navigate("patterns") },
                            onEvidence = { nav.navigate("evidence") },
                            onKnowledge = { nav.navigate("knowledge") },
                            onPrivacy = { nav.navigate("privacy") },
                            onSubscription = { nav.navigate("subscription") },
                            onReport = { nav.navigate("report-ai") },
                            onHelp = { nav.navigate("help") },
                        )
                    }
                    composable("patterns") { PatternScreen(model) }
                    composable("evidence") { EvidenceScreen(model) }
                    composable("knowledge") { KnowledgeScreen(model) }
                    composable("privacy") {
                        PrivacyScreen(model) {
                            model.signOut()
                            nav.navigate("auth") { popUpTo(0) }
                        }
                    }
                    composable("subscription") { SubscriptionScreen(model) }
                    composable("report-ai") { AiReportScreen(model) }
                    composable("help") { HelpScreen() }
                }
            }
        }
    }
}

@Composable
private fun AgeScreen(onAccept: () -> Unit) {
    var checked by remember { mutableStateOf(false) }
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Eyebrow("Client nativo ${BuildConfig.VERSION_NAME}")
        Text("GREED & GROSS", color = Chlorophyll, style = MaterialTheme.typography.headlineMedium, fontFamily = FontFamily.Serif)
        Text("Strumento scientifico per breeder. Non è un negozio, non organizza vendite e non calcola in locale.", color = Paper)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Switch(checked = checked, onCheckedChange = { checked = it })
        Text(t("Ho almeno 18 anni", "I am at least 18"), color = Paper)
        }
        Button(onClick = onAccept, enabled = checked, colors = primaryButton()) { Text("Entra") }
    }
}

@Composable
private fun ConnectScreen(model: GgModel, onResult: (String) -> Unit) {
    LaunchedEffect(Unit) {
        if (model.baseUrl.isBlank()) {
            onResult("unavailable")
            return@LaunchedEffect
        }
        val state = runCatching {
            withContext(Dispatchers.IO) {
                val health = model.api().health()
                if (health.optString("status") == "MAINTENANCE") return@withContext "maintenance"
                if (health.has("ok") && !health.optBoolean("ok")) return@withContext "unavailable"
                val version = model.api().version()
                val api = version.optString("api_version")
                if (api.isNotBlank() && !api.startsWith("${BuildConfig.EXPECTED_API_MAJOR}.")) return@withContext "incompatible"
                model.rememberSync(version.optString("snapshot_id"), version.optString("model_version"))
                "available"
            }
        }.getOrElse { error ->
            if (error is ApiException && (error.status == 401 || error.status == 403)) "auth" else "unavailable"
        }
        onResult(state)
    }
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("GREED & GROSS", color = Chlorophyll, style = MaterialTheme.typography.headlineMedium, fontFamily = FontFamily.Serif)
        Text("Apro l'applicazione.", color = Paper)
    }
}

@Composable
private fun OfflineScreen(message: String, onRetry: () -> Unit) {
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("GREED & GROSS", color = Chlorophyll, style = MaterialTheme.typography.headlineMedium, fontFamily = FontFamily.Serif)
        Text(message, color = Paper)
        Button(onClick = onRetry, colors = primaryButton()) { Text("Riprova") }
    }
}

@Composable
private fun AuthScreen(model: GgModel, onDone: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf(model.email) }
    var password by remember { mutableStateOf("") }
    var signUp by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf(false) }
    Column(Modifier.padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (signUp) "Crea account" else "Accedi", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("Lo stesso account del sito. Il token resta sul telefono.", color = Muted)
        if (signUp) OutlinedTextField(name, { name = it }, label = { Text("Nome") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors(), singleLine = true)
        OutlinedTextField(
            password,
            { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
        )
        Button(onClick = { pending = true; error = null }, enabled = !pending && email.contains("@") && password.length >= 8, colors = primaryButton()) {
            Text(if (pending) "Connessione…" else if (signUp) "Registrati" else "Entra")
        }
        TextButton(onClick = { signUp = !signUp }) { Text(if (signUp) "Ho già un account" else "Crea account", color = Chlorophyll) }
        error?.let { Text(it, color = Antho) }
    }
    LaunchedEffect(pending) {
        if (!pending) return@LaunchedEffect
        val account = email
        val result = runCatching {
            withContext(Dispatchers.IO) {
                if (signUp) model.api().signUp(name, account, password) else model.api().signIn(account, password)
            }
        }
        pending = false
        result.onSuccess {
            model.saveSession(it, account)
            onDone()
        }.onFailure { error = it.message }
    }
}

@Composable
private fun HomeScreen(model: GgModel) {
    var input by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var parentA by remember { mutableStateOf<JSONObject?>(null) }
    var parentB by remember { mutableStateOf<JSONObject?>(null) }
    var turns by remember { mutableStateOf(listOf(JSONObject().put("role", "assistant").put("text", "Scrivi un incrocio o un nome. Il calcolo resta sul server, insieme al catalogo."))) }
    var ticket by remember { mutableIntStateOf(0) }
    var conversation by remember { mutableStateOf<JSONObject?>(null) }
    var queued by remember { mutableStateOf<JSONObject?>(null) }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Chat", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        SyncLine(model)
        error?.let { Text(it, color = Antho) }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(turns) { turn ->
                val mine = turn.optString("role") == "user"
                GgCard {
                    Text(turn.optString("text"), color = if (mine) Chlorophyll else Paper)
                    val cards = turn.optJSONArray("cards")?.objects().orEmpty()
                    cards.forEach { card ->
                        Text("${card.optString("name")} · ${card.optString("breeder")}", color = Paper, fontWeight = FontWeight.Medium)
                        Text(card.optString("line"), color = Muted)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { parentA = card }) { Text("Parent A") }
                            TextButton(onClick = { parentB = card }) { Text("Parent B") }
                        }
                    }
                }
            }
        }
        if (parentA != null || parentB != null) {
            Text(
                "A ${parentA?.optString("name") ?: "—"} · B ${parentB?.optString("name") ?: "—"}",
                color = Muted,
            )
        }
        OutlinedTextField(
            input,
            { input = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Lemon Haze × Mango") },
            colors = fieldColors(),
        )
        Button(
            onClick = {
                val message = input.trim()
                if (message.length < 2 || pending) return@Button
                val body = JSONObject().put("message", message)
                if (conversation != null) body.put("context", conversation)
                queued = body
                pending = true
                error = null
                turns = turns + JSONObject().put("role", "user").put("text", message)
                input = ""
                parentA = null
                parentB = null
                ticket += 1
            },
            enabled = !pending,
            colors = primaryButton(),
        ) { Text(if (pending) "Cerco" else "Invia") }
    }
    LaunchedEffect(ticket) {
        if (ticket == 0) return@LaunchedEffect
        val job = queued ?: return@LaunchedEffect
        val result = runCatching {
            withContext(Dispatchers.IO) {
                model.api().chat(job.getString("message"), job.optJSONObject("context"))
            }
        }
        pending = false
        result.onSuccess { json ->
            val snap = json.optString("knowledge_snapshot").ifBlank { json.optJSONObject("context")?.optString("knowledge_snapshot").orEmpty() }
            if (snap.isNotBlank()) model.rememberSync(snap, model.modelVersion)
            json.optJSONObject("context")?.let { conversation = it }
            turns = turns + JSONObject()
                .put("role", "assistant")
                .put("text", json.optString("reply"))
                .put("cards", json.optJSONArray("cards") ?: JSONArray())
        }.onFailure { error = it.message }
    }
}

@Composable
private fun StrainSearchScreen(model: GgModel, onOpen: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var generation by remember { mutableIntStateOf(0) }
    var rows by remember { mutableStateOf(emptyList<JSONObject>()) }
    var note by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Cultivar", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("Prima lo store. Se il nome o il cross non si risolvono, il backend ricerca e salva. A x B non è un pedigree.", color = Muted)
        OutlinedTextField(query, { query = it }, label = { Text("Nome o alias") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors(), singleLine = true)
        Button(onClick = { generation += 1 }, enabled = query.trim().length >= 2, colors = primaryButton()) { Text("Cerca sul backend") }
        error?.let { Text(it, color = Antho) }
        note?.let { Text(it, color = Muted) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
            if (generation > 0 && error == null && rows.isEmpty()) item { Text(note ?: "Nessun record dopo la risoluzione.", color = Muted) }
            items(rows) { row ->
                Card(
                    onClick = { onOpen(row.optString("id")) },
                    colors = cardColors(),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(row.optString("canonical_name"), color = Paper, fontWeight = FontWeight.Medium)
                        Text("${row.optString("match_kind")} · ${row.optString("identity_status")}", color = Muted)
                        Text(row.optString("record_role"), color = Chlorophyll)
                    }
                }
            }
        }
    }
    LaunchedEffect(generation) {
        if (generation == 0) return@LaunchedEffect
        error = null
        runCatching { withContext(Dispatchers.IO) { model.api().search(query) } }
            .onSuccess {
                rows = it.optJSONArray("results")?.objects().orEmpty()
                val origin = it.optString("origin")
                val research = it.optString("research_id")
                note = when {
                    origin == "ACQUIRED" -> "Ricerca eseguita e scritta nello stesso store. Non è un laboratorio."
                    origin == "INSUFFICIENT" -> "Ricerca eseguita. Evidenza insufficiente. Nessun pedigree inventato."
                    origin == "GROK_FAILED" -> "Ricerca fallita. Tentativo salvato. Nessun dato inventato."
                    origin == "GROK_UNAVAILABLE" -> "Ricerca non disponibile. Tentativo salvato."
                    research.isNotBlank() -> "Riletto dallo store. Research $research. Nessuna nuova chiamata."
                    origin == "DATABASE" -> "Letto dal database. Nessuna chiamata al modello."
                    else -> it.optString("resolution_note").take(280)
                }
            }
            .onFailure { error = it.message; rows = emptyList(); note = null }
    }
}

@Composable
private fun StrainScreen(model: GgModel, id: String, onPedigree: () -> Unit) {
    var body by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        runCatching { withContext(Dispatchers.IO) { model.api().strain(id) } }
            .onSuccess { body = it }
            .onFailure { error = it.message }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        error?.let { item { Text(it, color = Antho) } }
        body?.let { json ->
            val strain = json.optJSONObject("strain") ?: JSONObject()
            item {
                Text(strain.optString("canonical_name"), color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
                Text(strain.optString("identity_status"), color = Chlorophyll)
                Text(strain.optString("record_role"), color = Muted)
            }
            item { Text(strain.optString("summary"), color = Paper) }
            val quality = json.optJSONObject("quality")
            if (quality != null) {
                item {
                    GgCard {
                        Text("Qualità ${quality.optString("formula_id")}", color = Muted)
                        Text(if (quality.isNull("value")) "non calcolata" else quality.opt("value").toString(), color = Paper)
                    }
                }
            }
            item { Button(onClick = onPedigree, colors = primaryButton()) { Text("Apri pedigree") } }
            val aliases = json.optJSONArray("aliases")
            if (aliases != null && aliases.length() > 0) {
                item { Text("Alias: ${aliases.join()}", color = Muted) }
            }
            val claims = json.optJSONArray("claims")?.objects().orEmpty()
            items(claims) { claim ->
                GgCard {
                    Text("${claim.optString("claim_class")} · L${claim.optInt("evidence_level")} · ${claim.optString("measurement_kind")}", color = Antho)
                    Text(claim.optString("claim_text"), color = Paper)
                }
            }
        }
    }
}

@Composable
private fun PedigreeScreen(model: GgModel, id: String) {
    var body by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        runCatching { withContext(Dispatchers.IO) { model.api().pedigree(id) } }
            .onSuccess { body = it }
            .onFailure { error = it.message }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text(body?.optString("canonical_name") ?: "Pedigree", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
            Text("Il contributo di pedigree non è una percentuale genomica.", color = Muted)
        }
        error?.let { item { Text(it, color = Antho) } }
        val edges = body?.optJSONArray("edges")?.objects().orEmpty()
        if (body != null && edges.isEmpty()) item { Text("Nessun arco archiviato per questa identità.", color = Muted) }
        items(edges) { edge ->
            GgCard {
                Text("${edge.optString("child_name")} ← ${edge.optString("parent_name").ifBlank { "sconosciuto" }}", color = Paper)
                Text("${edge.optString("relationship_type")} · confidenza ${edge.opt("confidence")}", color = Chlorophyll)
                Text(edge.optString("note"), color = Muted)
            }
        }
    }
}

@Composable
private fun CrossScreen(model: GgModel, onSaved: (String) -> Unit) {
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("F1") }
    var population by remember { mutableStateOf("40") }
    var error by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Cross builder", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("I parent si risolvono sul server. Un nome ambiguo resta non fuso e la predizione può uscire OUT_OF_DISTRIBUTION.", color = Muted)
        ParentField("Parent A", a, { a = it }, model)
        ParentField("Parent B", b, { b = it }, model)
        Text("Tipo genealogico", color = Muted)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("F1", "F2", "F3_PLUS", "S1", "BC1", "SSD", "AUTHOR_G_LABEL").forEach { item ->
                FilterChip(selected = type == item, onClick = { type = item }, label = { Text(item) })
            }
        }
        OutlinedTextField(
            population,
            { population = it.filter { ch -> ch.isDigit() }.take(5) },
            label = { Text("Popolazione N") },
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        Button(
            onClick = { pending = true; error = null; report = null },
            enabled = !pending && a.trim().length >= 2 && b.trim().length >= 2,
            colors = primaryButton(),
        ) { Text(if (pending) "Invio…" else "Calcola sul server") }
        error?.let { Text(it, color = Antho) }
        report?.let { Text(it, color = Paper) }
        Text("Il backend resta l'unica fonte del rapporto. Nessun calcolo sul telefono. Salvare l'incrocio richiede l'account.", color = Muted)
        Spacer(Modifier.height(12.dp))
    }
    LaunchedEffect(pending) {
        if (!pending) return@LaunchedEffect
        val result = runCatching {
            withContext(Dispatchers.IO) {
                model.api().predict(a.trim(), b.trim())
            }
        }
        pending = false
        result.onSuccess { json ->
            val probability = if (json.isNull("prediction_probability")) "null" else json.opt("prediction_probability").toString()
            val traits = json.optJSONArray("traits")?.objects().orEmpty().take(4).joinToString("\n") { trait ->
                "${trait.optString("compound")} ${trait.optString("status")} ${if (trait.isNull("central_estimate")) "senza stima" else trait.opt("central_estimate").toString()}"
            }
            error = null
            report = listOf(
                json.optString("human_report").ifBlank { json.optString("reply") },
                "Identità ${json.optString("identity_status")} · dati ${json.optString("data_status")}",
                "Probabilità $probability · non è una calibrazione",
                traits,
            ).filter { it.isNotBlank() }.joinToString("\n\n")
        }.onFailure { error = it.message }
    }
}

@Composable
private fun ParentField(label: String, value: String, onValue: (String) -> Unit, model: GgModel) {
    var hits by remember { mutableStateOf(emptyList<JSONObject>()) }
    var generation by remember { mutableIntStateOf(0) }
    var note by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value, onValue, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), colors = fieldColors(), singleLine = true)
        OutlinedButton(onClick = { generation += 1 }, enabled = value.trim().length >= 2) { Text("Risolvi dal catalogo") }
        note?.let { Text(it, color = Muted) }
        hits.take(4).forEach { row ->
            Card(
                onClick = {
                    onValue(row.optString("canonical_name"))
                    note = "Selezionato ${row.optString("id")} · ${row.optString("identity_status")} · ${row.optString("match_kind")}"
                    hits = emptyList()
                },
                colors = cardColors(),
            ) {
                Text(
                    "${row.optString("canonical_name")} · ${row.optString("match_kind")}",
                    color = Paper,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
    LaunchedEffect(generation) {
        if (generation == 0) return@LaunchedEffect
        note = null
        runCatching { withContext(Dispatchers.IO) { model.api().search(value) } }
            .onSuccess {
                hits = it.optJSONArray("results")?.objects().orEmpty()
                if (hits.isEmpty()) note = "Nessuna identità risolta. Il nome partirà comunque, marcato dal server."
            }
            .onFailure { note = it.message }
    }
}

@Composable
private fun ReportScreen(model: GgModel, id: String) {
    var body by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    var trait by remember { mutableStateOf("flowering") }
    var message by remember { mutableStateOf<String?>(null) }
    var send by remember { mutableIntStateOf(0) }
    LaunchedEffect(id) {
        runCatching { withContext(Dispatchers.IO) { model.api().prediction(id) } }
            .onSuccess { body = it }
            .onFailure { error = it.message }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Eyebrow("Predizione immutabile")
            Text(id.take(8), color = Muted)
        }
        error?.let { item { Text(it, color = Antho) } }
        body?.let { json ->
            item {
                Text(json.optString("status"), color = Antho, fontWeight = FontWeight.Medium)
                Text(
                    "Modello ${json.optString("model_version")} · snapshot ${json.optString("knowledge_snapshot")} · cache ${json.optString("cache_status")}",
                    color = Muted,
                )
            }
            val pedigree = json.optJSONObject("pedigree_confidence")
            if (pedigree != null) {
                item {
                    GgCard {
                        Text("Confidenza di pedigree", color = Muted)
                        Text(if (pedigree.isNull("value")) "non calcolata" else pedigree.opt("value").toString(), color = Paper)
                        Text(pedigree.optString("formula"), color = Paper)
                    }
                }
            }
            val chemo = json.optJSONObject("chemotype")
            if (chemo != null) {
                item {
                    GgCard {
                        Text("Chemotype ${chemo.optString("percentage_status")}", color = Chlorophyll)
                        Text(chemo.optString("reason"), color = Paper)
                    }
                }
            }
            val pigment = json.optJSONObject("pigmentation")
            if (pigment != null) {
                item { Text(pigment.optString("statement"), color = Paper) }
            }
            val stability = json.optJSONObject("stability")
            if (stability != null) {
                item {
                    Text(
                        "La generazione implica stabilità: ${if (stability.optBoolean("generation_implies_stability")) "sì" else "no"}. ${stability.optString("observed_stability_evidence")}",
                        color = Paper,
                    )
                }
            }
            item { Text(json.optString("human_report"), color = Paper, fontFamily = FontFamily.Serif) }
            item {
                Text(
                    "Probabilità ${if (json.isNull("prediction_probability")) "null" else json.opt("prediction_probability").toString()} · stato ${json.optString("status")}",
                    color = Muted,
                )
            }
            val limits = json.optJSONArray("limitations")?.strings().orEmpty()
            items(limits) { line -> Text("· $line", color = Muted) }
        }
        item { Text("Osservazione successiva", color = Chlorophyll) }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("flowering", "pigmentation", "architecture").forEach { item ->
                    FilterChip(selected = trait == item, onClick = { trait = item }, label = { Text(item) })
                }
            }
        }
        item {
            OutlinedTextField(note, { note = it }, label = { Text("Cosa hai osservato") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
        }
        item { Button(onClick = { send += 1 }, enabled = note.isNotBlank(), colors = primaryButton()) { Text("Allega esito") } }
        message?.let { item { Text(it, color = Chlorophyll) } }
    }
    LaunchedEffect(send) {
        if (send == 0) return@LaunchedEffect
        message = runCatching {
            withContext(Dispatchers.IO) { model.api().observation(id, trait, note).optString("id", "registrata") }
        }.fold(onSuccess = { "Osservazione $it. La predizione storica non è stata riscritta." }, onFailure = { it.message })
    }
}

@Composable
private fun HistoryScreen(model: GgModel, onOpen: (String) -> Unit) {
    var rows by remember { mutableStateOf(emptyList<JSONObject>()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { model.api().predictions() } }
            .onSuccess { rows = it.optJSONArray("predictions")?.objects().orEmpty() }
            .onFailure { error = if (it is ApiException && it.status == 401) "Accedi per vedere gli incroci salvati. La chat non richiede un account." else it.message }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("Archivio", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
            Text("Solo i Cross Record di questo account.", color = Muted)
        }
        error?.let { item { Text(it, color = Antho) } }
        if (error == null && rows.isEmpty()) item { Text("Nessuna predizione salvata.", color = Muted) }
        items(rows) { row ->
            Card(onClick = { onOpen(row.optString("id")) }, colors = cardColors(), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(row.optString("parents"), color = Paper)
                    Text("${row.optString("status")} · ${row.optString("created_at")}", color = Muted)
                }
            }
        }
    }
}

@Composable
private fun MoreScreen(
    model: GgModel,
    onPatterns: () -> Unit,
    onEvidence: () -> Unit,
    onKnowledge: () -> Unit,
    onPrivacy: () -> Unit,
    onSubscription: () -> Unit,
    onReport: () -> Unit,
    onHelp: () -> Unit,
) {
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sistema", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        SyncLine(model)
        Button(onClick = onPatterns, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Pattern explorer") }
        Button(onClick = onEvidence, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Evidenze e fonti") }
        Button(onClick = onKnowledge, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Stato della conoscenza") }
        Button(onClick = onPrivacy, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Account e privacy") }
        Button(onClick = onSubscription, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Abbonamento") }
        Button(onClick = onReport, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Segnala contenuto") }
        Button(onClick = onHelp, modifier = Modifier.fillMaxWidth(), colors = primaryButton()) { Text("Informazioni") }
    }
}

@Composable
private fun PatternScreen(model: GgModel) {
    var rows by remember { mutableStateOf(emptyList<JSONObject>()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { model.api().patterns() } }
            .onSuccess { rows = it.optJSONArray("patterns")?.objects().orEmpty() }
            .onFailure { error = it.message }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Pattern", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif) }
        error?.let { item { Text(it, color = Antho) } }
        items(rows) { row ->
            GgCard {
                Text("${row.optString("pattern_type")} · ${row.optString("validation_status")}", color = Chlorophyll)
                Text(row.optString("hypothesis"), color = Paper)
                Text(row.optString("transferability"), color = Muted)
            }
        }
    }
}

@Composable
private fun EvidenceScreen(model: GgModel) {
    var query by remember { mutableStateOf("") }
    var generation by remember { mutableIntStateOf(0) }
    var rows by remember { mutableStateOf(emptyList<JSONObject>()) }
    var note by remember { mutableStateOf("Scrivi un nome. Il corpus non si scarica tutto.") }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Evidenze", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("Claim riportati per quel nome. Non sono misure di laboratorio.", color = Muted)
        OutlinedTextField(query, { query = it }, label = { Text("Nome") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors(), singleLine = true)
        Button(onClick = { generation += 1 }, enabled = query.trim().length >= 2, colors = primaryButton()) { Text("Cerca") }
        error?.let { Text(it, color = Antho) }
        Text(note, color = Muted)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
            items(rows) { row ->
                GgCard {
                    Text(row.optString("claim_text").ifBlank { "${row.optString("field")}: ${row.optString("value")}" }, color = Paper)
                    Text("${row.optString("claim_class").ifBlank { row.optString("source_type") }} · ${row.optString("measurement_kind")}", color = Chlorophyll)
                }
            }
        }
    }
    LaunchedEffect(generation) {
        if (generation == 0) return@LaunchedEffect
        error = null
        runCatching { withContext(Dispatchers.IO) { model.api().evidence(query.trim()) } }
            .onSuccess {
                rows = it.optJSONArray("claims")?.objects().orEmpty().ifEmpty { it.optJSONArray("sources")?.objects().orEmpty() }
                note = it.optString("note").ifBlank { if (rows.isEmpty()) "Nessun claim per questo nome." else "${rows.size} claim. Non sono misure." }
            }
            .onFailure { error = it.message; rows = emptyList() }
    }
}

@Composable
private fun KnowledgeScreen(model: GgModel) {
    var body by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { model.api().knowledge() } }
            .onSuccess {
                body = it
                model.rememberSync(it.optString("snapshot_id"), it.optString("model_version"))
            }
            .onFailure { error = it.message }
    }
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Conoscenza", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        error?.let { Text(it, color = Antho) }
        body?.let {
            Stat("Modello", "${it.optString("model_id")} ${it.optString("model_version")}")
            Stat("Snapshot", it.optString("snapshot_id"))
            Stat("Motore", it.optString("engine_version"))
            Stat("Embedding", it.optString("embedding_model"))
            Stat("Vettori", it.optString("vector_backend"))
            Stat("Redis", it.optString("redis"))
            Text(it.optString("vector_backend_note"), color = Muted)
            PredictionGateLine(model)
            SyncLine(model)
        }
    }
}

@Composable
private fun PrivacyScreen(model: GgModel, onSignedOut: () -> Unit) {
    var message by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var action by remember { mutableIntStateOf(0) }
    var kind by remember { mutableStateOf("") }
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Account e privacy", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text(model.email.ifBlank { "Account sul server" }, color = Chlorophyll)
        Text("L'esportazione e la cancellazione chiamano il backend. La memoria scientifica condivisa non contiene l'identità.", color = Muted)
        Button(onClick = { kind = "export"; action += 1 }, colors = primaryButton()) { Text("Esporta i dati privati") }
        if (!confirmDelete) {
            OutlinedButton(onClick = { confirmDelete = true }) { Text("Cancella i dati privati") }
        } else {
            Text("Confermi la cancellazione di incroci, predizioni e osservazioni di questo account?", color = Antho)
            Button(onClick = { kind = "delete"; action += 1 }, colors = ButtonDefaults.buttonColors(containerColor = Antho, contentColor = Ink)) {
                Text("Conferma cancellazione")
            }
        }
        OutlinedButton(onClick = onSignedOut) { Text("Esci da questo telefono") }
        message?.let { Text(it, color = Paper) }
    }
    LaunchedEffect(action) {
        if (action == 0) return@LaunchedEffect
        message = when (kind) {
            "export" -> runCatching { withContext(Dispatchers.IO) { model.api().exportAccount().toString(2) } }.getOrElse { it.message }
            "delete" -> runCatching {
                withContext(Dispatchers.IO) { model.api().deleteAccount() }
                "Dati privati cancellati sul server. Lo snapshot scientifico condiviso è rimasto."
            }.getOrElse { it.message }
            else -> message
        }
    }
}

@Composable
private fun PredictionGateLine(model: GgModel) {
    var line by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        line = runCatching {
            withContext(Dispatchers.IO) { model.api().targets() }
        }.fold(
            onSuccess = { json ->
                val ready = json.optInt("targets_production_ready")
                val total = json.optInt("target_count")
                "Target $total · pronti per produzione $ready · una predizione senza calibrazione resta non calcolabile"
            },
            onFailure = { it.message },
        )
    }
    line?.let { Text(it, color = Muted) }
}

@Composable
private fun SubscriptionScreen(model: GgModel) {
    var line by remember { mutableStateOf("Livello FREE. Nessun acquisto è attivo.") }
    LaunchedEffect(Unit) {
        line = runCatching { withContext(Dispatchers.IO) { model.api().entitlements() } }.fold(
            onSuccess = { json ->
                val count = if (json.has("count")) json.getInt("count").toString() else "NOT_IN_RESPONSE"
                val granted = if (json.has("granted_count")) json.getInt("granted_count").toString() else "NOT_IN_RESPONSE"
                "Livello ${json.optString("tier", "FREE")}. Meccanismi $count, concessi $granted. Play: ${json.optString("play_billing", "NOT_LINKED")}. Prezzi non scelti."
            },
            onFailure = { "Server G&G non disponibile. Riprova." },
        )
    }
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Abbonamento", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text(line, color = Paper)
        Text("I prezzi non sono ancora in vendita. Un abbonamento, quando esisterà, si pagherà solo con Google Play e non sbloccherà una certezza scientifica.", color = Muted)
        Text("Gratis: lettura di base. Premium e Pro restano chiusi finché l'acquisto non è verificato dal server.", color = Muted)
    }
}

@Composable
private fun AiReportScreen(model: GgModel) {
    var detail by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("scientifically_unsupported") }
    var message by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf(false) }
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Segnala contenuto", color = Paper, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("Puoi segnalare un testo o un'immagine generati dal sistema, senza uscire dall'app.", color = Muted)
        listOf(
            "incorrect" to "Errato",
            "offensive" to "Offensivo",
            "unsafe" to "Non sicuro",
            "misleading" to "Ingannevole",
            "scientifically_unsupported" to "Non supportato",
            "privacy" to "Privacy",
            "image" to "Immagine",
        ).forEach { (value, label) ->
            FilterChip(selected = kind == value, onClick = { kind = value }, label = { Text(label) })
        }
        OutlinedTextField(detail, { detail = it }, label = { Text("Descrizione") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
        Button(
            onClick = { pending = true },
            enabled = !pending && model.token.isNotBlank() && detail.trim().length >= 3,
            colors = primaryButton(),
        ) { Text(if (model.token.isBlank()) "Accedi per segnalare" else "Invia segnalazione") }
        message?.let { Text(it, color = Paper) }
    }
    LaunchedEffect(pending) {
        if (!pending) return@LaunchedEffect
        message = runCatching { withContext(Dispatchers.IO) { model.api().reportContent(kind, detail.trim(), "") } }.fold(
            onSuccess = { if (it.optBoolean("stored")) "Segnalazione registrata." else "Segnalazione non registrata: ${it.optString("status")}" },
            onFailure = { error ->
                if (error is ApiException && (error.status == 401 || error.status == 403)) "Sessione scaduta. Accedi nuovamente."
                else "Server G&G non disponibile. Riprova."
            },
        )
        pending = false
    }
}

@Composable
private fun HelpScreen() {
    Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("GREED & GROSS", color = Chlorophyll, style = MaterialTheme.typography.headlineSmall, fontFamily = FontFamily.Serif)
        Text("Archivio e analisi di genetica, pedigree, evidenze e modelli. Non è un negozio e non dà istruzioni di coltivazione.", color = Paper)
        Text("Una mediana chimica non è una probabilità. Se il calcolo non è possibile, il risultato resta non calcolabile.", color = Muted)
        Text("Le immagini, quando il server le produce, sono visualizzazioni. Non sono fotografie della progenie.", color = Muted)
    }
}

private fun t(italian: String, english: String): String =
    if (java.util.Locale.getDefault().language == "en") english else italian

@Composable
private fun Eyebrow(text: String) {
    Text(text.uppercase(), color = Chlorophyll, style = MaterialTheme.typography.labelMedium)
}

@Composable
private fun SyncLine(model: GgModel) {
    val whenText = if (model.lastSync == 0L) {
        "mai"
    } else {
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(model.lastSync))
    }
    Text(
        "Ultima sincronizzazione $whenText · modello ${model.modelVersion.ifBlank { "—" }} · snapshot ${model.snapshot.ifBlank { "—" }}",
        color = Muted,
    )
}

@Composable
private fun Stat(label: String, value: String) {
    GgCard {
        Text(label, color = Muted)
        Text(value, color = Paper, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun GgCard(content: @Composable () -> Unit) {
    Card(colors = cardColors(), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { content() }
    }
}

@Composable
private fun primaryButton() = ButtonDefaults.buttonColors(containerColor = Chlorophyll, contentColor = Ink)

@Composable
private fun cardColors() = CardDefaults.cardColors(containerColor = SurfaceInk, contentColor = Paper)

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Paper,
    unfocusedTextColor = Paper,
    focusedBorderColor = Chlorophyll,
    unfocusedBorderColor = Line,
    focusedLabelColor = Chlorophyll,
    unfocusedLabelColor = Muted,
    cursorColor = Chlorophyll,
)

private fun JSONArray.join(): String = List(length()) { optString(it) }.filter { it.isNotBlank() }.joinToString(", ")

private fun JSONArray.strings(): List<String> = List(length()) { optString(it) }.filter { it.isNotBlank() }
