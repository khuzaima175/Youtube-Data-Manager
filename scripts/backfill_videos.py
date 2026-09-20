"""
One-time / on-demand backfill script:
Populates the Supabase `videos` table with historical videos for all tracked channels.
"""
import os
import sys
import time
import re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Add root to sys.path so we can import helpers
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from supabase import create_client
from googleapiclient.discovery import build

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
API_KEY      = os.getenv("YOUTUBE_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set in .env")
    sys.exit(1)

if not API_KEY:
    print("ERROR: YOUTUBE_API_KEY not set in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
yt = build("youtube", "v3", developerKey=API_KEY)


def parse_duration(s: str) -> int:
    """Parse ISO 8601 duration string to total seconds. PT14M20S -> 860"""
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', s or '')
    if not m:
        return 0
    h, mn, sec = (int(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + sec


def classify_is_short(duration_seconds: int, thumb_width: int, thumb_height: int) -> bool:
    """
    Classify video as YouTube Short.
    YouTube expanded Shorts to 3 min (180s) in Oct 2024 with orientation requirement.
    """
    if duration_seconds is None or duration_seconds > 183:
        return False
    if thumb_width and thumb_height:
        return thumb_height > thumb_width
    return duration_seconds <= 60


def best_thumb_info(thumbnails: dict):
    for size in ("maxres", "standard", "high", "medium", "default"):
        t = thumbnails.get(size)
        if t and t.get("url"):
            return t.get("url"), t.get("width", 0), t.get("height", 0)
    return "", 0, 0


def backfill_all_channels():
    print("=" * 60)
    print("  YT TRACKER — VIDEO PERSISTENCE BACKFILL (Module 0)")
    print("=" * 60)

    try:
        r = sb.table("channels").select("*").execute()
        channels = r.data or []
    except Exception as e:
        print(f"FAIL: Could not load channels from Supabase: {e}")
        return

    if not channels:
        print("No channels found in Supabase `channels` table.")
        return

    print(f"Found {len(channels)} tracked channel(s). Starting backfill...\n")
    total_synced = 0

    for idx, ch in enumerate(channels, 1):
        cid = ch["id"]
        cname = ch.get("name", cid)
        print(f"[{idx}/{len(channels)}] Fetching videos for {cname} ({cid})...")

        try:
            cr = yt.channels().list(part="contentDetails", id=cid).execute()
            if not cr.get("items"):
                print(f"    WARN: Channel details not found for {cid}")
                continue

            uploads_pid = cr["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
            pl = yt.playlistItems().list(
                part="snippet", playlistId=uploads_pid, maxResults=50
            ).execute()
            items = pl.get("items", [])
            if not items:
                print(f"    No uploads found for {cname}")
                continue

            ids = [i["snippet"]["resourceId"]["videoId"] for i in items]
            vr = yt.videos().list(part="snippet,statistics,contentDetails", id=",".join(ids)).execute()
            video_meta = {v["id"]: v for v in vr.get("items", [])}

            rows_to_upsert = []
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            for item in items:
                sn = item["snippet"]
                vid_id = sn["resourceId"]["videoId"]
                v_detail = video_meta.get(vid_id, {})
                stats = v_detail.get("statistics", {})
                cd = v_detail.get("contentDetails", {})
                sn_detail = v_detail.get("snippet", sn)

                dur_s = parse_duration(cd.get("duration", ""))
                thumb_url, tw, th = best_thumb_info(sn_detail.get("thumbnails", sn.get("thumbnails", {})))
                is_short = classify_is_short(dur_s, tw, th)

                published_at = sn.get("publishedAt") or now_iso
                views = int(stats.get("viewCount", 0))
                likes = int(stats.get("likeCount", 0))
                comments = int(stats.get("commentCount", 0))
                title = sn.get("title", "")

                rows_to_upsert.append({
                    "video_id": vid_id,
                    "channel_id": cid,
                    "title": title,
                    "published_at": published_at,
                    "duration_seconds": dur_s,
                    "views": views,
                    "likes": likes,
                    "comments": comments,
                    "thumbnail_url": thumb_url,
                    "thumbnail_width": tw,
                    "thumbnail_height": th,
                    "is_short": is_short,
                    "last_synced_at": now_iso
                })

            if rows_to_upsert:
                # Upsert into Supabase videos table
                res = sb.table("videos").upsert(rows_to_upsert, on_conflict="video_id").execute()
                count = len(res.data or rows_to_upsert)
                total_synced += count
                print(f"    OK  Upserted {count} videos into `videos` table.")
            time.sleep(0.2)
        except Exception as ex:
            print(f"    FAIL: Error syncing {cname}: {ex}")

    print("\n" + "=" * 60)
    print(f"  BACKFILL COMPLETED: {total_synced} total videos synced!")
    print("=" * 60)


if __name__ == "__main__":
    backfill_all_channels()
