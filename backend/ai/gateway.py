"""Gateway BYOK multi-proveedor para tareas internas de IA por tenant."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from sqlmodel import Session, select

from core.crypto import decrypt_secret
from core.models import AIProviderConfig, AIProviderType

DEFAULT_BASE_URLS: dict[str, str] = {
    AIProviderType.OPENAI.value: "https://api.openai.com/v1",
    AIProviderType.ANTHROPIC.value: "https://api.anthropic.com/v1",
    AIProviderType.GEMINI.value: "https://generativelanguage.googleapis.com/v1beta",
    AIProviderType.OPENROUTER.value: "https://openrouter.ai/api/v1",
    AIProviderType.MISTRAL.value: "https://api.mistral.ai/v1",
    AIProviderType.OLLAMA.value: "http://localhost:11434/v1",
}

PROVIDERS_REQUIRING_KEY = {
    AIProviderType.OPENAI.value,
    AIProviderType.ANTHROPIC.value,
    AIProviderType.GEMINI.value,
    AIProviderType.OPENROUTER.value,
    AIProviderType.MISTRAL.value,
}


class AIGatewayError(RuntimeError):
    """Error al invocar o validar un proveedor BYOK."""


@dataclass
class AIResponse:
    content: str
    provider: str
    model: str
    usage: Optional[dict[str, Any]] = None


@dataclass
class ConnectionTestResult:
    ok: bool
    provider: str
    model: str
    latency_ms: int
    detail: str


def get_default_provider_config(session: Session, tenant_id: int) -> Optional[AIProviderConfig]:
    """Obtiene la configuración BYOK activa por defecto de un tenant."""
    default_cfg = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.tenant_id == tenant_id,
            AIProviderConfig.is_active == True,  # noqa: E712
            AIProviderConfig.is_default == True,  # noqa: E712
        )
    ).first()
    if default_cfg is not None:
        return default_cfg

    return session.exec(
        select(AIProviderConfig)
        .where(
            AIProviderConfig.tenant_id == tenant_id,
            AIProviderConfig.is_active == True,  # noqa: E712
        )
        .order_by(AIProviderConfig.id.desc())  # type: ignore[union-attr]
    ).first()


class AIGateway:
    """Cliente unificado BYOK para OpenAI, Anthropic, Gemini, OpenRouter, Mistral y Ollama/vLLM."""

    def __init__(self, timeout_seconds: float = 30.0, transport: Optional[httpx.AsyncBaseTransport] = None) -> None:
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def _resolve_api_key(self, config: AIProviderConfig) -> Optional[str]:
        if config.api_key_encrypted:
            return decrypt_secret(config.api_key_encrypted)
        if config.provider in PROVIDERS_REQUIRING_KEY:
            raise AIGatewayError(f"El proveedor '{config.provider}' requiere una API key configurada.")
        return None

    def _resolve_base_url(self, config: AIProviderConfig) -> str:
        if config.base_url and config.base_url.strip():
            return config.base_url.strip().rstrip("/")
        if config.provider in DEFAULT_BASE_URLS:
            return DEFAULT_BASE_URLS[config.provider]
        raise AIGatewayError(f"El proveedor '{config.provider}' requiere especificar 'base_url'.")

    async def complete(
        self,
        config: AIProviderConfig,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: int = 512,
    ) -> AIResponse:
        if not config.is_active:
            raise AIGatewayError("La configuración del proveedor de IA está desactivada.")

        api_key = self._resolve_api_key(config)
        base_url = self._resolve_base_url(config)
        provider = config.provider

        async with httpx.AsyncClient(timeout=self.timeout_seconds, transport=self.transport) as client:
            if provider in {
                AIProviderType.OPENAI.value,
                AIProviderType.OPENROUTER.value,
                AIProviderType.MISTRAL.value,
                AIProviderType.OLLAMA.value,
                AIProviderType.OPENAI_COMPATIBLE.value,
            }:
                return await self._call_openai_compatible(
                    client=client,
                    provider=provider,
                    base_url=base_url,
                    model_name=config.model_name,
                    api_key=api_key,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            if provider == AIProviderType.ANTHROPIC.value:
                return await self._call_anthropic(
                    client=client,
                    base_url=base_url,
                    model_name=config.model_name,
                    api_key=api_key or "",
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            if provider == AIProviderType.GEMINI.value:
                return await self._call_gemini(
                    client=client,
                    base_url=base_url,
                    model_name=config.model_name,
                    api_key=api_key or "",
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )

        raise AIGatewayError(f"Proveedor de IA no soportado: {provider}")

    async def test_connection(self, config: AIProviderConfig) -> ConnectionTestResult:
        started = time.perf_counter()
        try:
            response = await self.complete(
                config,
                [{"role": "user", "content": "Responde únicamente con 'OK'."}],
                temperature=0.0,
                max_tokens=16,
            )
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return ConnectionTestResult(
                ok=True,
                provider=config.provider,
                model=response.model,
                latency_ms=elapsed_ms,
                detail="Conexión verificada correctamente.",
            )
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return ConnectionTestResult(
                ok=False,
                provider=config.provider,
                model=config.model_name,
                latency_ms=elapsed_ms,
                detail=str(exc),
            )

    async def _call_openai_compatible(
        self,
        *,
        client: httpx.AsyncClient,
        provider: str,
        base_url: str,
        model_name: str,
        api_key: Optional[str],
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> AIResponse:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        if provider == AIProviderType.OPENROUTER.value:
            headers["HTTP-Referer"] = "https://fidusos.local"
            headers["X-Title"] = "FidusOS v2"

        url = f"{base_url}/chat/completions"
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise AIGatewayError(f"Error {resp.status_code} desde {provider}: {resp.text[:300]}")

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise AIGatewayError(f"Respuesta vacía sin 'choices' desde {provider}.")
        content = choices[0].get("message", {}).get("content", "")
        return AIResponse(
            content=content,
            provider=provider,
            model=data.get("model", model_name),
            usage=data.get("usage"),
        )

    async def _call_anthropic(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        model_name: str,
        api_key: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> AIResponse:
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        chat_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m.get("role") in {"user", "assistant"}
        ]
        payload: dict[str, Any] = {
            "model": model_name,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": chat_messages,
        }
        if system_parts:
            payload["system"] = "\n".join(system_parts)

        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        url = f"{base_url}/messages"
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise AIGatewayError(f"Error {resp.status_code} desde anthropic: {resp.text[:300]}")

        data = resp.json()
        blocks = data.get("content") or []
        text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
        return AIResponse(
            content=text,
            provider=AIProviderType.ANTHROPIC.value,
            model=data.get("model", model_name),
            usage=data.get("usage"),
        )

    async def _call_gemini(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        model_name: str,
        api_key: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> AIResponse:
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        contents = []
        for m in messages:
            if m.get("role") == "system":
                continue
            role = "model" if m.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_parts)}]}

        url = f"{base_url}/models/{model_name}:generateContent"
        resp = await client.post(url, params={"key": api_key}, json=payload)
        if resp.status_code >= 400:
            raise AIGatewayError(f"Error {resp.status_code} desde gemini: {resp.text[:300]}")

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise AIGatewayError("Respuesta vacía sin 'candidates' desde gemini.")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        return AIResponse(
            content=text,
            provider=AIProviderType.GEMINI.value,
            model=model_name,
            usage=data.get("usageMetadata"),
        )
