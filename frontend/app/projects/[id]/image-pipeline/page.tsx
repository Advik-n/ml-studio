"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { GitBranch, Loader2, XCircle, BarChart2, Target, Layers, Download, Cpu, AlertTriangle, Code, FileText, Shield, TrendingUp, Crosshair } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { extractApiError } from "@/lib/api-errors";
import type { Project, User } from "@/lib/types";

const MODELS = [
  { id: "RandomForest", label: "Random Forest", desc: "Ensemble of decision trees" },
  { id: "ExtraTrees", label: "Extra Trees", desc: "Extremely randomized trees" },
  { id: "SVM", label: "Support Vector Machine", desc: "Kernel-based classifier" },
  { id: "KNN", label: "K-Nearest Neighbors", desc: "Instance-based learning" },
  { id: "LogisticRegression", label: "Logistic Regression", desc: "Linear classifier" },
  { id: "GradientBoosting", label: "Gradient Boosting", desc: "Boosted tree ensemble" },
  { id: "XGBoost", label: "XGBoost", desc: "Extreme gradient boosting" },
  { id: "LightGBM", label: "LightGBM", desc: "Light gradient boosting" },
];

const FEATURE_METHODS = [
  { id: "hog", label: "HOG + Color", desc: "Histogram of Oriented Gradients + color histograms" },
  { id: "lbp", label: "LBP + Color", desc: "Local Binary Pattern + color histograms" },
  { id: "combined", label: "Combined (HOG+LBP)", desc: "HOG + LBP + color histograms (best accuracy)" },
];

const SIZES = [
  { value: [64, 64], label: "64×64 (Fast)" },
  { value: [128, 128], label: "128×128 (Balanced)" },
  { value: [256, 256], label: "256×256 (Quality)" },
];

export default function ImagePipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [edaJobId, setEdaJobId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("RandomForest");
  const [targetSize, setTargetSize] = useState<number[]>([128, 128]);
  const [testSplit, setTestSplit] = useState(0.2);
  const [featureMethod, setFeatureMethod] = useState("hog");
  const [training, setTraining] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [userData, projRes] = await Promise.all([
        getCurrentUser(),
        api.get<Project>(`/projects/${id}`),
      ]);
      setUser(userData);
      setProject(projRes.data);
      const edaId = searchParams.get("edaJobId");
      if (edaId) {
        setEdaJobId(edaId);
      } else {
        try {
          const jobsRes = await api.get(`/image/${id}/jobs`);
          const jobsList = Array.isArray(jobsRes.data) ? jobsRes.data : [];
          const edaJobs = jobsList.filter((j: any) => j.job_type === "image_eda" && j.status === "completed");
          if (edaJobs.length > 0) setEdaJobId(edaJobs[0].id);
          const pipJobs = jobsList.filter((j: any) => j.job_type === "image_pipeline" && j.status === "completed");
          if (pipJobs.length > 0) setResult(pipJobs[0]);
        } catch (err) {
          console.error("Failed to fetch image jobs:", err);
        }
      }
    } catch {
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [id, router, searchParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTrain = async () => {
    if (!edaJobId) return;
    setTraining(true);
    setResult(null);
    try {
      const res = await api.post(`/image/jobs/${edaJobId}/run-pipeline`, {
        target_size: targetSize,
        model_name: selectedModel,
        test_split: testSplit,
        normalize: true,
        feature_method: featureMethod,
      }, { timeout: 900000 });
      setResult(res.data);
    } catch (err: unknown) {
      toast.error(extractApiError(err, "Training failed"));
    } finally {
      setTraining(false);
    }
  };

  const downloadFile = async (endpoint: string, filename: string, type: string) => {
    try {
      const res = await api.get(endpoint, { responseType: "blob" });
      const blob = new Blob([res.data], { type });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`Downloaded ${filename}`);
    } catch {
      toast.error("Download failed");
    }
  };

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  const metrics = result?.metrics;
  const overfitting = metrics?.overfitting;
  const errorAnalysis = metrics?.error_analysis;
  const confidenceStats = metrics?.confidence_stats;
  const featureImportance = metrics?.feature_importance;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.name || user?.username} />
      <div className="flex">
        <Sidebar projectId={id} projectName={project.name} projectType="image" />
        <main className="flex-1 p-6 max-w-6xl">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
              <motion.div whileHover={{ rotate: 15 }}>
                <GitBranch className="h-5 w-5 text-purple-500" />
              </motion.div>
              Image Pipeline
            </h1>
            <p className="text-sm text-[var(--text-muted)]">Train image classification models</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Configuration */}
            <div className="space-y-4">
              {!edaJobId && (
                <Card className="border-amber-500/30 card-hover-glow">
                  <CardContent className="p-4 text-amber-400 text-sm">
                    ⚠️ Run Image EDA first to prepare dataset for training.
                    <Button variant="secondary" size="sm" className="mt-2" onClick={() => router.push(`/projects/${id}/image-eda`)}>
                      Go to Image EDA
                    </Button>
                  </CardContent>
                </Card>
              )}

              {edaJobId && (
                <>
                  {/* Model Selection */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Select Model</h3>
                      <div className="space-y-2">
                        {MODELS.map(m => (
                          <motion.button key={m.id} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedModel(m.id)}
                            className={`w-full text-left rounded-lg border p-3 transition-all ${
                              selectedModel === m.id
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm shadow-[var(--primary)]/10"
                                : "border-[var(--border)] hover:border-[var(--primary)]/30"
                            }`}>
                            <p className="text-sm font-medium text-[var(--text)]">{m.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">{m.desc}</p>
                          </motion.button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Image Size */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Image Size</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {SIZES.map(s => (
                          <motion.button key={s.label} whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }}
                            onClick={() => setTargetSize(s.value)}
                            className={`rounded-lg border p-2 text-center transition-all ${
                              targetSize[0] === s.value[0]
                                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                                : "border-[var(--border)] hover:border-[var(--primary)]/30"
                            }`}>
                            <p className="text-xs font-medium text-[var(--text)]">{s.label}</p>
                          </motion.button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Test Split */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Test Split</h3>
                      <div className="flex items-center gap-3">
                        <input type="range" min="0.1" max="0.4" step="0.05"
                          value={testSplit} onChange={e => setTestSplit(parseFloat(e.target.value))}
                          className="flex-1 accent-[var(--primary)]" />
                        <span className="text-sm font-mono text-[var(--text-muted)] w-12">{(testSplit * 100).toFixed(0)}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Feature Extraction */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-cyan-400" /> Feature Extraction
                      </h3>
                      <div className="space-y-2">
                        {FEATURE_METHODS.map(m => (
                          <motion.button key={m.id} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}
                            onClick={() => setFeatureMethod(m.id)}
                            className={`w-full text-left rounded-lg border p-3 transition-all ${
                              featureMethod === m.id
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm shadow-[var(--primary)]/10"
                                : "border-[var(--border)] hover:border-[var(--primary)]/30"
                            }`}>
                            <p className="text-sm font-medium text-[var(--text)]">{m.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">{m.desc}</p>
                          </motion.button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Train Button */}
                  <Button onClick={handleTrain} isLoading={training} className="w-full btn-glow" disabled={training}>
                    {training ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Training...</>
                    ) : (
                      <><GitBranch className="h-4 w-4" /> Train Model</>
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Results */}
            <div>
              {training && (
                <Card>
                  <CardContent className="p-6 flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-4" />
                    <p className="text-[var(--text)] font-medium">Training model...</p>
                    <p className="text-xs text-[var(--text-muted)]">This may take a few minutes</p>
                  </CardContent>
                </Card>
              )}

              {result && result.status === "completed" && metrics && (
                <div className="space-y-4">
                  {/* Download Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" className="btn-glow" onClick={() => downloadFile(`/image/jobs/${result.id}/download-report`, `pipeline_${result.id?.slice(0, 8)}.py`, "text/x-python")}>
                      <Code className="h-3.5 w-3.5" /> Pipeline Code (.py)
                    </Button>
                    <Button variant="secondary" size="sm" className="btn-glow" onClick={() => downloadFile(`/image/jobs/${result.id}/download-pipeline-report`, `pipeline_report_${result.id?.slice(0, 8)}.txt`, "text/plain")}>
                      <FileText className="h-3.5 w-3.5" /> Pipeline Report
                    </Button>
                  </div>

                  {/* Training Performance */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-400" /> Training Performance
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Train Accuracy", value: overfitting?.train_acc, color: "text-blue-400" },
                          { label: "Test Accuracy", value: result.accuracy, color: "text-emerald-400" },
                          { label: "Precision", value: metrics?.precision, color: "text-purple-400" },
                          { label: "Recall", value: metrics?.recall, color: "text-cyan-400" },
                          { label: "F1 Score", value: metrics?.f1_score, color: "text-orange-400" },
                          { label: "ROC-AUC", value: metrics?.roc_auc, color: "text-pink-400" },
                        ].map(m => (
                          <div key={m.label} className="rounded-lg bg-[var(--bg)] p-3 text-center stat-card-glow">
                            <p className="text-xs text-[var(--text-muted)]">{m.label}</p>
                            <p className={`text-xl font-bold ${m.color}`}>
                              {m.value != null ? `${((m.value ?? 0) * 100).toFixed(1)}%` : "N/A"}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Overfitting Detection */}
                      {overfitting && (
                        <div className={`mt-3 p-3 rounded-lg ${overfitting.level === 'SEVERE' ? 'bg-red-500/10' : overfitting.level === 'MODERATE' ? 'bg-amber-500/10' : overfitting.level === 'MILD' ? 'bg-yellow-500/10' : 'bg-emerald-500/10'}`}>
                          <div className="flex items-center gap-2">
                            {overfitting.level !== 'NONE' ? (
                              <AlertTriangle className={`h-4 w-4 ${overfitting.level === 'SEVERE' ? 'text-red-400' : 'text-amber-400'}`} />
                            ) : (
                              <Shield className="h-4 w-4 text-emerald-400" />
                            )}
                            <span className="text-sm font-medium text-[var(--text)]">
                              Overfitting: {overfitting.level}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">
                              (gap: {(overfitting.gap * 100).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Cross-validation */}
                      {metrics?.cv_scores && (
                        <div className="mt-3 p-3 rounded-lg bg-[var(--bg)]">
                          <p className="text-xs text-[var(--text-muted)] mb-1">Cross-Validation (5-fold)</p>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {(metrics.cv_scores.mean * 100).toFixed(1)}% ± {(metrics.cv_scores.std * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Per-Class Metrics */}
                  {metrics?.per_class_metrics && (
                    <Card className="card-hover-glow">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-blue-400" /> Per-Class Metrics
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-left">
                                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Class</th>
                                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Precision</th>
                                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">Recall</th>
                                <th className="pb-2 pr-4 text-xs font-medium text-[var(--text-muted)]">F1</th>
                                <th className="pb-2 text-xs font-medium text-[var(--text-muted)]">Support</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(metrics.per_class_metrics || {}).map(([cls, m]: [string, any]) => (
                                <tr key={cls} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/50 transition-colors">
                                  <td className="py-2 pr-4 font-medium text-[var(--text)]">{cls}</td>
                                  <td className="py-2 pr-4 text-[var(--text-muted)]">{(((m?.precision ?? 0)) * 100).toFixed(1)}%</td>
                                  <td className="py-2 pr-4 text-[var(--text-muted)]">{(((m?.recall ?? 0)) * 100).toFixed(1)}%</td>
                                  <td className="py-2 pr-4 text-[var(--text-muted)]">{(((m?.f1 ?? 0)) * 100).toFixed(1)}%</td>
                                  <td className="py-2 text-[var(--text-muted)]">{m?.support ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Confusion Matrix */}
                  {result.confusion_matrix && (
                    <Card className="card-hover-glow">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                          <BarChart2 className="h-4 w-4 text-purple-400" /> Confusion Matrix
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="text-sm">
                            <thead>
                              <tr>
                                <th className="p-2 text-xs text-[var(--text-muted)]"></th>
                                {(result.class_names || []).map((cls: string) => (
                                  <th key={cls} className="p-2 text-xs text-[var(--text-muted)] text-center">{cls.slice(0, 10)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.confusion_matrix.map((row: number[], i: number) => (
                                <tr key={i}>
                                  <td className="p-2 text-xs font-medium text-[var(--text)]">
                                    {(result.class_names || [])[i]?.slice(0, 10)}
                                  </td>
                                  {row.map((val: number, j: number) => {
                                    const maxVal = Math.max(...row);
                                    const intensity = maxVal > 0 ? val / maxVal : 0;
                                    return (
                                      <td key={j} className="p-2 text-center text-sm font-mono rounded"
                                        style={{
                                          backgroundColor: i === j
                                            ? `rgba(34, 197, 94, ${intensity * 0.5})`
                                            : val > 0 ? `rgba(239, 68, 68, ${intensity * 0.3})` : 'transparent',
                                          color: 'var(--text)',
                                        }}>
                                        {val}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Error Analysis */}
                  {errorAnalysis && errorAnalysis.total_misclassified > 0 && (
                    <Card className="card-hover-glow">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-400" /> Error Analysis
                        </h3>
                        <div className="flex items-center gap-3 mb-3">
                          <Badge variant="error">{errorAnalysis.total_misclassified} misclassified ({errorAnalysis.misclassified_pct}%)</Badge>
                        </div>
                        <div className="space-y-1.5">
                          {errorAnalysis.samples?.slice(0, 10).map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="text-[var(--text)] font-medium w-28 truncate">{s.true_class}</span>
                              <span className="text-red-400">→</span>
                              <span className="text-red-400 w-28 truncate">{s.predicted_class}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Prediction Intelligence */}
                  {confidenceStats && (
                    <Card className="card-hover-glow border-[var(--primary)]/20">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                          <Crosshair className="h-4 w-4 text-[var(--primary)]" /> Prediction Intelligence
                        </h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="rounded-lg bg-[var(--bg)] p-3 text-center">
                            <p className="text-xs text-[var(--text-muted)]">Mean Confidence</p>
                            <p className="text-xl font-bold text-[var(--primary)]">{(confidenceStats.mean * 100).toFixed(1)}%</p>
                          </div>
                          <div className="rounded-lg bg-[var(--bg)] p-3 text-center">
                            <p className="text-xs text-[var(--text-muted)]">High Conf (&gt;90%)</p>
                            <p className="text-xl font-bold text-emerald-400">{confidenceStats.high_confidence_count}</p>
                          </div>
                          <div className="rounded-lg bg-[var(--bg)] p-3 text-center">
                            <p className="text-xs text-[var(--text-muted)]">Low Conf (&lt;50%)</p>
                            <p className="text-xl font-bold text-amber-400">{confidenceStats.low_confidence_count}</p>
                          </div>
                          <div className="rounded-lg bg-[var(--bg)] p-3 text-center">
                            <p className="text-xs text-[var(--text-muted)]">Min / Max</p>
                            <p className="text-sm font-bold text-[var(--text)]">
                              {(confidenceStats.min * 100).toFixed(0)}% / {(confidenceStats.max * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                        {/* Confidence Distribution */}
                        {confidenceStats.distribution && (
                          <div>
                            <p className="text-xs text-[var(--text-muted)] mb-2">Confidence Distribution</p>
                            <div className="flex items-end gap-1 h-16">
                              {confidenceStats.distribution.map((count: number, i: number) => {
                                const maxC = Math.max(...confidenceStats.distribution);
                                const h = maxC > 0 ? (count / maxC) * 100 : 0;
                                return (
                                  <motion.div key={i}
                                    initial={{ height: 0 }} animate={{ height: `${h}%` }}
                                    transition={{ delay: i * 0.05, duration: 0.3 }}
                                    className="flex-1 rounded-t bg-gradient-to-t from-[var(--primary)] to-[var(--accent)] opacity-70"
                                    title={`${i * 10}-${(i + 1) * 10}%: ${count}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-1">
                              <span>0%</span><span>50%</span><span>100%</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Feature Importance */}
                  {featureImportance && (
                    <Card className="card-hover-glow">
                      <CardContent className="p-5">
                        <h3 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                          <Target className="h-4 w-4 text-orange-400" /> Feature Importance
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] mb-3">Top features out of {featureImportance.total_features}</p>
                        <div className="space-y-2">
                          {featureImportance.top_features?.slice(0, 8).map((f: any, i: number) => (
                            <div key={i}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-[var(--text-muted)] font-mono">Feature[{f.index}]</span>
                                <span className="text-[var(--text)]">{(f.importance * 100).toFixed(2)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${f.importance * 100 / (featureImportance.top_features[0]?.importance || 1)}%` }}
                                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Training Summary */}
                  <Card className="card-hover-glow">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Training Summary</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-[var(--text-muted)]">Model</div>
                        <div className="text-[var(--text)] font-medium">{result.model_name}</div>
                        <div className="text-[var(--text-muted)]">Features</div>
                        <div className="text-[var(--text)]">{metrics?.feature_method || "HOG + Color"}</div>
                        <div className="text-[var(--text-muted)]">Total Samples</div>
                        <div className="text-[var(--text)]">{metrics?.total_samples}</div>
                        <div className="text-[var(--text-muted)]">Train / Test</div>
                        <div className="text-[var(--text)]">{metrics?.train_samples} / {metrics?.test_samples}</div>
                        <div className="text-[var(--text-muted)]">Feature Dim</div>
                        <div className="text-[var(--text)]">{metrics?.feature_dim}</div>
                        {metrics?.failed_loads > 0 && (
                          <>
                            <div className="text-amber-400">Failed Loads</div>
                            <div className="text-amber-400">{metrics?.failed_loads}</div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {result && result.status === "failed" && (
                <Card className="border-red-500/30 card-hover-glow">
                  <CardContent className="p-5 flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    <div>
                      <p className="font-medium text-red-400">Training Failed</p>
                      <p className="text-sm text-[var(--text-muted)]">{result.error_message || "Training failed. Please try again."}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
