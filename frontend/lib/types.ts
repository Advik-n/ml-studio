export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  is_verified: boolean;
  theme: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  project_type: string; // "eda" | "pipeline" | "mixed"
  folder_path: string;
  created_at: string;
  updated_at: string;
}

export type EDAJobStatus = "pending" | "processing" | "completed" | "failed";

export interface EDAJob {
  id: string;
  project_id: string;
  input_filename: string;
  status: EDAJobStatus;
  output_folder: string | null;
  notebook_path: string | null;
  docx_path: string | null;
  cleaned_csv_path: string | null;
  zip_path: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export type PipelineJobStatus = "pending" | "processing" | "completed" | "failed";

export interface PipelineJob {
  id: string;
  project_id: string;
  model_type: string | null;
  model_name: string | null;
  dataset_filename?: string | null;
  transformers?: string | null;
  test_size?: number | null;
  target_column?: string | string[] | null;
  feature_columns?: string | string[] | null;
  hyperparams?: string | null;
  status: PipelineJobStatus;
  accuracy: number | null;
  metrics: string | null; // JSON string from backend
  notebook_path: string | null;
  model_path: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// Pipeline builder config sent to backend as request body
export interface PipelineConfig {
  dataset_filename: string;
  model_type: string;
  model_name: string;
  transformers: string[];
  test_size?: number;
  target_column?: string | string[];
  feature_columns?: string[];
  hyperparams?: Record<string, string | number | boolean>;
}

export type TaskType = "classification" | "regression" | "clustering" | "nlp";

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface PredictRequest {
  features: Record<string, string | number>;
}

export interface PredictResponse {
  prediction: string | number | Record<string, unknown> | Array<unknown>;
  confidence?: number;
  probabilities?: Record<string, number>;
}
