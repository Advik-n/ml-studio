"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  Database,
  Brain,
  Wrench,
  SplitSquareHorizontal,
  Columns,
  Sliders,
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  Play,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import type { PipelineConfig, PipelineJob, TaskType } from "@/lib/types";
import { formatFileSize } from "@/lib/utils";

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Dataset",           icon: <Database className="h-5 w-5" />,             headerBg: "from-blue-600 to-blue-500",      ring: "ring-blue-500" },
  { id: 2, label: "Task Type",         icon: <Brain className="h-5 w-5" />,                headerBg: "from-purple-600 to-purple-500",  ring: "ring-purple-500" },
  { id: 3, label: "Model",             icon: <Brain className="h-5 w-5" />,                headerBg: "from-green-600 to-green-500",    ring: "ring-green-500" },
  { id: 4, label: "Features Eng.",     icon: <Wrench className="h-5 w-5" />,               headerBg: "from-orange-600 to-orange-500",  ring: "ring-orange-500" },
  { id: 5, label: "Train/Test Split",  icon: <SplitSquareHorizontal className="h-5 w-5" />, headerBg: "from-teal-600 to-teal-500",     ring: "ring-teal-500" },
  { id: 6, label: "Features & Target", icon: <Columns className="h-5 w-5" />,              headerBg: "from-pink-600 to-pink-500",      ring: "ring-pink-500" },
  { id: 7, label: "Hyperparameters",   icon: <Sliders className="h-5 w-5" />,              headerBg: "from-yellow-600 to-yellow-500",  ring: "ring-yellow-500" },
  { id: 8, label: "Review & Run",      icon: <ClipboardList className="h-5 w-5" />,        headerBg: "from-red-600 to-red-500",        ring: "ring-red-500" },
];

// ── Model options per task ────────────────────────────────────────────────────
const MODELS: Record<TaskType, string[]> = {
  classification: ["LogisticRegression", "RandomForestClassifier", "GradientBoostingClassifier", "SVC", "XGBClassifier", "LGBMClassifier"],
  regression:     ["LinearRegression", "Ridge", "Lasso", "RandomForestRegressor", "GradientBoostingRegressor", "XGBRegressor"],
  clustering:     ["KMeans", "DBSCAN", "AgglomerativeClustering", "GaussianMixture"],
  nlp:            ["TFIDFLogistic", "BertClassifier", "NaiveBayesNLP"],
  image_recognition: ["ResNet50", "EfficientNetB0", "MobileNetV2", "VGG16"],
};

// ── Hyperparameter templates ──────────────────────────────────────────────────
type HPType = "number" | "select" | "boolean";
interface HPField { name: string; label: string; type: HPType; default: string | number | boolean; options?: string[] }
const HP_TEMPLATES: Record<string, HPField[]> = {
  LogisticRegression:          [{ name: "C", label: "C (Regularization)", type: "number", default: 1.0 }, { name: "max_iter", label: "Max Iterations", type: "number", default: 200 }],
  RandomForestClassifier:      [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "max_depth", label: "Max Depth", type: "number", default: 10 }],
  GradientBoostingClassifier:  [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  SVC:                         [{ name: "C", label: "C", type: "number", default: 1.0 }, { name: "kernel", label: "Kernel", type: "select", default: "rbf", options: ["linear","rbf","poly"] }],
  XGBClassifier:               [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }, { name: "max_depth", label: "Max Depth", type: "number", default: 6 }],
  LGBMClassifier:              [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  LinearRegression:            [],
  Ridge:                       [{ name: "alpha", label: "Alpha", type: "number", default: 1.0 }],
  Lasso:                       [{ name: "alpha", label: "Alpha", type: "number", default: 1.0 }],
  RandomForestRegressor:       [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "max_depth", label: "Max Depth", type: "number", default: 10 }],
  GradientBoostingRegressor:   [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  XGBRegressor:                [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  KMeans:                      [{ name: "n_clusters", label: "N Clusters", type: "number", default: 8 }, { name: "max_iter", label: "Max Iterations", type: "number", default: 300 }],
  DBSCAN:                      [{ name: "eps", label: "Epsilon", type: "number", default: 0.5 }, { name: "min_samples", label: "Min Samples", type: "number", default: 5 }],
  AgglomerativeClustering:     [{ name: "n_clusters", label: "N Clusters", type: "number", default: 8 }, { name: "linkage", label: "Linkage", type: "select", default: "ward", options: ["ward","complete","average","single"] }],
  GaussianMixture:             [{ name: "n_components", label: "N Components", type: "number", default: 3 }],
  TFIDFLogistic:               [{ name: "max_features", label: "Max Features", type: "number", default: 10000 }],
  BertClassifier:              [{ name: "epochs", label: "Epochs", type: "number", default: 3 }],
  NaiveBayesNLP:               [],
  ResNet50:                    [{ name: "epochs", label: "Epochs", type: "number", default: 10 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.001 }],
  EfficientNetB0:              [{ name: "epochs", label: "Epochs", type: "number", default: 10 }],
  MobileNetV2:                 [{ name: "epochs", label: "Epochs", type: "number", default: 10 }],
  VGG16:                       [{ name: "epochs", label: "Epochs", type: "number", default: 10 }],
};

const TRANSFORMERS = [
  "StandardScaler", "MinMaxScaler", "RobustScaler",
  "PCA", "LabelEncoder", "OneHotEncoder",
  "PolynomialFeatures", "SelectKBest", "VarianceThreshold",
];

const TASK_LABELS: Record<TaskType, string> = {
  classification: "Classification",
  regression: "Regression",
  clustering: "Clustering",
  nlp: "NLP",
  image_recognition: "Image Recognition",
};

// ── Main component ─────────────────────────────────────────────────────────────
interface PipelineBuilderProps {
  projectId: string;
  onJobCreated: (job: PipelineJob) => void;
}

export default function PipelineBuilder({ projectId, onJobCreated }: PipelineBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [running, setRunning] = useState(false);

  // Config state
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("classification");
  const [modelName, setModelName] = useState<string>("");
  const [selectedTransformers, setSelectedTransformers] = useState<string[]>([]);
  const [testSize, setTestSize] = useState(0.2);
  const [columns, setColumns] = useState<string[]>([]);
  const [featureColumns, setFeatureColumns] = useState<string[]>([]);
  const [targetColumns, setTargetColumns] = useState<string[]>([]);
  const [hyperparameters, setHyperparameters] = useState<Record<string, string | number | boolean>>({});
  const [datasetFilename, setDatasetFilename] = useState<string>("");

  // Dataset dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setDatasetFile(acceptedFiles[0]);
      setDatasetFilename(acceptedFiles[0].name);
      // Parse CSV header
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split("\n")[0];
        const cols = firstLine.split(",").map((c) => c.trim().replace(/"/g, ""));
        setColumns(cols);
        setFeatureColumns(cols.slice(0, -1));
        setTargetColumns(cols.length > 0 ? [cols[cols.length - 1]] : []);
      };
      reader.readAsText(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
  });

  // Navigation
  const goNext = () => {
    setDirection("forward");
    setCurrentStep((s) => Math.min(s + 1, 8));
  };
  const goBack = () => {
    setDirection("back");
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  // Toggle transformer
  const toggleTransformer = (t: string) => {
    setSelectedTransformers((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  // Toggle feature column
  const toggleFeature = (col: string) => {
    setFeatureColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const toggleTarget = (col: string) => {
    setTargetColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  // Init HP when model changes
  const handleModelChange = (model: string) => {
    setModelName(model);
    const fields = HP_TEMPLATES[model] || [];
    const defaults: Record<string, string | number | boolean> = {};
    fields.forEach((f) => { defaults[f.name] = f.default; });
    setHyperparameters(defaults);
  };

  // Run pipeline
  const handleRun = async () => {
    setRunning(true);
    try {
      const config: PipelineConfig = {
        dataset_filename: datasetFilename,
        model_type: taskType,
        model_name: modelName,
        feature_columns: featureColumns,
        target_column: taskType !== "clustering" ? targetColumns : undefined,
        test_size: testSize,
        transformers: selectedTransformers,
        hyperparams: hyperparameters,
      };

      if (datasetFile) {
        const formData = new FormData();
        formData.append("file", datasetFile);
        await api.post(`/pipeline/${projectId}/upload-dataset`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      const jobResponse = await api.post<PipelineJob>(`/pipeline/${projectId}/configure`, config);

      toast.success("Pipeline started!");
      onJobCreated(jobResponse.data);
    } catch {
      toast.error("Failed to start pipeline.");
    } finally {
      setRunning(false);
    }
  };

  const step = STEPS[currentStep - 1];
  const variants = {
    enter: { x: direction === "forward" ? 40 : -40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: direction === "forward" ? -40 : 40, opacity: 0 },
  };

  return (
    <div className="space-y-4">
      {/* Top progress */}
      <div className="flex gap-1">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 bg-gradient-to-r ${
              s.id <= currentStep ? s.headerBg : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {/* Step labels */}
      <div className="flex gap-1 text-[10px] text-[var(--text-muted)]">
        {STEPS.map((s) => (
          <div key={s.id} className={`flex-1 text-center truncate ${s.id === currentStep ? "font-semibold text-[var(--text)]" : ""}`}>
            {s.label}
          </div>
        ))}
      </div>

      {/* Step card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25 }}
        >
          <Card className="overflow-hidden">
            {/* Colored header */}
            <div className={`bg-gradient-to-r ${step.headerBg} px-5 py-3 flex items-center gap-2`}>
              <span className="text-white">{step.icon}</span>
              <span className="text-white font-semibold">
                Step {step.id}: {step.label}
              </span>
            </div>

            <CardContent className="p-5">
              {/* ── Step 1: Dataset ── */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div
                    {...getRootProps()}
                    className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                      isDragActive ? "border-blue-500 bg-blue-500/5" : "border-[var(--border)] hover:border-blue-400"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-8 w-8 mx-auto mb-2 text-blue-400" />
                    <p className="text-sm font-medium text-[var(--text)]">
                      {isDragActive ? "Drop CSV here" : "Upload your dataset (CSV)"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Drag & drop or click to browse</p>
                  </div>
                  {datasetFile && (
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{datasetFile.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatFileSize(datasetFile.size)} · {columns.length} columns detected</p>
                      </div>
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: Task Type ── */}
              {currentStep === 2 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(Object.keys(TASK_LABELS) as TaskType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTaskType(t); setModelName(""); }}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        taskType === t
                          ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/50"
                          : "border-[var(--border)] hover:border-purple-400 hover:bg-purple-500/5"
                      }`}
                    >
                      <p className="font-semibold text-sm text-[var(--text)]">{TASK_LABELS[t]}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Step 3: Model ── */}
              {currentStep === 3 && (
                <div className="space-y-2">
                  {MODELS[taskType].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleModelChange(m)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                        modelName === m
                          ? "border-green-500 bg-green-500/10 font-semibold text-[var(--text)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-green-400 hover:bg-green-500/5"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Step 4: Feature Engineering ── */}
              {currentStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-muted)]">Select preprocessing transformers to apply:</p>
                  <div className="flex flex-wrap gap-2">
                    {TRANSFORMERS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTransformer(t)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedTransformers.includes(t)
                            ? "border-orange-500 bg-orange-500/15 text-orange-600 dark:text-orange-400"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:border-orange-400"
                        }`}
                      >
                        {selectedTransformers.includes(t) && <Check className="inline h-3 w-3 mr-1" />}
                        {t}
                      </button>
                    ))}
                  </div>
                  {selectedTransformers.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">No transformers selected (raw features will be used).</p>
                  )}
                </div>
              )}

              {/* ── Step 5: Train/Test Split ── */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-[var(--text-muted)]">
                    <span>Training: {Math.round((1 - testSize) * 100)}%</span>
                    <span>Testing: {Math.round(testSize * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.4}
                    step={0.05}
                    value={testSize}
                    onChange={(e) => setTestSize(Number(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                  <div className="flex rounded-xl overflow-hidden h-6">
                    <div
                      className="bg-gradient-to-r from-teal-600 to-teal-400 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                      style={{ width: `${(1 - testSize) * 100}%` }}
                    >
                      {Math.round((1 - testSize) * 100)}% Train
                    </div>
                    <div
                      className="bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                      style={{ width: `${testSize * 100}%` }}
                    >
                      {Math.round(testSize * 100)}% Test
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 6: Features & Target ── */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  {columns.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)]">No columns detected. Please upload a CSV file in Step 1.</p>
                  )}
                  {columns.length > 0 && (
                    <>
                      <div>
                        <p className="text-sm font-medium text-[var(--text)] mb-2">Feature Columns (select multiple)</p>
                        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                          {columns.map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => toggleFeature(col)}
                              className={`rounded-full border px-3 py-1 text-xs transition-all ${
                                featureColumns.includes(col)
                                  ? "border-pink-500 bg-pink-500/15 text-pink-600 dark:text-pink-400"
                                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-pink-400"
                              }`}
                            >
                              {featureColumns.includes(col) && <Check className="inline h-3 w-3 mr-1" />}
                              {col}
                            </button>
                          ))}
                        </div>
                      </div>
                      {taskType !== "clustering" && (
                        <div>
                          <p className="text-sm font-medium text-[var(--text)] mb-2">Target Columns (select one or more)</p>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {columns.map((col) => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => toggleTarget(col)}
                                className={`rounded-full border px-3 py-1 text-xs transition-all ${
                                  targetColumns.includes(col)
                                    ? "border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-300"
                                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-purple-400"
                                }`}
                              >
                                {targetColumns.includes(col) && <Check className="inline h-3 w-3 mr-1" />}
                                {col}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Step 7: Hyperparameters ── */}
              {currentStep === 7 && (
                <div className="space-y-4">
                  {!modelName ? (
                    <p className="text-sm text-[var(--text-muted)]">Please select a model in Step 3 first.</p>
                  ) : (HP_TEMPLATES[modelName] || []).length === 0 ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
                      <p className="text-sm text-[var(--text-muted)]">{modelName} has no configurable hyperparameters.</p>
                    </div>
                  ) : (
                    (HP_TEMPLATES[modelName] || []).map((field) => (
                      <div key={field.name} className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-[var(--text)]">{field.label}</label>
                        {field.type === "select" ? (
                          <select
                            value={String(hyperparameters[field.name] ?? field.default)}
                            onChange={(e) => setHyperparameters((p) => ({ ...p, [field.name]: e.target.value }))}
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          >
                            {field.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : field.type === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(hyperparameters[field.name] ?? field.default)}
                            onChange={(e) => setHyperparameters((p) => ({ ...p, [field.name]: e.target.checked }))}
                            className="h-4 w-4 accent-yellow-500"
                          />
                        ) : (
                          <input
                            type="number"
                            value={Number(hyperparameters[field.name] ?? field.default)}
                            onChange={(e) => setHyperparameters((p) => ({ ...p, [field.name]: Number(e.target.value) }))}
                            step={field.name.includes("rate") || field.name === "C" || field.name === "alpha" || field.name === "eps" ? 0.01 : 1}
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Step 8: Review & Run ── */}
              {currentStep === 8 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Dataset", value: datasetFilename || "Not set" },
                      { label: "Task Type", value: TASK_LABELS[taskType] },
                      { label: "Model", value: modelName || "Not set" },
                      { label: "Transformers", value: selectedTransformers.length > 0 ? selectedTransformers.join(", ") : "None" },
                      { label: "Test Size", value: `${Math.round(testSize * 100)}%` },
                      { label: "Features", value: featureColumns.length > 0 ? `${featureColumns.length} selected` : "None" },
                      { label: "Target", value: targetColumns.length > 0 ? targetColumns.join(", ") : (taskType === "clustering" ? "N/A" : "Not set") },
                      { label: "Hyperparameters", value: Object.keys(hyperparameters).length > 0 ? `${Object.keys(hyperparameters).length} params` : "Default" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">{item.label}</p>
                        <p className="text-sm font-medium text-[var(--text)] truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-700 hover:to-orange-600 border-0"
                    size="lg"
                    isLoading={running}
                    onClick={handleRun}
                    disabled={!modelName || (taskType !== "clustering" && targetColumns.length === 0) || !datasetFilename}
                  >
                    <Play className="h-5 w-5" />
                    Run Pipeline
                  </Button>
                  {(!modelName || (taskType !== "clustering" && targetColumns.length === 0) || !datasetFilename) && (
                    <p className="text-xs text-red-500 text-center">Please complete all required steps before running.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={goBack}
          disabled={currentStep === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        {currentStep < 8 && (
          <Button onClick={goNext}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
