import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import type { InsightCard, ParticipantProfile } from "@imsg/shared";
import { apiGet, apiPost, apiUpload } from "./api";
import "./App.css";

type ViewKey = "people" | "conversations" | "timeline" | "insights" | "imports" | "reports" | "settings";

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "people", label: "People" },
  { key: "conversations", label: "Conversations" },
  { key: "timeline", label: "Timeline" },
  { key: "insights", label: "Insights" },
  { key: "imports", label: "Imports" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

function NumberChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="number-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<ViewKey>("people");
  const [range, setRange] = useState<"90d" | "12m" | "all">("12m");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem("privacy-mode") !== "off");

  const queryClient = useQueryClient();

  const peopleQuery = useQuery({
    queryKey: ["people", range],
    queryFn: () => apiGet<{ people: ParticipantProfile[] }>(`/people?range=${range}`),
  });

  const personMetricsQuery = useQuery({
    queryKey: ["person-metrics", selectedPersonId],
    enabled: Boolean(selectedPersonId),
    queryFn: () => apiGet<{ profile: ParticipantProfile; dailyTrend: Array<{ day: string; inbound: number; outbound: number }>; topConversations: Array<{ id: string; title: string; totalMessages: number }> }>(`/people/${selectedPersonId}/metrics`),
  });

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      apiGet<{
        conversations: Array<{
          id: string;
          title: string;
          isGroup: boolean;
          participantCount: number;
          totalMessages: number;
          inboundCount: number;
          outboundCount: number;
          firstSeen: string;
          lastSeen: string;
        }>;
      }>("/conversations"),
  });

  const conversationDetailQuery = useQuery({
    queryKey: ["conversation", selectedConversationId],
    enabled: Boolean(selectedConversationId),
    queryFn: () =>
      apiGet<{
        id: string;
        title: string;
        recentMessages: Array<{ id: string; sentAt: string; direction: string; textPreview: string; author: string }>;
      }>(`/conversations/${selectedConversationId}`),
  });

  const timelineQuery = useQuery({
    queryKey: ["timeline", range],
    queryFn: () => apiGet<{ points: Array<{ day: string; total: number }> }>(`/timeline?range=${range}`),
  });

  const insightsQuery = useQuery({
    queryKey: ["insights"],
    queryFn: () => apiGet<{ insights: InsightCard[] }>("/insights"),
  });

  const importsQuery = useQuery({
    queryKey: ["imports"],
    queryFn: () =>
      apiGet<{ imports: Array<{ id: string; sourceId: string; format: string; ingestedAt: string; qualityScore: number }> }>(
        "/imports"
      ),
  });

  const warningsQuery = useQuery({
    queryKey: ["warnings", selectedImportId],
    enabled: Boolean(selectedImportId),
    queryFn: () => apiGet<{ warnings: Array<{ id: string; severity: string; code: string; affectedRows: number }> }>(`/imports/${selectedImportId}/warnings`),
  });

  const oauthQuery = useQuery({
    queryKey: ["oauth-status"],
    queryFn: () => apiGet<{ connected: boolean; mode: string; message: string }>("/oauth/codex/status"),
  });

  const identitySuggestionsQuery = useQuery({
    queryKey: ["identity-suggestions"],
    queryFn: () =>
      apiGet<{
        suggestions: Array<{
          id: string;
          participantIdA: string;
          participantIdB: string;
          confidence: number;
          reason: string;
        }>;
      }>("/identity-links/suggestions"),
  });

  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: () => apiGet<{ reports: Array<{ id: string; format: string; range: string; createdAt: string }> }>("/reports"),
  });

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<{ ok: boolean; macosStatus: { ok: boolean; path: string; hint?: string } }>("/health"),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      let runs = 0;
      let totalInserted = 0;
      let totalScanned = 0;
      let keepGoing = true;

      while (keepGoing && runs < 250) {
        const response = await apiPost<{
          sourceId: string;
          insertedMessages: number;
          scannedMessages: number;
          nextWatermark: number;
        }>("/sources/macos/sync");

        runs += 1;
        totalInserted += response.insertedMessages;
        totalScanned += response.scannedMessages;
        keepGoing = response.scannedMessages >= 5000;
      }

      return { runs, totalInserted, totalScanned };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      void queryClient.invalidateQueries({ queryKey: ["timeline"] });
      void queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<{
        sourceId: string;
        importId: string;
        insertedMessages: number;
        totalParsedMessages: number;
        qualityScore: number;
      }>("/imports/imazing", file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      void queryClient.invalidateQueries({ queryKey: ["timeline"] });
      void queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const resolveIdentityMutation = useMutation({
    mutationFn: (payload: { participantIdA: string; participantIdB: string; action: "approve" | "reject" }) =>
      apiPost("/identity-links/resolve", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["identity-suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const nlpMutation = useMutation({
    mutationFn: () =>
      apiPost<{ jobId: string; recordCount: number }>("/nlp/jobs", {
        analysisType: "sentiment_trend",
        selection: {
          dateStart: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          maxMessages: 500,
        },
        consent: {
          approved: true,
          approvedAt: new Date().toISOString(),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (format: "csv" | "pdf") => apiPost<{ id: string }>("/reports", { format, range }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const people = peopleQuery.data?.people ?? [];
  const totals = useMemo(() => {
    const totalMessages = people.reduce((sum, item) => sum + item.totalMessages, 0);
    const activePeople = people.filter((item) => item.totalMessages > 0).length;
    const avgReciprocity =
      people.length > 0
        ? people.reduce((sum, item) => sum + item.reciprocityScore, 0) / people.length
        : 0;
    return { totalMessages, activePeople, avgReciprocity };
  }, [people]);

  function setPrivacy(next: boolean) {
    setPrivacyMode(next);
    localStorage.setItem("privacy-mode", next ? "on" : "off");
  }

  return (
    <div className={`app-shell ${privacyMode ? "privacy-on" : "privacy-off"}`}>
      <aside className="sidebar">
        <h1>iMsg Pulse</h1>
        <p>Local-first iMessage analytics</p>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === view ? "active" : ""}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{navItems.find((item) => item.key === view)?.label}</h2>
            <p>Default window: last 12 months (changeable)</p>
          </div>
          <div className="top-actions">
            <select value={range} onChange={(event) => setRange(event.target.value as "90d" | "12m" | "all")}>
              <option value="90d">Last 90 days</option>
              <option value="12m">Last 12 months</option>
              <option value="all">All time</option>
            </select>
            <button type="button" onClick={() => setPrivacy(!privacyMode)}>
              {privacyMode ? "Privacy Mode: On" : "Privacy Mode: Off"}
            </button>
          </div>
        </header>

        <section className="kpis">
          <NumberChip label="Total messages" value={totals.totalMessages.toLocaleString()} />
          <NumberChip label="Active contacts" value={totals.activePeople} />
          <NumberChip label="Avg reciprocity" value={totals.avgReciprocity.toFixed(2)} />
        </section>

        {view === "people" && (
          <section className="panel-grid two-col">
            <article className="panel">
              <h3>Top Contacts</h3>
              <div className="contact-list">
                {people.map((person) => (
                  <button key={person.id} type="button" className="contact-row" onClick={() => setSelectedPersonId(person.id)}>
                    <span>{person.displayName}</span>
                    <strong>{person.totalMessages}</strong>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel">
              <h3>Volume by Person</h3>
              <ReactECharts
                option={{
                  tooltip: { trigger: "axis" },
                  xAxis: { type: "category", data: people.slice(0, 12).map((p) => p.displayName) },
                  yAxis: { type: "value" },
                  series: [
                    {
                      type: "bar",
                      data: people.slice(0, 12).map((p) => p.totalMessages),
                      itemStyle: { color: "#0b7285" },
                    },
                  ],
                }}
                style={{ height: 280 }}
              />
              {personMetricsQuery.data?.profile && (
                <div className="detail-card">
                  <h4>{personMetricsQuery.data.profile.displayName}</h4>
                  <p>Reciprocity: {personMetricsQuery.data.profile.reciprocityScore.toFixed(2)}</p>
                  <p>
                    Avg response: {personMetricsQuery.data.profile.avgResponseMinutes?.toFixed(1) ?? "N/A"} minutes
                  </p>
                </div>
              )}
            </article>
          </section>
        )}

        {view === "conversations" && (
          <section className="panel-grid two-col">
            <article className="panel">
              <h3>Conversations</h3>
              {conversationsQuery.data?.conversations.map((conversation) => (
                <button key={conversation.id} type="button" className="contact-row" onClick={() => setSelectedConversationId(conversation.id)}>
                  <span>{conversation.title}</span>
                  <strong>{conversation.totalMessages}</strong>
                </button>
              ))}
            </article>
            <article className="panel">
              <h3>Conversation Detail</h3>
              {conversationDetailQuery.data?.recentMessages?.map((message) => (
                <div key={message.id} className="message-row">
                  <div>
                    <strong>{message.author}</strong>
                    <p className="sensitive">{message.textPreview}</p>
                  </div>
                  <time>{new Date(message.sentAt).toLocaleString()}</time>
                </div>
              ))}
            </article>
          </section>
        )}

        {view === "timeline" && (
          <section className="panel">
            <h3>Global Activity</h3>
            <ReactECharts
              option={{
                tooltip: { trigger: "axis" },
                xAxis: { type: "category", data: timelineQuery.data?.points.map((p) => p.day) ?? [] },
                yAxis: { type: "value" },
                series: [
                  {
                    type: "line",
                    smooth: true,
                    areaStyle: { color: "rgba(34,139,230,0.2)" },
                    lineStyle: { color: "#228be6", width: 3 },
                    data: timelineQuery.data?.points.map((p) => p.total) ?? [],
                  },
                ],
              }}
              style={{ height: 340 }}
            />
          </section>
        )}

        {view === "insights" && (
          <section className="panel-grid">
            <article className="panel">
              <div className="row-between">
                <h3>Insights</h3>
                <button type="button" onClick={() => nlpMutation.mutate()} disabled={nlpMutation.isPending}>
                  Run GPT Insight Job
                </button>
              </div>
              <div className="insight-list">
                {insightsQuery.data?.insights.map((insight) => (
                  <div key={insight.id} className="insight-card">
                    <header>
                      <strong>{insight.insightType.replaceAll("_", " ")}</strong>
                      <span>{insight.source.toUpperCase()}</span>
                    </header>
                    <p className="sensitive">{JSON.stringify(insight.value)}</p>
                    <small>Confidence: {(insight.confidence * 100).toFixed(0)}%</small>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {view === "imports" && (
          <section className="panel-grid two-col">
            <article className="panel">
              <h3>Import Controls</h3>
              <p>
                macOS access: <strong>{healthQuery.data?.macosStatus.ok ? "Ready" : "Permission Required"}</strong>
              </p>
              {!healthQuery.data?.macosStatus.ok && <p>{healthQuery.data?.macosStatus.hint}</p>}
              <button type="button" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                Sync Local macOS Messages
              </button>
              {syncMutation.isPending && <p>Sync in progress. Pulling macOS messages in 5,000-row batches...</p>}
              {syncMutation.isError && (
                <p>Sync failed: {syncMutation.error instanceof Error ? syncMutation.error.message : "Unknown error"}</p>
              )}
              {syncMutation.data && (
                <p>
                  Sync complete: {syncMutation.data.totalInserted.toLocaleString()} inserted from{" "}
                  {syncMutation.data.totalScanned.toLocaleString()} scanned across {syncMutation.data.runs} batch(es).
                </p>
              )}
              <p>Tip: if People looks empty, switch range to “All time” in the top-right filter.</p>
              <label className="upload-box">
                <span>Import iMazing CSV/TXT</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadMutation.mutate(file);
                    }
                  }}
                />
              </label>
              {uploadMutation.isPending && <p>Import upload in progress...</p>}
              {uploadMutation.isError && (
                <p>
                  Import failed: {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Unknown error"}
                </p>
              )}
              {uploadMutation.data && (
                <p>
                  Import complete: {uploadMutation.data.insertedMessages}/{uploadMutation.data.totalParsedMessages} inserted
                  (quality {uploadMutation.data.qualityScore.toFixed(1)}%).
                </p>
              )}
            </article>

            <article className="panel">
              <h3>Imported Datasets</h3>
              {importsQuery.data?.imports.map((entry) => (
                <button key={entry.id} type="button" className="contact-row" onClick={() => setSelectedImportId(entry.id)}>
                  <span>{entry.format}</span>
                  <strong>{entry.qualityScore.toFixed(1)}%</strong>
                </button>
              ))}
              <h4>Parse Warnings</h4>
              {warningsQuery.data?.warnings.map((warning) => (
                <p key={warning.id}>
                  [{warning.severity}] {warning.code} ({warning.affectedRows})
                </p>
              ))}
            </article>
          </section>
        )}

        {view === "reports" && (
          <section className="panel-grid two-col">
            <article className="panel">
              <h3>Generate Reports</h3>
              <div className="row-between">
                <button type="button" onClick={() => reportMutation.mutate("csv")}>
                  Generate CSV
                </button>
                <button type="button" onClick={() => reportMutation.mutate("pdf")}>
                  Generate PDF
                </button>
              </div>
            </article>
            <article className="panel">
              <h3>Report History</h3>
              {reportsQuery.data?.reports.map((report) => (
                <a key={report.id} href={`http://127.0.0.1:8787/api/v1/reports/${report.id}?download=1`} target="_blank" rel="noreferrer">
                  {report.id} ({report.format}, {report.range})
                </a>
              ))}
            </article>
          </section>
        )}

        {view === "settings" && (
          <section className="panel-grid two-col">
            <article className="panel">
              <h3>Privacy + OAuth</h3>
              <p>{oauthQuery.data?.message}</p>
              <p>
                OAuth mode: <strong>{oauthQuery.data?.mode}</strong>
              </p>
            </article>

            <article className="panel">
              <h3>Identity Merge Queue</h3>
              {(identitySuggestionsQuery.data?.suggestions ?? []).slice(0, 20).map((suggestion) => (
                <div key={suggestion.id} className="merge-row">
                  <p>
                    {suggestion.participantIdA} ↔ {suggestion.participantIdB}
                  </p>
                  <small>
                    {(suggestion.confidence * 100).toFixed(0)}% · {suggestion.reason}
                  </small>
                  <div className="row-between">
                    <button
                      type="button"
                      onClick={() =>
                        resolveIdentityMutation.mutate({
                          participantIdA: suggestion.participantIdA,
                          participantIdB: suggestion.participantIdB,
                          action: "approve",
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        resolveIdentityMutation.mutate({
                          participantIdA: suggestion.participantIdA,
                          participantIdB: suggestion.participantIdB,
                          action: "reject",
                        })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
