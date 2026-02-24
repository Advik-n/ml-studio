export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_verified: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  type: "eda" | "pipeline" | "both";
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export type EDAJobStatus =
  | "pending"
  | "uploading"
  | "analyzing"
  | "generating_notebook"
  | "creating_report"
  | "cleaning_data"
  | "completed"
  | "failed";

export interface EDAJob {
  id: string;
  project_id: string;
  filename: string;
  status: EDAJobStatus;
  progress: number;
  file_url?: string;
  notebook_url?: string;
  report_url?: string;
  cleaned_data_url?: string;
  zip_url?: string;
  row_count?: number;
  column_count?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type PipelineJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface PipelineMetrics {
  accuracy?: number;
  f1_score?: number;
  precision?: number;
  recall?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  [key: string]: number | undefined;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface PipelineJob {
  id: string;
  project_id: string;
  config: PipelineConfig;
  status: PipelineJobStatus;
  progress: number;
  metrics?: PipelineMetrics;
  feature_importance?: FeatureImportance[];
  confusion_matrix?: number[][];
  notebook_url?: string;
  model_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type TaskType =
  | "classification"
  | "regression"
  | "clustering"
  | "nlp"
  | "image_recognition";

export interface HyperParameter {
  name: string;
  value: string | number | boolean;
}

export interface PipelineConfig {
  dataset_id?: string;
  dataset_filename?: string;
  task_type: TaskType;
  model_name: string;
  feature_columns: string[];
  target_column?: string;
  test_size: number;
  transformers: string[];
  hyperparameters: Record<string, string | number | boolean>;
}

export interface PredictRequest {
  pipeline_job_id: string;
  features: Record<string, string | number>;
}

export interface PredictResponse {
  prediction: string | number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  full_name: string;
  password: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}
