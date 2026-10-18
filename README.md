# Northstar Portfolio Risk Intelligence

A synthetic wealth-management risk dashboard with a FastAPI/Pandas backend and a React, Vite, Tailwind, and Recharts frontend.

## Requirements

- Python 3.10+
- Node.js 18+

## Run locally

On Windows, double-click [`start-local.bat`](./start-local.bat) for a one-step start. It uses installed dependencies when available, installs missing frontend packages, and creates a Python virtual environment and installs backend packages if needed. It opens the dashboard in your browser and keeps the API and frontend running in separate command windows; close those windows to stop the app.

You can also start the services manually:

In one terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn main:app --app-dir backend --reload
```

In another terminal:

```powershell
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The API serves interactive OpenAPI documentation at `http://localhost:8000/docs`. `localhost` and `127.0.0.1` are both allowed for local Vite development. Set `VITE_API_URL` if the API is hosted elsewhere. Set `CORS_ORIGINS` to a comma-separated list of allowed frontend origins when deploying.

Advisor briefings are generated locally by deterministic rules from the selected portfolio's risk score and dimensions, mandate volatility band, largest holdings, illiquid assets, and active alerts. They require no API key or paid LLM service. Treat the intent-versus-drift wording as a discussion prompt, not a conclusion about client intent.

## Risk methodology

The app creates 12 repeatable synthetic client households from a seeded security universe; every portfolio's weights sum to 100%. Two households intentionally illustrate out-of-mandate growth exposure and concentrated/illiquid holdings so the dashboard demonstrates both High and Critical review states. The four component scores (0–100) are weighted into a composite: concentration 25%, market 30%, suitability 25%, and liquidity 20%.

- **Concentration:** holding and sector HHI, with additional penalty above 10% for a single position.
- **Market:** weighted security volatility adjusted by effective holding count, plus weighted beta.
- **Suitability:** volatility outside the mandate band. Conservative 4–9%, Moderate 8–15%, Growth 13–22%, Aggressive 19–32%.
- **Liquidity:** exposure to holdings with liquidation windows longer than five days.
- **Tier:** Low below 25, Medium 25–49.9, High 50–74.9, Critical 75 and above.
- **VaR:** parametric 95% one-year estimate using `1.645 × portfolio volatility × AUM`.

This is an illustrative prototype, not investment advice or a production risk model. The volatility aggregation uses a simple diversification discount, not a covariance matrix; VaR relies on parametric assumptions and does not model tail events.

## API

- `GET /api/health` — service health
- `GET /api/dashboard` — portfolio book, scores, alerts, and chart summaries
- `GET /api/clients/{client_id}` — household detail
- `POST /api/briefing` — rule-based advisor briefing for `{ "client_id": "c-1001" }`

## Verification

```powershell
python -m pytest backend\test_main.py
npm run build
```
