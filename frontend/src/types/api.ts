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
  entity_label?: string | null;
  description?: string | null;
  details?: Record<string, unknown> | null;
  details_json: string | null;
  timestamp?: string;
  created_at: string;
}

export interface OrganizationContactPreview {
  id: number;
  full_name: string;
  job_title: string | null;
  email: string | null;
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
  contacts_count?: number;
  contacts_preview?: OrganizationContactPreview[];
  open_opportunities_count?: number;
  open_pipeline_eur?: number;
  open_tasks_count?: number;
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

export type ClientPotential = "low" | "medium" | "high";

export interface Client {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  organization_name?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  rgpd_consent: boolean;
  rgpd_consent_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  open_opportunities_count?: number;
  open_pipeline_eur?: number;
  score?: number;
  potential?: ClientPotential;
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

export interface ClientUpdatePayload extends Partial<ClientPayload> {
  potential?: ClientPotential;
}

export interface Lead {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  organization_name?: string | null;
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
  skip_ai_qualification?: boolean;
}

export interface Opportunity {
  id: number;
  tenant_id: number;
  organization_id: number | null;
  organization_name?: string | null;
  client_id: number | null;
  client_name?: string | null;
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
  expected_close_date?: string | null;
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
  due_date?: string | null;
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

export interface ProactiveQualifyResponse {
  status: string;
  lead_id: number;
  score: number | null;
  model_used: string | null;
  created_action: AgentAction | null;
}

export interface CopilotContext {
  view?: string;
  entity_type?: "organization" | "client" | "lead" | "opportunity" | "task";
  entity_id?: number;
  entity_label?: string;
}

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatPayload {
  messages: CopilotMessage[];
  organization_id?: number | null;
  context?: CopilotContext | null;
}

export interface CopilotChatResponse {
  answer: string;
  tools_used: string[];
  created_actions: AgentAction[];
  model_used: string;
}

export interface TodayPriorityItem {
  id: string;
  kind: "task" | "lead_followup" | "opportunity_stalled" | "client_followup";
  entity_type: "task" | "lead" | "opportunity" | "client";
  entity_id: number;
  title: string;
  reason: string;
  priority: "urgent" | "high" | "medium" | "low";
  impact_score: number;
  status: string;
  due_date: string | null;
  is_overdue: boolean;
  amount_eur: number | null;
  organization_id: number | null;
  organization_name: string | null;
  opportunity_id: number | null;
  opportunity_title: string | null;
  score: number | null;
}

export interface TodayStaleLead {
  id: number;
  full_name: string;
  company_name: string | null;
  status: string;
  score: number | null;
  days_without_activity: number;
  last_activity_at: string;
}

export interface TodayStaleOpportunity {
  id: number;
  title: string;
  organization_id: number | null;
  organization_name: string | null;
  amount_eur: number;
  stage: string;
  probability: number;
  days_without_activity: number;
  has_open_task: boolean;
}

export interface TodayPrioritiesResponse {
  generated_at: string;
  items: TodayPriorityItem[];
  attention: {
    stale_leads: TodayStaleLead[];
    stale_opportunities: TodayStaleOpportunity[];
  };
  summary: {
    overdue_tasks_count: number;
    open_tasks_count: number;
    stale_leads_count: number;
    stalled_opportunities_count: number;
    clients_pending_count: number;
    total_action_items: number;
    pending_hitl_count: number;
  };
}

export interface DashboardAnalyticsResponse {
  filters: {
    year: number;
    quarter: number | null;
    available_years: number[];
  };
  kpis: {
    total_leads: number;
    total_clients: number;
    pipeline_value: number;
    weighted_pipeline: number;
    won_value: number;
    conversion_rate: number;
    win_rate: number;
  };
  lead_funnel: {
    status: string;
    label: string;
    count: number;
  }[];
  opp_pipeline: {
    stage: string;
    label: string;
    value: number;
    count: number;
  }[];
  monthly_activity: {
    month: number;
    label: string;
    activities: number;
    leads: number;
    opportunities_eur: number;
  }[];
  forecast: {
    quarter: string;
    label: string;
    pipeline_eur: number;
    weighted_eur: number;
    won_eur: number;
    count: number;
  }[];
  top_clients: {
    organization_id: number;
    name: string;
    cif: string | null;
    pipeline_eur: number;
    won_eur: number;
    total_eur: number;
    opportunities_count: number;
  }[];
  recent_wins: {
    id: number;
    title: string;
    organization_id: number | null;
    organization_name: string | null;
    amount_eur: number;
    updated_at: string;
  }[];
  concentration: {
    top1_name: string | null;
    top1_share_pct: number;
    top3_share_pct: number;
  };
}

export interface LeadConvertRequest {
  organization?: {
    existing_id?: number | null;
    create?: boolean;
    name?: string;
    cif?: string;
    razon_social?: string;
    direccion_fiscal?: string;
    sector?: string;
    website?: string;
    phone?: string;
    email?: string;
  };
  client?: {
    existing_id?: number | null;
    create?: boolean;
    full_name?: string;
    email?: string;
    phone?: string;
    job_title?: string;
    rgpd_consent?: boolean;
    notes?: string;
  };
  opportunity?: {
    create?: boolean;
    title?: string;
    amount_eur?: number;
    stage?: string;
    probability?: number;
    expected_close_date?: string | null;
    notes?: string;
  };
}

export interface LeadConvertResponse {
  lead: Lead;
  organization: Organization | null;
  client: Client | null;
  opportunity: Opportunity | null;
}

export type GlobalSearchGroupType = "organization" | "client" | "lead" | "opportunity" | "task";

export interface GlobalSearchItem {
  id: number;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchGroup {
  type: GlobalSearchGroupType;
  label: string;
  items: GlobalSearchItem[];
}

export interface GlobalSearchResponse {
  query: string;
  groups: GlobalSearchGroup[];
}

export type Entity360Type = "lead" | "client" | "organization" | "opportunity";

export interface Entity360Response {
  entity_type: Entity360Type;
  entity_id: number;
  entity: Record<string, unknown>;
  organization: Organization | null;
  clients: Client[];
  leads: Lead[];
  opportunities: Opportunity[];
  tasks: Task[];
  activities: ActivityLog[];
}

export type InteractionChannel = "llamada" | "nota" | "reunion" | "email" | "whatsapp";

export interface InteractionCreatePayload {
  entity_type: Entity360Type;
  entity_id: number;
  channel: InteractionChannel;
  summary: string;
  outcome?: string;
}
