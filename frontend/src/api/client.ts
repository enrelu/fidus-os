import type {
  ActivityLog,
  ActorType,
  AgentAction,
  AgentActionReviewPayload,
  AgentActionStatus,
  AgentApiKey,
  AgentApiKeyCreated,
  AgentApiKeyCreatePayload,
  AIProviderConfig,
  AIProviderCreatePayload,
  AIProviderUpdatePayload,
  Client,
  ClientPayload,
  ConnectionTestResponse,
  Lead,
  LeadPayload,
  LoginPayload,
  Opportunity,
  OpportunityPayload,
  Organization,
  OrganizationPayload,
  ProactiveIngestPayload,
  ProactiveIngestResponse,
  ProactiveRadarResponse,
  ProactiveStatus,
  RegisterPayload,
  Task,
  TaskPayload,
  TokenResponse,
  UserPublic,
} from "../types/api";

const TOKEN_STORAGE_KEY = "fidus_os_jwt";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") || "";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth = true
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (requiresAuth) {
    const token = getStoredToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    const text = await response.text();
    body = text ? { detail: text } : null;
  }

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `Error HTTP ${response.status}`;
    throw new ApiError(response.status, detail);
  }

  return body as T;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    request<TokenResponse>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify(payload) },
      false
    ),
  register: (payload: RegisterPayload) =>
    request<TokenResponse>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(payload) },
      false
    ),
  me: () => request<UserPublic>("/api/v1/auth/me"),
};

export const aiApi = {
  listAgentActions: (status?: AgentActionStatus) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<AgentAction[]>(`/api/v1/ai/agent-actions${query}`);
  },
  approveAgentAction: (actionId: number, review?: AgentActionReviewPayload) =>
    request<AgentAction>(`/api/v1/ai/agent-actions/${actionId}/approve`, {
      method: "POST",
      body: review ? JSON.stringify(review) : undefined,
    }),
  executeAgentAction: (actionId: number) =>
    request<AgentAction>(`/api/v1/ai/agent-actions/${actionId}/execute`, {
      method: "POST",
    }),
  approveAndExecuteAgentAction: (actionId: number, review?: AgentActionReviewPayload) =>
    request<AgentAction>(`/api/v1/ai/agent-actions/${actionId}/approve-and-execute`, {
      method: "POST",
      body: review ? JSON.stringify(review) : undefined,
    }),
  rejectAgentAction: (actionId: number, review?: AgentActionReviewPayload) =>
    request<AgentAction>(`/api/v1/ai/agent-actions/${actionId}/reject`, {
      method: "POST",
      body: review ? JSON.stringify(review) : undefined,
    }),

  listProviders: () => request<AIProviderConfig[]>("/api/v1/ai/providers"),
  createProvider: (payload: AIProviderCreatePayload) =>
    request<AIProviderConfig>("/api/v1/ai/providers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProvider: (providerId: number, payload: AIProviderUpdatePayload) =>
    request<AIProviderConfig>(`/api/v1/ai/providers/${providerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteProvider: (providerId: number) =>
    request<void>(`/api/v1/ai/providers/${providerId}`, {
      method: "DELETE",
    }),
  testProvider: (providerId: number) =>
    request<ConnectionTestResponse>(`/api/v1/ai/providers/${providerId}/test`, {
      method: "POST",
    }),

  listAgentKeys: () => request<AgentApiKey[]>("/api/v1/ai/agent-keys"),
  createAgentKey: (payload: AgentApiKeyCreatePayload) =>
    request<AgentApiKeyCreated>("/api/v1/ai/agent-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  revokeAgentKey: (keyId: number) =>
    request<void>(`/api/v1/ai/agent-keys/${keyId}`, {
      method: "DELETE",
    }),

  getProactiveStatus: () => request<ProactiveStatus>("/api/v1/ai/proactive/status"),
  runProactiveRadar: (staleDays = 7) =>
    request<ProactiveRadarResponse>("/api/v1/ai/proactive/radar", {
      method: "POST",
      body: JSON.stringify({ stale_days: staleDays }),
    }),
  ingestProactiveText: (payload: ProactiveIngestPayload) =>
    request<ProactiveIngestResponse>("/api/v1/ai/proactive/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const crmApi = {
  listActivities: (params?: { actor_type?: ActorType; entity_type?: string }) => {
    const search = new URLSearchParams();
    if (params?.actor_type) search.set("actor_type", params.actor_type);
    if (params?.entity_type) search.set("entity_type", params.entity_type);
    const qs = search.toString();
    return request<ActivityLog[]>(`/api/v1/crm/activities${qs ? `?${qs}` : ""}`);
  },

  listOrganizations: () => request<Organization[]>("/api/v1/crm/organizations"),
  createOrganization: (payload: OrganizationPayload) =>
    request<Organization>("/api/v1/crm/organizations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateOrganization: (id: number, payload: Partial<OrganizationPayload>) =>
    request<Organization>(`/api/v1/crm/organizations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteOrganization: (id: number) =>
    request<void>(`/api/v1/crm/organizations/${id}`, { method: "DELETE" }),

  listClients: () => request<Client[]>("/api/v1/crm/clients"),
  createClient: (payload: ClientPayload) =>
    request<Client>("/api/v1/crm/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateClient: (id: number, payload: Partial<ClientPayload>) =>
    request<Client>(`/api/v1/crm/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteClient: (id: number) =>
    request<void>(`/api/v1/crm/clients/${id}`, { method: "DELETE" }),

  listLeads: () => request<Lead[]>("/api/v1/crm/leads"),
  createLead: (payload: LeadPayload) =>
    request<Lead>("/api/v1/crm/leads", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateLead: (id: number, payload: Partial<LeadPayload>) =>
    request<Lead>(`/api/v1/crm/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteLead: (id: number) =>
    request<void>(`/api/v1/crm/leads/${id}`, { method: "DELETE" }),

  listOpportunities: () => request<Opportunity[]>("/api/v1/crm/opportunities"),
  createOpportunity: (payload: OpportunityPayload) =>
    request<Opportunity>("/api/v1/crm/opportunities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateOpportunity: (id: number, payload: Partial<OpportunityPayload>) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteOpportunity: (id: number) =>
    request<void>(`/api/v1/crm/opportunities/${id}`, { method: "DELETE" }),

  listTasks: () => request<Task[]>("/api/v1/crm/tasks"),
  createTask: (payload: TaskPayload) =>
    request<Task>("/api/v1/crm/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTask: (id: number, payload: Partial<TaskPayload>) =>
    request<Task>(`/api/v1/crm/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTask: (id: number) =>
    request<void>(`/api/v1/crm/tasks/${id}`, { method: "DELETE" }),
};
