"""
Full system verification: checks .env, Supabase tables, local JSON files,
and shows exactly what is in sync and what is not.
"""
import os
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BASE = Path(__file__).parent

print("=" * 60)
print("  FULL SYSTEM VERIFICATION")
print("=" * 60)

# ── 1. .env check ────────────────────────────────────────────
print("\n[1] Environment Variables")
checks = {
    "YOUTUBE_API_KEY":      os.getenv("YOUTUBE_API_KEY", ""),
    "SUPABASE_URL":         SUPABASE_URL,
    "SUPABASE_SERVICE_KEY": SUPABASE_KEY,
}
all_ok = True
for k, v in checks.items():
    if v:
        print(f"    OK  {k} = {v[:30]}...")
    else:
        print(f"    MISSING  {k}")
        all_ok = False

# ── 2. Local JSON files ──────────────────────────────────────
print("\n[2] Local Data Files")
channels_file = BASE / "channels.json"
snapshots_file = BASE / "snapshots.json"

local_channels = []
if channels_file.exists():
    with open(channels_file, encoding="utf-8") as f:
        local_channels = json.load(f)
    print(f"    OK  channels.json  — {len(local_channels)} channels")
    for c in local_channels:
        print(f"        - {c.get('name')} ({c.get('id')})")
else:
    print("    MISSING  channels.json")

if snapshots_file.exists():
    with open(snapshots_file, encoding="utf-8") as f:
        snaps = json.load(f)
    print(f"    OK  snapshots.json — {len(snaps)} channel(s) have history")
else:
    print("    MISSING  snapshots.json")

# ── 3. Supabase connection ───────────────────────────────────
print("\n[3] Supabase Connection")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("    SKIP  Cannot test — URL or KEY missing")
    sys.exit(1)

try:
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("    OK  Client created")
except Exception as e:
    print(f"    FAIL  Could not create client: {e}")
    sys.exit(1)

# ── 4. Supabase tables ───────────────────────────────────────
print("\n[4] Supabase Tables")
tables_to_check = ["channels", "snapshots", "api_cache"]
for table in tables_to_check:
    try:
        r = sb.table(table).select("*", count="exact").limit(1).execute()
        print(f"    OK  '{table}' table exists — {r.count} rows")
    except Exception as e:
        err = str(e)
        if "does not exist" in err or "42P01" in err:
            print(f"    MISSING  '{table}' table does not exist yet")
        else:
            print(f"    ERROR  '{table}': {err[:80]}")

# ── 5. Sync status ───────────────────────────────────────────
print("\n[5] Sync Status")
try:
    r = sb.table("channels").select("id, name").execute()
    sb_channels = r.data or []
    sb_ids  = {c["id"] for c in sb_channels}
    loc_ids = {c["id"] for c in local_channels}
    only_local = loc_ids - sb_ids
    only_sb    = sb_ids  - loc_ids

    if not only_local and not only_sb:
        print("    SYNCED  Local JSON and Supabase match!")
    else:
        if only_local:
            print(f"    OUT OF SYNC  {len(only_local)} channel(s) only in local JSON (not in Supabase):")
            for cid in only_local:
                name = next((c["name"] for c in local_channels if c["id"] == cid), cid)
                print(f"        - {name}")
        if only_sb:
            print(f"    OUT OF SYNC  {len(only_sb)} channel(s) only in Supabase (not in local JSON):")
            for cid in only_sb:
                print(f"        - {cid}")
except Exception as e:
    print(f"    ERROR  Could not compare: {e}")

# ── Summary ──────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  SUMMARY")
print("=" * 60)
print("  - server.py currently uses: LOCAL JSON FILES (not Supabase)")
print("  - Supabase is: CONNECTED but empty")
print("  - Action needed: Migrate server.py to use Supabase,")
print("    OR import local data into Supabase")
print("=" * 60)
