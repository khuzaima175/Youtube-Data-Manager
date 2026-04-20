"""
YT Tracker — Flask backend
Serves the dashboard and proxies YouTube Data API v3 requests.
"""

import os
import re
import json
import time
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from googleapiclient.discovery import build

load_dotenv()

API_KEY   = os.getenv("YOUTUBE_API_KEY", "")
DEBUG     = os.getenv("FLASK_DEBUG", "0") == "1"
MAX_CHANNELS = 20          # soft cap to protect API quota

app = Flask(__name__, static_folder="static")

# Restrict CORS to localhost only in dev; tighten for production
CORS(app, origins=["http://localhost:5000", "http://127.0.0.1:5000"])

DATA_FILE = Path(__file__).parent / "channels.json"

# Simple in-memory rate limiter: {ip: last_add_timestamp}
_last_add: dict[str, float] = {}
ADD_THROTTLE_SECS = 5   # minimum seconds between add requests per IP


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


def load_channels() -> list:
    """Load channels from JSON file. Returns empty list on error."""
    try:
        if DATA_FILE.exists():
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError):
        pass
    return []


def save_channels(channels: list) -> None:
    """Atomically save channels to JSON (temp file + rename prevents corruption)."""
    tmp = DATA_FILE.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(channels, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
    except OSError:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


def build_yt():
    """Build YouTube API client. Raises ValueError if API key is missing."""
    if not API_KEY:
        raise ValueError("YOUTUBE_API_KEY is not set in .env")
    return build("youtube", "v3", developerKey=API_KEY)


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


@app.route("/api/channels", methods=["GET"])
def get_channels():
    """Return all saved channels."""
    return jsonify(load_channels())


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
        channels.append(d)
        save_channels(channels)
        return jsonify({"success": True, "channel": d})
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to add channel", 500)


@app.route("/api/channels/<channel_id>", methods=["DELETE"])
def delete_channel(channel_id):
    """Remove a channel from the tracking list."""
    channels = load_channels()
    new_list = [c for c in channels if c["id"] != channel_id]
    if len(new_list) == len(channels):
        return api_error("Channel not found", 404)
    # If deleted channel was primary, promote the first remaining
    if new_list and not any(c.get("is_primary") for c in new_list):
        new_list[0]["is_primary"] = True
    save_channels(new_list)
    return jsonify({"success": True})


@app.route("/api/channels/<channel_id>/refresh", methods=["POST"])
def refresh_channel(channel_id):
    """Refresh stats for a single channel from YouTube API."""
    try:
        yt = build_yt()
        d, e = fetch_full_channel(yt, channel_id=channel_id)
        if e:
            return api_error(e, 404)

        channels = load_channels()
        for i, c in enumerate(channels):
            if c["id"] == channel_id:
                d["is_primary"]    = c.get("is_primary", False)
                d["added_at"]      = c.get("added_at", "")
                d["last_refreshed"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                channels[i]        = d
                break
        save_channels(channels)
        return jsonify({"success": True, "channel": d})
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to refresh channel", 500)


@app.route("/api/channels/<channel_id>/set-primary", methods=["POST"])
def set_primary(channel_id):
    """Set a channel as the user's primary channel."""
    channels = load_channels()
    found = False
    for c in channels:
        c["is_primary"] = (c["id"] == channel_id)
        if c["id"] == channel_id:
            found = True
    if not found:
        return api_error("Channel not found", 404)
    save_channels(channels)
    return jsonify({"success": True})


@app.route("/api/channels/<channel_id>/videos")
def channel_videos(channel_id):
    """Return recent videos for a channel."""
    try:
        n  = min(int(request.args.get("max", 6)), 20)
        yt = build_yt()
        return jsonify(fetch_recent_videos(yt, channel_id, n))
    except ValueError as ex:
        return api_error(str(ex), 503)
    except Exception:
        return api_error("Failed to fetch videos", 500)


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

    from flask import Response
    return Response(
        "\n".join(lines),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=yt_tracker_channels.csv"}
    )


if __name__ == "__main__":
    if not API_KEY:
        print("⚠  WARNING: YOUTUBE_API_KEY not set in .env — API calls will fail.")
    print("YT Tracker running at http://localhost:5000")
    app.run(debug=DEBUG, port=5000)
