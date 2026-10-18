import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  Bell,
  ChevronDown,
  CircleHelp,
  Command,
  Download,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RiskTier = "Low" | "Medium" | "High" | "Critical";
type Security = {
  ticker: string;
  name: string;
  asset_class: string;
  sector: string;
  volatility: number;
  beta: number;
  liquidity_days: number;
  expected_return: number;
};
type Holding = { ticker: string; weight: number; security: Security };
type Alert = { severity: "warning" | "critical"; message: string };
type Metrics = {
  score: number;
  tier: RiskTier;
  concentration: number;
  market: number;
  suitability: number;
  liquidity: number;
  portfolio_volatility: number;
  portfolio_beta: number;
  effective_holdings: number;
  position_hhi: number;
  sector_hhi: number;
  illiquid_exposure: number;
  var_95_1y: number;
};
type Client = {
  client_id: string;
  name: string;
  advisor: string;
  mandate: string;
  aum: number;
  holdings: Holding[];
  metrics: Metrics;
  alerts: Alert[];
};
type DashboardData = {
  summary: {
    total_aum: number;
    aum_at_risk: number;
    critical_count: number;
    average_score: number;
    total_var: number;
    tier_distribution: Record<RiskTier, number>;
    dimension_averages: Record<string, number>;
    advisor_exposure: { advisor: string; aum: number; risk_aum: number }[];
  };
  clients: Client[];
  advisors: string[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const tierColors: Record<RiskTier, string> = {
  Low: "#55c69a",
  Medium: "#e8b65b",
  High: "#ee895d",
  Critical: "#ed6471",
};
const mandateColors: Record<string, string> = {
  Conservative: "#82a9ee",
  Moderate: "#70c9ad",
  Growth: "#c0a3f4",
  Aggressive: "#f0a36b",
};
const money = (value: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);

async function readError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.detail ?? `Request failed (${response.status})`;
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All tiers");
  const [mandateFilter, setMandateFilter] = useState("All mandates");
  const [advisorFilter, setAdvisorFilter] = useState("All advisors");
  const [sortBy, setSortBy] = useState<"score" | "aum" | "name">("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Client | null>(null);
  const [briefing, setBriefing] = useState("");
  const [briefingError, setBriefingError] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 6 && active; attempt += 1) {
        try {
          const response = await fetch(`${API_URL}/api/dashboard`);
          if (!response.ok) throw new Error(await readError(response));
          const result = await (response.json() as Promise<DashboardData>);
          if (active) {
            setData(result);
            setError(null);
          }
          return;
        } catch (reason: unknown) {
          lastError = reason;
          if (attempt < 5 && active) {
            await new Promise((resolve) => window.setTimeout(resolve, 5000));
          }
        }
      }
      if (active) {
        setError(lastError instanceof Error ? lastError.message : "Could not load portfolio data.");
      }
    };
    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setBriefing("");
    setBriefingError("");
  }, [selected?.client_id]);

  const filteredClients = useMemo(() => {
    if (!data) return [];
    return data.clients
      .filter((client) => {
        const term = search.trim().toLowerCase();
        return (
          (!term || `${client.name} ${client.advisor} ${client.client_id}`.toLowerCase().includes(term)) &&
          (tierFilter === "All tiers" || client.metrics.tier === tierFilter) &&
          (mandateFilter === "All mandates" || client.mandate === mandateFilter) &&
          (advisorFilter === "All advisors" || client.advisor === advisorFilter)
        );
      })
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        if (sortBy === "name") return a.name.localeCompare(b.name) * direction;
        const left = sortBy === "aum" ? a.aum : a.metrics.score;
        const right = sortBy === "aum" ? b.aum : b.metrics.score;
        return (left - right) * direction;
      });
  }, [data, search, tierFilter, mandateFilter, advisorFilter, sortBy, sortDirection]);

  const sort = (field: "score" | "aum" | "name") => {
    if (sortBy === field) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  async function generateBriefing() {
    if (!selected) return;
    setBriefingLoading(true);
    setBriefingError("");
    try {
      const response = await fetch(`${API_URL}/api/briefing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected.client_id }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { briefing: string };
      setBriefing(result.briefing);
    } catch (reason) {
      setBriefingError(reason instanceof Error ? reason.message : "Could not generate the briefing.");
    } finally {
      setBriefingLoading(false);
    }
  }

  const exportClients = () => {
    if (!data) return;
    const rows = [
      ["Client", "Client ID", "Advisor", "Mandate", "AUM", "Risk score", "Tier", "1Y 95% VaR"],
      ...filteredClients.map((client) => [
        client.name,
        client.client_id,
        client.advisor,
        client.mandate,
        client.aum,
        client.metrics.score,
        client.metrics.tier,
        Math.round(client.metrics.var_95_1y),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "northstar-portfolio-risk.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (error) {
    return (
      <div className="state-screen">
        <div className="state-card">
          <AlertCircle size={25} />
          <h1>Couldn’t connect to the risk service</h1>
          <p>{error}</p>
          <span>The analytics service may take a few moments to wake up. Please try again shortly.</span>
          <button className="button button-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="state-screen">
        <LoaderCircle className="spinner" size={28} />
        <p>Preparing portfolio intelligence…</p>
      </div>
    );
  }

  const summary = data.summary;
  const distribution = Object.entries(summary.tier_distribution).map(([tier, count]) => ({
    tier,
    count,
    color: tierColors[tier as RiskTier],
  }));
  const dimensions = [
    { key: "concentration", label: "Concentration", color: "#e9ae60" },
    { key: "market", label: "Market risk", color: "#8b9cf4" },
    { key: "suitability", label: "Suitability", color: "#5bc6ad" },
    { key: "liquidity", label: "Liquidity", color: "#ce91df" },
  ].map((item) => ({ ...item, value: summary.dimension_averages[item.key] }));
  const advisorExposure = summary.advisor_exposure.map((item) => ({
    ...item,
    lower_risk_aum: item.aum - item.risk_aum,
  }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#" className="brand" aria-label="Northstar home">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">northstar<span> .</span></span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-icon">W</div>
          <div className="workspace-copy"><small>WORKSPACE</small><strong>Wealth Partners</strong></div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <a className="nav-item active" href="#overview"><LayoutDashboard size={17} /> Overview</a>
        <a className="nav-item" href="#clients"><ShieldCheck size={17} /> Client portfolios <span className="nav-count">{data.clients.length}</span></a>
        <a className="nav-item" href="#insights"><Sparkles size={17} /> Insights</a>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={16} /><span>Help & support</span><ArrowRight size={14} /></div>
          <div className="user-profile">
            <div className="avatar user-avatar">AM</div>
            <div><strong>Alex Morgan</strong><small>Portfolio admin</small></div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Portfolio intelligence <span>/</span> <strong>Overview</strong></div>
          <div className="topbar-actions">
            <div className="as-of"><span className="live-dot" /> Live portfolio data <span className="as-of-divider" /> Updated just now</div>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <div className="avatar top-avatar">AM</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> WEALTH MANAGEMENT <span className="eyebrow-separator">/</span> RISK OVERVIEW</div>
              <h1>Portfolio risk <span>intelligence</span></h1>
              <p>A clear view of portfolio exposure, suitability, and client risk across your book.</p>
            </div>
            <button className="button button-secondary" onClick={exportClients}><Download size={15} /> Export report</button>
          </section>

          <section className="kpi-grid" aria-label="Portfolio key metrics">
            <KpiCard label="Total assets under management" value={money(summary.total_aum, true)} detail={`${data.clients.length} client households`} icon="aum" />
            <KpiCard label="Assets in high & critical" value={money(summary.aum_at_risk, true)} detail={`${Math.round((summary.aum_at_risk / summary.total_aum) * 100)}% of total AUM`} icon="risk" accent="warm" />
            <KpiCard label="Critical risk portfolios" value={String(summary.critical_count).padStart(2, "0")} detail={summary.critical_count ? "Requires immediate review" : "No immediate escalations"} icon="critical" accent={summary.critical_count ? "red" : "green"} />
            <KpiCard label="Average portfolio risk score" value={summary.average_score.toFixed(1)} detail="Across all mandates" icon="score" />
            <KpiCard label="Aggregate 1-year VaR (95%)" value={money(summary.total_var, true)} detail="Parametric · 1-year horizon" icon="var" />
          </section>

          <section className="analytics-grid" aria-label="Risk analytics">
            <article className="panel chart-panel">
              <PanelHeading title="Risk tier distribution" caption="Households by composite score" />
              <div className="tier-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 13, right: 4, bottom: 0, left: -24 }} barSize={30}>
                    <CartesianGrid stroke="#232c39" vertical={false} />
                    <XAxis dataKey="tier" axisLine={false} tickLine={false} tick={{ fill: "#8491a4", fontSize: 11 }} dy={9} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#687487", fontSize: 10 }} />
                    <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "#171e29", border: "1px solid #303a49", borderRadius: 9, color: "#e9edf4", fontSize: 12 }} />
                    <Bar dataKey="count" name="Households" radius={[5, 5, 0, 0]}>
                      {distribution.map((entry) => <Cell key={entry.tier} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend">
                {distribution.map((item) => <span key={item.tier}><i style={{ background: item.color }} />{item.tier}<b>{item.count}</b></span>)}
              </div>
            </article>

            <article className="panel chart-panel dimension-panel">
              <PanelHeading title="Risk by dimension" caption="Average score across the book · 0–100" />
              <div className="dimension-list">
                {dimensions.map((dimension) => (
                  <div className="dimension-row" key={dimension.key}>
                    <div className="dimension-label"><span className="dimension-dot" style={{ background: dimension.color }} />{dimension.label}</div>
                    <div className="dimension-track"><span style={{ width: `${dimension.value}%`, background: dimension.color }} /></div>
                    <span className="dimension-value">{dimension.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="dimension-foot"><span>Lower exposure</span><span>Higher exposure</span></div>
            </article>

            <article className="panel chart-panel advisor-panel">
              <PanelHeading title="Advisor exposure" caption="AUM by advisor · at-risk portion highlighted" />
              <div className="advisor-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={advisorExposure} margin={{ top: 9, right: 0, bottom: 0, left: 2 }} barSize={18} layout="vertical">
                    <CartesianGrid stroke="#232c39" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#788598", fontSize: 10 }} tickFormatter={(value: number) => `$${(value / 1000000).toFixed(0)}m`} />
                    <YAxis type="category" dataKey="advisor" width={96} axisLine={false} tickLine={false} tick={{ fill: "#aab3c1", fontSize: 10 }} />
                    <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ background: "#171e29", border: "1px solid #303a49", borderRadius: 9, color: "#e9edf4", fontSize: 12 }} />
                    <Bar dataKey="lower_risk_aum" name="Low & medium risk" stackId="exposure" fill="#4b607d" />
                    <Bar dataKey="risk_aum" name="High & critical" stackId="exposure" fill="#e48960" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="advisor-legend"><span><i className="legend-total" /> Low & medium risk</span><span><i className="legend-risk" /> High & critical</span></div>
            </article>
          </section>

          <section className="panel client-panel" id="clients">
            <div className="client-panel-heading">
              <div>
                <div className="section-title-row"><h2>Client portfolios</h2><span className="table-count">{filteredClients.length} households</span></div>
                <p>Review individual portfolio risk and suitability against each client mandate.</p>
              </div>
              <button className="button button-subtle" onClick={exportClients}><Download size={14} /> Export</button>
            </div>
            <div className="filters">
              <label className="search-box"><Search size={15} /><input aria-label="Search clients" placeholder="Search clients or advisors..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd><Command size={10} /> K</kbd></label>
              <div className="filter-select"><Filter size={14} /><select aria-label="Filter by risk tier" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option>All tiers</option>{Object.keys(tierColors).map((tier) => <option key={tier}>{tier}</option>)}</select><ChevronDown size={13} /></div>
              <div className="filter-select"><select aria-label="Filter by mandate" value={mandateFilter} onChange={(event) => setMandateFilter(event.target.value)}><option>All mandates</option>{["Conservative", "Moderate", "Growth", "Aggressive"].map((mandate) => <option key={mandate}>{mandate}</option>)}</select><ChevronDown size={13} /></div>
              <div className="filter-select"><select aria-label="Filter by advisor" value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)}><option>All advisors</option>{data.advisors.map((advisor) => <option key={advisor}>{advisor}</option>)}</select><ChevronDown size={13} /></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th><button onClick={() => sort("name")}>CLIENT <SortIcon selected={sortBy === "name"} direction={sortDirection} /></button></th>
                  <th>ADVISOR</th><th>MANDATE</th>
                  <th><button onClick={() => sort("aum")}>AUM <SortIcon selected={sortBy === "aum"} direction={sortDirection} /></button></th>
                  <th><button onClick={() => sort("score")}>RISK SCORE <SortIcon selected={sortBy === "score"} direction={sortDirection} /></button></th>
                  <th>RISK TIER</th><th>1Y 95% VaR</th><th aria-label="Open details" />
                </tr></thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.client_id} onClick={() => setSelected(client)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelected(client); }}>
                      <td><div className="client-name-cell"><div className="avatar client-avatar" style={{ background: avatarColor(client.name) }}>{initials(client.name)}</div><div><strong>{client.name}</strong><small>{client.client_id}</small></div></div></td>
                      <td><span className="advisor-name">{client.advisor}</span></td>
                      <td><span className="mandate-tag" style={{ color: mandateColors[client.mandate], borderColor: `${mandateColors[client.mandate]}35`, background: `${mandateColors[client.mandate]}0c` }}>{client.mandate}</span></td>
                      <td className="numeric-cell">{money(client.aum)}</td>
                      <td><div className="score-cell"><strong style={{ color: tierColors[client.metrics.tier] }}>{client.metrics.score.toFixed(0)}</strong><span className="score-track"><i style={{ width: `${client.metrics.score}%`, background: tierColors[client.metrics.tier] }} /></span></div></td>
                      <td><span className={`tier-pill tier-${client.metrics.tier.toLowerCase()}`}><i />{client.metrics.tier}</span></td>
                      <td className="numeric-cell">{money(client.metrics.var_95_1y)}</td>
                      <td><button className="row-open" aria-label={`View ${client.name}`}><ArrowRight size={15} /></button></td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && <tr><td colSpan={8} className="empty-state">No households match these filters. Try adjusting your search.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{filteredClients.length}</strong> of {data.clients.length} households</span><span><i className="live-dot" /> Risk metrics refreshed just now</span></div>
          </section>
          <footer className="page-footer"><span><ShieldCheck size={14} /> Northstar Risk Intelligence</span><span>For advisor use only · VaR estimates are not a guarantee of future performance</span></footer>
        </div>
      </main>

      {selected && (
        <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="detail-drawer" aria-label={`${selected.name} portfolio details`}>
            <div className="drawer-header">
              <div className="drawer-brand"><span className="brand-mark small"><span /></span> PORTFOLIO DETAILS</div>
              <button className="icon-button close-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={18} /></button>
            </div>
            <div className="drawer-scroll">
              <div className="detail-profile">
                <div className="avatar detail-avatar" style={{ background: avatarColor(selected.name) }}>{initials(selected.name)}</div>
                <div><h2>{selected.name}</h2><p>{selected.client_id} <span>·</span> {selected.advisor}</p></div>
              </div>
              <div className="detail-summary">
                <div><span>PORTFOLIO RISK SCORE</span><div className="detail-score" style={{ color: tierColors[selected.metrics.tier] }}>{selected.metrics.score.toFixed(0)}<small>/100</small></div></div>
                <span className={`tier-pill tier-${selected.metrics.tier.toLowerCase()}`}><i />{selected.metrics.tier} risk</span>
              </div>
              <div className="detail-stat-grid">
                <div><span>PORTFOLIO VALUE</span><strong>{money(selected.aum)}</strong></div>
                <div><span>RISK MANDATE</span><strong>{selected.mandate}</strong></div>
                <div><span>1-YEAR 95% VaR</span><strong>{money(selected.metrics.var_95_1y)}</strong></div>
                <div><span>PORTFOLIO BETA</span><strong>{selected.metrics.portfolio_beta.toFixed(2)}</strong></div>
              </div>
              <section className="drawer-section">
                <div className="drawer-section-heading"><h3>Risk profile</h3><span>0–100 exposure</span></div>
                <div className="radar-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { dimension: "Concentration", value: selected.metrics.concentration },
                      { dimension: "Market", value: selected.metrics.market },
                      { dimension: "Suitability", value: selected.metrics.suitability },
                      { dimension: "Liquidity", value: selected.metrics.liquidity },
                    ]} outerRadius="69%">
                      <PolarGrid stroke="#303a49" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: "#a0abba", fontSize: 10 }} />
                      <Radar dataKey="value" stroke="#75cfb3" fill="#75cfb3" fillOpacity={0.19} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="dimension-score-grid">
                  {[["Concentration", selected.metrics.concentration], ["Market risk", selected.metrics.market], ["Suitability", selected.metrics.suitability], ["Liquidity", selected.metrics.liquidity]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value).toFixed(0)}</strong></div>)}
                </div>
              </section>
              <section className="drawer-section holdings-section">
                <div className="drawer-section-heading"><h3>Top holdings</h3><span>{selected.holdings.length} positions</span></div>
                {[...selected.holdings].sort((a, b) => b.weight - a.weight).slice(0, 5).map((holding) => (
                  <div className="holding-row" key={holding.ticker}>
                    <div className="holding-ticker">{holding.ticker.slice(0, 2)}</div>
                    <div className="holding-info"><strong>{holding.ticker}</strong><span>{holding.security.name}</span></div>
                    <div className="holding-weight"><strong>{(holding.weight * 100).toFixed(0)}%</strong><span>{holding.security.sector}</span></div>
                  </div>
                ))}
              </section>
              <section className="drawer-section alerts-section">
                <div className="drawer-section-heading"><h3>Active alerts</h3><span className="alert-count">{selected.alerts.length}</span></div>
                {selected.alerts.length ? selected.alerts.map((alert, index) => (
                  <div className={`alert-row alert-${alert.severity}`} key={`${alert.message}-${index}`}><AlertCircle size={16} /><p>{alert.message}</p></div>
                )) : <div className="no-alerts"><ShieldCheck size={16} /> No active risk alerts for this portfolio.</div>}
              </section>
              <section className="briefing-section" id="insights">
                <div className="briefing-heading">                <div className="sparkle-icon"><Sparkles size={15} /></div><div><h3>Advisor briefing</h3><p>Rule-based portfolio context</p></div></div>
                {!briefing && !briefingError && <p className="briefing-intro">Get a concise summary of what's driving this portfolio's risk profile, with suggested discussion points.</p>}
                {briefing && <div className="briefing-copy">{briefing}</div>}
                {briefingError && <div className="briefing-error"><AlertCircle size={14} />{briefingError}</div>}
                <button className="button button-ai" onClick={generateBriefing} disabled={briefingLoading}>
                  {briefingLoading ? <LoaderCircle className="spinner" size={15} /> : <Sparkles size={15} />}
                  {briefingLoading ? "Preparing briefing…" : briefing ? "Refresh briefing" : "Generate briefing"}
                  {!briefingLoading && <ArrowRight size={14} />}
                </button>
                <p className="ai-disclaimer">Rule-based summary from portfolio data; verify details and client context before discussion.</p>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, detail, icon, accent = "" }: { label: string; value: string; detail: string; icon: string; accent?: string }) {
  const Icon = icon === "aum" ? ShieldCheck : icon === "risk" ? AlertCircle : icon === "critical" ? Bell : icon === "score" ? ArrowDownUp : Command;
  return (
    <article className={`kpi-card ${accent ? `kpi-${accent}` : ""}`}>
      <div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${icon}`}>{<Icon size={15} />}</span></div>
      <div className="kpi-value">{value}{icon === "score" && <span>/100</span>}</div>
      <div className="kpi-detail"><span className={accent === "red" ? "detail-alert-dot" : ""}>{detail}</span>{icon === "risk" && <span className="trend-down"><ArrowDown size={13} /></span>}</div>
    </article>
  );
}

function PanelHeading({ title, caption }: { title: string; caption: string }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{caption}</p></div><button className="more-button" aria-label={`${title} information`}><CircleHelp size={15} /></button></div>;
}

function SortIcon({ selected, direction }: { selected: boolean; direction: "asc" | "desc" }) {
  if (!selected) return <ArrowDownUp size={12} />;
  return direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function avatarColor(name: string) {
  const palette = ["#325a55", "#454b75", "#685044", "#465e78", "#665071", "#58643f"];
  const index = name.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return palette[index % palette.length];
}

export default App;
