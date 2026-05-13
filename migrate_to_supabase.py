"""
One-time migration: import local channels.json + snapshots.json into Supabase.
Safe to run multiple times (uses upsert).
"""
import json
import sys
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BASE = Path(__file__).parent

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY missing from .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
print("OK  Supabase client created\n")

# -- 1. Channels --------------------------------------------------------------
channels_file = BASE / "channels.json"
if channels_file.exists():
    channels = json.loads(channels_file.read_text(encoding="utf-8"))
    print(f"[Channels] Found {len(channels)} local channels")
    if channels:
        result = sb.table("channels").upsert(channels, on_conflict="id").execute()
        print(f"[Channels] Upserted {len(result.data)} rows into Supabase")
    else:
        print("[Channels] Nothing to migrate")
else:
    print("[Channels] channels.json not found -- skipping")

# -- 2. Snapshots -------------------------------------------------------------
snapshots_file = BASE / "snapshots.json"
if snapshots_file.exists():
    raw = json.loads(snapshots_file.read_text(encoding="utf-8"))

    # Only keep snapshots for channel_ids that exist in Supabase channels table
    existing_ids_result = sb.table("channels").select("id").execute()
    valid_ids = {row["id"] for row in (existing_ids_result.data or [])}
    print(f"\n[Snapshots] Valid channel IDs in Supabase: {len(valid_ids)}")

    rows = []
    skipped_channels = set()
    for channel_id, entries in raw.items():
        if channel_id not in valid_ids:
            skipped_channels.add(channel_id)
            continue
        for entry in entries:
            rows.append({
                "channel_id":  channel_id,
                "date":        entry["date"],
                "subscribers": entry["subscribers"],
                "views":       entry["views"],
            })

    if skipped_channels:
        print(f"[Snapshots] Skipped {len(skipped_channels)} orphan channel(s) (not in channels table): {skipped_channels}")

    print(f"[Snapshots] Migrating {len(rows)} snapshot rows")
    if rows:
        for i in range(0, len(rows), 500):
            chunk = rows[i:i+500]
            sb.table("snapshots").upsert(chunk, on_conflict="channel_id,date").execute()
            print(f"[Snapshots] Upserted rows {i+1}-{i+len(chunk)}")
    else:
        print("[Snapshots] Nothing to migrate")
else:
    print("\n[Snapshots] snapshots.json not found -- skipping")

print("\nDONE  Migration complete! Supabase DB is now in sync.")
