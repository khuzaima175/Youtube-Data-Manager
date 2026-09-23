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
import importlib
import urllib.request
import urllib.error
import threading
import xml.etree.ElementTree as ET
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


# ── Phase 3: FastEmbed & Semantic Vector Clustering ────────────────────────────
_fastembed_model = None

def get_embedding_model():
    """Lazy initialize FastEmbed TextEmbedding model (sentence-transformers/all-MiniLM-L6-v2) on CPU."""
    global _fastembed_model
    if _fastembed_model is None:
        try:
            import importlib
            fastembed_pkg = importlib.import_module("fastembed")
            TextEmbedding = getattr(fastembed_pkg, "TextEmbedding")
            _fastembed_model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
            print("[FastEmbed] Model sentence-transformers/all-MiniLM-L6-v2 loaded.")
        except Exception as e:
            print(f"[FastEmbed] Model init notice (fallback mode active): {e}")
            _fastembed_model = False
    return _fastembed_model if _fastembed_model else None

def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a)) or 1e-9
    norm_b = math.sqrt(sum(y * y for y in b)) or 1e-9
    return dot / (norm_a * norm_b)

def cluster_titles_semantic(videos: list[dict], threshold: float = 0.60) -> list[dict]:
    """Semantic clustering using embeddings with cosine similarity distance."""
    if not videos:
        return []
    
    titles = [v.get("title", "") for v in videos]
    model = get_embedding_model()
    
    embeddings = []
    if model:
        try:
            embeddings = [list(vec) for vec in model.embed(titles)]
        except Exception as ex:
            print(f"[FastEmbed] Embed error: {ex}")
            embeddings = []
    
    # Fallback to simple N-gram token overlap if FastEmbed not available
    if not embeddings or len(embeddings) != len(videos):
        clusters_map = {}
        for v in videos:
            t = v.get("title", "").lower()
            words = [w for w in re.findall(r"\w+", t) if len(w) > 3]
            key = " ".join(words[:2]) if len(words) >= 2 else (words[0] if words else "General")
            clusters_map.setdefault(key, []).append(v)
        
        result = []
        for key, vlist in clusters_map.items():
            tot_views = sum(int(x.get("view_count") or x.get("views_raw") or 0) for x in vlist)
            avg_v = tot_views // max(1, len(vlist))
            result.append({
                "cluster_id": f"cluster-{abs(hash(key)) % 10000}",
                "topic": key.title(),
                "n": len(vlist),
                "avg_views": avg_v,
                "centroid_title": vlist[0].get("title", ""),
                "videos": vlist[:10]
            })
        return sorted(result, key=lambda c: c["avg_views"], reverse=True)

    # Agglomerative clustering with cosine threshold
    clusters: list[list[int]] = []
    for idx, emb in enumerate(embeddings):
        placed = False
        for cl in clusters:
            centroid_emb = embeddings[cl[0]]
            sim = cosine_similarity(emb, centroid_emb)
            if sim >= threshold:
                cl.append(idx)
                placed = True
                break
        if not placed:
            clusters.append([idx])

    result = []
    for cl in clusters:
        vlist = [videos[i] for i in cl]
        tot_views = sum(int(x.get("view_count") or x.get("views_raw") or 0) for x in vlist)
        avg_v = tot_views // max(1, len(vlist))
        
        centroid_idx = cl[0]
        centroid_title = videos[centroid_idx].get("title", "")
        
        all_words = " ".join(v.get("title", "") for v in vlist).lower()
        word_freq = {}
        stop_words = {"how", "why", "what", "with", "from", "that", "this", "your", "best", "full", "guide", "tutorial", "video", "works", "using"}
        for w in re.findall(r"[a-zA-Z0-9#+]{3,}", all_words):
            if w not in stop_words:
                word_freq[w] = word_freq.get(w, 0) + 1
        top_words = sorted(word_freq.keys(), key=lambda w: word_freq[w], reverse=True)[:3]
        topic_label = " ".join(top_words).title() if top_words else centroid_title[:30]
        archetypes = map_topic_archetypes(top_words or [topic_label])

        result.append({
            "cluster_id": f"cluster-{abs(hash(centroid_title)) % 10000}",
            "topic": topic_label,
            "archetypes": archetypes,
            "n": len(vlist),
            "avg_views": avg_v,
            "centroid_title": centroid_title,
            "videos": vlist[:10]
        })

    return sorted(result, key=lambda c: c["avg_views"], reverse=True)

def map_topic_archetypes(keywords: list[str]) -> list[str]:
    """
    Map topic keywords to Creator Studio viral packaging archetypes (v5.0 Patch 3):
    - Pseudo-sentence formatting: "This video is about {kw1, kw2, ...}"
    - Complete archetype mappings: B2B Engineering, Vlog Entertainment, Educational Tutorial, News, and Fallback.
    """
    if not keywords:
        return ["General Deep Dive", "Explainer"]
    
    kw_string = f"This video is about {', '.join(keywords[:5])}".lower()
    
    # Categorization heuristic calibrated against BART-MNLI classes
    if any(k in kw_string for k in ["cad", "solidworks", "cnc", "engineering", "code", "architecture", "tool", "dev", "api", "tech", "hardware", "software", "system"]):
        return ["Deep Dive", "Workflow Optimization", "Common Mistakes"]
    elif any(k in kw_string for k in ["challenge", "vlog", "insane", "impossible", "test", "stress", "secret", "hidden", "truth", "broke", "worst"]):
        return ["Impossible Feat", "Stress Test", "Hidden Flaw"]
    elif any(k in kw_string for k in ["learn", "mastery", "guide", "tutorial", "step", "beginners", "complete", "course", "basics", "how to"]):
        return ["Zero-to-Mastery", "Step-by-Step Guide", "Common Pitfalls"]
    elif any(k in kw_string for k in ["news", "update", "breaking", "release", "announcement", "future", "ai", "leak", "vs"]):
        return ["Breaking Analysis", "Industry Update", "What It Means"]
    else:
        return ["General Deep Dive", "Explainer"]

@app.route("/api/topics/semantic-clusters", methods=["GET", "POST"])
def get_semantic_clusters():
    """Cluster video catalog using FastEmbed 384-d semantic vectors."""
    try:
        body = request.get_json(silent=True) or {}
        custom_videos = body.get("videos")
        threshold = float(body.get("threshold", 0.60))

        if custom_videos and isinstance(custom_videos, list):
            videos = custom_videos
        else:
            # Fetch from DB or memory cache
            videos = []
            channels = load_channels()
            for ch in channels:
                cid = ch["id"]
                en = _full_cache.get(cid) or _video_cache.get(cid)
                if en and en.get("data"):
                    for v in en["data"]:
                        videos.append({**v, "channel_name": ch["name"]})
            
            # Fallback to Supabase if local cache is empty
            if not videos:
                try:
                    sb = get_sb()
                    r = sb.table("videos").select("id,channel_id,title,view_count,published_at,thumbnail_url").limit(300).execute()
                    videos = r.data or []
                except Exception:
                    pass

        clusters = cluster_titles_semantic(videos, threshold=threshold)
        return jsonify({
            "success": True,
            "model": "all-MiniLM-L6-v2" if get_embedding_model() else "ngram-fallback",
            "cluster_count": len(clusters),
            "total_videos": len(videos),
            "clusters": clusters
        })
    except Exception as ex:
        print(f"[SemanticClusters] Error: {ex}")
        return jsonify({"success": False, "error": str(ex), "clusters": []}), 500


# ── Phase 4: Zero-Quota Google WebSub Ingestion & Snapshot Scheduler ─────────

def db_video_exists(video_id: str) -> bool:
    """Check if video already exists in database or cache to avoid edit traps on historical videos."""
    for en in _full_cache.values():
        if any(v.get("id") == video_id or v.get("video_id") == video_id for v in en.get("data", [])):
            return True
    for en in _video_cache.values():
        if any(v.get("id") == video_id or v.get("video_id") == video_id for v in en.get("data", [])):
            return True
    try:
        sb = get_sb()
        r = sb.table("videos").select("id").eq("id", video_id).limit(1).execute()
        return bool(r.data)
    except Exception:
        return False

def schedule_video_snapshots(video_id: str, channel_id: str):
    """Schedule T+2h, T+24h, and T+168h snapshots in snapshot_schedule table."""
    try:
        sb = get_sb()
        now_ts = time.time()
        checkpoints = [
            {"hour": 2, "offset": 2 * 3600},
            {"hour": 24, "offset": 24 * 3600},
            {"hour": 168, "offset": 168 * 3600}
        ]
        rows = []
        for cp in checkpoints:
            target_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now_ts + cp["offset"]))
            rows.append({
                "video_id": video_id,
                "channel_id": channel_id,
                "target_snapshot_at": target_time,
                "hour_checkpoint": cp["hour"],
                "status": "pending"
            })
        sb.table("snapshot_schedule").insert(rows).execute()
        print(f"[SnapshotSchedule] Queued T+2h, T+24h, T+168h checkpoints for {video_id}")
    except Exception as ex:
        print(f"[SnapshotSchedule] Notice: {ex}")

_redis_instance = None

def get_redis_client():
    """Returns connected Redis client if available, else None."""
    global _redis_instance
    if _redis_instance is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            redis_lib = importlib.import_module("redis")
            client = redis_lib.from_url(redis_url, socket_timeout=1)
            client.ping()
            _redis_instance = client
        except Exception:
            _redis_instance = False
    return _redis_instance if _redis_instance is not False else None

def get_daily_quota_spend() -> int:
    """Get current quota spend for today with Redis byte type-cast and Supabase fallback (v5.0 Patch 1)."""
    r = get_redis_client()
    if r:
        try:
            raw_spend = r.get("quota:daily_spend")
            if raw_spend is not None:
                # 1. TYPE CAST FIX: Decode bytes safely to integer
                return int(raw_spend.decode("utf-8") if isinstance(raw_spend, bytes) else raw_spend)
        except Exception:
            pass

    today_key = time.strftime("%Y-%m-%d", time.gmtime())
    try:
        sb = get_sb()
        res = sb.table("quota_ledger").select("units_spent").eq("ledger_date", today_key).limit(1).execute()
        if res.data:
            return res.data[0].get("units_spent", 0)
    except Exception:
        pass
    return 0

def is_circuit_breaker_active() -> bool:
    """Check if circuit breaker is active (>8,500 units spent today)."""
    spend = get_daily_quota_spend()
    return spend >= 8500

def record_quota_spend(units: int = 1):
    """Record quota spend in Redis & Supabase with 24h midnight reset and 85% circuit breaker (v5.0 Patch 1)."""
    r = get_redis_client()
    current_spend = 0
    if r:
        try:
            raw_spend = r.get("quota:daily_spend")
            # 1. TYPE CAST FIX: Decode bytes safely to integer
            if raw_spend is not None:
                current_spend = int(raw_spend.decode("utf-8") if isinstance(raw_spend, bytes) else raw_spend)
            else:
                current_spend = 0

            # 2. MIDNIGHT RESET FIX: Expire key 24 hours (86400s) on initial creation
            if raw_spend is None:
                r.set("quota:daily_spend", str(units), ex=86400)
            else:
                r.incrby("quota:daily_spend", units)
        except Exception as ex:
            print(f"[RedisQuota] Warning: {ex}")

    today_key = time.strftime("%Y-%m-%d", time.gmtime())
    try:
        sb = get_sb()
        res = sb.table("quota_ledger").select("units_spent").eq("ledger_date", today_key).limit(1).execute()
        db_current = res.data[0]["units_spent"] if res.data else 0
        new_spend = max(current_spend + units, db_current + units)
        breaker = new_spend >= 8500

        sb.table("quota_ledger").upsert({
            "ledger_date": today_key,
            "units_spent": new_spend,
            "circuit_breaker_active": breaker
        }, on_conflict="ledger_date").execute()

        # 3. Circuit Breaker trigger
        if breaker and not (db_current >= 8500):
            print("[CircuitBreaker] ⚠️ Daily quota >= 8,500 units! Cancelling non-critical historical checkpoints (24h, 168h).")
            sb.table("snapshot_schedule").update({"status": "cancelled"}).in_("hour_checkpoint", [24, 168]).eq("status", "pending").execute()
    except Exception:
        pass

def evaluate_outlier_threshold(video_id: str, channel_id: str, current_velocity: float, hour_checkpoint: int):
    """
    Evaluate time-bucketed velocity outlier thresholds (v5.0 Patch 2 & 4):
    - T+2h Bucket: Requires >= 3.5x historical baseline (Viral Breakout)
    - T+24h Bucket: Requires >= 2.5x historical baseline (Fast Velocity Outlier)
    - T+168h Bucket: Requires >= 2.0x historical 168h baseline (Sustained Evergreen Outlier)
    """
    try:
        channels = load_channels()
        ch_meta = next((c for c in channels if c.get("id") == channel_id), None)
        channel_name = ch_meta.get("name", channel_id) if ch_meta else channel_id

        sb = get_sb()
        baseline_velocity = None

        if hour_checkpoint == 2:
            try:
                res = sb.table("channel_baselines_v2m").select("median_velocity_24h").eq("channel_id", channel_id).limit(1).execute()
                if res.data:
                    baseline_velocity = float(res.data[0].get("median_velocity_24h") or 1.0)
            except Exception:
                pass
            if not baseline_velocity or baseline_velocity <= 0:
                baseline_velocity = max(1.0, float(ch_meta.get("median_views_30d", 1000) if ch_meta else 1000) / 720.0)

            if current_velocity >= (baseline_velocity * 3.5):
                multiplier = round(current_velocity / baseline_velocity, 2)
                alert_payload = {
                    "id": video_id,
                    "title": f"Viral Breakout (T+2h) - {current_velocity:.1f} v/h ({multiplier}x baseline)",
                    "velocity": current_velocity,
                    "hour_checkpoint": 2
                }
                dispatch_outlier_alert(alert_payload, ch_meta or {"name": channel_name, "id": channel_id}, multiplier)

        elif hour_checkpoint == 24:
            try:
                res = sb.table("channel_baselines_v2m").select("median_velocity_24h").eq("channel_id", channel_id).limit(1).execute()
                if res.data:
                    baseline_velocity = float(res.data[0].get("median_velocity_24h") or 1.0)
            except Exception:
                pass
            if not baseline_velocity or baseline_velocity <= 0:
                baseline_velocity = max(1.0, float(ch_meta.get("median_views_30d", 1000) if ch_meta else 1000) / 720.0)

            if current_velocity >= (baseline_velocity * 2.5):
                multiplier = round(current_velocity / baseline_velocity, 2)
                alert_payload = {
                    "id": video_id,
                    "title": f"Fast Velocity Outlier (T+24h) - {current_velocity:.1f} v/h ({multiplier}x baseline)",
                    "velocity": current_velocity,
                    "hour_checkpoint": 24
                }
                dispatch_outlier_alert(alert_payload, ch_meta or {"name": channel_name, "id": channel_id}, multiplier)

        elif hour_checkpoint == 168:
            try:
                res = sb.table("channel_baselines_v2m_168h").select("median_velocity_168h").eq("channel_id", channel_id).limit(1).execute()
                if res.data:
                    baseline_velocity = float(res.data[0].get("median_velocity_168h") or 1.0)
            except Exception:
                pass
            if not baseline_velocity or baseline_velocity <= 0:
                baseline_velocity = max(1.0, float(ch_meta.get("median_views_30d", 1000) if ch_meta else 1000) / 1440.0)

            if current_velocity >= (baseline_velocity * 2.0):
                multiplier = round(current_velocity / baseline_velocity, 2)
                alert_payload = {
                    "id": video_id,
                    "title": f"Sustained Evergreen Outlier (T+7d) - {current_velocity:.1f} v/h ({multiplier}x baseline)",
                    "velocity": current_velocity,
                    "hour_checkpoint": 168
                }
                dispatch_outlier_alert(alert_payload, ch_meta or {"name": channel_name, "id": channel_id}, multiplier)
    except Exception as ex:
        print(f"[OutlierThreshold] Error evaluating video {video_id}: {ex}")

@app.route("/api/webhooks/youtube-sub", methods=["GET", "POST"])
def youtube_websub_webhook():
    """
    Google WebSub / PubSubHubbub webhook endpoint for real-time YouTube drop notifications.
    GET: Echoes hub.challenge to verify subscription.
    POST: Parses XML drop notifications and enriches newly published video (1 quota unit).
    """
    if request.method == "GET":
        challenge = request.args.get("hub.challenge", "")
        mode = request.args.get("hub.mode", "")
        topic = request.args.get("hub.topic", "")
        print(f"[WebSub] Verification request: mode={mode}, topic={topic}")
        if challenge:
            return Response(challenge, status=200, mimetype="text/plain")
        return "Missing hub.challenge", 400

    # POST: XML Atom drop notification
    try:
        raw_xml = request.get_data(as_text=True)
        if not raw_xml:
            return "Empty payload", 200

        root = ET.fromstring(raw_xml)
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "yt": "http://www.youtube.com/xml/dtd/2015"
        }

        entry = root.find("atom:entry", ns)
        if entry is None:
            return "OK - No entry", 200

        video_id_el = entry.find("yt:videoId", ns)
        channel_id_el = entry.find("yt:channelId", ns)
        title_el = entry.find("atom:title", ns)
        published_el = entry.find("atom:published", ns)

        video_id = video_id_el.text if video_id_el is not None else ""
        channel_id = channel_id_el.text if channel_id_el is not None else ""
        title = title_el.text if title_el is not None else "New Drop"
        published_at = published_el.text if published_el is not None else ""

        print(f"[WebSub] Real-time drop detected! Video: {video_id} ({title}) by Channel: {channel_id}")

        if video_id:
            # EDIT TRAP GUARD: Check if video is already tracked
            is_new_video = not db_video_exists(video_id)
            # Process single-video API fetch
            threading.Thread(target=_process_websub_drop, args=(video_id, channel_id, title, published_at, is_new_video), daemon=True).start()

        return "OK - Processed", 200
    except Exception as ex:
        print(f"[WebSub] XML parse error: {ex}")
        return f"Error: {ex}", 200

def _process_websub_drop(video_id: str, channel_id: str, title: str, published_at: str, is_new_video: bool = True):
    """Enrich video stats in background, update DB, queue snapshot schedule, and check for Outlier alerts."""
    try:
        yt = get_yt()
        record_quota_spend(1)
        res = yt.videos().list(id=video_id, part="snippet,statistics,contentDetails").execute()
        items = res.get("items", [])
        if not items:
            return

        item = items[0]
        snippet = item.get("snippet", {})
        stats = item.get("statistics", {})
        content_details = item.get("contentDetails", {})

        views = int(stats.get("viewCount", 0))
        likes = int(stats.get("likeCount", 0))
        comments = int(stats.get("commentCount", 0))
        thumb = snippet.get("thumbnails", {}).get("high", {}).get("url", "")
        duration = content_details.get("duration", "")

        # Save to Supabase
        try:
            sb = get_sb()
            sb.table("videos").upsert([{
                "id": video_id,
                "channel_id": channel_id,
                "title": snippet.get("title", title),
                "published_at": snippet.get("publishedAt", published_at),
                "view_count": views,
                "like_count": likes,
                "comment_count": comments,
                "thumbnail_url": thumb,
                "duration": duration
            }]).execute()
        except Exception as e:
            print(f"[WebSub] Supabase save warning: {e}")

        # If net-new video, queue T+2h, T+24h, T+168h snapshot checkpoints
        if is_new_video:
            schedule_video_snapshots(video_id, channel_id)

        # Check VRPI & Breakout Outlier
        channels = load_channels()
        ch_meta = next((c for c in channels if c.get("id") == channel_id), None)
        base_views = int(ch_meta.get("avg_views_raw", 1000) if ch_meta else 1000)
        daily_base = max(1.0, base_views / 30.0)
        
        vrpi = views / daily_base

        if vrpi >= 2.0 or views >= 500:
            video_data = {
                "id": video_id,
                "title": snippet.get("title", title),
                "view_count": views,
                "thumbnail_url": thumb,
                "published_at": snippet.get("publishedAt", published_at)
            }
            dispatch_outlier_alert(video_data, ch_meta or {"name": channel_id, "id": channel_id}, vrpi)

    except Exception as ex:
        print(f"[WebSub] _process_websub_drop error: {ex}")

@app.route("/api/cron/process-snapshots", methods=["GET", "POST"])
def cron_process_snapshots():
    """Process pending snapshot checkpoints due from snapshot_schedule table."""
    if is_circuit_breaker_active():
        return jsonify({"success": True, "circuit_breaker": True, "processed": 0})

    try:
        sb = get_sb()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        r = sb.table("snapshot_schedule").select("*").eq("status", "pending").lte("target_snapshot_at", now_iso).limit(50).execute()
        pending = r.data or []
        if not pending:
            return jsonify({"success": True, "processed": 0, "message": "No pending snapshots due"})

        video_ids = list(set(item["video_id"] for item in pending))
        yt = get_yt()
        record_quota_spend(1)
        res = yt.videos().list(id=",".join(video_ids), part="snippet,statistics").execute()
        stats_map = {item["id"]: item for item in res.get("items", [])}

        now_ts = time.time()
        snap_rows = []
        completed_ids = []

        for item in pending:
            vid = item["video_id"]
            cid = item.get("channel_id")
            v_data = stats_map.get(vid)
            if v_data:
                vc = int(v_data.get("statistics", {}).get("viewCount", 0))
                pub_str = v_data.get("snippet", {}).get("publishedAt", "")
                try:
                    t_pub = time.mktime(time.strptime(pub_str[:10], "%Y-%m-%d"))
                    age_hours = max(0.1, (now_ts - t_pub) / 3600.0)
                except Exception:
                    age_hours = float(item["hour_checkpoint"])

                snap_rows.append({
                    "video_id": vid,
                    "channel_id": cid or "unknown",
                    "recorded_at": now_iso,
                    "age_hours": round(age_hours, 2),
                    "view_count": vc
                })

                # Evaluate Time-Bucketed Outlier Thresholds (v5.0 Patch 2 & 4)
                current_vel = vc / max(0.1, age_hours)
                evaluate_outlier_threshold(vid, cid or "unknown", current_vel, int(item.get("hour_checkpoint", 24)))

            completed_ids.append(item["id"])

        if snap_rows:
            try:
                sb.table("video_snapshots_v4").insert(snap_rows).execute()
            except Exception:
                try:
                    sb.table("video_snapshots").insert(snap_rows).execute()
                except Exception:
                    pass

        if completed_ids:
            sb.table("snapshot_schedule").update({"status": "completed", "executed_at": now_iso}).in_("id", completed_ids).execute()

        return jsonify({"success": True, "processed": len(completed_ids), "snapshots_recorded": len(snap_rows)})
    except Exception as ex:
        print(f"[SnapshotWorker] Notice: {ex}")
        return jsonify({"success": True, "processed": 0, "notice": str(ex)})

@app.route("/api/intelligence/score-title", methods=["POST"])
def api_score_title():
    """Server-side title scoring with semantic keyword demand and curiosity analysis."""
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    if not title:
        return jsonify({"success": False, "error": "Title required"}), 400

    length = len(title)
    len_score = 25 if (40 <= length <= 60) else (18 if (30 <= length <= 70) else 10)
    has_hook = bool(re.search(r"\b(how|why|secret|secrets|never|ultimate|masterclass|explained|truth|stop|fast|guide|pro|mistakes|best|worst|vs|real|built|build|break|making|first|full|revolution|future|revealed)\b", title, re.I))
    has_number = bool(re.search(r"\b\d+\b", title))
    has_brackets = bool(re.search(r"[\[\]\(\)]", title))
    hook_score = (9 if has_hook else 0) + (8 if has_number else 0) + (8 if has_brackets else 0)

    hook_match = re.search(r"\b(how|why|secret|secrets|never|ultimate|masterclass|explained|truth|stop|fast|guide|pro|mistakes|best|worst|vs|real|built|build|break|making|first|full|revolution|future|revealed|\d+)\b", title, re.I)
    hook_index = hook_match.start() if hook_match else -1
    is_hook_before_fold = (hook_index == -1) or (hook_index <= 48)

    score = min(100, len_score + hook_score + 35 + 15)

    return jsonify({
        "success": True,
        "title": title,
        "score": score,
        "length": length,
        "is_hook_before_fold": is_hook_before_fold,
        "visible_title": title[:50],
        "truncated_title": title[50:] if length > 50 else "",
        "has_truncation": length > 50
    })

def subscribe_channel_websub(channel_id: str, hub_url: str = "https://pubsubhubbub.appspot.com/subscribe", callback_url: str = None) -> bool:
    """Send subscription request to Google WebSub hub for a channel's upload feed."""
    if not callback_url:
        return False
    try:
        topic_url = f"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channel_id}"
        data = urllib.parse.urlencode({
            "hub.callback": callback_url,
            "hub.mode": "subscribe",
            "hub.topic": topic_url,
            "hub.verify": "async"
        }).encode("utf-8")

        req = urllib.request.Request(hub_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status in (202, 204)
    except Exception as ex:
        print(f"[WebSub] Subscription error for {channel_id}: {ex}")
        return False


# ── Phase 5: Outlier Radar Webhook System ─────────────────────────────────────

_WEBHOOK_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

def load_webhook_settings() -> dict:
    """Load user webhook configuration."""
    default_cfg = {
        "webhook_url": "",
        "platform": "discord",  # 'discord' | 'slack'
        "min_vrpi": 2.5,
        "enabled": False
    }
    if os.path.exists(_WEBHOOK_SETTINGS_FILE):
        try:
            with open(_WEBHOOK_SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return { **default_cfg, **data }
        except Exception:
            pass
    return default_cfg

def save_webhook_settings(cfg: dict):
    """Persist user webhook configuration."""
    try:
        with open(_WEBHOOK_SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as ex:
        print(f"[Webhook] Error saving settings: {ex}")

def dispatch_outlier_alert(video_data: dict, channel_data: dict, vrpi_score: float, custom_url: str = None) -> bool:
    """Dispatch rich breakout outlier embed to Discord or Slack."""
    cfg = load_webhook_settings()
    url = custom_url or cfg.get("webhook_url", "")
    if not url:
        return False
    
    platform = cfg.get("platform", "discord").lower()
    ch_name = channel_data.get("name", "Competitor Channel")
    v_title = video_data.get("title", "Video")
    v_views = fmt(video_data.get("view_count", 0))
    v_id = video_data.get("id", "")
    v_url = f"https://www.youtube.com/watch?v={v_id}"
    thumb_url = video_data.get("thumbnail_url", "")

    try:
        if "discord.com" in url or platform == "discord":
            payload = {
                "username": "YT Tracker Radar",
                "avatar_url": "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/radar.png",
                "embeds": [{
                    "title": f"🔥 BREAKOUT OUTLIER DETECTED ({vrpi_score:.1f}× Velocity)",
                    "description": f"**[{v_title}]({v_url})**\n\nUploaded by **{ch_name}** and surging at **{vrpi_score:.1f}×** channel baseline velocity!",
                    "url": v_url,
                    "color": 16728132,  # #ef4444 Red
                    "fields": [
                        {"name": "Channel", "value": ch_name, "inline": True},
                        {"name": "Views", "value": v_views, "inline": True},
                        {"name": "Velocity Multiplier", "value": f"{vrpi_score:.1f}× Baseline", "inline": True}
                    ],
                    "image": {"url": thumb_url} if thumb_url else {},
                    "footer": {"text": "YT Tracker Outlier Radar • Zero-Quota Alert"}
                }]
            }
        else:
            payload = {
                "text": f"🔥 *BREAKOUT OUTLIER DETECTED ({vrpi_score:.1f}× Velocity)*\n*<{v_url}|{v_title}>* by *{ch_name}*\nViews: {v_views} | Multiplier: {vrpi_score:.1f}×"
            }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "YTTracker-OutlierRadar/1.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status in (200, 204)
    except Exception as ex:
        print(f"[Webhook] Dispatch failed: {ex}")
        return False

@app.route("/api/settings/get-webhook", methods=["GET"])
def get_webhook_config():
    """Return stored webhook settings."""
    return jsonify(load_webhook_settings())

@app.route("/api/settings/save-webhook", methods=["POST"])
def save_webhook_config():
    """Save webhook settings."""
    body = request.get_json(silent=True) or {}
    cfg = {
        "webhook_url": body.get("webhook_url", "").strip(),
        "platform": body.get("platform", "discord").strip(),
        "min_vrpi": float(body.get("min_vrpi", 2.5)),
        "enabled": bool(body.get("enabled", False))
    }
    save_webhook_settings(cfg)
    return jsonify({"success": True, "settings": cfg})

@app.route("/api/settings/test-webhook", methods=["POST"])
def test_webhook_alert():
    """Send a test embed to verify user webhook URL."""
    body = request.get_json(silent=True) or {}
    url = body.get("webhook_url", "").strip() or load_webhook_settings().get("webhook_url", "")
    if not url:
        return jsonify({"success": False, "error": "Webhook URL is required"}), 400

    test_video = {
        "id": "dQw4w9WgXcQ",
        "title": "Why SolidWorks Sheet Metal Fails: The Secret K-Factor Guide",
        "view_count": 48200,
        "thumbnail_url": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80"
    }
    test_channel = {"name": "Titan CAD & Engineering", "id": "UC_titan_sample"}
    
    ok = dispatch_outlier_alert(test_video, test_channel, 3.8, custom_url=url)
    if ok:
        return jsonify({"success": True, "message": "Test webhook alert dispatched successfully!"})
    else:
        return jsonify({"success": False, "error": "Failed to send webhook. Check your URL."}), 502

@app.route("/api/cron/check-outliers", methods=["GET", "POST"])
def cron_check_outliers():
    """Scan recent drops across competitor cohort and trigger alerts for videos exceeding VRPI threshold."""
    cfg = load_webhook_settings()
    if not cfg.get("enabled") or not cfg.get("webhook_url"):
        return jsonify({"success": True, "skipped": "Webhook disabled or URL unset", "alerts_sent": 0})

    min_vrpi = float(cfg.get("min_vrpi", 2.5))
    alerts_sent = 0

    try:
        channels = load_channels()
        now = time.time()

        for ch in channels:
            if ch.get("is_primary"):
                continue
            cid = ch["id"]
            en = _full_cache.get(cid) or _video_cache.get(cid)
            if not en or not en.get("data"):
                continue

            base_views = max(1, int(ch.get("avg_views_raw", 1000)))
            daily_base = max(1.0, base_views / 30.0)

            for v in en["data"][:8]:
                pub_str = v.get("published_at") or v.get("date")
                if not pub_str:
                    continue
                try:
                    # Parse publication date
                    t_pub = time.mktime(time.strptime(pub_str[:10], "%Y-%m-%d"))
                    days_old = max(0.04, (now - t_pub) / 86400.0)
                    if days_old > 14.0:
                        continue # Only alert for fresh drops <= 14 days
                    
                    vc = int(v.get("view_count") or v.get("views_raw") or 0)
                    daily_vel = vc / days_old
                    raw_vrpi = daily_vel / daily_base
                    
                    if raw_vrpi >= min_vrpi:
                        ok = dispatch_outlier_alert(v, ch, raw_vrpi)
                        if ok:
                            alerts_sent += 1
                except Exception:
                    pass

        return jsonify({"success": True, "alerts_sent": alerts_sent})
    except Exception as ex:
        print(f"[CronOutliers] Error: {ex}")
        return jsonify({"success": False, "error": str(ex), "alerts_sent": 0}), 500


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
