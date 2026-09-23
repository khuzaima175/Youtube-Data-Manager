"""
Unit & Integration tests for Phases 1-6 upgrades:
- WebSub challenge & XML ingestion
- FastEmbed / Semantic vector clustering
- Webhook settings & Outlier radar
- VRPI & age decay math
"""

import json
import xml.etree.ElementTree as ET
from server import app, cosine_similarity, cluster_titles_semantic

def test_websub_get_challenge():
    client = app.test_client()
    resp = client.get("/api/webhooks/youtube-sub?hub.challenge=chal_abc123&hub.mode=subscribe&hub.topic=test")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert resp.data.decode("utf-8") == "chal_abc123", f"Expected chal_abc123, got {resp.data.decode('utf-8')}"
    print("PASS: WebSub GET hub.challenge verification")

def test_websub_post_xml():
    client = app.test_client()
    sample_xml = """<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/dtd/2015">
      <title>YouTube video feed</title>
      <entry>
        <id>yt:video:test_vid_999</id>
        <yt:videoId>test_vid_999</yt:videoId>
        <yt:channelId>UC_test_chan_123</yt:channelId>
        <title>Fast 5-Axis CNC Mill Automation</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=test_vid_999"/>
        <published>2026-09-23T12:00:00+00:00</published>
      </entry>
    </feed>"""
    resp = client.post("/api/webhooks/youtube-sub", data=sample_xml, content_type="application/atom+xml")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    print("PASS: WebSub POST XML Atom drop ingestion")

def test_semantic_clusters():
    client = app.test_client()
    sample_videos = [
        {"title": "How SolidWorks Sheet Metal K-Factor Works", "view_count": 50000, "channel_id": "c1"},
        {"title": "SolidWorks Sheet Metal Bend Tables & Radius", "view_count": 42000, "channel_id": "c1"},
        {"title": "Best Budget 3D Printer Direct Drive Extruder", "view_count": 89000, "channel_id": "c2"},
        {"title": "Why Your FDM 3D Printer Extruder Clogs", "view_count": 64000, "channel_id": "c2"}
    ]
    resp = client.post("/api/topics/semantic-clusters", json={"videos": sample_videos, "threshold": 0.50})
    data = resp.get_json()
    if resp.status_code == 200:
        assert data.get("success") is True
        assert len(data.get("clusters", [])) >= 1
        print(f"PASS: Semantic vector clustering with FastEmbed (Found {len(data['clusters'])} clusters)")
    else:
        # Landmine 4 Fix: Verified strict refusal to silently fall back to N-grams
        assert resp.status_code == 503
        assert data.get("model_unavailable") is True
        print("PASS: Strict FastEmbed enforcement verified (Refused silent N-gram fallback, returned 503)")

def test_webhook_settings():
    client = app.test_client()
    # Save settings
    cfg = {
        "webhook_url": "https://discord.com/api/webhooks/dummy/sample",
        "platform": "discord",
        "min_vrpi": 3.0,
        "enabled": False
    }
    resp = client.post("/api/settings/save-webhook", json=cfg)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["settings"]["min_vrpi"] == 3.0

    # Get settings
    resp2 = client.get("/api/settings/get-webhook")
    assert resp2.status_code == 200
    saved = resp2.get_json()
    assert saved["webhook_url"] == "https://discord.com/api/webhooks/dummy/sample"
    print("PASS: Webhook settings save & retrieve")

def test_cron_outliers():
    client = app.test_client()
    resp = client.post("/api/cron/check-outliers")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    print("PASS: Cron outlier checker scanner")

def test_score_title_endpoint():
    client = app.test_client()
    resp = client.post("/api/intelligence/score-title", json={"title": "How SolidWorks 2026 Solves Sheet Metal K-Factor (Full Guide)"})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.get_json()
    assert data.get("success") is True
    assert data.get("score") > 70
    assert data.get("is_hook_before_fold") is True
    assert "visible_title" in data
    print(f"PASS: /api/intelligence/score-title endpoint (Score: {data.get('score')})")

def test_cron_process_snapshots_endpoint():
    client = app.test_client()
    resp = client.post("/api/cron/process-snapshots")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    print("PASS: /api/cron/process-snapshots endpoint")

def test_circuit_breaker_and_quota_ledger():
    from server import get_daily_quota_spend, is_circuit_breaker_active, record_quota_spend
    spend = get_daily_quota_spend()
    assert isinstance(spend, int)
    breaker = is_circuit_breaker_active()
    assert isinstance(breaker, bool)
    print(f"PASS: Circuit breaker quota tracking (Current spend: {spend} units, Breaker: {breaker})")

def test_zero_shot_archetype_mapping():
    from server import map_topic_archetypes
    b2b = map_topic_archetypes(["solidworks", "cad", "sheet metal"])
    assert "Workflow Optimization" in b2b or "Deep Dive" in b2b
    
    vlog = map_topic_archetypes(["impossible", "stress test", "broke"])
    assert "Impossible Feat" in vlog or "Stress Test" in vlog
    
    edu = map_topic_archetypes(["guide", "tutorial", "beginners"])
    assert "Zero-to-Mastery" in edu or "Step-by-Step Guide" in edu
    
    news = map_topic_archetypes(["news", "breaking", "update"])
    assert "Breaking Analysis" in news or "Industry Update" in news
    
    fallback = map_topic_archetypes(["unknownxyz"])
    assert len(fallback) >= 1
    print("PASS: Zero-shot archetype pseudo-sentence mapping (All 4 classes + Fallback verified)")

def test_time_bucketed_outliers():
    from server import evaluate_outlier_threshold
    # Should not raise exception
    evaluate_outlier_threshold("test_vid_1", "test_cid", 500.0, 2)
    evaluate_outlier_threshold("test_vid_2", "test_cid", 200.0, 24)
    evaluate_outlier_threshold("test_vid_3", "test_cid", 50.0, 168)
    print("PASS: Time-bucketed outlier threshold evaluation (T+2h, T+24h, T+168h)")

def test_pacific_time_quota():
    from server import get_pacific_date_str
    pt_date = get_pacific_date_str()
    assert len(pt_date) == 10
    assert pt_date.count("-") == 2
    print(f"PASS: Pacific Time quota date resolution (PT Date: {pt_date})")

def test_refresh_baselines_endpoint():
    client = app.test_client()
    resp = client.post("/api/cron/refresh-baselines")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    print("PASS: /api/cron/refresh-baselines concurrent materialized view refresh")

def test_sql_schema_migration():
    with open("scripts/migration_v4_schema.sql", "r", encoding="utf-8") as f:
        sql = f.read()
    assert "CREATE TABLE IF NOT EXISTS snapshot_schedule" in sql
    assert "USING hnsw (centroid_vector vector_cosine_ops)" in sql
    assert "CREATE TABLE IF NOT EXISTS video_snapshots_v4" in sql
    assert "CREATE MATERIALIZED VIEW IF NOT EXISTS channel_baselines_v2m" in sql
    assert "CREATE MATERIALIZED VIEW IF NOT EXISTS channel_baselines_v2m_168h" in sql
    assert "CREATE TABLE IF NOT EXISTS quota_ledger" in sql
    assert "CREATE OR REPLACE FUNCTION refresh_channel_baselines()" in sql
    print("PASS: scripts/migration_v4_schema.sql schema verification (including 168h view & refresh procedure)")

if __name__ == "__main__":
    test_websub_get_challenge()
    test_websub_post_xml()
    test_semantic_clusters()
    test_webhook_settings()
    test_cron_outliers()
    test_score_title_endpoint()
    test_cron_process_snapshots_endpoint()
    test_circuit_breaker_and_quota_ledger()
    test_zero_shot_archetype_mapping()
    test_time_bucketed_outliers()
    test_pacific_time_quota()
    test_refresh_baselines_endpoint()
    test_sql_schema_migration()
    print("\nALL BACKEND AUTOMATED TESTS PASSED (13/13)!")
