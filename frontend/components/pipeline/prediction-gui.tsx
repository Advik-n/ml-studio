"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { extractApiError } from "@/lib/api-errors";
import type { PipelineJob, PredictResponse } from "@/lib/types";

interface PredictionGUIProps {
  job: PipelineJob;
}

export default function PredictionGUI({ job }: PredictionGUIProps) {
  const featureCols: string[] = React.useMemo(() => {
    if ((job as any).config?.feature_columns) return (job as any).config.feature_columns;
    if (!job.feature_columns) return [];
    if (Array.isArray(job.feature_columns)) return job.feature_columns as string[];
    try {
      const parsed = JSON.parse(job.feature_columns);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "string") return [parsed];
    } catch {
      /* ignore */
    }
    return typeof job.feature_columns === "string"
      ? job.feature_columns.split(",").map((c) => c.trim()).filter(Boolean)
      : [];
  }, [job.feature_columns, job]);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(featureCols.map((f) => [f, ""]))
  );
  useEffect(() => {
    setValues(Object.fromEntries(featureCols.map((f) => [f, ""])));
  }, [featureCols]);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (col: string, val: string) => {
    setValues((p) => ({ ...p, [col]: val }));
  };

  const handlePredict = async () => {
    const features: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === "") { toast.error(`Please fill in "${k}"`); return; }
      features[k] = isNaN(Number(v)) ? v : Number(v);
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<PredictResponse>(`/pipeline/jobs/${job.id}/predict`, {
        features,
      });
      setResult(res.data);
    } catch (err: unknown) {
      const msg = extractApiError(err, "Prediction failed.");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const maxProb = result?.probabilities
    ? Math.max(...Object.values(result.probabilities ?? {}))
    : null;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] px-5 py-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-white" />
          <span className="font-semibold text-white">Make a Prediction</span>
        </div>
        <CardContent className="p-5 space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Enter feature values to get a prediction from your trained model.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {featureCols.map((col) => (
              <div key={col} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text)]">{col}</label>
                <input
                  type="text"
                  placeholder={`Enter ${col}...`}
                  value={values[col]}
                  onChange={(e) => handleChange(col, e.target.value)}
                  className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handlePredict}
            isLoading={loading}
          >
            <Sparkles className="h-4 w-4" />
            Predict
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-[var(--text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Running inference...</span>
        </div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="overflow-hidden border-[var(--primary)]/30">
              <div className="bg-gradient-to-r from-[var(--primary)]/20 to-[var(--accent)]/20 px-5 py-3">
                <span className="font-semibold text-[var(--text)]">Prediction Result</span>
              </div>
              <CardContent className="p-5 space-y-4">
                {/* Main prediction */}
                <div className="text-center">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Predicted Value</p>
          {typeof result.prediction === "object" ? (
            <pre className="text-xs text-left whitespace-pre-wrap bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              {JSON.stringify(result.prediction, null, 2)}
            </pre>
          ) : (
            <p className="text-4xl font-bold text-[var(--primary)]">
              {String(result.prediction)}
            </p>
          )}
                </div>

                {/* Confidence */}
                {result.confidence !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-[var(--text-muted)]">
                      <span>Confidence</span>
                      <span>{(result.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${result.confidence * 100}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                )}

                {/* Class probabilities */}
                {result.probabilities && Object.keys(result.probabilities).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--text-muted)]">Class Probabilities</p>
                    {Object.entries(result.probabilities)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cls, prob]) => (
                        <div key={cls} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className={`font-medium ${prob === maxProb ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`}>
                              {cls}
                            </span>
                            <span className={prob === maxProb ? "text-[var(--primary)] font-bold" : "text-[var(--text-muted)]"}>
                              {(prob * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${prob === maxProb ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${prob * 100}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
