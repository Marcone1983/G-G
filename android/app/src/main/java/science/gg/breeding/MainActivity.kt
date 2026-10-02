package science.gg.breeding

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import science.gg.breeding.ui.GgApp

class MainActivity : ComponentActivity() {
    private var googleToken by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        googleToken = tokenFrom(intent)
        setContent { GgApp(googleToken = googleToken) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        googleToken = tokenFrom(intent)
    }

    private fun tokenFrom(intent: Intent?): String? {
        val data = intent?.data ?: return null
        if (data.scheme != "science.gg.breeding" || data.host != "auth") return null
        return data.getQueryParameter("token")?.trim()?.ifBlank { null }
    }
}
