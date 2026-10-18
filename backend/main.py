from __future__ import annotations

import os
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

RiskTier = Literal["Low", "Medium", "High", "Critical"]


class Security(BaseModel):
    ticker: str
    name: str
    asset_class: str
    sector: str
    volatility: float
    beta: float
    liquidity_days: int
    expected_return: float


class Holding(BaseModel):
    ticker: str
    weight: float
    security: Security


class RiskMetrics(BaseModel):
    score: float
    tier: RiskTier
    concentration: float
    market: float
    suitability: float
    liquidity: float
    portfolio_volatility: float
    portfolio_beta: float
    effective_holdings: float
    position_hhi: float
    sector_hhi: float
    illiquid_exposure: float
    var_95_1y: float


class Alert(BaseModel):
    severity: Literal["warning", "critical"]
    message: str


class Client(BaseModel):
    client_id: str
    name: str
    advisor: str
    mandate: str
    aum: float
    holdings: list[Holding]
    metrics: RiskMetrics
    alerts: list[Alert]


class DashboardSummary(BaseModel):
    total_aum: float
    aum_at_risk: float
    critical_count: int
    average_score: float
    total_var: float
    tier_distribution: dict[str, int]
    dimension_averages: dict[str, float]
    advisor_exposure: list[dict[str, str | float]]


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    clients: list[Client]
    advisors: list[str]


class BriefingRequest(BaseModel):
    client_id: str


class BriefingResponse(BaseModel):
    client_id: str
    briefing: str


def generate_briefing(client: Client) -> str:
    metrics = client.metrics
    low, high = MANDATE_BANDS[client.mandate]
    dimensions = {
        "concentration": ("concentration", metrics.concentration),
        "market": ("market", metrics.market),
        "suitability": ("suitability", metrics.suitability),
        "liquidity": ("liquidity", metrics.liquidity),
    }
    leading_drivers = sorted(dimensions.items(), key=lambda item: item[1][1], reverse=True)[:2]
    top_holdings = sorted(client.holdings, key=lambda holding: holding.weight, reverse=True)[:3]
    largest_holding = top_holdings[0]

    if metrics.portfolio_volatility < low:
        mandate_observation = (
            f"Estimated volatility is {metrics.portfolio_volatility:.1%}, below the "
            f"{client.mandate.lower()} mandate's {low:.0%}–{high:.0%} reference range."
        )
        drift_prompt = "This could reflect a deliberate defensive allocation or a portfolio that has drifted below its growth target; confirm the client's current objectives."
    elif metrics.portfolio_volatility > high:
        mandate_observation = (
            f"Estimated volatility is {metrics.portfolio_volatility:.1%}, above the "
            f"{client.mandate.lower()} mandate's {low:.0%}–{high:.0%} reference range."
        )
        drift_prompt = "The elevated exposure may be intentional, but it warrants confirming the mandate and checking for allocation drift."
    else:
        mandate_observation = (
            f"Estimated volatility is {metrics.portfolio_volatility:.1%}, within the "
            f"{client.mandate.lower()} mandate's {low:.0%}–{high:.0%} reference range."
        )
        drift_prompt = "The volatility is within the mandate range; confirm that concentrated or illiquid positions, if any, remain intentional."

    if largest_holding.weight > 0.1:
        concentration_observation = (
            f"{largest_holding.ticker} is the largest position at {largest_holding.weight:.0%} "
            f"of the portfolio; position HHI is {metrics.position_hhi:.2f}."
        )
    else:
        concentration_observation = (
            f"The largest holding is {largest_holding.ticker} at {largest_holding.weight:.0%}; "
            f"position HHI is {metrics.position_hhi:.2f}."
        )

    illiquid_holdings = [
        holding for holding in client.holdings
        if holding.security.liquidity_days > 5
    ]
    if illiquid_holdings:
        illiquid_details = ", ".join(
            f"{holding.ticker} ({holding.weight:.0%}, {holding.security.liquidity_days}-day window)"
            for holding in sorted(illiquid_holdings, key=lambda holding: holding.weight, reverse=True)
        )
        liquidity_observation = (
            f"Illiquid exposure is {metrics.illiquid_exposure:.0%} of the portfolio: {illiquid_details}."
        )
    else:
        liquidity_observation = "No holdings have liquidation windows longer than five days."

    driver_summary = "; ".join(
        f"{label.title()} ({score:.0f}/100)"
        for _, (label, score) in leading_drivers
    )
    holding_summary = ", ".join(
        f"{holding.ticker} {holding.weight:.0%}"
        for holding in top_holdings
    )
    alert_summary = (
        "\n".join(f"- {alert.message}" for alert in client.alerts)
        if client.alerts
        else "- No active rule-based alerts."
    )

    return (
        f"{client.name} — {metrics.tier} portfolio risk ({metrics.score:.0f}/100).\n\n"
        f"What's driving it: The highest risk dimensions are {driver_summary}. "
        f"{concentration_observation} {mandate_observation} "
        f"Weighted beta is {metrics.portfolio_beta:.2f}; estimated 1-year 95% parametric VaR is "
        f"${metrics.var_95_1y:,.0f}.\n\n"
        f"Intent vs. drift: {drift_prompt}\n\n"
        f"Holdings to review: {holding_summary}. {liquidity_observation}\n\n"
        f"Active alerts:\n{alert_summary}\n\n"
        "Advisor talking points:\n"
        f"1. Ask whether the current allocation and largest position ({largest_holding.ticker}) "
        "still reflect the client's objectives and concentration tolerance.\n"
        f"2. Review the mandate's {low:.0%}–{high:.0%} volatility range and discuss the "
        "portfolio's risk and estimated VaR in the context of the client's time horizon.\n"
        "3. Confirm liquidity needs and any redemption constraints before making allocation changes."
    )


MANDATE_BANDS: dict[str, tuple[float, float]] = {
    "Conservative": (0.04, 0.09),
    "Moderate": (0.08, 0.15),
    "Growth": (0.13, 0.22),
    "Aggressive": (0.19, 0.32),
}

SECURITIES = [
    Security(ticker="VTI", name="Total US Market ETF", asset_class="Equity", sector="Broad Market", volatility=0.18, beta=1.0, liquidity_days=1, expected_return=0.085),
    Security(ticker="VXUS", name="International Equity ETF", asset_class="Equity", sector="International", volatility=0.19, beta=0.92, liquidity_days=1, expected_return=0.08),
    Security(ticker="QQQ", name="Nasdaq 100 ETF", asset_class="Equity", sector="Technology", volatility=0.27, beta=1.2, liquidity_days=1, expected_return=0.105),
    Security(ticker="XLV", name="Health Care Select ETF", asset_class="Equity", sector="Healthcare", volatility=0.16, beta=0.72, liquidity_days=1, expected_return=0.075),
    Security(ticker="XLF", name="Financial Select ETF", asset_class="Equity", sector="Financials", volatility=0.22, beta=1.08, liquidity_days=1, expected_return=0.085),
    Security(ticker="BND", name="Total Bond Market ETF", asset_class="Fixed Income", sector="Fixed Income", volatility=0.06, beta=0.08, liquidity_days=1, expected_return=0.042),
    Security(ticker="TIP", name="Inflation-Protected Bonds", asset_class="Fixed Income", sector="Fixed Income", volatility=0.055, beta=0.03, liquidity_days=1, expected_return=0.04),
    Security(ticker="VNQ", name="Real Estate ETF", asset_class="Real Assets", sector="Real Estate", volatility=0.21, beta=0.84, liquidity_days=1, expected_return=0.075),
    Security(ticker="GLD", name="Gold ETF", asset_class="Real Assets", sector="Commodities", volatility=0.17, beta=0.12, liquidity_days=1, expected_return=0.05),
    Security(ticker="PRIV", name="Private Credit Fund", asset_class="Alternative", sector="Private Credit", volatility=0.11, beta=0.28, liquidity_days=90, expected_return=0.085),
    Security(ticker="PEQ", name="Private Equity Fund", asset_class="Alternative", sector="Private Equity", volatility=0.25, beta=1.1, liquidity_days=365, expected_return=0.12),
    Security(ticker="CASH", name="Treasury Money Market", asset_class="Cash", sector="Cash", volatility=0.01, beta=0.0, liquidity_days=0, expected_return=0.035),
]

CLIENT_SEEDS = [
    ("c-1001", "Olivia Bennett", "Sarah Chen", "Conservative", 2_450_000, [("BND", 0.43), ("VTI", 0.24), ("TIP", 0.16), ("VXUS", 0.1), ("CASH", 0.07)]),
    ("c-1002", "James Whitaker", "Marcus Reed", "Moderate", 5_200_000, [("VTI", 0.34), ("BND", 0.25), ("VXUS", 0.17), ("XLV", 0.1), ("VNQ", 0.08), ("CASH", 0.06)]),
    ("c-1003", "Sophia Martinez", "Sarah Chen", "Growth", 3_800_000, [("QQQ", 0.34), ("VTI", 0.3), ("VXUS", 0.14), ("PEQ", 0.12), ("BND", 0.1)]),
    ("c-1004", "William Foster", "Priya Patel", "Moderate", 1_750_000, [("VTI", 0.39), ("BND", 0.25), ("XLV", 0.12), ("XLF", 0.1), ("GLD", 0.08), ("CASH", 0.06)]),
    ("c-1005", "Isabella Chen", "Marcus Reed", "Moderate", 8_100_000, [("QQQ", 0.5), ("PEQ", 0.35), ("CASH", 0.15)]),
    ("c-1006", "Benjamin Clark", "Elena Rodriguez", "Conservative", 940_000, [("BND", 0.51), ("TIP", 0.2), ("VTI", 0.14), ("PRIV", 0.1), ("CASH", 0.05)]),
    ("c-1007", "Charlotte Lewis", "Priya Patel", "Growth", 6_400_000, [("VTI", 0.3), ("QQQ", 0.24), ("VXUS", 0.16), ("PEQ", 0.12), ("VNQ", 0.1), ("BND", 0.08)]),
    ("c-1008", "Ethan Walker", "Sarah Chen", "Moderate", 2_150_000, [("VTI", 0.38), ("BND", 0.27), ("VXUS", 0.15), ("GLD", 0.08), ("XLV", 0.07), ("CASH", 0.05)]),
    ("c-1009", "Amelia Brooks", "Elena Rodriguez", "Moderate", 4_600_000, [("QQQ", 0.39), ("VTI", 0.31), ("PEQ", 0.16), ("XLF", 0.09), ("CASH", 0.05)]),
    ("c-1010", "Lucas Thompson", "Marcus Reed", "Growth", 1_280_000, [("VTI", 0.36), ("VXUS", 0.2), ("QQQ", 0.17), ("BND", 0.12), ("PRIV", 0.09), ("GLD", 0.06)]),
    ("c-1011", "Mia Anderson", "Priya Patel", "Conservative", 3_150_000, [("BND", 0.4), ("TIP", 0.2), ("VTI", 0.2), ("PRIV", 0.12), ("CASH", 0.08)]),
    ("c-1012", "Henry Davis", "Elena Rodriguez", "Moderate", 7_300_000, [("VTI", 0.33), ("VXUS", 0.18), ("BND", 0.2), ("QQQ", 0.12), ("VNQ", 0.1), ("PRIV", 0.07)]),
]


def clamp(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def score_client(seed: tuple) -> Client:
    client_id, name, advisor, mandate, aum, weights = seed
    security_by_ticker = {security.ticker: security for security in SECURITIES}
    holdings = [
        Holding(ticker=ticker, weight=weight, security=security_by_ticker[ticker])
        for ticker, weight in weights
    ]
    frame = pd.DataFrame(
        [
            {
                "weight": holding.weight,
                "sector": holding.security.sector,
                "volatility": holding.security.volatility,
                "beta": holding.security.beta,
                "liquidity_days": holding.security.liquidity_days,
            }
            for holding in holdings
        ]
    )
    position_hhi = float((frame["weight"] ** 2).sum())
    sector_weights = frame.groupby("sector")["weight"].sum()
    sector_hhi = float((sector_weights**2).sum())
    effective_holdings = 1 / position_hhi
    weighted_volatility = float((frame["weight"] * frame["volatility"]).sum())
    diversification_discount = min(0.28, 0.08 * (effective_holdings - 1) ** 0.5)
    portfolio_volatility = weighted_volatility * (1 - diversification_discount)
    portfolio_beta = float((frame["weight"] * frame["beta"]).sum())
    illiquid_exposure = float(frame.loc[frame["liquidity_days"] > 5, "weight"].sum())

    largest_position = float(frame["weight"].max())
    concentration = clamp(
        max(0.0, (position_hhi - 0.08) * 180)
        + max(0.0, (sector_hhi - 0.22) * 80)
        + max(0.0, largest_position - 0.1) * 125
    )
    market = clamp(portfolio_volatility / 0.3 * 70 + max(0.0, portfolio_beta - 1) * 35)
    low, high = MANDATE_BANDS[mandate]
    distance = low - portfolio_volatility if portfolio_volatility < low else portfolio_volatility - high if portfolio_volatility > high else 0
    suitability = clamp(distance / max(high - low, 0.01) * 140)
    liquidity = clamp(illiquid_exposure * 150 + max(0.0, illiquid_exposure - 0.2) * 100)
    composite = clamp(
        concentration * 0.25
        + market * 0.3
        + suitability * 0.25
        + liquidity * 0.2
    )
    tier: RiskTier = (
        "Critical" if composite >= 75
        else "High" if composite >= 50
        else "Medium" if composite >= 25
        else "Low"
    )
    alerts: list[Alert] = []
    if largest_position > 0.1:
        largest = max(holdings, key=lambda holding: holding.weight)
        alerts.append(Alert(severity="warning", message=f"{largest.ticker} position is {largest.weight:.0%}, above the 10% concentration guideline."))
    if portfolio_volatility < low or portfolio_volatility > high:
        alerts.append(Alert(severity="critical", message=f"Portfolio volatility ({portfolio_volatility:.1%}) is outside the {mandate.lower()} mandate band ({low:.0%}–{high:.0%})."))
    if illiquid_exposure > 0.15:
        alerts.append(Alert(severity="warning", message=f"{illiquid_exposure:.0%} of assets have liquidation windows longer than five days."))
    if portfolio_beta > 1.2:
        alerts.append(Alert(severity="warning", message=f"Portfolio beta of {portfolio_beta:.2f} indicates elevated market sensitivity."))
    if position_hhi > 0.2:
        alerts.append(Alert(severity="critical", message="Holdings are highly concentrated (position HHI exceeds 0.20)."))

    return Client(
        client_id=client_id,
        name=name,
        advisor=advisor,
        mandate=mandate,
        aum=aum,
        holdings=holdings,
        metrics=RiskMetrics(
            score=composite,
            tier=tier,
            concentration=concentration,
            market=market,
            suitability=suitability,
            liquidity=liquidity,
            portfolio_volatility=portfolio_volatility,
            portfolio_beta=portfolio_beta,
            effective_holdings=effective_holdings,
            position_hhi=position_hhi,
            sector_hhi=sector_hhi,
            illiquid_exposure=illiquid_exposure,
            var_95_1y=1.645 * portfolio_volatility * aum,
        ),
        alerts=alerts,
    )


CLIENTS = [score_client(seed) for seed in CLIENT_SEEDS]
app = FastAPI(title="Portfolio Risk Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard() -> DashboardResponse:
    tiers: dict[str, int] = {tier: 0 for tier in ("Low", "Medium", "High", "Critical")}
    for client in CLIENTS:
        tiers[client.metrics.tier] += 1
    total_aum = sum(client.aum for client in CLIENTS)
    summary = DashboardSummary(
        total_aum=total_aum,
        aum_at_risk=sum(client.aum for client in CLIENTS if client.metrics.tier in ("High", "Critical")),
        critical_count=tiers["Critical"],
        average_score=sum(client.metrics.score for client in CLIENTS) / len(CLIENTS),
        total_var=sum(client.metrics.var_95_1y for client in CLIENTS),
        tier_distribution=tiers,
        dimension_averages={
            key: sum(getattr(client.metrics, key) for client in CLIENTS) / len(CLIENTS)
            for key in ("concentration", "market", "suitability", "liquidity")
        },
        advisor_exposure=[
            {
                "advisor": advisor,
                "aum": sum(client.aum for client in CLIENTS if client.advisor == advisor),
                "risk_aum": sum(client.aum for client in CLIENTS if client.advisor == advisor and client.metrics.tier in ("High", "Critical")),
            }
            for advisor in sorted({client.advisor for client in CLIENTS})
        ],
    )
    return DashboardResponse(
        summary=summary,
        clients=CLIENTS,
        advisors=sorted({client.advisor for client in CLIENTS}),
    )


@app.get("/api/clients/{client_id}", response_model=Client)
def get_client(client_id: str) -> Client:
    for client in CLIENTS:
        if client.client_id == client_id:
            return client
    raise HTTPException(status_code=404, detail="Client not found")


@app.post("/api/briefing", response_model=BriefingResponse)
def create_briefing(request: BriefingRequest) -> BriefingResponse:
    client = next((item for item in CLIENTS if item.client_id == request.client_id), None)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return BriefingResponse(
        client_id=client.client_id,
        briefing=generate_briefing(client),
    )
