export type ActorType = "human" | "agent";

export type AIProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "mistral"
  | "ollama"
  | "openai_compatible";

export type AgentActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed";

export interface UserPublic {
  id: number;
  tenant_id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserPublic;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  tenant_name: string;
  tenant_slug?: string;
  cif?: string;
  razon_social?: string;
  direccion_fiscal?: string;
  full_name: string;
  email: string;
  password: string;
}

export interface AgentAction {
  id: number;
  tenant_id: number;
  agent_name: string;
  model_used: string | null;
  action_type: string;
  target_entity_type: string;
  target_entity_id: number | null;
  payload: Record<string, unknown>;
  status: AgentActionStatus;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentActionReviewPayload {
  review_note?: string;
}

export interface AIProviderConfig {
  id: number;
  tenant_id: number;
  provider: AIProviderType;
  model_name: string;
  base_url: string | null;
  has_api_key: boolean;
  api_key_masked: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIProviderCreatePayload {
  provider: AIProviderType;
  model_name: string;
  base_url?: string;
  api_key?: string;
  is_default: boolean;
  is_active: boolean;
}

export interface AIProviderUpdatePayload {
  model_name?: string;
  base_url?: string;
  api_key?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export interface ConnectionTestResponse {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  detail: string;
}

export interface AgentApiKey {
  id: number;
  tenant_id: number;
  name: string;
  key_prefix: string;
  scopes: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface AgentApiKeyCreated extends AgentApiKey {
  raw_key: string;
}

export interface AgentApiKeyCreatePayload {
  name: string;
  scopes: string;
}

export interface ActivityLog {
  id: number;
  tenant_id: number;
  actor_type: ActorType;
  actor_name: string;
  user_id: number | null;
  model_used: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details_json: string | null;
  created_at: string;
}

export interface Organization {
  id: number;
  tenant_id: number;
  name: string;
  cif: string | null;
  razon_social: string | null;
  direccion_fiscal: string | null;
  sector: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationPayload {
  name: string;
  cif?: string;
  razon_social?: string;
  direccion_fiscal?: string;
  sector?: string;
  website?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface Client {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  rgpd_consent: boolean;
  rgpd_consent_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPayload {
  organization_id?: number | null;
  full_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  rgpd_consent: boolean;
  notes?: string;
}

export interface Lead {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  status: string;
  score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadPayload {
  organization_id?: number | null;
  full_name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  source?: string;
  status: string;
  score?: number | null;
  notes?: string;
}

export interface Opportunity {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  client_id: number | null;
  lead_id: number | null;
  title: string;
  amount_eur: number;
  currency: string;
  stage: string;
  probability: number;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityPayload {
  organization_id?: number | null;
  client_id?: number | null;
  lead_id?: number | null;
  title: string;
  amount_eur: number;
  stage: string;
  probability: number;
  notes?: string;
}

export interface Task {
  id: number;
  tenant_id: number;
  assigned_user_id: number | null;
  organization_id: number | null;
  client_id: number | null;
  opportunity_id: number | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskPayload {
  organization_id?: number | null;
  client_id?: number | null;
  opportunity_id?: number | null;
  title: string;
  description?: string;
  status: string;
  priority: string;
}

export interface ProactiveStatus {
  has_default_byok: boolean;
  default_provider: string | null;
  default_model: string | null;
  worker_online: boolean;
  worker_last_heartbeat: string | null;
  pending_actions_count: number;
}

export interface ProactiveRadarResponse {
  briefing: string;
  findings_count: number;
  created_actions: AgentAction[];
}

export interface ProactiveIngestPayload {
  text: string;
  organization_id?: number | null;
}

export interface ProactiveIngestResponse {
  summary: string;
  created_actions: AgentAction[];
}

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatPayload {
  messages: CopilotMessage[];
  organization_id?: number | null;
}

export interface CopilotChatResponse {
  answer: string;
  tools_used: string[];
  created_actions: AgentAction[];
  model_used: string;
}

