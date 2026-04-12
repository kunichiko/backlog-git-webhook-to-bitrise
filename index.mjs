// index.mjs (Node.js 18/20)
// Handler: index.handler

function safeTruncate(s, max = 8000) {
  if (typeof s !== "string") return s;
  return s.length > max ? s.slice(0, max) + `...(truncated ${s.length - max} chars)` : s;
}

function dumpEvent(event) {
  // eventは大きいので bodyだけは切り詰めてログ
  const cloned = {
    ...event,
    body: event?.body ? safeTruncate(event.body, 12000) : event?.body,
  };
  console.log("[EVENT]", JSON.stringify(cloned));
}

function parseBacklogPayload(event) {
  const headers = event?.headers ?? {};
  const contentType = (headers["content-type"] || headers["Content-Type"] || "").toLowerCase();

  const rawBody = event?.body
    ? (event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body)
    : "";

  console.log("[REQ] content-type:", contentType);
  console.log("[REQ] rawBody head:", safeTruncate(rawBody, 2000));

  if (!rawBody) return {};

  // 1) JSONとして来るパターン
  if (contentType.includes("application/json") || rawBody.trim().startsWith("{")) {
    const parsed = JSON.parse(rawBody);
    // { payload: "..." } も想定
    if (typeof parsed?.payload === "string") return JSON.parse(parsed.payload);
    return parsed?.payload ?? parsed;
  }

  // 2) application/x-www-form-urlencoded で payload=... が来るパターン
  // 例: payload=%7B%22before%22%3A...%7D
  // 例: payload={"before":"..."}
  if (contentType.includes("application/x-www-form-urlencoded") || rawBody.includes("payload=")) {
    const params = new URLSearchParams(rawBody);
    const payloadVal = params.get("payload");
    if (!payloadVal) throw new Error("form body has no payload=");

    // URLSearchParamsはデコード済み文字列を返す
    // payloadVal が JSON文字列そのもののはず
    return JSON.parse(payloadVal);
  }

  // 3) それ以外：最後の手段として payload= を探す
  const m = rawBody.match(/(?:^|&)payload=([^&]+)/);
  if (m) {
    const decoded = decodeURIComponent(m[1].replace(/\+/g, "%20"));
    return JSON.parse(decoded);
  }

  throw new Error(`unsupported content-type/body format: ${contentType}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BITRISE_HOST = "hooks.bitrise.io";
const BITRISE_PREFIX = "/h/github/";
const PROXY_RE = /^[0-9a-fA-F-]{36}\/[A-Za-z0-9_\-]{10,200}$/;

function toGithubLikePush(backlog) {
  const revisions = Array.isArray(backlog?.revisions) ? backlog.revisions : [];
  const commits = revisions.map((r) => ({
    id: r?.id,
    message: r?.message,
    timestamp: r?.timestamp,
    url: r?.url,
    added: r?.added ?? [],
    removed: r?.removed ?? [],
    modified: r?.modified ?? [],
    author: { name: r?.author?.name, email: r?.author?.email },
    committer: { name: r?.author?.name, email: r?.author?.email },
  }));
  const headCommit = commits.find((c) => c.id === backlog?.after) ?? commits[0] ?? null;

  return {
    ref: backlog?.ref,
    before: backlog?.before,
    after: backlog?.after,
    commits,
    head_commit: headCommit,
    repository: {
      name: backlog?.repository?.name,
      full_name: backlog?.repository?.name,
      html_url: backlog?.repository?.url,
      url: backlog?.repository?.url,
      description: backlog?.repository?.description,
      private: true,
    },
  };
}

export const handler = async (event) => {
  // ★リクエスト全体をログ（bodyは切り詰め）
  dumpEvent(event);

  const EXPECTED_SECRET = process.env.URL_RANDOM;

  const secret = event?.pathParameters?.secret;
  const proxy = event?.pathParameters?.proxy;

  if (!EXPECTED_SECRET) {
    console.log("[ERR] URL_RANDOM env is not set");
    return { statusCode: 500, body: "URL_RANDOM env is not set" };
  }
  if (!secret || secret !== EXPECTED_SECRET) {
    console.log("[DENY] secret mismatch");
    return { statusCode: 403, body: "forbidden" };
  }
  if (!proxy || !PROXY_RE.test(proxy)) {
    console.log("[DENY] bad proxy path:", proxy);
    return { statusCode: 400, body: "bad proxy path" };
  }

  let backlogPayload;
  try {
    backlogPayload = parseBacklogPayload(event);
  } catch (e) {
    console.log("[ERR] invalid payload:", String(e));
    return { statusCode: 400, body: `invalid payload: ${String(e)}` };
  }

  const ref = backlogPayload?.ref ?? "";
  console.log("[BACKLOG] ref:", ref);
  console.log("[BACKLOG] repo:", backlogPayload?.repository?.name, backlogPayload?.repository?.url);
  console.log("[BACKLOG] revisions:", Array.isArray(backlogPayload?.revisions) ? backlogPayload.revisions.length : 0);

  if (!ref.startsWith("refs/heads/")) {
    console.log("[SKIP] not a branch push, ignoring:", ref);
    return { statusCode: 200, body: "skipped: not a branch push" };
  }

  const delaySec = Number(process.env.DELAY_SECONDS || "0");
  if (delaySec > 0) {
    console.log(`[DELAY] waiting ${delaySec}s before forwarding to Bitrise...`);
    await sleep(delaySec * 1000);
  }

  const githubLike = toGithubLikePush(backlogPayload);
  const bodyStr = JSON.stringify(githubLike);
  const url = `https://${BITRISE_HOST}${BITRISE_PREFIX}${proxy}`;

  console.log("[BITRISE] POST:", url);
  console.log("[BITRISE] payload bytes:", bodyStr.length);
  console.log("[BITRISE] payload head:", safeTruncate(bodyStr, 2000));

  let resp;
  let text = "";
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "user-agent": "backlog-webhook-proxy/1.0",
      },
      body: bodyStr,
    });
    text = await resp.text();
  } catch (e) {
    console.log("[ERR] fetch failed:", String(e));
    return { statusCode: 502, body: `bitrise fetch failed: ${String(e)}` };
  }

  console.log("[BITRISE] status:", resp.status);
  console.log("[BITRISE] resp body head:", safeTruncate(text, 2000));

  if (!resp.ok) {
    return { statusCode: 502, body: `bitrise hook error: ${resp.status} ${text}` };
  }

  return { statusCode: 200, body: "ok" };
};