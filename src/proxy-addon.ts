/**
 * mitmproxy addon used by `cpr run <A> --inference <B>`. It touches only
 * POST /v1/messages* on api.anthropic.com; everything else passes through.
 */
export const PROXY_ADDON_PY = String.raw`import json
import os
import time

from mitmproxy import http

with open(os.environ["CPR_PROXY_CONFIG"], encoding="utf-8") as f:
    CFG = json.load(f)


def _error(status, error_type, message, details=None):
    err = {"type": error_type, "message": message}
    if details:
        err["details"] = details
    return http.Response.make(
        status,
        json.dumps({"type": "error", "error": err}),
        {"content-type": "application/json"},
    )


def _map_model(model):
    if CFG.get("forceModel"):
        return CFG["forceModel"]
    model = str(model or "").split("[")[0]
    if "/" in model:
        return model
    tiers = CFG.get("tiers") or {}
    lowered = model.lower()
    for tier in ("opus", "sonnet", "haiku"):
        if tier in lowered and tiers.get(tier):
            return tiers[tier]
    return model


def _oauth_token():
    try:
        with open(CFG["credentialsFile"], encoding="utf-8") as f:
            oauth = json.load(f)["claudeAiOauth"]
    except Exception:
        return None, "no login found for the inference account; run cpr run <account> once and /login"
    if oauth.get("expiresAt") and oauth["expiresAt"] < time.time() * 1000:
        return None, "the inference account's token expired; run cpr run <account> once to refresh it"
    return oauth["accessToken"], None


def request(flow: http.HTTPFlow) -> None:
    r = flow.request
    # Only the model call; count_tokens, OAuth and Remote Control stay with Anthropic.
    if r.method != "POST" or r.pretty_host != "api.anthropic.com" or r.path.split("?")[0] != "/v1/messages":
        return

    body = None
    try:
        body = json.loads(r.get_text())
    except Exception:
        pass

    # A claude.ai login sends stateful "thread" turns that only the issuing account can serve.
    # Refusing makes Claude Code resend the full history statelessly.
    if isinstance(body, dict) and "thread" in body:
        flow.response = _error(
            400,
            "invalid_request_error",
            "thread continuation is not supported through the split proxy",
            {"error_code": "thread_unsupported_request"},
        )
        return

    if isinstance(body, dict) and "model" in body:
        body["model"] = _map_model(body["model"])
        r.set_text(json.dumps(body))

    if CFG["mode"] == "oauth":
        token, problem = _oauth_token()
        if problem:
            flow.response = _error(401, "authentication_error", problem)
            return
        r.headers["authorization"] = "Bearer " + token
        flow.metadata["cpr_routed"] = True
        return

    r.scheme = CFG["scheme"]
    r.host = CFG["host"]
    r.port = CFG["port"]
    r.headers["host"] = CFG["host"]
    r.path = CFG.get("basePath", "") + r.path
    # The claude.ai OAuth token must never leave for the gateway.
    r.headers.pop("x-api-key", None)
    r.headers["authorization"] = "Bearer " + CFG["token"]
    flow.metadata["cpr_routed"] = True
    betas = r.headers.get("anthropic-beta")
    if betas:
        kept = [b for b in betas.split(",") if not b.strip().startswith("oauth-")]
        if kept:
            r.headers["anthropic-beta"] = ",".join(kept)
        else:
            del r.headers["anthropic-beta"]


def responseheaders(flow: http.HTTPFlow) -> None:
    # Stream SSE straight through; buffering looks like a hang to Claude Code.
    if flow.response is None:
        return
    if flow.metadata.get("cpr_routed") or "text/event-stream" in flow.response.headers.get("content-type", ""):
        flow.response.stream = True
`;
