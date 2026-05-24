"""
YT Tracker — Flask backend
Serves the dashboard and proxies YouTube Data API v3 requests.
Data is persisted in Supabase (cloud Postgres).
"""

import os
import re
import time
import urllib.request
import threading
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from googleapiclient.discovery import build
from supabase import create_client, Client

load_dotenv()

API_KEY      = os.getenv("YOUTUBE_API_KEY", "")
DEBUG        = os.getenv("FLASK_DEBUG", "0") == "1"
MAX_CHANNELS = 20          # soft cap to protect API quota

# ── Thread-local storage for API clients ──────────────────────────────────────
_local = threading.local()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

def get_sb() -> Client:
    """Return a thread-local cached Supabase client, raising clearly if credentials are missing."""
    if not hasattr(_local, "sb"):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL / SUPABASE_SERVICE_KEY not set in .env")
        _local.sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _local.sb

def get_yt():
    """Build or return the thread-local cached YouTube API client to avoid re-discovery lag."""
    if not hasattr(_local, "yt"):
        if not API_KEY:
            raise ValueError("YOUTUBE_API_KEY is not set in .env")
        # static_discovery=False or reusing the client prevents the 1s 'cold start' lag
        _local.yt = build("youtube", "v3", developerKey=API_KEY)
    return _local.yt

app = Flask(__name__, static_folder="static")

# ── CORS configuration ────────────────────────────────────────────────────────
_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000,http://127.0.0.1:5000").split(",")
CORS(app, origins=[o.strip() for o in _origins if o.strip()])

@app.after_request
def fix_charset(response):
    """Ensure JS and CSS files are served with UTF-8 charset so emoji/unicode renders correctly."""
    ct = response.content_type or ''
    if ('javascript' in ct or 'css' in ct) and 'charset' not in ct:
        base = ct.split(';')[0].strip()
        response.content_type = f'{base}; charset=utf-8'
    return response


# Simple in-memory rate limiter: {ip: last_add_timestamp}
_last_add: dict[str, float] = {}
ADD_THROTTLE_SECS = 5   # minimum seconds between add requests per IP

# ── Server-side video caches ──────────────────────────────────────────────────
# Short cache for recent-videos endpoint (15 min)
_video_cache: dict[str, dict] = {}   # { channel_id: { "data": [...], "ts": float } }
VIDEO_CACHE_TTL = 15 * 60            # 15 minutes

# Long cache for full video list (4 hours)
_full_cache: dict[str, dict] = {}    # { channel_id: { "data": [...], "ts": float } }
FULL_CACHE_TTL = 4 * 60 * 60         # 4 hours

# Image proxy cache (1 hour) — stores raw bytes keyed by URL
_img_cache: dict[str, dict] = {}     # { url: { "data": bytes, "mime": str, "ts": float } }
IMG_CACHE_TTL = 60 * 60             # 1 hour

# Search suggestion cache (5 min) — keyed by lowercase query
_suggest_cache: dict[str, dict] = {}  # { q: { "data": [...], "ts": float } }
SUGGEST_CACHE_TTL = 5 * 60           # 5 minutes


# ─── Utilities ────────────────────────────────────────────────────────────────

def fmt(n) -> str:
    """Format an integer to a human-readable abbreviated string."""
    try:
        n = int(n)
        if n >= 1_000_000_000: return f"{n / 1e9:.2f}B"
        if n >= 1_000_000:     return f"{n / 1e6:.2f}M"
        if n >= 1_000:         return f"{n / 1e3:.1f}K"
        return str(n)
    except Exception:
        return "N/A"


def best_thumb(thumbnails: dict) -> str:
    """Return highest-quality available thumbnail URL."""
    for size in ("maxres", "standard", "high", "medium", "default"):
        url = thumbnails.get(size, {}).get("url", "")
        if url:
            return url
    return ""


def parse_duration(s: str) -> int:
    """Parse ISO 8601 duration string to total seconds. PT14M20S -> 860"""
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', s or '')
    if not m:
        return 0
    h, mn, sec = (int(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + sec


def fmt_duration(secs: int) -> str:
    """Format seconds to MM:SS or H:MM:SS string. 860 -> '14:20'"""
    if not secs:
        return ''
    h = secs // 3600
    m = (secs % 3600) // 60
    s = secs % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# ── Supabase persistence helpers ─────────────────────────────────────────────

def load_channels() -> list:
    """Load all tracked channels from Supabase, ordered by added_at."""
    try:
        sb = get_sb()
        r = sb.table("channels").select("*").order("added_at").execute()
        return r.data or []
    except Exception as exc:
        print(f"[Supabase] load_channels failed: {exc}")
        return []


def save_channels(channels: list) -> None:
    """
    Persist the full channel list to Supabase.
    Uses upsert so it is safe to call after add, delete, or set-primary.
    NOTE: callers that delete a channel should call delete_channel_db() directly.
    """
    # This is only called for bulk updates (refresh-all, set-primary bulk toggle).
    # Individual add/delete use targeted helpers below.
    sb = get_sb()
    if channels:
        sb.table("channels").upsert(channels, on_conflict="id").execute()


def add_channel_db(channel: dict) -> None:
    """Insert a single channel row into Supabase."""
    sb = get_sb()
    sb.table("channels").insert(channel).execute()


def update_channel_db(channel: dict) -> None:
    """Update an existing channel row in Supabase."""
    sb = get_sb()
    sb.table("channels").update(channel).eq("id", channel["id"]).execute()


def delete_channel_db(channel_id: str) -> None:
    """Delete a channel row from Supabase."""
    sb = get_sb()
    sb.table("channels").delete().eq("id", channel_id).execute()


def load_snapshots() -> dict:
    """
    Load all snapshot rows from Supabase and reshape into
    { channel_id: [ {date, subscribers, views}, ... ] }.
    """
    try:
        sb = get_sb()
        r = sb.table("snapshots").select("*").order("date").execute()
        result: dict = {}
        for row in (r.data or []):
            cid = row["channel_id"]
            result.setdefault(cid, []).append({
                "date":        row["date"],
                "subscribers": row["subscribers"],
                "views":       row["views"],
            })
        return result
    except Exception as exc:
        print(f"[Supabase] load_snapshots failed: {exc}")
        return {}


def save_snapshot(channel_id: str, subscribers: int, total_views: int) -> None:
    """Upsert today's snapshot for a channel into Supabase."""
    today = time.strftime("%Y-%m-%d", time.gmtime())
    sb = get_sb()
    sb.table("snapshots").upsert(
        {
            "channel_id":  channel_id,
            "date":        today,
            "subscribers": subscribers,
            "views":       total_views,
        },
        on_conflict="channel_id,date",
    ).execute()


def build_yt():
    """Wrapper to get the cached YouTube client."""
    return get_yt()


def api_error(message: str, code: int = 500):
    """Return a clean JSON error response without exposing internals."""
    return jsonify({"error": message}), code


# ─── Core fetch functions ─────────────────────────────────────────────────────

def fetch_full_channel(youtube, query=None, channel_id=None):
    """
    Fetch complete channel data including latest video.
    Pass either `query` (search by name) or `channel_id`.
    Returns (data_dict, error_string).
    """
    if not channel_id:
        sr = youtube.search().list(
            part="snippet", q=query, type="channel", maxResults=1
        ).execute()
        if not sr.get("items"):
            return None, "Channel not found"
        channel_id = sr["items"][0]["snippet"]["channelId"]

    cr = youtube.channels().list(
        part="snippet,statistics,contentDetails",
        id=channel_id,
    ).execute()
    if not cr.get("items"):
        return None, "Channel not found"

    ch      = cr["items"][0]
    snap    = ch["snippet"]
    stats   = ch["statistics"]
    content = ch["contentDetails"]

    subs  = int(stats.get("subscriberCount", 0))
    views = int(stats.get("viewCount", 0))
    vids  = int(stats.get("videoCount", 1))
    avg   = views // max(vids, 1)

    uploads_pid = content["relatedPlaylists"]["uploads"]

    # Latest video — fetch statistics + contentDetails in one call
    pl = youtube.playlistItems().list(
        part="snippet", playlistId=uploads_pid, maxResults=1
    ).execute()
    video = {}
    if pl.get("items"):
        ls     = pl["items"][0]["snippet"]
        vid_id = ls["resourceId"]["videoId"]
        vr     = youtube.videos().list(
            part="statistics,contentDetails", id=vid_id
        ).execute()
        vs  = vr["items"][0]["statistics"]    if vr.get("items") else {}
        cd  = vr["items"][0].get("contentDetails", {}) if vr.get("items") else {}
        dur = parse_duration(cd.get("duration", ""))
        video = {
            "id":            vid_id,
            "title":         ls.get("title", ""),
            "date":          ls.get("publishedAt", "")[:10],
            "published_at":  ls.get("publishedAt", ""),
            "url":           f"https://youtube.com/watch?v={vid_id}",
            "thumb":         best_thumb(ls.get("thumbnails", {})),
            "views":         fmt(vs.get("viewCount", 0)),
            "views_raw":     int(vs.get("viewCount", 0)),
            "view_count":    int(vs.get("viewCount", 0)),
            "likes":         fmt(vs.get("likeCount", 0)),
            "like_count":    int(vs.get("likeCount", 0)),
            "comments":      fmt(vs.get("commentCount", 0)),
            "comment_count": int(vs.get("commentCount", 0)),
            "duration_secs": dur,
            "duration":      fmt_duration(dur),
        }

    return {
        "id":               channel_id,
        "name":             snap.get("title", ""),
        "handle":           snap.get("customUrl", ""),
        "country":          snap.get("country", ""),
        "created":          snap.get("publishedAt", "")[:10],
        "description":      snap.get("description", "")[:300],
        "logo_url":         best_thumb(snap.get("thumbnails", {})),
        "subscribers":      fmt(subs),
        "subscribers_raw":  subs,
        "subscriber_count": subs,
        "total_views":      fmt(views),
        "total_views_raw":  views,
        "total_videos":     fmt(vids),
        "total_videos_raw": vids,
        "video_count":      vids,
        "avg_views":        fmt(avg),
        "avg_views_raw":    avg,
        "video":            video,
        "is_primary":       False,
    }, None


def fetch_recent_videos(youtube, channel_id: str, n: int = 6) -> list:
    """Return the last N uploaded videos with statistics and duration."""
    cr = youtube.channels().list(part="contentDetails", id=channel_id).execute()
    if not cr.get("items"):
        return []
    uploads_pid = cr["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    pl = youtube.playlistItems().list(
        part="snippet", playlistId=uploads_pid, maxResults=n
    ).execute()
    if not pl.get("items"):
        return []

    ids   = [i["snippet"]["resourceId"]["videoId"] for i in pl["items"]]
    vr    = youtube.videos().list(part="statistics,contentDetails", id=",".join(ids)).execute()
    sm_st = {v["id"]: v.get("statistics", {})     for v in vr.get("items", [])}
    sm_cd = {v["id"]: v.get("contentDetails", {}) for v in vr.get("items", [])}

    result = []
    for item in pl["items"]:
        sn     = item["snippet"]
        vid_id = sn["resourceId"]["videoId"]
        vs     = sm_st.get(vid_id, {})
        cd     = sm_cd.get(vid_id, {})
        dur_s  = parse_duration(cd.get("duration", ""))
        result.append({
            "id":            vid_id,
            "title":         sn.get("title", ""),
            "date":          sn.get("publishedAt", "")[:10],
            "published_at":  sn.get("publishedAt", ""),
            "url":           f"https://youtube.com/watch?v={vid_id}",
            "thumb":         best_thumb(sn.get("thumbnails", {})),
            "views":         fmt(vs.get("viewCount", 0)),
            "views_raw":     int(vs.get("viewCount", 0)),
            "view_count":    int(vs.get("viewCount", 0)),
            "likes":         fmt(vs.get("likeCount", 0)),
            "like_count":    int(vs.get("likeCount", 0)),
            "comments":      fmt(vs.get("commentCount", 0)),
            "comment_count": int(vs.get("commentCount", 0)),
            "duration_secs": dur_s,
            "duration":      fmt_duration(dur_s),
        })
    return result


def fetch_all_videos(youtube, channel_id: str, max_videos: int = 500) -> list:
    """
    Fetch ALL videos for a channel (paginated, up to max_videos).
    Each page = 1 playlistItems.list + 1 videos.list = 2 units/page.
    50 items/page → 500 videos ≈ 20 pages ≈ 40 units total.
    """
    cr = youtube.channels().list(part="contentDetails", id=channel_id).execute()
    if not cr.get("items"):
        return []
    uploads_pid = cr["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    all_items = []
    page_token = None

    while len(all_items) < max_videos:
        kwargs = dict(part="snippet", playlistId=uploads_pid, maxResults=50)
        if page_token:
            kwargs["pageToken"] = page_token
        pl = youtube.playlistItems().list(**kwargs).execute()
        all_items.extend(pl.get("items", []))
        page_token = pl.get("nextPageToken")
        if not page_token:
            break

    all_items = all_items[:max_videos]
    if not all_items:
        return []

    # Batch video stats (50 per request)
    result = []
    for batch_start in range(0, len(all_items), 50):
        batch = all_items[batch_start:batch_start + 50]
        ids   = [i["snippet"]["resourceId"]["videoId"] for i in batch]
        vr    = youtube.videos().list(part="statistics,contentDetails", id=",".join(ids)).execute()
        sm_st = {v["id"]: v.get("statistics", {})     for v in vr.get("items", [])}
        sm_cd = {v["id"]: v.get("contentDetails", {}) for v in vr.get("items", [])}

        for item in batch:
            sn     = item["snippet"]
            vid_id = sn["resourceId"]["videoId"]
            vs     = sm_st.get(vid_id, {})
            cd     = sm_cd.get(vid_id, {})
            dur_s  = parse_duration(cd.get("duration", ""))
            result.append({
                "id":            vid_id,
                "title":         sn.get("title", ""),
                "date":          sn.get("publishedAt", "")[:10],
                "published_at":  sn.get("publishedAt", ""),
                "url":           f"https://youtube.com/watch?v={vid_id}",
                "thumb":         best_thumb(sn.get("thumbnails", {})),
                "views":         fmt(vs.get("viewCount", 0)),
                "views_raw":     int(vs.get("viewCount", 0)),
                "view_count":    int(vs.get("viewCount", 0)),
                "likes":         fmt(vs.get("likeCount", 0)),
                "like_count":    int(vs.get("likeCount", 0)),
                "comments":      fmt(vs.get("commentCount", 0)),
                "comment_count": int(vs.get("commentCount", 0)),
                "duration_secs": dur_s,
                "duration":      fmt_duration(dur_s),
            })
    return result


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/channel")
def search_channel_route():
    """Search for a channel by name (does NOT save it)."""
    q = request.args.get("q", "").strip()
    if not q:
        return api_error("Query is required", 400)
    try:
        yt = build_yt()
        d, e = fetch_full_channel(yt, query=q)
        if e:
            return api_error(e, 404)
        return jsonify(d)
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch channel data", 500)


@app.route("/api/channel-by-id/<channel_id>")
def get_channel_by_id(channel_id):
    """
    Fetch a channel by its known YouTube channel ID.
    Uses channels.list (1 unit) — quota-safe for autocomplete suggestion selection.
    """
    if not channel_id:
        return api_error("Channel ID is required", 400)
    try:
        yt = build_yt()
        d, e = fetch_full_channel(yt, channel_id=channel_id)
        if e:
            return api_error(e, 404)
        return jsonify(d)
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch channel data", 500)


@app.route("/api/channels", methods=["GET"])
def get_channels():
    """Return all saved channels."""
    return jsonify(load_channels())


@app.route("/api/channels/search-suggest")
def search_suggest():
    """
    Return up to 5 channel suggestions for autocomplete.
    Uses forHandle (1 unit) if query starts with @, else search.list (100 units).
    Results are cached in-memory for 5 minutes to reduce quota burn on repeat queries.
    """
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])

    # Cache check (case-insensitive key)
    cache_key = q.lower()
    now = time.time()
    cached = _suggest_cache.get(cache_key)
    if cached and (now - cached["ts"]) < SUGGEST_CACHE_TTL:
        return jsonify(cached["data"])

    try:
        yt = build_yt()
        suggestions = []

        if q.startswith("@"):
            # Exact handle lookup — costs only 1 unit
            handle = q if q.startswith("@") else "@" + q
            cr = yt.channels().list(
                part="snippet,statistics",
                forHandle=handle,
            ).execute()
            for item in cr.get("items", [])[:5]:
                sn = item["snippet"]
                st = item.get("statistics", {})
                subs = int(st.get("subscriberCount", 0))
                suggestions.append({
                    "id":          item["id"],
                    "name":        sn.get("title", ""),
                    "handle":      sn.get("customUrl", ""),
                    "logo_url":    best_thumb(sn.get("thumbnails", {})),
                    "subscribers": fmt(subs),
                    "subscribers_raw": subs,
                })
        else:
            # Full text search — costs 100 units
            sr = yt.search().list(
                part="snippet", q=q, type="channel", maxResults=5
            ).execute()
            channel_ids = [item["snippet"]["channelId"] for item in sr.get("items", [])]
            if channel_ids:
                cr = yt.channels().list(
                    part="snippet,statistics",
                    id=",".join(channel_ids),
                ).execute()
                id_order = {cid: i for i, cid in enumerate(channel_ids)}
                items = sorted(cr.get("items", []), key=lambda x: id_order.get(x["id"], 99))
                for item in items:
                    sn = item["snippet"]
                    st = item.get("statistics", {})
                    subs = int(st.get("subscriberCount", 0))
                    suggestions.append({
                        "id":          item["id"],
                        "name":        sn.get("title", ""),
                        "handle":      sn.get("customUrl", ""),
                        "logo_url":    best_thumb(sn.get("thumbnails", {})),
                        "subscribers": fmt(subs),
                        "subscribers_raw": subs,
                    })

        # Store in cache
        _suggest_cache[cache_key] = {"data": suggestions, "ts": now}
        return jsonify(suggestions)
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch suggestions", 500)


@app.route("/api/channels/add", methods=["POST"])
def add_channel():
    """Add a channel by name or ID. Enforces channel cap and throttle."""
    # Rate limit: prevent spamming
    ip = request.remote_addr or "unknown"
    now = time.time()
    if now - _last_add.get(ip, 0) < ADD_THROTTLE_SECS:
        return api_error("Too many requests. Please wait a moment.", 429)
    _last_add[ip] = now

    body = request.get_json(silent=True) or {}
    q    = (body.get("q") or body.get("channel_id") or "").strip()
    if not q:
        return api_error("Query is required", 400)

    channels = load_channels()
    if len(channels) >= MAX_CHANNELS:
        return api_error(f"Channel limit reached ({MAX_CHANNELS} max). Remove one first.", 409)

    try:
        yt = build_yt()
        # If looks like a channel ID, fetch by ID for speed
        by_id = q.startswith("UC") and len(q) == 24
        d, e  = fetch_full_channel(yt, channel_id=q if by_id else None, query=None if by_id else q)
        if e:
            return api_error(e, 404)

        if any(c["id"] == d["id"] for c in channels):
            return jsonify({"error": "Already tracking this channel", "channel": d}), 409

        if not channels:
            d["is_primary"] = True   # first added → auto primary

        d["added_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        add_channel_db(d)
        return jsonify({"success": True, "channel": d})
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to add channel", 500)


@app.route("/api/channels/<channel_id>", methods=["DELETE"])
def delete_channel(channel_id):
    """Remove a channel from the tracking list."""
    channels = load_channels()
    target = next((c for c in channels if c["id"] == channel_id), None)
    if not target:
        return api_error("Channel not found", 404)

    delete_channel_db(channel_id)

    # If deleted channel was primary, promote the first remaining
    remaining = [c for c in channels if c["id"] != channel_id]
    if remaining and not any(c.get("is_primary") for c in remaining):
        remaining[0]["is_primary"] = True
        update_channel_db(remaining[0])

    return jsonify({"success": True})


@app.route("/api/channels/<channel_id>/refresh", methods=["POST"])
def refresh_channel(channel_id):
    """Refresh stats for a single channel from YouTube API."""
    try:
        yt = build_yt()
        d, e = fetch_full_channel(yt, channel_id=channel_id)
        if e:
            return api_error(e, 404)

        # Preserve metadata from the existing row
        channels = load_channels()
        existing = next((c for c in channels if c["id"] == channel_id), {})
        d["is_primary"]    = existing.get("is_primary", False)
        d["added_at"]      = existing.get("added_at", "")
        d["last_refreshed"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        update_channel_db(d)

        # Auto-save a daily snapshot for growth timeline
        try:
            save_snapshot(channel_id, d["subscribers_raw"], d["total_views_raw"])
        except Exception:
            pass  # snapshot failure is non-fatal

        # Invalidate caches for this channel
        _video_cache.pop(channel_id, None)

        return jsonify({"success": True, "channel": d})
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to refresh channel", 500)


@app.route("/api/channels/<channel_id>/set-primary", methods=["POST"])
def set_primary(channel_id):
    """Set a channel as the user's primary channel."""
    channels = load_channels()
    found = any(c["id"] == channel_id for c in channels)
    if not found:
        return api_error("Channel not found", 404)

    sb = get_sb()
    # Clear primary on all channels, then set on the target
    sb.table("channels").update({"is_primary": False}).neq("id", "").execute()
    sb.table("channels").update({"is_primary": True}).eq("id", channel_id).execute()
    return jsonify({"success": True})


@app.route("/api/channels/<channel_id>/videos")
def channel_videos(channel_id):
    """Return recent videos for a channel (server-side cached 15 min)."""
    now = time.time()
    cached = _video_cache.get(channel_id)
    if cached and (now - cached["ts"]) < VIDEO_CACHE_TTL:
        return jsonify(cached["data"])

    try:
        n  = min(int(request.args.get("max", 6)), 20)
        yt = build_yt()
        data = fetch_recent_videos(yt, channel_id, n)
        _video_cache[channel_id] = {"data": data, "ts": now}
        return jsonify(data)
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch videos", 500)


@app.route("/api/channels/<channel_id>/videos/full")
def channel_videos_full(channel_id):
    """
    Return ALL videos for a channel (paginated, up to 500).
    Server-side cached for 4 hours to protect quota.
    """
    now = time.time()
    cached = _full_cache.get(channel_id)
    if cached and (now - cached["ts"]) < FULL_CACHE_TTL:
        return jsonify(cached["data"])

    try:
        yt   = build_yt()
        data = fetch_all_videos(yt, channel_id, max_videos=500)
        _full_cache[channel_id] = {"data": data, "ts": now}
        return jsonify(data)
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch full video list", 500)


@app.route("/api/snapshots/<channel_id>")
def get_snapshots(channel_id):
    """Return growth snapshot history for a channel."""
    snaps = load_snapshots()
    return jsonify(snaps.get(channel_id, []))


@app.route("/api/img-proxy")
def img_proxy():
    """
    Proxy YouTube / ggpht thumbnail images so the browser never hits the CDN
    directly (which blocks non-YouTube referrers). Caches in-memory for 1 hour.
    """
    url = request.args.get("url", "").strip()
    # Only allow yt3.ggpht.com and googleusercontent.com origins
    if not url or not ("ggpht.com" in url or "googleusercontent.com" in url or "ytimg.com" in url):
        return Response(status=400)

    cache_key = url
    cached = _img_cache.get(cache_key)
    now = time.time()
    if cached and (now - cached["ts"]) < IMG_CACHE_TTL:
        return Response(cached["data"], mimetype=cached["mime"],
                        headers={"Cache-Control": "public, max-age=3600"})

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            # No Referer — that's the whole point
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read()
            mime = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
        _img_cache[cache_key] = {"data": data, "ts": now, "mime": mime}
        return Response(data, mimetype=mime,
                        headers={"Cache-Control": "public, max-age=3600"})
    except Exception:
        return Response(status=502)


@app.route("/api/export/csv")
def export_csv():
    """Export all tracked channels as a CSV download."""
    channels = load_channels()
    lines = ["Name,Handle,Country,Subscribers,Total Views,Videos,Avg Views,Last Refreshed"]
    for c in channels:
        row = [
            c.get("name", ""),
            c.get("handle", ""),
            c.get("country", ""),
            str(c.get("subscribers_raw", "")),
            str(c.get("total_views_raw", "")),
            str(c.get("total_videos_raw", "")),
            str(c.get("avg_views_raw", "")),
            c.get("last_refreshed", c.get("added_at", "")),
        ]
        lines.append(",".join(f'"{v}"' for v in row))

    return Response(
        "\n".join(lines),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=yt_tracker_channels.csv"}
    )


@app.route("/ping")
def ping():
    """Low-overhead ping endpoint for UptimeRobot keep-alive."""
    return "ok", 200


if __name__ == "__main__":
    if not API_KEY:
        print("WARNING: YOUTUBE_API_KEY not set in .env -- API calls will fail.")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("WARNING: SUPABASE_URL / SUPABASE_SERVICE_KEY not set in .env -- DB calls will fail.")
    else:
        try:
            get_sb()  # eagerly validate credentials on startup
            print("OK  Supabase connected.")
        except Exception as e:
            print(f"FAIL  Supabase connection failed: {e}")
    port = int(os.getenv("PORT", 5000))
    print(f"YT Tracker running at http://localhost:{port}")
    app.run(debug=DEBUG, host="0.0.0.0", port=port)
