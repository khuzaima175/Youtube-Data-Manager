"""
YT Tracker — Flask backend
Serves the dashboard and proxies YouTube Data API v3 requests.
Data is persisted in Supabase (cloud Postgres).
"""

import os
import re
import time
import json
import math
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


def classify_is_short(duration_seconds: int, thumb_width: int = 0, thumb_height: int = 0) -> bool:
    """
    Classify video as YouTube Short.
    YouTube expanded Shorts to 3 min (180s) in Oct 2024 with orientation requirement.
    """
    if duration_seconds is None or duration_seconds > 183:  # 180s cap + small encoding buffer
        return False
    if thumb_width and thumb_height:
        return thumb_height > thumb_width  # vertical or square-leaning thumbnail
    return duration_seconds <= 60


def best_thumb_info(thumbnails: dict):
    """Return (url, width, height) of highest-quality available thumbnail."""
    for size in ("maxres", "standard", "high", "medium", "default"):
        t = thumbnails.get(size)
        if t and t.get("url"):
            return t.get("url"), int(t.get("width") or 0), int(t.get("height") or 0)
    return "", 0, 0


def jaccard_similarity(query: str, title: str) -> float:
    """Compute token-overlap Jaccard similarity between query and title."""
    q_tokens = set(re.findall(r'\w+', (query or '').lower()))
    t_tokens = set(re.findall(r'\w+', (title or '').lower()))
    if not q_tokens or not t_tokens:
        return 0.0
    return len(q_tokens & t_tokens) / len(q_tokens | t_tokens)


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


@app.route("/api/snapshots")
def get_all_snapshots():
    """Return growth snapshot history for all channels."""
    return jsonify(load_snapshots())


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


# ── Module 0: Video Persistence Sync ──────────────────────────────────────────

@app.route("/api/videos/sync", methods=["POST"])
def sync_videos():
    """
    Upsert a batch of enriched videos into Supabase.
    Zero YouTube API quota cost.
    """
    body = request.get_json(silent=True) or {}
    channel_id = body.get("channel_id")
    videos = body.get("videos", [])
    if not channel_id or not isinstance(videos, list):
        return api_error("channel_id and videos array required", 400)

    try:
        sb = get_sb()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        rows = []
        for v in videos:
            vid_id = v.get("video_id") or v.get("id")
            if not vid_id:
                continue
            dur = v.get("duration_seconds")
            if dur is None:
                dur = v.get("duration_secs", 0)
            tw = int(v.get("thumbnail_width") or 0)
            th = int(v.get("thumbnail_height") or 0)
            is_short = v.get("is_short")
            if is_short is None:
                is_short = classify_is_short(dur, tw, th)

            published_at = v.get("published_at") or v.get("date") or now_iso
            # Standardize date to ISO if needed
            if len(str(published_at)) == 10:
                published_at = f"{published_at}T00:00:00Z"

            views = int(v.get("views") or v.get("views_raw") or v.get("view_count") or 0)
            likes = int(v.get("likes") or v.get("likes_raw") or v.get("like_count") or 0)
            comments = int(v.get("comments") or v.get("comments_raw") or v.get("comment_count") or 0)
            thumb = v.get("thumbnail_url") or v.get("thumb") or ""

            rows.append({
                "video_id":         vid_id,
                "channel_id":       channel_id,
                "title":            v.get("title", ""),
                "published_at":     published_at,
                "duration_seconds": dur,
                "views":            views,
                "likes":            likes,
                "comments":         comments,
                "thumbnail_url":    thumb,
                "thumbnail_width":  tw,
                "thumbnail_height": th,
                "is_short":         bool(is_short),
                "last_synced_at":   now_iso
            })

        if rows:
            # Batch upsert to Supabase
            for i in range(0, len(rows), 50):
                batch = rows[i:i + 50]
                sb.table("videos").upsert(batch, on_conflict="video_id").execute()

        # Invalidate baseline cache when new videos are synced
        _baseline_cache["data"] = None

        return jsonify({"synced": len(rows), "channel_id": channel_id})
    except Exception as exc:
        print(f"[Supabase] sync_videos error: {exc}")
        # Return 200 with synced:0 and error note so client is never blocked
        return jsonify({"synced": 0, "error": str(exc), "channel_id": channel_id}), 200


# ── Module 1: Channel Baselines View ─────────────────────────────────────────

_baseline_cache: dict = {"data": None, "ts": 0}
BASELINE_CACHE_TTL = 6 * 3600  # 6 hours

@app.route("/api/channel-baselines")
def get_channel_baselines():
    """
    Return rolling 90-day long-form median views for all tracked channels.
    Cached in-memory for 6 hours. Zero YouTube API quota.
    """
    now = time.time()
    if _baseline_cache["data"] and (now - _baseline_cache["ts"]) < BASELINE_CACHE_TTL:
        return jsonify(_baseline_cache["data"])

    channels = load_channels()
    result = {}

    try:
        sb = get_sb()
        cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 90 * 86400))
        r = sb.table("videos").select("channel_id, views, is_short, published_at").gte("published_at", cutoff).execute()
        rows = r.data or []

        by_channel: dict[str, list[int]] = {}
        for row in rows:
            if row.get("is_short") is True:
                continue
            cid = row.get("channel_id")
            if cid:
                by_channel.setdefault(cid, []).append(int(row.get("views") or 0))

        for ch in channels:
            cid = ch["id"]
            views_list = by_channel.get(cid, [])
            if len(views_list) >= 5:
                views_list.sort()
                mid = len(views_list) // 2
                if len(views_list) % 2 == 1:
                    median = views_list[mid]
                else:
                    median = (views_list[mid - 1] + views_list[mid]) // 2
                result[cid] = {"median": median, "count": len(views_list)}
            else:
                result[cid] = {"median": None, "count": len(views_list)}

        _baseline_cache["data"] = result
        _baseline_cache["ts"] = now
        return jsonify(result)
    except Exception as ex:
        print(f"[Supabase] get_channel_baselines fallback error: {ex}")
        for ch in channels:
            result[ch["id"]] = {"median": None, "count": 0}
        return jsonify(result)


# ── Module 2: Supply/Demand Saturation Recalculation ──────────────────────────

@app.route("/api/recalculate-topic-metrics", methods=["POST", "GET"])
def recalculate_topic_metrics():
    """
    Recalculate RPI + Saturation Matrix metrics across all videos.
    Independent scheduled job endpoint. Zero YouTube API quota.
    """
    try:
        sb = get_sb()
        now = time.time()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        cut_14d = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 14 * 86400))

        # 1. Fetch videos and baselines
        r_vids = sb.table("videos").select("video_id, channel_id, title, views, is_short, published_at").execute()
        videos = r_vids.data or []
        if not videos:
            return jsonify({"topics_processed": 0, "blue_oceans": 0, "message": "No videos found in database"})

        # Get baselines
        baselines = {}
        by_channel = {}
        for v in videos:
            if v.get("is_short") is not True:
                by_channel.setdefault(v["channel_id"], []).append(int(v.get("views") or 0))
        for cid, vlist in by_channel.items():
            if len(vlist) >= 5:
                vlist.sort()
                mid = len(vlist) // 2
                med = vlist[mid] if len(vlist) % 2 == 1 else (vlist[mid - 1] + vlist[mid]) // 2
                baselines[cid] = med

        # Group videos by topic keywords
        stop_words = {'how','what','why','does','do','the','a','an','to','of','in','on','for','with','and','or',
                      'using','use','that','this','you','your','my','we','it','is','are','was','full','guide',
                      'tutorial','vs','part','video','new','best','top','first','last','build','get','all'}
        topic_groups = {}
        for v in videos:
            title = v.get("title", "").lower()
            words = [w for w in re.findall(r'\b\w+\b', title) if len(w) > 2 and w not in stop_words]
            tokens = set(words)
            for i in range(len(words) - 1):
                tokens.add(f"{words[i]} {words[i+1]}")

            cid = v.get("channel_id")
            base = baselines.get(cid)
            v_views = int(v.get("views") or 0)
            rpi = (v_views / base) if (base and base > 0) else 1.0
            pub = v.get("published_at", "")
            is_recent_14d = bool(pub and pub >= cut_14d)

            for t in tokens:
                if t not in topic_groups:
                    topic_groups[t] = {"videos": [], "recent_14d": 0}
                topic_groups[t]["videos"].append(rpi)
                if is_recent_14d:
                    topic_groups[t]["recent_14d"] += 1

        topic_rows = []
        blue_oceans_count = 0
        for topic, info in topic_groups.items():
            rpis = info["videos"]
            n = len(rpis)
            if n < 2:
                continue

            raw_mean_rpi = sum(rpis) / n
            w = n / (n + 5.0)
            shrunken_rpi = round(w * raw_mean_rpi + (1.0 - w) * 1.0, 2)
            recent_14d = info["recent_14d"]
            blue_ocean_score = round(float(shrunken_rpi) / math.log10(recent_14d + 2.0), 2)

            if shrunken_rpi >= 1.5 and recent_14d <= 2:
                saturation_label = "BLUE_OCEAN"
                blue_oceans_count += 1
            elif shrunken_rpi >= 1.5 and recent_14d >= 5:
                saturation_label = "RED_OCEAN"
            elif shrunken_rpi < 1.0 and recent_14d <= 2:
                saturation_label = "WATCH"
            else:
                saturation_label = "DEAD"

            topic_rows.append({
                "topic_key":          topic,
                "canonical_name":     topic.title(),
                "total_videos":       n,
                "recent_uploads_14d": recent_14d,
                "shrunken_rpi":       shrunken_rpi,
                "blue_ocean_score":   blue_ocean_score,
                "saturation_label":   saturation_label,
                "calculated_at":      now_iso
            })

        if topic_rows:
            # Batch upsert to topic_metrics table
            for i in range(0, len(topic_rows), 100):
                batch = topic_rows[i:i + 100]
                sb.table("topic_metrics").upsert(batch, on_conflict="topic_key").execute()

        return jsonify({
            "success": True,
            "topics_processed": len(topic_rows),
            "blue_oceans": blue_oceans_count
        })
    except Exception as ex:
        print(f"[Supabase] recalculate_topic_metrics error: {ex}")
        return jsonify({"success": False, "error": str(ex), "topics_processed": 0, "blue_oceans": 0}), 200


# ── Module 3: Autocomplete Void Miner ─────────────────────────────────────────

_void_cache: dict = {}
VOID_CACHE_TTL = 24 * 3600  # 24 hours

@app.route("/api/autocomplete-voids")
def autocomplete_voids():
    """
    Mine YouTube search suggestions with depth cap <= 2 and calculate
    Jaccard token coverage against competitor catalog. Zero YouTube API quota.
    """
    q = request.args.get("q", "").strip()
    depth = min(int(request.args.get("depth", 1)), 2)
    if not q:
        return api_error("Seed query 'q' is required", 400)

    cache_key = f"{q.lower()}_d{depth}"
    now = time.time()
    cached = _void_cache.get(cache_key)
    if cached and (now - cached["ts"]) < VOID_CACHE_TTL:
        return jsonify(cached["data"])

    # 1. Scrape suggestions from suggestqueries.google.com
    suggestions = []
    seen = set()

    def fetch_suggestions(query_str):
        try:
            url = f"https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q={urllib.parse.quote(query_str)}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read().decode("utf-8", errors="ignore")
                # Format: window.google.ac.h(["query",[["sugg1",0,[...]], ...], ...])
                match = re.search(r'\[.+\]', raw)
                if match:
                    parsed = json.loads(match.group(0))
                    if len(parsed) > 1 and isinstance(parsed[1], list):
                        for item in parsed[1]:
                            s_text = item[0] if isinstance(item, list) and item else str(item)
                            if s_text and s_text not in seen:
                                seen.add(s_text)
                                suggestions.append(s_text)
        except Exception as e:
            pass

    fetch_suggestions(q)

    # If depth == 2, expand with alphabet suffixes
    if depth == 2:
        for char in "abcdefghijklmnopqrstuvwxyz":
            fetch_suggestions(f"{q} {char}")
            time.sleep(0.04)

    # 2. Cross-reference against tracked competitor titles
    tracked_titles = []
    try:
        sb = get_sb()
        r = sb.table("videos").select("title").execute()
        tracked_titles = [row["title"] for row in (r.data or []) if row.get("title")]
    except Exception:
        # Fallback to in-memory cached channel video titles
        for ch_data in _video_cache.values():
            for v in ch_data.get("data", []):
                if v.get("title"):
                    tracked_titles.append(v["title"])

    results = []
    for sugg in suggestions[:50]:
        max_sim = 0.0
        match_count = 0
        matched_title = ""
        for title in tracked_titles:
            sim = jaccard_similarity(sugg, title)
            if sim > max_sim:
                max_sim = sim
                matched_title = title
            if sim >= 0.4:
                match_count += 1

        coverage_ratio = min(1.0, match_count / 3.0)
        void_score = round((1.0 - coverage_ratio) * 10.0, 1)
        is_void = (match_count == 0)

        results.append({
            "query":               sugg,
            "suggestion":          sugg,
            "is_void":             is_void,
            "void_score":          void_score,
            "competitor_coverage": match_count,
            "overlap":             round(max_sim, 2),
            "max_similarity":      round(max_sim, 2),
            "matched_title":       matched_title if match_count > 0 else "",
            "level":               1
        })

    results.sort(key=lambda x: (x["is_void"], x["void_score"]), reverse=True)
    voids = [r for r in results if r["is_void"]]
    covered = [r for r in results if not r["is_void"]]

    resp_data = {"seed": q, "voids": results, "unmet": voids, "covered": covered, "total": len(results)}
    _void_cache[cache_key] = {"data": resp_data, "ts": now}
    return jsonify(resp_data)


@app.route("/api/mine-voids-batch", methods=["POST"])
def mine_voids_batch():
    """Auto-mine voids for top topics and persist into search_voids table."""
    try:
        sb = get_sb()
        # Fetch top topics
        r_top = sb.table("topic_metrics").select("topic_key").order("blue_ocean_score", desc=True).limit(8).execute()
        topic_keys = [t["topic_key"] for t in (r_top.data or [])]
        if not topic_keys:
            topic_keys = ["ai video", "python tutorial", "workflow automation", "system design"]

        mined_count = 0
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        for seed in topic_keys:
            with app.test_request_context(f"/api/autocomplete-voids?q={urllib.parse.quote(seed)}&depth=1"):
                res = autocomplete_voids()
                data = res.get_json() if hasattr(res, 'get_json') else {}
                voids = data.get("unmet", data.get("voids", []))

                rows = []
                for item in voids[:6]:
                    rows.append({
                        "seed_keyword":        seed,
                        "suggestion":          item.get("suggestion") or item.get("query"),
                        "void_score":          item["void_score"],
                        "competitor_coverage": item["competitor_coverage"],
                        "last_seen":           now_iso,
                        "status":              "active"
                    })
                if rows:
                    sb.table("search_voids").upsert(rows, on_conflict="seed_keyword,suggestion").execute()
                    mined_count += len(rows)

        return jsonify({"success": True, "mined_voids": mined_count})
    except Exception as ex:
        return jsonify({"success": False, "error": str(ex)}), 500


# ── Module 4: LLM Title Synthesizer ──────────────────────────────────────────

@app.route("/api/llm/generate-titles", methods=["POST"])
def generate_llm_titles():
    """
    Generate high-CTR title concepts and thumbnail concepts across 5 packaging archetypes.
    Supports OpenAI, Gemini, Anthropic, or Groq API key, with resilient fallback.
    """
    body = request.get_json(silent=True) or {}
    topics = body.get("topics", [])
    voids = body.get("voids", [])
    moats = body.get("moats", [])
    topic_single = body.get("topic") or body.get("current_title")
    archetype = body.get("archetype", "all")
    count = min(int(body.get("count", 5)), 10)

    # Primary topic to anchor
    main_topic = "General Tech"
    if topic_single and str(topic_single).strip():
        main_topic = str(topic_single).strip()
    elif voids and isinstance(voids, list) and voids[0]:
        main_topic = voids[0].get("suggestion") or voids[0].get("query") if isinstance(voids[0], dict) else str(voids[0])
    elif topics and isinstance(topics, list) and topics[0]:
        main_topic = topics[0].get("topic") if isinstance(topics[0], dict) else str(topics[0])
    elif moats and isinstance(moats, list) and moats[0]:
        main_topic = moats[0].get("topic") if isinstance(moats[0], dict) else str(moats[0])

    main_topic = main_topic.title()

    # Master Archetype Meta Catalog
    archetype_catalog = {
        "impossible_feat": {
            "label": "🏆 Impossible Feat",
            "titles": [
                f"The Impossible Engineering Behind {main_topic} (How It Works)",
                f"Why Experts Said {main_topic} Was Physically Impossible",
                f"How 1 Breakthrough Changed {main_topic} Forever",
                f"The 100-Year Mystery of {main_topic} Finally Solved",
                f"I Built a {main_topic} Setup That Breaks Normal Limits"
            ],
            "blueprint": {
                "layout": "Split-screen contrast with macro cutaway",
                "focal_element": f"Glowing neon heat-map over core {main_topic} mechanism",
                "contrast_colors": "Deep dark slate background with neon cyan & yellow accents",
                "text_overlay": "IMPOSSIBLE"
            },
            "explanation": "High curiosity gap leveraging cognitive dissonance and engineering intrigue."
        },
        "hidden_flaw": {
            "label": "🚨 Hidden Flaw",
            "titles": [
                f"The Billion Dollar Flaw in {main_topic} Nobody Talks About",
                f"Why You Need to Rethink {main_topic} in 2026",
                f"The Fatal Mistake That Ruins Every {main_topic} Project",
                f"The Dark Side of {main_topic} (What Companies Won't Tell You)",
                f"The Secret Problem with {main_topic} You Must Avoid"
            ],
            "blueprint": {
                "layout": "Warning badge callout with microscopic highlight",
                "focal_element": f"Creator inspecting a highlighted micro-defect in {main_topic}",
                "contrast_colors": "Matte carbon background with vibrant amber warning glow",
                "text_overlay": "FATAL FLAW"
            },
            "explanation": "Loss-aversion hook warning against subtle, expensive pitfalls."
        },
        "head_to_head": {
            "label": "⚔️ Head-to-Head",
            "titles": [
                f"{main_topic} vs The Entire Industry: The Brutal Truth",
                f"I Tested {main_topic} Against the Market Leader (Shocking)",
                f"{main_topic} Benchmark: Is It Actually Better or Just Hype?",
                f"The $500 vs $5,000 {main_topic} Face-Off",
                f"Why I Switched Everything to {main_topic}"
            ],
            "blueprint": {
                "layout": "High-tension 50/50 split clash with lightning divider",
                "focal_element": f"Side-by-side performance showdown of {main_topic}",
                "contrast_colors": "Electric cyan left vs crimson red right",
                "text_overlay": "VS"
            },
            "explanation": "Competitive polarization driving immediate click decision."
        },
        "zero_to_mastery": {
            "label": "🎓 Zero-to-Mastery",
            "titles": [
                f"How to Master {main_topic} in 30 Days (Complete Roadmap)",
                f"The {main_topic} Masterclass I Wish I Had as a Beginner",
                f"10 {main_topic} Principles That Will 10x Your Results",
                f"The Only 3 {main_topic} Techniques You Actually Need",
                f"From Beginner to Pro: The Ultimate {main_topic} Guide"
            ],
            "blueprint": {
                "layout": "Step 1 → Step 2 → Step 3 level-up roadmap chevron graphic",
                "focal_element": f"Clean technical cheat sheet and tier-list for {main_topic}",
                "contrast_colors": "Dark obsidian background with gold tier gradients",
                "text_overlay": "0 TO 100"
            },
            "explanation": "High perceived utility and aspirational transformation hook."
        },
        "stress_test": {
            "label": "💥 Stress Test",
            "titles": [
                f"I Tested {main_topic} for 100 Hours So You Don't Have To",
                f"Pushing {main_topic} to the Absolute Breaking Point",
                f"Can {main_topic} Survive Extreme Real-World Stress?",
                f"I Replaced My Entire Workflow with {main_topic} for 7 Days",
                f"What Happens When You Push {main_topic} Beyond Its Limits"
            ],
            "blueprint": {
                "layout": "Extreme action torture test with digital timer display",
                "focal_element": f"Stress meters or physical stress test maxed out in red",
                "contrast_colors": "High-contrast industrial neon orange on smoke dark",
                "text_overlay": "100 HOURS"
            },
            "explanation": "Extreme commitment proof hook verifying real-world durability."
        }
    }

    # Check for external LLM API keys
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if gemini_key or openai_key:
        system_prompt = (
            f"You are a master YouTube strategist. Generate 5 high-CTR video title concepts for '{main_topic}' across "
            f"archetypes (impossible_feat, hidden_flaw, head_to_head, zero_to_mastery, stress_test). "
            f"Return ONLY valid JSON: {{\"titles\": [ {{\"title\": \"...\", \"archetype\": \"...\", \"archetype_label\": \"...\", \"explanation\": \"...\", \"thumbnail_concept\": {{\"layout\": \"...\", \"focal_element\": \"...\", \"contrast_colors\": \"...\", \"text_overlay\": \"...\"}} }} ]}}"
        )
        if gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
                req_data = {
                    "contents": [{"parts": [{"text": system_prompt}]}],
                    "generationConfig": {"response_mime_type": "application/json"}
                }
                req = urllib.request.Request(url, data=json.dumps(req_data).encode("utf-8"),
                                             headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res_json = json.loads(resp.read().decode("utf-8"))
                    text_content = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text_content)
                    if "titles" in parsed and isinstance(parsed["titles"], list) and parsed["titles"]:
                        return jsonify(parsed)
            except Exception as e:
                print(f"[LLM] Gemini API call fallback: {e}")

        elif openai_key:
            try:
                url = "https://api.openai.com/v1/chat/completions"
                req_data = {
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "system", "content": system_prompt}],
                    "response_format": {"type": "json_object"}
                }
                req = urllib.request.Request(url, data=json.dumps(req_data).encode("utf-8"),
                                             headers={"Content-Type": "application/json", "Authorization": f"Bearer {openai_key}"},
                                             method="POST")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res_json = json.loads(resp.read().decode("utf-8"))
                    parsed = json.loads(res_json["choices"][0]["message"]["content"])
                    if "titles" in parsed and isinstance(parsed["titles"], list) and parsed["titles"]:
                        return jsonify(parsed)
            except Exception as e:
                print(f"[LLM] OpenAI API call fallback: {e}")

    # Fallback to high-signal structured archetype templates
    structured_results = []
    if archetype == "all":
        for a_key, a_meta in archetype_catalog.items():
            structured_results.append({
                "title": a_meta["titles"][0],
                "archetype": a_key,
                "archetype_label": a_meta["label"],
                "estimated_score": 93,
                "explanation": a_meta["explanation"],
                "thumbnail_concept": a_meta["blueprint"]
            })
    else:
        a_meta = archetype_catalog.get(archetype, archetype_catalog["impossible_feat"])
        for idx, t_str in enumerate(a_meta["titles"][:count]):
            structured_results.append({
                "title": t_str,
                "archetype": archetype,
                "archetype_label": a_meta["label"],
                "estimated_score": 90 + (idx % 5),
                "explanation": a_meta["explanation"],
                "thumbnail_concept": a_meta["blueprint"]
            })

    return jsonify({
        "titles": structured_results,
        "archetype": archetype,
        "main_topic": main_topic
    })


# ── Module 5: Velocity Acceleration Tracker ───────────────────────────────────

@app.route("/api/cron/snapshot-velocity", methods=["POST", "GET"])
def cron_snapshot_velocity():
    """
    Capture daily view velocity snapshots for videos published in last 14 days.
    Missed-day resilient: queries closest prior date. Near-zero YouTube API quota (~1 unit per 50 vids).
    """
    try:
        sb = get_sb()
        now = time.time()
        today_date = time.strftime("%Y-%m-%d", time.gmtime())
        cut_14d = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 14 * 86400))

        # 1. Fetch recent videos
        r = sb.table("videos").select("video_id, channel_id, published_at, views").gte("published_at", cut_14d).execute()
        recent_vids = r.data or []
        if not recent_vids:
            return jsonify({"success": True, "processed": 0, "message": "No recent videos in 14-day window"})

        # 2. Issue batched YouTube API refresh for fresh view counts (1 unit per 50 IDs)
        yt = build_yt()
        vid_ids = [v["video_id"] for v in recent_vids]
        live_views_map = {}
        for i in range(0, len(vid_ids), 50):
            batch_ids = vid_ids[i:i + 50]
            vr = yt.videos().list(part="statistics", id=",".join(batch_ids)).execute()
            for item in vr.get("items", []):
                live_views_map[item["id"]] = int(item.get("statistics", {}).get("viewCount", 0))

        # 3. Query historical velocity snapshots for prior dates
        r_hist = sb.table("video_velocity").select("*").lt("snapshot_date", today_date).order("snapshot_date", desc=True).execute()
        hist_rows = r_hist.data or []
        hist_by_video = {}
        for row in hist_rows:
            vid = row["video_id"]
            hist_by_video.setdefault(vid, []).append(row)

        velocity_rows = []
        accelerating_count = 0

        for v in recent_vids:
            vid_id = v["video_id"]
            cid = v["channel_id"]
            cur_views = live_views_map.get(vid_id, int(v.get("views") or 0))

            # Find closest prior snapshot
            prev_snapshots = hist_by_video.get(vid_id, [])
            prev_snap = prev_snapshots[0] if prev_snapshots else None

            if prev_snap:
                prev_date_str = prev_snap["snapshot_date"]
                prev_views = int(prev_snap.get("views") or 0)
                try:
                    t_today = time.mktime(time.strptime(today_date, "%Y-%m-%d"))
                    t_prev = time.mktime(time.strptime(prev_date_str, "%Y-%m-%d"))
                    days_elapsed = max(1.0, (t_today - t_prev) / 86400.0)
                except Exception:
                    days_elapsed = 1.0
                daily_vel = max(0.0, (cur_views - prev_views) / days_elapsed)
            else:
                # First snapshot — estimate from published_at
                pub_str = v.get("published_at", "")[:10]
                try:
                    t_pub = time.mktime(time.strptime(pub_str, "%Y-%m-%d"))
                    t_today = time.mktime(time.strptime(today_date, "%Y-%m-%d"))
                    days_pub = max(1.0, (t_today - t_pub) / 86400.0)
                except Exception:
                    days_pub = 1.0
                daily_vel = cur_views / days_pub

            # Find 7-day prior snapshot for acceleration math
            seven_days_ago_snap = None
            for snap in prev_snapshots:
                try:
                    t_snap = time.mktime(time.strptime(snap["snapshot_date"], "%Y-%m-%d"))
                    t_today = time.mktime(time.strptime(today_date, "%Y-%m-%d"))
                    diff_days = (t_today - t_snap) / 86400.0
                    if diff_days >= 6:
                        seven_days_ago_snap = snap
                        break
                except Exception:
                    pass

            if seven_days_ago_snap and float(seven_days_ago_snap.get("velocity") or 0) > 0:
                vel_7d = float(seven_days_ago_snap["velocity"])
                acceleration = round((daily_vel - vel_7d) / vel_7d, 3)
            else:
                acceleration = 0.0

            if acceleration >= 0.5:
                accelerating_count += 1

            velocity_rows.append({
                "video_id":      vid_id,
                "channel_id":    cid,
                "snapshot_date": today_date,
                "views":         cur_views,
                "velocity":      round(daily_vel, 2),
                "acceleration":  acceleration
            })

        if velocity_rows:
            sb.table("video_velocity").upsert(velocity_rows, on_conflict="video_id,snapshot_date").execute()

        return jsonify({
            "success": True,
            "processed": len(velocity_rows),
            "accelerating_count": accelerating_count,
            "snapshot_date": today_date
        })
    except Exception as ex:
        print(f"[Supabase] cron_snapshot_velocity error: {ex}")
        return jsonify({"success": False, "error": str(ex), "processed": 0}), 200


@app.route("/api/velocity/trending")
def get_trending_velocity():
    """Return top accelerating videos with recent velocity metrics."""
    try:
        sb = get_sb()
        r = sb.table("video_velocity").select("*, videos(title, thumbnail_url, channel_id)").order("acceleration", desc=True).limit(10).execute()
        rows = r.data or []
        channels = {c["id"]: c["name"] for c in load_channels()}

        trending = []
        for row in rows:
            v_info = row.get("videos") or {}
            cid = row.get("channel_id") or v_info.get("channel_id")
            trending.append({
                "video_id":     row["video_id"],
                "title":        v_info.get("title", "Video"),
                "thumbnail":    v_info.get("thumbnail_url", ""),
                "channel_name": channels.get(cid, "Channel"),
                "velocity":     float(row.get("velocity") or 0),
                "acceleration": float(row.get("acceleration") or 0),
                "views":        int(row.get("views") or 0)
            })
        return jsonify({"trending": trending})
    except Exception as ex:
        return jsonify({"trending": []})


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
