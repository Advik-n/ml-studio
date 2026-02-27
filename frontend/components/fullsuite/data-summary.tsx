"use client";

import React, { useEffect, useState } from "react";
import {
  Database,
  Columns3,
  HardDrive,
  Copy,
  ChevronDown,
  ChevronRight,
  Download,
  ArrowRight,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Tags,
  Link2,
  Target,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "@/lib/toast";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColumnDetail {
  name: string;
  dtype: string;
  missing_pct: number;
  unique_count: number;
  sample_values: string[];
}

interface NumericStat {
  column: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  outliers: number;
}

interface CategoricalColumn {
  column: string;
  top_values: { value: string; count: number; pct: number }[];
}

interface CorrelationPair {
  col1: string;
  col2: string;
  correlation: number;
}

interface TargetSuggestions {
  classification: string[];
  regression: string[];
}

interface DataSummaryData {
  overview: {
    rows: number;
    columns: number;
    memory_mb: number;
    duplicates: number;
  };
  column_details: ColumnDetail[];
  numeric_statistics: NumericStat[];
  categorical_summary: CategoricalColumn[];
  top_correlations: CorrelationPair[];
  recommendations: string[];
  target_suggestions: TargetSuggestions;
}

interface DataSummaryProps {
  jobId: string;
  onProceedToPipeline: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function dtypeBadgeVariant(dtype: string): "processing" | "success" | "pending" | "primary" | "default" {
  const d = dtype.toLowerCase();
  if (d.includes("int") || d.includes("float") || d.includes("numeric")) return "processing";
  if (d.includes("bool")) return "success";
  if (d.includes("date") || d.includes("time")) return "pending";
  if (d.includes("cat") || d.includes("object") || d.includes("str")) return "primary";
  return "default";
}

function correlationColor(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 0.8) return "bg-red-500";
  if (abs >= 0.6) return "bg-orange-500";
  if (abs >= 0.4) return "bg-yellow-500";
  return "bg-blue-500";
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--surface-2)] ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
      <Skeleton className="h-40" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-blue-400" />
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function DataSummary({ jobId, onProceedToPipeline }: DataSummaryProps) {
  const [data, setData] = useState<DataSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numericExpanded, setNumericExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get<DataSummaryData>(`/eda/jobs/${jobId}/data-summary`);
        if (!cancelled) setData(res.data);
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.response?.data?.detail || "Failed to load data summary.";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, [jobId]);

  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      const res = await api.get(`/eda/jobs/${jobId}/pipeline-report`, { responseType: "blob" });
      const blob = new Blob([res.data]);
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `pipeline_report_${jobId}.docx`;
      link.click();
      window.URL.revokeObjectURL(link.href);
      toast.success("Report downloaded.");
    } catch {
      toast.error("Failed to download report.");
    } finally {
      setDownloading(false);
    }
  };

  /* Loading */
  if (loading) return <LoadingSkeleton />;

  /* Error */
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-red-500">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Failed to load data summary</p>
              <p className="text-sm text-[var(--text-muted)]">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { overview, column_details, numeric_statistics, categorical_summary, top_correlations, recommendations, target_suggestions } = data;

  return (
    <div className="space-y-6">
      {/* ── a. Dataset Overview ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Rows", value: formatNumber(overview.rows), icon: Database, color: "text-blue-400" },
          { label: "Columns", value: overview.columns, icon: Columns3, color: "text-emerald-400" },
          { label: "Memory", value: `${overview.memory_mb.toFixed(1)} MB`, icon: HardDrive, color: "text-purple-400" },
          { label: "Duplicates", value: formatNumber(overview.duplicates), icon: Copy, color: "text-amber-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-[var(--text-muted)]">{stat.label}</span>
            </div>
            <span className="text-xl font-bold text-[var(--text)]">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* ── b. Column Details Table ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <SectionHeader icon={Columns3} title="Column Details" />
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr className="border-b border-[var(--border)] text-left">
                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Name</th>
                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Type</th>
                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Missing %</th>
                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Unique</th>
                <th className="pb-2 text-xs font-medium text-[var(--text-muted)]">Sample Values</th>
              </tr>
            </thead>
            <tbody>
              {column_details.map((col) => (
                <tr key={col.name} className="border-b border-[var(--border)]/50">
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">{col.name}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={dtypeBadgeVariant(col.dtype)}>{col.dtype}</Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={col.missing_pct > 20 ? "text-red-400 font-medium" : "text-[var(--text-muted)]"}>
                      {col.missing_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-[var(--text-muted)]">{formatNumber(col.unique_count)}</td>
                  <td className="py-2 text-[var(--text-muted)] truncate max-w-[200px]">
                    {col.sample_values.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── c. Numeric Statistics (collapsible) ── */}
      {numeric_statistics.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <button
            onClick={() => setNumericExpanded(!numericExpanded)}
            className="flex w-full items-center gap-2 text-left"
          >
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-[var(--text)] flex-1">Numeric Statistics</h3>
            {numericExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            )}
          </button>
          {numericExpanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    {["Column", "Mean", "Std", "Min", "Max", "Skewness", "Kurtosis", "Outliers"].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-xs font-medium text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {numeric_statistics.map((s) => (
                    <tr key={s.column} className="border-b border-[var(--border)]/50">
                      <td className="py-2 pr-3 font-medium text-[var(--text)]">{s.column}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{s.mean.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{s.std.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{s.min.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{s.max.toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        <span className={Math.abs(s.skewness) > 1 ? "text-amber-400 font-medium" : "text-[var(--text-muted)]"}>
                          {s.skewness.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{s.kurtosis.toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        <span className={s.outliers > 50 ? "text-red-400 font-medium" : "text-[var(--text-muted)]"}>
                          {s.outliers}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── d. Categorical Summary ── */}
      {categorical_summary.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <SectionHeader icon={Tags} title="Categorical Summary" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categorical_summary.map((cat) => (
              <div
                key={cat.column}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
              >
                <p className="text-xs font-semibold text-[var(--text)] mb-2">{cat.column}</p>
                <div className="space-y-1.5">
                  {cat.top_values.map((tv) => (
                    <div key={tv.value} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="truncate text-[var(--text-muted)]">{tv.value}</span>
                          <span className="text-[var(--text-muted)] shrink-0 ml-1">{tv.pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                            style={{ width: `${Math.min(tv.pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── e. Top Correlations ── */}
      {top_correlations.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <SectionHeader icon={Link2} title="Top Correlations" />
          <div className="space-y-2">
            {top_correlations.slice(0, 10).map((pair, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-muted)] w-6 shrink-0">{i + 1}.</span>
                <span className="text-sm text-[var(--text)] font-medium min-w-[120px]">{pair.col1}</span>
                <span className="text-xs text-[var(--text-muted)]">↔</span>
                <span className="text-sm text-[var(--text)] font-medium min-w-[120px]">{pair.col2}</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${correlationColor(pair.correlation)}`}
                    style={{ width: `${Math.abs(pair.correlation) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-right shrink-0">
                  {pair.correlation.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── f. Recommendations ── */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Recommendations</h3>
          </div>
          <ul className="space-y-1.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── g. Target Suggestions ── */}
      {(target_suggestions.classification.length > 0 || target_suggestions.regression.length > 0) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <SectionHeader icon={Target} title="Target Suggestions" />
          <div className="grid gap-4 sm:grid-cols-2">
            {target_suggestions.classification.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Classification</p>
                <div className="flex flex-wrap gap-2">
                  {target_suggestions.classification.map((t) => (
                    <button
                      key={t}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {target_suggestions.regression.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Regression</p>
                <div className="flex flex-wrap gap-2">
                  {target_suggestions.regression.map((t) => (
                    <button
                      key={t}
                      className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button
          variant="secondary"
          onClick={handleDownloadReport}
          isLoading={downloading}
        >
          <Download className="h-4 w-4" />
          Download Pipeline Report (.docx)
        </Button>
        <Button
          className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white"
          onClick={onProceedToPipeline}
        >
          Continue to Pipeline
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
