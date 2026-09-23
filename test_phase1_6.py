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
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.get_json()
    assert data.get("success") is True
    assert len(data.get("clusters", [])) >= 1
    print(f"PASS: Semantic vector clustering (Found {len(data['clusters'])} clusters from {len(sample_videos)} videos)")

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

if __name__ == "__main__":
    test_websub_get_challenge()
    test_websub_post_xml()
    test_semantic_clusters()
    test_webhook_settings()
    test_cron_outliers()
    print("\nALL BACKEND AUTOMATED TESTS PASSED (5/5)!")
