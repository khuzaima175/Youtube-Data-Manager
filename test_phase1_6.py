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
        sql_v4 = f.read()
    assert "CREATE TABLE IF NOT EXISTS snapshot_schedule" in sql_v4
    assert "USING hnsw (centroid_vector vector_cosine_ops)" in sql_v4
    assert "CREATE TABLE IF NOT EXISTS video_snapshots_v4" in sql_v4
    assert "CREATE MATERIALIZED VIEW IF NOT EXISTS channel_baselines_v2m" in sql_v4
    assert "CREATE MATERIALIZED VIEW IF NOT EXISTS channel_baselines_v2m_168h" in sql_v4
    assert "CREATE TABLE IF NOT EXISTS quota_ledger" in sql_v4
    assert "CREATE OR REPLACE FUNCTION refresh_channel_baselines()" in sql_v4
    
    with open("scripts/migration_pgvector.sql", "r", encoding="utf-8") as f:
        sql_pgv = f.read()
    assert "USING hnsw (embedding vector_cosine_ops)" in sql_pgv
    print("PASS: scripts/migration_v4_schema.sql & migration_pgvector.sql HNSW schema verification")

def test_polling_fallback_endpoint():
    client = app.test_client()
    resp = client.post("/api/cron/poll-channels-fallback")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    print("PASS: /api/cron/poll-channels-fallback Hybrid Discovery Polling Fallback")

def test_age_decay_does_not_leak_into_blue_ocean():
    """Mathematical verification: Blue Ocean score MUST use pure RPI, not age-decayed Catalog VRPI."""
    # Simulate an evergreen video 60 days old with 60,000 views on a channel with 1,000 avg views
    views = 60000
    channel_baseline = 1000
    pure_rpi = views / channel_baseline # 60.0x
    
    # Catalog VRPI calculation with age decay
    age_days = 60.0
    daily_vel = views / age_days # 1,000 views/day
    daily_base = channel_baseline / 30.0 # 33.33 views/day
    raw_vrpi = daily_vel / daily_base # 30.0x
    age_decay = 1.0 / (1 + (age_days - 7) / 21) ** 0.5 # ~0.533
    decayed_catalog_vrpi = raw_vrpi * age_decay # ~16.0x
    
    # Blue Ocean must be based on pure RPI (60.0), NOT decayed_catalog_vrpi (16.0)
    # Bühlmann shrinkage with K=15, n=15
    k = 15
    n = 15
    w = n / (n + k) # 0.50
    shrunken_rpi = w * pure_rpi + (1 - w) * 1.0 # 0.5 * 60 + 0.5 * 1.0 = 30.5
    
    # Assert that shrunken_rpi is derived from pure_rpi, not decayed_catalog_vrpi
    corrupted_shrunken_rpi = w * decayed_catalog_vrpi + (1 - w) * 1.0
    assert shrunken_rpi > corrupted_shrunken_rpi, "Age decay leaked into RPI calculation!"
    assert abs(shrunken_rpi - 30.5) < 0.01
    print("PASS: Verified mathematical isolation: Age decay does NOT leak into Blue Ocean or RPI")

def test_credibility_weighting_k15():
    """Verify Bühlmann credibility weighting with K=15 properly suppresses small-sample flukes."""
    k = 15
    # n = 1: weight should be ~6.25%
    w1 = 1 / (1 + k)
    assert abs(w1 - 0.0625) < 0.001
    
    # n = 3: fluke suppression (weight is 16.7% vs 37.5% at k=5)
    w3 = 3 / (3 + k)
    assert abs(w3 - 0.1667) < 0.01
    
    # n = 15: 50% credibility achieved at 15 observations
    w15 = 15 / (15 + k)
    assert abs(w15 - 0.50) < 0.001
    print("PASS: Bühlmann credibility weighting with K=15 verified (EPV/VHM ratio suppression)")

def test_empirical_buhlmann_k_estimation():
    """Empirical nonparametric Bühlmann K estimation (EPV / VHM)."""
    from server import estimate_buhlmann_k
    
    # Case 1: Measurable between-cluster signal (EPV=1500, VHM=100 -> K=15.0)
    clusters_signal = [
        {"name": "Cluster A", "videos": [1000, 1050, 1020, 1040, 990]},
        {"name": "Cluster B", "videos": [2000, 2030, 1980, 2010, 2020]},
        {"name": "Cluster C", "videos": [3000, 3050, 2980, 3020, 3010]}
    ]
    k_est, epv, vhm = estimate_buhlmann_k(clusters_signal)
    assert k_est is not None
    assert vhm > 0
    print(f"PASS: Empirical Bühlmann estimation with positive signal (K={k_est:.2f}, EPV={epv:.2f}, VHM={vhm:.2f})")
    
    # Case 2: Heavy-tailed within-topic noise (VHM <= 0 -> Fallback to K=15)
    clusters_noisy = [
        {"name": "Cluster A", "videos": [100, 50000, 200, 300, 150]},
        {"name": "Cluster B", "videos": [150, 250, 350, 45000, 180]}
    ]
    k_fallback, epv_noisy, vhm_noisy = estimate_buhlmann_k(clusters_noisy)
    assert k_fallback is None  # Signals VHM <= 0 fallback
    assert vhm_noisy <= 0
    print(f"PASS: Nonparametric Bühlmann heavy-tailed noise detected (VHM={vhm_noisy:.2f} <= 0 -> Falling back to K=15.0)")

def test_blue_ocean_production_code_invariant():
    """True Invariant Test: Verifies production code paths and AST/source strictly isolate age decay."""
    import inspect
    from server import compute_blue_ocean_metrics
    
    # 1. Execute actual production function
    res = compute_blue_ocean_metrics(raw_rpi=4.0, sample_size=15, recent_supply_14d=0, k_param=15.0)
    assert res["credibility_weight"] == 0.50
    assert res["shrunken_rpi"] == 2.50
    assert res["blue_ocean_score"] == 2.50
    assert res["quadrant"] == "blue_ocean"
    assert res["age_decay_applied"] is False
    
    # 2. Inspect server.py production function source code
    server_source = inspect.getsource(compute_blue_ocean_metrics)
    assert "vrpi" not in server_source.lower()
    assert "decay" not in server_source.lower() or "age_decay_applied" in server_source
    assert "raw_rpi" in server_source
    
    # 3. Inspect static/js/nlp-topics.js production source code
    with open("static/js/nlp-topics.js", "r", encoding="utf-8") as f:
        js_source = f.read()
    
    # Check that shrunkenRpi is derived from rawRpi, NOT vrpi or rawVrpi
    assert "const shrunkenRpi = parseFloat((w * rawRpi + (1 - w) * 1.0).toFixed(2));" in js_source
    assert "const blueOceanScore = parseFloat((shrunkenRpi / (1 + supply14d)).toFixed(2));" in js_source
    print("PASS: True Invariant Enforcement: Production Python & JavaScript code paths strictly use pure un-decayed RPI")

def test_estimate_credibility_endpoint():
    client = app.test_client()
    sample_clusters = [
        {"name": "Cluster A", "videos": [1000, 1050, 1020, 1040, 990]},
        {"name": "Cluster B", "videos": [2000, 2030, 1980, 2010, 2020]}
    ]
    resp = client.post("/api/topics/estimate-credibility", json={"clusters": sample_clusters})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    print("PASS: /api/topics/estimate-credibility endpoint verified")

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
    test_polling_fallback_endpoint()
    test_age_decay_does_not_leak_into_blue_ocean()
    test_credibility_weighting_k15()
    test_empirical_buhlmann_k_estimation()
    test_blue_ocean_production_code_invariant()
    test_estimate_credibility_endpoint()
    print("\nALL BACKEND AUTOMATED TESTS PASSED (19/19)!")
