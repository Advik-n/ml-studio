"use client";

import React, { useState, useCallback, useMemo } from "react";
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

// ── Dynamic step system ──────────────────────────────────────────────────────
type StepId =
  | "dataset"
  | "task"
  | "target"
  | "features"
  | "preprocessing"
  | "split"
  | "model"
  | "hyperparams"
  | "review";

interface StepDef {
  id: StepId;
  label: string;
  icon: React.ReactNode;
  headerBg: string;
}

const STEP_DEFS: Record<StepId, StepDef> = {
  dataset:       { id: "dataset",       label: "Dataset",          icon: <Database className="h-5 w-5" />,              headerBg: "from-blue-600 to-blue-500" },
  task:          { id: "task",          label: "Task Type",        icon: <Brain className="h-5 w-5" />,                 headerBg: "from-purple-600 to-purple-500" },
  target:        { id: "target",        label: "Target Column",    icon: <Columns className="h-5 w-5" />,              headerBg: "from-pink-600 to-pink-500" },
  features:      { id: "features",      label: "Features",         icon: <Columns className="h-5 w-5" />,              headerBg: "from-cyan-600 to-cyan-500" },
  preprocessing: { id: "preprocessing", label: "Preprocessing",    icon: <Wrench className="h-5 w-5" />,               headerBg: "from-orange-600 to-orange-500" },
  split:         { id: "split",         label: "Train/Test Split", icon: <SplitSquareHorizontal className="h-5 w-5" />, headerBg: "from-teal-600 to-teal-500" },
  model:         { id: "model",         label: "Model Selection",  icon: <Brain className="h-5 w-5" />,                headerBg: "from-green-600 to-green-500" },
  hyperparams:   { id: "hyperparams",   label: "Hyperparameters",  icon: <Sliders className="h-5 w-5" />,              headerBg: "from-yellow-600 to-yellow-500" },
  review:        { id: "review",        label: "Review & Run",     icon: <ClipboardList className="h-5 w-5" />,        headerBg: "from-red-600 to-red-500" },
};

/** Returns step sequence specific to each task type per configuration.txt */
function getStepsForTask(taskType: TaskType): StepDef[] {
  const s = (id: StepId) => STEP_DEFS[id];
  switch (taskType) {
    case "classification":
    case "regression":
      return [s("dataset"), s("task"), s("target"), s("features"), s("preprocessing"), s("split"), s("model"), s("hyperparams"), s("review")];
    case "clustering":
      // No target column, no train/test split
      return [s("dataset"), s("task"), s("features"), s("preprocessing"), s("model"), s("hyperparams"), s("review")];
    case "nlp":
      // Text + target in one step, no separate features step
      return [s("dataset"), s("task"), s("target"), s("preprocessing"), s("split"), s("model"), s("hyperparams"), s("review")];
    default:
      return [s("dataset"), s("task"), s("target"), s("features"), s("preprocessing"), s("split"), s("model"), s("hyperparams"), s("review")];
  }
}

// ── Model options per task ────────────────────────────────────────────────────
const MODELS: Record<TaskType, string[]> = {
  classification: [
    "LogisticRegression", "RandomForestClassifier", "GradientBoostingClassifier",
    "SVC", "KNeighborsClassifier", "DecisionTreeClassifier", "GaussianNB", "XGBClassifier",
  ],
  regression: [
    "LinearRegression", "Ridge", "Lasso", "ElasticNet",
    "RandomForestRegressor", "GradientBoostingRegressor",
    "SVR", "DecisionTreeRegressor", "XGBRegressor",
  ],
  clustering: ["KMeans", "DBSCAN", "AgglomerativeClustering", "GaussianMixture"],
  nlp: ["TfidfLogistic", "TfidfNaiveBayes", "TfidfSVM", "TfidfRandomForest"],
};

// ── Hyperparameter templates ──────────────────────────────────────────────────
type HPType = "number" | "select" | "boolean";
interface HPField { name: string; label: string; type: HPType; default: string | number | boolean; options?: string[] }
const HP_TEMPLATES: Record<string, HPField[]> = {
  LogisticRegression:          [{ name: "C", label: "C (Regularization)", type: "number", default: 1.0 }, { name: "max_iter", label: "Max Iterations", type: "number", default: 1000 }],
  RandomForestClassifier:      [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "max_depth", label: "Max Depth", type: "number", default: 10 }],
  GradientBoostingClassifier:  [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  SVC:                         [{ name: "C", label: "C", type: "number", default: 1.0 }, { name: "kernel", label: "Kernel", type: "select", default: "rbf", options: ["linear","rbf","poly","sigmoid"] }],
  KNeighborsClassifier:        [{ name: "n_neighbors", label: "N Neighbors", type: "number", default: 5 }, { name: "weights", label: "Weights", type: "select", default: "uniform", options: ["uniform","distance"] }],
  DecisionTreeClassifier:      [{ name: "max_depth", label: "Max Depth", type: "number", default: 10 }, { name: "criterion", label: "Criterion", type: "select", default: "gini", options: ["gini","entropy","log_loss"] }],
  GaussianNB:                  [],
  XGBClassifier:               [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }, { name: "max_depth", label: "Max Depth", type: "number", default: 6 }],
  LinearRegression:            [],
  Ridge:                       [{ name: "alpha", label: "Alpha", type: "number", default: 1.0 }],
  Lasso:                       [{ name: "alpha", label: "Alpha", type: "number", default: 1.0 }],
  ElasticNet:                  [{ name: "alpha", label: "Alpha", type: "number", default: 1.0 }, { name: "l1_ratio", label: "L1 Ratio (0=Ridge, 1=Lasso)", type: "number", default: 0.5 }],
  RandomForestRegressor:       [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "max_depth", label: "Max Depth", type: "number", default: 10 }],
  GradientBoostingRegressor:   [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  SVR:                         [{ name: "C", label: "C", type: "number", default: 1.0 }, { name: "kernel", label: "Kernel", type: "select", default: "rbf", options: ["linear","rbf","poly","sigmoid"] }],
  DecisionTreeRegressor:       [{ name: "max_depth", label: "Max Depth", type: "number", default: 10 }, { name: "criterion", label: "Criterion", type: "select", default: "squared_error", options: ["squared_error","friedman_mse","absolute_error","poisson"] }],
  XGBRegressor:                [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "learning_rate", label: "Learning Rate", type: "number", default: 0.1 }],
  KMeans:                      [{ name: "n_clusters", label: "N Clusters", type: "number", default: 3 }, { name: "max_iter", label: "Max Iterations", type: "number", default: 300 }],
  DBSCAN:                      [{ name: "eps", label: "Epsilon", type: "number", default: 0.5 }, { name: "min_samples", label: "Min Samples", type: "number", default: 5 }],
  AgglomerativeClustering:     [{ name: "n_clusters", label: "N Clusters", type: "number", default: 3 }, { name: "linkage", label: "Linkage", type: "select", default: "ward", options: ["ward","complete","average","single"] }],
  GaussianMixture:             [{ name: "n_components", label: "N Components", type: "number", default: 3 }, { name: "covariance_type", label: "Covariance Type", type: "select", default: "full", options: ["full","tied","diag","spherical"] }],
  TfidfLogistic:               [{ name: "C", label: "C (Regularization)", type: "number", default: 1.0 }, { name: "max_iter", label: "Max Iterations", type: "number", default: 1000 }],
  TfidfNaiveBayes:             [{ name: "alpha", label: "Alpha (Smoothing)", type: "number", default: 1.0 }],
  TfidfSVM:                    [{ name: "C", label: "C", type: "number", default: 1.0 }],
  TfidfRandomForest:           [{ name: "n_estimators", label: "N Estimators", type: "number", default: 100 }, { name: "max_depth", label: "Max Depth", type: "number", default: 10 }],
};

const NLP_MODEL_LABELS: Record<string, string> = {
  TfidfLogistic: "TF-IDF + Logistic Regression",
  TfidfNaiveBayes: "TF-IDF + Naive Bayes",
  TfidfSVM: "TF-IDF + SVM",
  TfidfRandomForest: "TF-IDF + Random Forest",
};

// ── Task-specific preprocessing options ──────────────────────────────────────
interface PreprocessingConfig {
  scalers: string[];
  imputers: string[];
  encoders: string[];
  featureEng: string[];
}

const PREPROCESSING: Record<TaskType, PreprocessingConfig> = {
  classification: {
    scalers: ["StandardScaler", "RobustScaler"],
    imputers: ["MedianImputer", "KNNImputer"],
    encoders: ["OneHotEncoder", "LabelEncoder"],
    featureEng: ["SelectKBest", "PCA"],
  },
  regression: {
    scalers: ["StandardScaler", "MinMaxScaler", "RobustScaler"],
    imputers: ["MedianImputer", "KNNImputer"],
    encoders: ["OneHotEncoder", "LabelEncoder"],
    featureEng: ["SelectKBest", "PCA", "PolynomialFeatures"],
  },
  clustering: {
    scalers: ["StandardScaler", "MinMaxScaler", "RobustScaler"],
    imputers: ["MedianImputer", "KNNImputer"],
    encoders: [],
    featureEng: ["PCA", "VarianceThreshold"],
  },
  nlp: { scalers: [], imputers: [], encoders: [], featureEng: [] },
};

const TASK_LABELS: Record<TaskType, string> = {
  classification: "Classification",
  regression: "Regression",
  clustering: "Clustering",
  nlp: "NLP Text Classification",
};

const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  classification: "Predict discrete labels (Yes/No, categories)",
  regression: "Predict continuous numeric values",
  clustering: "Find hidden groups — no target needed",
  nlp: "Classify text using NLP techniques",
};

// ── Main component ──────────────────────────────────────────────────────────
interface PipelineBuilderProps {
  projectId: string;
  onJobCreated: (job: PipelineJob) => void;
}

export default function PipelineBuilder({ projectId, onJobCreated }: PipelineBuilderProps) {
  const [stepIndex, setStepIndex] = useState(0);
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

  // Dynamic steps based on task type
  const steps = useMemo(() => getStepsForTask(taskType), [taskType]);
  const currentStep = steps[stepIndex] ?? steps[0];
  const currentStepId = currentStep.id;
  const pp = PREPROCESSING[taskType];

  // Dataset dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setDatasetFile(acceptedFiles[0]);
      setDatasetFilename(acceptedFiles[0].name);
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
    accept: {
      "text/csv": [".csv", ".tsv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/json": [".json"],
      "application/octet-stream": [".parquet"],
      "application/x-parquet": [".parquet"],
    },
    maxFiles: 1,
  });

  // Step completion check
  const isStepComplete = (sid: StepId): boolean => {
    switch (sid) {
      case "dataset": return !!datasetFile;
      case "task": return !!taskType;
      case "target":
        if (taskType === "nlp") return featureColumns.length > 0 && targetColumns.length > 0;
        return targetColumns.length > 0;
      case "features": return featureColumns.length > 0;
      case "preprocessing": return true;
      case "split": return testSize > 0 && testSize < 1;
      case "model": return !!modelName;
      case "hyperparams": return true;
      case "review": return true;
      default: return true;
    }
  };

  const goNext = () => {
    if (!isStepComplete(currentStepId)) return;
    setDirection("forward");
    setStepIndex((s) => Math.min(s + 1, steps.length - 1));
  };
  const goBack = () => {
    setDirection("back");
    setStepIndex((s) => Math.max(s - 1, 0));
  };

  // When task type changes, reset dependent state and clamp step index
  const handleTaskChange = (t: TaskType) => {
    setTaskType(t);
    setModelName("");
    setSelectedTransformers([]);
    setHyperparameters({});
    // Stay on task step (always index 1)
  };

  const toggleTransformer = (t: string) => {
    setSelectedTransformers((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

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
        test_size: taskType !== "clustering" ? testSize : undefined,
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

  const variants = {
    enter: { x: direction === "forward" ? 40 : -40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: direction === "forward" ? -40 : 40, opacity: 0 },
  };

  // ── Step content renderer ──────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStepId) {
      // ── Dataset ──
      case "dataset":
        return (
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
                {isDragActive ? "Drop dataset here" : "Upload your dataset (.csv, .tsv, .xls, .xlsx, .json, .parquet)"}
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setDatasetFile(null); setDatasetFilename(""); setColumns([]); setFeatureColumns([]); setTargetColumns([]); }}
                >
                  <span className="text-sm">✕</span>
                </Button>
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              </div>
            )}
          </div>
        );

      // ── Task Type ──
      case "task":
        return (
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(TASK_LABELS) as TaskType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTaskChange(t)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  taskType === t
                    ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/50"
                    : "border-[var(--border)] hover:border-purple-400 hover:bg-purple-500/5"
                }`}
              >
                <p className="font-semibold text-sm text-[var(--text)]">{TASK_LABELS[t]}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{TASK_DESCRIPTIONS[t]}</p>
              </button>
            ))}
          </div>
        );

      // ── Target Column (+ text column for NLP) ──
      case "target":
        if (columns.length === 0) {
          return <p className="text-sm text-[var(--text-muted)]">No columns detected. Please upload a dataset first.</p>;
        }
        if (taskType === "nlp") {
          return (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">Text Column <span className="text-xs text-[var(--text-muted)]">(the column containing text data)</span></p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {columns.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setFeatureColumns([col])}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        featureColumns.includes(col)
                          ? "border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-cyan-400"
                      }`}
                    >
                      {featureColumns.includes(col) && <Check className="inline h-3 w-3 mr-1" />}
                      {col}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">Target Column</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {columns.filter((c) => !featureColumns.includes(c)).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setTargetColumns([col])}
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
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--text)]">
              Target Column
              {taskType === "classification" && <span className="text-xs text-[var(--text-muted)] ml-1">(categorical — auto-detects binary vs multiclass)</span>}
              {taskType === "regression" && <span className="text-xs text-[var(--text-muted)] ml-1">(must be numeric)</span>}
            </p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {columns.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setTargetColumns([col])}
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
        );

      // ── Feature Selection ──
      case "features":
        if (columns.length === 0) {
          return <p className="text-sm text-[var(--text-muted)]">No columns detected. Please upload a dataset first.</p>;
        }
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--text)]">Select Feature Columns</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFeatureColumns(columns.filter((c) => !targetColumns.includes(c)))} className="text-xs text-blue-500 hover:text-blue-400">Select All</button>
                <button type="button" onClick={() => setFeatureColumns([])} className="text-xs text-red-500 hover:text-red-400">Clear</button>
              </div>
            </div>
            {taskType === "clustering" && (
              <p className="text-xs text-amber-500">⚠ For clustering, non-numeric columns will be auto-encoded. Consider dropping ID/text columns.</p>
            )}
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {columns.filter((c) => !targetColumns.includes(c)).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleFeature(col)}
                  className={`rounded-full border px-3 py-1 text-xs transition-all ${
                    featureColumns.includes(col)
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-cyan-400"
                  }`}
                >
                  {featureColumns.includes(col) && <Check className="inline h-3 w-3 mr-1" />}
                  {col}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)]">{featureColumns.length} of {columns.length - targetColumns.length} columns selected</p>
          </div>
        );

      // ── Preprocessing (task-specific) ──
      case "preprocessing":
        if (taskType === "nlp") {
          return (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-medium text-[var(--text)] mb-2">NLP Text Preprocessing</p>
              <p className="text-xs text-[var(--text-muted)] mb-3">The following preprocessing is automatically applied:</p>
              <div className="space-y-2">
                {["Lowercasing", "English stopword removal", "TF-IDF Vectorization (max_features=5000, ngram_range=(1,2))"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-[var(--text)]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            {pp.imputers.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">Missing Value Handling</p>
                <div className="flex flex-wrap gap-2">
                  {pp.imputers.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTransformer(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedTransformers.includes(t)
                          ? "border-orange-500 bg-orange-500/15 text-orange-600 dark:text-orange-400"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-orange-400"
                      }`}
                    >
                      {selectedTransformers.includes(t) && <Check className="inline h-3 w-3 mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pp.encoders.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">Encoding</p>
                <div className="flex flex-wrap gap-2">
                  {pp.encoders.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTransformer(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedTransformers.includes(t)
                          ? "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-violet-400"
                      }`}
                    >
                      {selectedTransformers.includes(t) && <Check className="inline h-3 w-3 mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pp.scalers.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">
                  Scaling
                  {taskType === "clustering" && <span className="text-xs text-amber-500 ml-1">(Highly recommended for clustering)</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pp.scalers.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTransformer(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedTransformers.includes(t)
                          ? "border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-400"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-teal-400"
                      }`}
                    >
                      {selectedTransformers.includes(t) && <Check className="inline h-3 w-3 mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pp.featureEng.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--text)] mb-2">Feature Engineering</p>
                <div className="flex flex-wrap gap-2">
                  {pp.featureEng.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTransformer(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedTransformers.includes(t)
                          ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-blue-400"
                      }`}
                    >
                      {selectedTransformers.includes(t) && <Check className="inline h-3 w-3 mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedTransformers.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {taskType === "clustering"
                  ? "StandardScaler is applied by default if none selected. Scaling is critical for clustering."
                  : "Default: StandardScaler (numeric) + auto-encoding (categorical). Select to override."}
              </p>
            )}
          </div>
        );

      // ── Train/Test Split ──
      case "split":
        return (
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-[var(--text-muted)]">
              <span>Training: {Math.round((1 - testSize) * 100)}%</span>
              <span>Testing: {Math.round(testSize * 100)}%</span>
            </div>
            <input
              type="range" min={0.1} max={0.4} step={0.05}
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
            {taskType === "classification" && (
              <p className="text-xs text-[var(--text-muted)]">✓ Stratified split is automatically applied for classification tasks.</p>
            )}
          </div>
        );

      // ── Model Selection ──
      case "model":
        return (
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
                {NLP_MODEL_LABELS[m] || m}
              </button>
            ))}
          </div>
        );

      // ── Hyperparameters ──
      case "hyperparams":
        return (
          <div className="space-y-4">
            {!modelName ? (
              <p className="text-sm text-[var(--text-muted)]">Please select a model first.</p>
            ) : (HP_TEMPLATES[modelName] || []).length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
                <p className="text-sm text-[var(--text-muted)]">{NLP_MODEL_LABELS[modelName] || modelName} has no configurable hyperparameters.</p>
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
                      step={field.name.includes("rate") || field.name === "C" || field.name === "alpha" || field.name === "eps" || field.name === "l1_ratio" ? 0.01 : 1}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        );

      // ── Review & Run ──
      case "review": {
        const reviewItems = [
          { label: "Dataset", value: datasetFilename || "Not set" },
          { label: "Task Type", value: TASK_LABELS[taskType] },
          ...(taskType !== "clustering"
            ? [{ label: "Target", value: targetColumns.length > 0 ? targetColumns.join(", ") : "Not set" }]
            : []),
          { label: "Features", value: featureColumns.length > 0 ? `${featureColumns.length} selected` : "None" },
          { label: "Preprocessing", value: selectedTransformers.length > 0 ? selectedTransformers.join(", ") : "Default" },
          ...(taskType !== "clustering"
            ? [{ label: "Test Size", value: `${Math.round(testSize * 100)}%` }]
            : []),
          { label: "Model", value: NLP_MODEL_LABELS[modelName] || modelName || "Not set" },
          { label: "Hyperparameters", value: Object.keys(hyperparameters).length > 0 ? `${Object.keys(hyperparameters).length} params` : "Default" },
        ];
        const canRun = !!modelName && (taskType === "clustering" || targetColumns.length > 0) && !!datasetFilename;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {reviewItems.map((item) => (
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
              disabled={!canRun}
            >
              <Play className="h-5 w-5" />
              Run Pipeline
            </Button>
            {!canRun && (
              <p className="text-xs text-red-500 text-center">Please complete all required steps before running.</p>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top progress bar */}
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= stepIndex ? `bg-gradient-to-r ${s.headerBg}` : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {/* Step labels */}
      <div className="flex gap-1 text-[10px] text-[var(--text-muted)]">
        {steps.map((s, i) => (
          <div key={s.id} className={`flex-1 text-center truncate ${i === stepIndex ? "font-semibold text-[var(--text)]" : ""}`}>
            {s.label}
          </div>
        ))}
      </div>

      {/* Step card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStepId}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25 }}
        >
          <Card className="overflow-hidden">
            <div className={`bg-gradient-to-r ${currentStep.headerBg} px-5 py-3 flex items-center gap-2`}>
              <span className="text-white">{currentStep.icon}</span>
              <span className="text-white font-semibold">
                Step {stepIndex + 1}: {currentStep.label}
              </span>
            </div>
            <CardContent className="p-5">
              {renderStepContent()}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button variant="secondary" onClick={goBack} disabled={stepIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        {stepIndex < steps.length - 1 && (
          <div className="flex items-center gap-2">
            {!isStepComplete(currentStepId) && (
              <span className="text-xs text-amber-500">Complete this step to continue</span>
            )}
            <Button onClick={goNext} disabled={!isStepComplete(currentStepId)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
