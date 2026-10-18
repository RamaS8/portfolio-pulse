from fastapi.testclient import TestClient

from main import CLIENTS, app

client = TestClient(app)


def test_dashboard_has_consistent_portfolios_and_summary():
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert len(data["clients"]) == 12
    assert sum(data["summary"]["tier_distribution"].values()) == 12
    assert data["summary"]["tier_distribution"]["High"] > 0
    assert data["summary"]["tier_distribution"]["Critical"] > 0
    assert data["summary"]["total_aum"] == sum(item["aum"] for item in data["clients"])
    for household in data["clients"]:
        assert abs(sum(holding["weight"] for holding in household["holdings"]) - 1) < 1e-9
        assert 0 <= household["metrics"]["score"] <= 100
        assert household["metrics"]["var_95_1y"] > 0


def test_client_detail_and_unknown_client():
    existing_id = CLIENTS[0].client_id
    assert client.get(f"/api/clients/{existing_id}").status_code == 200
    assert client.get("/api/clients/missing").status_code == 404


def test_dashboard_allows_vite_localhost_alias():
    response = client.get(
        "/api/dashboard",
        headers={"Origin": "http://127.0.0.1:5173"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_briefing_works_without_paid_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    household = next(item for item in CLIENTS if item.client_id == "c-1005")
    response = client.post("/api/briefing", json={"client_id": household.client_id})
    assert response.status_code == 200
    briefing = response.json()["briefing"]
    assert household.name in briefing
    assert f"{household.metrics.score:.0f}/100" in briefing
    assert "QQQ" in briefing
    assert "PEQ" in briefing
    assert "Active alerts:" in briefing
    assert "Advisor talking points:" in briefing
    assert "1-year 95% parametric VaR" in briefing


def test_briefing_returns_not_found_for_unknown_client():
    response = client.post("/api/briefing", json={"client_id": "missing"})
    assert response.status_code == 404
