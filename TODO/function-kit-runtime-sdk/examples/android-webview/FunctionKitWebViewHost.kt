package ime.functionkit.runtime.android

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Message
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import java.util.UUID

private const val PROTOCOL_VERSION = "1.0.0"
private const val DEFAULT_LOCAL_DOMAIN = "function-kit.local"
private const val DEFAULT_ASSET_PATH_PREFIX = "/assets/"
private const val DEFAULT_BRIDGE_NAME = "AndroidFunctionKitHost"
private const val DEFAULT_CONTENT_SECURITY_POLICY =
    "default-src 'self'; " +
        "base-uri 'none'; " +
        "object-src 'none'; " +
        "frame-src 'none'; " +
        "form-action 'none'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' https: 'unsafe-inline'; " +
        "img-src 'self' https: data: blob:; " +
        "media-src 'self' https: data: blob:; " +
        "font-src 'self' https: data:;"

private val ALLOWED_SURFACES = setOf("inline", "panel", "editor")
private val ALLOWED_INBOUND_TYPES =
    setOf(
        "bridge.ready",
        "context.request",
        "candidate.insert",
        "candidate.replace",
        "candidates.regenerate",
        "network.fetch",
        "ai.request",
        "ai.agent.list",
        "ai.agent.run",
        "composer.open",
        "composer.focus",
        "composer.update",
        "composer.close",
        "settings.open",
        "storage.get",
        "storage.set",
        "panel.state.update"
    )

class FunctionKitWebViewHost(
    private val webView: WebView,
    private val assetLoader: WebViewAssetLoader,
    private val onUiEnvelope: (JSONObject) -> Unit,
    private val onHostEvent: (String) -> Unit = {},
    private val config: Config = Config()
) {
    data class Config(
        val localDomain: String = DEFAULT_LOCAL_DOMAIN,
        val assetPathPrefix: String = DEFAULT_ASSET_PATH_PREFIX,
        val bridgeName: String = DEFAULT_BRIDGE_NAME,
        val expectedKitId: String? = null,
        val expectedSurface: String? = "panel",
        val enableDevTools: Boolean = false,
        val allowExternalResources: Boolean = true,
        val contentSecurityPolicy: String? = DEFAULT_CONTENT_SECURITY_POLICY
    ) {
        val normalizedAssetPathPrefix: String =
            assetPathPrefix
                .trim()
                .let { if (it.startsWith("/")) it else "/$it" }
                .let { if (it.endsWith("/")) it else "$it/" }

        val localOrigin: String = "https://$localDomain"
    }

    private var bridgeInstalled = false

    companion object {
        fun createDefaultAssetLoader(
            context: Context,
            config: Config = Config()
        ): WebViewAssetLoader =
            WebViewAssetLoader.Builder()
                .setDomain(config.localDomain)
                .addPathHandler(
                    config.normalizedAssetPathPrefix,
                    WebViewAssetLoader.AssetsPathHandler(context)
                )
                .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun initialize(entryRelativePath: String) {
        requireFeature(WebViewFeature.WEB_MESSAGE_LISTENER)
        requireFeature(WebViewFeature.POST_WEB_MESSAGE)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.mediaPlaybackRequiresUserGesture = true
        settings.setSupportMultipleWindows(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = true
        }

        CookieManager.getInstance().setAcceptCookie(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        }

        webView.removeJavascriptInterface("searchBoxJavaBridge_")
        webView.removeJavascriptInterface("accessibility")
        webView.removeJavascriptInterface("accessibilityTraversal")
        webView.isLongClickable = false
        webView.setDownloadListener { url, _, _, _, _ ->
            onHostEvent("Blocked download request: $url")
        }
        webView.webChromeClient =
            object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    request.deny()
                    onHostEvent(
                        "Denied WebView permission request: ${request.resources.joinToString()}"
                    )
                }

                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message?
                ): Boolean = false
            }
        webView.webViewClient =
            object : WebViewClientCompat() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url
                    if (isAllowedLocalUri(uri)) {
                        return false
                    }

                    val safeUri = uri ?: return true
                    val scheme = safeUri.scheme?.lowercase()
                    if (request?.isForMainFrame == true && (scheme == "http" || scheme == "https")) {
                        runCatching {
                            view?.context?.startActivity(
                                Intent(Intent.ACTION_VIEW, safeUri)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            )
                        }.onSuccess {
                            onHostEvent("Opened external link: $safeUri")
                        }.onFailure { error ->
                            onHostEvent("Failed to open external link: $safeUri error=${error.message}")
                        }
                        return true
                    }

                    onHostEvent("Blocked navigation: $safeUri")
                    return true
                }

                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val uri = request?.url
                        ?: return createTextResponse(
                            statusCode = 404,
                            reasonPhrase = "Not Found",
                            body = "missing-resource"
                        )
                    if (isAllowedLocalUri(uri)) {
                        return assetLoader.shouldInterceptRequest(uri)
                            ?.let { response -> applyHtmlSecurityHeaders(uri, response) }
                            ?: createTextResponse(
                                statusCode = 404,
                                reasonPhrase = "Not Found",
                                body = "missing-local-resource"
                            )
                    }
                    if (isAllowedOrigin(uri)) {
                        onHostEvent("Blocked local resource request: $uri")
                        return createTextResponse(
                            statusCode = 404,
                            reasonPhrase = "Not Found",
                            body = "missing-local-resource"
                        )
                    }
                    if (!config.allowExternalResources || request.isForMainFrame) {
                        onHostEvent("Blocked external resource request: $uri")
                        return createTextResponse(
                            statusCode = 403,
                            reasonPhrase = "Forbidden",
                            body = "blocked"
                        )
                    }

                    return null
                }
            }

        WebView.setWebContentsDebuggingEnabled(config.enableDevTools)
        installBridgeIfNeeded()
        webView.loadUrl(buildEntryUrl(entryRelativePath))
    }

    fun dispatchEnvelope(envelopeJson: String) {
        dispatchEnvelope(JSONObject(envelopeJson))
    }

    fun dispatchEnvelope(envelope: JSONObject) {
        val serializedEnvelope = envelope.toString()
        webView.post {
            WebViewCompat.postWebMessage(
                webView,
                WebMessageCompat(serializedEnvelope),
                Uri.parse(config.localOrigin)
            )
        }
    }

    fun dispatchReadyAck(
        replyTo: String?,
        kitId: String,
        surface: String,
        sessionId: String,
        grantedPermissions: List<String>
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "bridge.ready.ack",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload =
                    JSONObject()
                        .put("sessionId", sessionId)
                        .put("grantedPermissions", grantedPermissions)
                        .put(
                            "hostInfo",
                            JSONObject()
                                .put("platform", "android")
                                .put("runtime", "webview-asset-loader")
                        )
            )
        )
    }

    fun dispatchPermissionsSync(
        kitId: String,
        surface: String,
        grantedPermissions: List<String>
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "permissions.sync",
                replyTo = null,
                kitId = kitId,
                surface = surface,
                payload = JSONObject().put("grantedPermissions", grantedPermissions)
            )
        )
    }

    fun dispatchContextSync(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "context.sync",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchCandidatesRender(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "candidates.render",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchNetworkFetchResult(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "network.fetch.result",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchAiResponse(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "ai.response",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchAiAgentListResult(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "ai.agent.list.result",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchAiAgentRunResult(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "ai.agent.run.result",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchStorageSync(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "storage.sync",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchComposerStateSync(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "composer.state.sync",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchPanelStateAck(
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "panel.state.ack",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = payload
            )
        )
    }

    fun dispatchHostStateUpdate(
        kitId: String,
        surface: String,
        label: String,
        details: JSONObject = JSONObject()
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "host.state.update",
                replyTo = null,
                kitId = kitId,
                surface = surface,
                payload =
                    JSONObject()
                        .put("label", label)
                        .put("details", details)
            )
        )
    }

    fun dispatchPermissionDenied(
        replyTo: String?,
        kitId: String,
        surface: String,
        permission: String
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "permission.denied",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = JSONObject(),
                error =
                    JSONObject()
                        .put("code", "permission_denied")
                        .put("message", "Permission not granted: $permission")
                        .put("retryable", false)
                        .put("details", JSONObject().put("permission", permission))
            )
        )
    }

    fun dispatchBridgeError(
        replyTo: String?,
        kitId: String,
        surface: String,
        code: String,
        message: String,
        retryable: Boolean,
        details: JSONObject = JSONObject()
    ) {
        dispatchEnvelope(
            buildEnvelope(
                type = "bridge.error",
                replyTo = replyTo,
                kitId = kitId,
                surface = surface,
                payload = JSONObject(),
                error =
                    JSONObject()
                        .put("code", code)
                        .put("message", message)
                        .put("retryable", retryable)
                        .put("details", details)
            )
        )
    }

    private fun installBridgeIfNeeded() {
        if (bridgeInstalled) {
            return
        }

        WebViewCompat.addWebMessageListener(
            webView,
            config.bridgeName,
            setOf(config.localOrigin),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    if (!isMainFrame) {
                        onHostEvent("Dropped non-main-frame message from ${sourceOrigin}")
                        return
                    }

                    if (!isAllowedOrigin(sourceOrigin)) {
                        onHostEvent("Dropped message from unexpected origin: $sourceOrigin")
                        return
                    }

                    val rawEnvelope = message.data
                    if (rawEnvelope.isNullOrBlank()) {
                        onHostEvent("Dropped empty envelope from UI")
                        return
                    }

                    parseInboundEnvelope(rawEnvelope)?.let(onUiEnvelope)
                }
            }
        )

        bridgeInstalled = true
    }

    private fun buildEntryUrl(entryRelativePath: String): String {
        val normalizedEntryPath =
            entryRelativePath
                .replace("\\", "/")
                .trim('/')
                .also {
                    require(it.isNotEmpty()) { "entryRelativePath must not be blank" }
                    require(!it.split('/').any { segment -> segment.isBlank() || segment == ".." }) {
                        "entryRelativePath must stay inside the local asset root"
                    }
                }

        return "${config.localOrigin}${config.normalizedAssetPathPrefix}$normalizedEntryPath"
    }

    private fun buildEnvelope(
        type: String,
        replyTo: String?,
        kitId: String,
        surface: String,
        payload: JSONObject,
        error: JSONObject? = null
    ): JSONObject {
        val envelope =
            JSONObject()
                .put("version", PROTOCOL_VERSION)
                .put("messageId", "host-$type-${UUID.randomUUID()}")
                .put("timestamp", OffsetDateTime.now().toString())
                .put("kitId", kitId)
                .put("surface", surface)
                .put("source", "host-adapter")
                .put("target", "function-kit-ui")
                .put("type", type)
                .put("payload", payload)

        if (!replyTo.isNullOrBlank()) {
            envelope.put("replyTo", replyTo)
        }

        if (error != null) {
            envelope.put("error", error)
        }

        return envelope
    }

    private fun parseInboundEnvelope(rawEnvelope: String): JSONObject? =
        try {
            val envelope = JSONObject(rawEnvelope)

            if (envelope.optString("version") != PROTOCOL_VERSION) {
                onHostEvent("Dropped envelope with unsupported version")
                return null
            }

            if (envelope.optString("source") != "function-kit-ui") {
                onHostEvent("Dropped envelope with unexpected source")
                return null
            }

            val target = envelope.optString("target")
            if (target.isNotBlank() && target != "host-adapter") {
                onHostEvent("Dropped envelope with unexpected target")
                return null
            }

            if (envelope.optString("messageId").isBlank()) {
                onHostEvent("Dropped envelope without messageId")
                return null
            }

            if (envelope.optString("timestamp").isBlank()) {
                onHostEvent("Dropped envelope without timestamp")
                return null
            }

            val kitId = envelope.optString("kitId")
            if (kitId.isBlank()) {
                onHostEvent("Dropped envelope without kitId")
                return null
            }

            if (!config.expectedKitId.isNullOrBlank() && config.expectedKitId != kitId) {
                onHostEvent("Dropped envelope for unexpected kitId: $kitId")
                return null
            }

            val surface = envelope.optString("surface")
            if (surface !in ALLOWED_SURFACES) {
                onHostEvent("Dropped envelope with unsupported surface: $surface")
                return null
            }

            if (!config.expectedSurface.isNullOrBlank() && config.expectedSurface != surface) {
                onHostEvent("Dropped envelope for unexpected surface: $surface")
                return null
            }

            val type = envelope.optString("type")
            if (type !in ALLOWED_INBOUND_TYPES) {
                onHostEvent("Dropped envelope with unsupported type: $type")
                return null
            }

            if (envelope.opt("payload") !is JSONObject) {
                onHostEvent("Dropped envelope without object payload")
                return null
            }

            if (envelope.has("replyTo") && envelope.optString("replyTo").isBlank()) {
                onHostEvent("Dropped envelope with blank replyTo")
                return null
            }

            envelope
        } catch (error: Exception) {
            onHostEvent("Dropped malformed envelope: ${error.message}")
            null
        }

    private fun createTextResponse(
        statusCode: Int,
        reasonPhrase: String,
        body: String
    ): WebResourceResponse {
        val data = ByteArrayInputStream(body.toByteArray(StandardCharsets.UTF_8))
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return WebResourceResponse(
                "text/plain",
                StandardCharsets.UTF_8.name(),
                data
            )
        }

        return WebResourceResponse(
            "text/plain",
            StandardCharsets.UTF_8.name(),
            statusCode,
            reasonPhrase,
            mapOf("Cache-Control" to "no-store"),
            data
        )
    }

    private fun applyHtmlSecurityHeaders(
        uri: Uri,
        response: WebResourceResponse
    ): WebResourceResponse {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return response
        }
        val mimeType = response.mimeType?.trim()?.lowercase().orEmpty()
        val path = uri.encodedPath?.trim()?.lowercase().orEmpty()
        val isHtml =
            mimeType.contains("text/html") ||
                path.endsWith(".html") ||
                path.endsWith(".htm")
        if (!isHtml) {
            return response
        }

        val headers = LinkedHashMap<String, String>()
        response.responseHeaders?.let { existing -> headers.putAll(existing) }
        config.contentSecurityPolicy?.trim()?.takeIf { it.isNotBlank() }?.let { value ->
            headers["Content-Security-Policy"] = value
        }
        if (!headers.containsKey("Cache-Control")) {
            headers["Cache-Control"] = "no-store"
        }
        if (!headers.containsKey("X-Content-Type-Options")) {
            headers["X-Content-Type-Options"] = "nosniff"
        }
        response.responseHeaders = headers
        return response
    }

    private fun isAllowedLocalUri(uri: Uri?): Boolean {
        if (uri == null) {
            return false
        }

        if (uri.scheme != "https") {
            return false
        }

        if (!uri.host.equals(config.localDomain, ignoreCase = true)) {
            return false
        }

        return uri.encodedPath?.startsWith(config.normalizedAssetPathPrefix) == true
    }

    private fun isAllowedOrigin(uri: Uri?): Boolean {
        if (uri == null) {
            return false
        }

        if (uri.scheme != "https") {
            return false
        }

        return uri.host.equals(config.localDomain, ignoreCase = true)
    }

    private fun requireFeature(feature: String) {
        check(WebViewFeature.isFeatureSupported(feature)) {
            "Required WebView feature is missing: $feature"
        }
    }
}
