"""Copiloto Conversacional CRM BYOK con bucle de herramientas agnóstico de proveedor."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from pydantic import ValidationError
from sqlmodel import Session

from ai.gateway import AIGateway, get_default_provider_config
from ai.proactive import (
    NoBYOKConfiguredError,
    ProposedActionItem,
    _build_validated_action,
    _serialize_action,
    extract_json_object,
)
from core.models import ActivityLog, ActorType, AgentAction, User
from crm.services import (
    get_account_360_for_tenant,
    get_crm_summary_for_tenant,
    log_interaction_for_tenant,
    search_crm_for_tenant,
)

logger = logging.getLogger("fidus.copilot")

COPILOT_AGENT_NAME = "Copiloto CRM BYOK"
MAX_TOOL_ITERATIONS = 4


def _build_copilot_system_prompt(
    organization_id: Optional[int],
    context: Optional[dict[str, Any]] = None,
) -> str:
    focus_parts: list[str] = []
    if organization_id is not None:
        focus_parts.append(
            f"Contexto activo seleccionado por el usuario: organization_id={organization_id}. "
            "Si pregunta por esta cuenta o pide crear tareas/leads sin especificar empresa, ten en cuenta ese organization_id."
        )
    if context:
        ctx_view = str(context.get("view") or "").strip()
        ctx_etype = str(context.get("entity_type") or "").strip()
        ctx_eid = context.get("entity_id")
        ctx_label = str(context.get("entity_label") or "").strip()
        ctx_desc: list[str] = []
        if ctx_view:
            ctx_desc.append(f"vista={ctx_view}")
        if ctx_etype:
            ctx_desc.append(f"entity_type={ctx_etype}")
        if ctx_eid is not None:
            ctx_desc.append(f"entity_id={ctx_eid}")
        if ctx_label:
            ctx_desc.append(f"etiqueta={ctx_label}")
        if ctx_desc:
            focus_parts.append(
                "Contexto de pantalla actual del usuario: "
                + ", ".join(ctx_desc)
                + ". Si el usuario dice 'este lead', 'esta oportunidad', 'esta cuenta' o 'esta tarea', "
                "refiérete prioritariamente a esta entidad y consulta sus datos con buscar_crm/resumen_crm/cuenta_360 antes de proponer acciones."
            )
    focus_hint = ("\n".join(focus_parts) + "\n") if focus_parts else ""
    return (
        "Eres el Copiloto Operativo CRM de FidusOS v2 (mercado español, importes en EUR, datos fiscales con CIF/razón social).\n"
        f"{focus_hint}"
        "Tienes acceso a herramientas de lectura y propuesta sobre el CRM del tenant actual. "
        "NUNCA inventes datos del CRM (tareas, importes, clientes, oportunidades o IDs): cuando necesites consultar información, "
        "pide primero una o varias herramientas.\n\n"
        "HERRAMIENTAS DISPONIBLES:\n"
        "1. resumen_crm(limit?: int): devuelve tareas abiertas ordenadas por prioridad (urgent > high > medium > low) y vencimiento, "
        "oportunidades abiertas en EUR, leads recientes, organizaciones y acciones HITL pendientes.\n"
        "2. buscar_crm(query: str, limit?: int): busca organizaciones, clientes, leads, oportunidades y tareas por texto.\n"
        "3. cuenta_360(organization_id: int): devuelve ficha fiscal española (CIF, razón social, dirección fiscal), contactos, "
        "oportunidades en EUR, tareas pendientes y actividad reciente de una organización.\n"
        "4. proponer_accion(action_type, target_entity_type, target_entity_id?, payload): crea una AgentAction en estado "
        "pending_approval (Human-in-the-Loop) para que el usuario la apruebe con un clic. "
        "action_type permitidos: 'create_lead', 'create_task', 'update_opportunity'.\n"
        "5. registrar_interaccion(channel, entity_type, entity_id, summary, outcome?): registra en ActivityLog una interacción "
        "(channel: 'llamada' | 'reunion' | 'email' | 'whatsapp'; entity_type: 'organization' | 'client' | 'lead' | 'opportunity' | 'task').\n\n"
        "CLAVES EXACTAS DE payload PARA proponer_accion o proposed_actions:\n"
        "- create_lead: {\"full_name\" (obligatorio), \"email\"?, \"phone\"?, \"company_name\"?, \"source\"?, \"notes\"?, \"organization_id\"?}.\n"
        "- create_task: {\"title\" (obligatorio), \"description\"?, \"priority\" (low|medium|high|urgent)?, \"organization_id\"?, \"opportunity_id\"?}.\n"
        "- update_opportunity (requiere target_entity_id): {\"stage\"?, \"amount_eur\"?, \"probability\" (0-100)?, \"notes\"?}.\n\n"
        "FORMATO DE RESPUESTA OBLIGATORIO (responde EXCLUSIVAMENTE con un objeto JSON válido):\n"
        "- Si necesitas consultar herramientas o ejecutar proponer_accion/registrar_interaccion antes de contestar:\n"
        "  {\"tool_calls\": [{\"name\": \"resumen_crm\", \"arguments\": {}}]}\n"
        "- Cuando ya tengas toda la información para responder al usuario:\n"
        "  {\"answer\": \"respuesta clara, concisa y útil en español\", \"proposed_actions\": [...]}\n"
        "Si no hay nuevas acciones que proponer al final (o ya las propusiste con proponer_accion), deja \"proposed_actions\": []."
    )


def _execute_copilot_tool(
    session: Session,
    *,
    tenant_id: int,
    user: User,
    model_used: str,
    focus_org_id: Optional[int],
    tool_name: str,
    arguments: dict[str, Any],
    created_actions: list[AgentAction],
) -> dict[str, Any]:
    try:
        if tool_name == "resumen_crm":
            raw_limit = arguments.get("limit", 15)
            limit = int(raw_limit) if raw_limit is not None else 15
            return get_crm_summary_for_tenant(session, tenant_id, limit=limit)

        if tool_name == "buscar_crm":
            query = str(arguments.get("query") or "").strip()
            raw_limit = arguments.get("limit", 10)
            limit = int(raw_limit) if raw_limit is not None else 10
            return search_crm_for_tenant(session, tenant_id, query, limit=limit)

        if tool_name == "cuenta_360":
            raw_org_id = arguments.get("organization_id")
            if raw_org_id is None:
                raw_org_id = focus_org_id
            if raw_org_id is None:
                return {"error": "Se requiere 'organization_id' entero para cuenta_360."}
            return get_account_360_for_tenant(session, tenant_id, int(raw_org_id))

        if tool_name == "proponer_accion":
            raw_payload = dict(arguments.get("payload") or {})
            action_type = str(arguments.get("action_type") or "").strip()
            if (
                focus_org_id is not None
                and "organization_id" not in raw_payload
                and action_type in {"create_task", "create_lead"}
            ):
                raw_payload["organization_id"] = focus_org_id

            item = ProposedActionItem.model_validate(
                {
                    "action_type": action_type,
                    "target_entity_type": arguments.get("target_entity_type"),
                    "target_entity_id": arguments.get("target_entity_id"),
                    "payload": raw_payload,
                }
            )
            action = _build_validated_action(
                session,
                tenant_id=tenant_id,
                agent_name=COPILOT_AGENT_NAME,
                model_used=model_used,
                item=item,
                deduplicate=False,
            )
            if action is None:
                return {
                    "created": False,
                    "error": "La acción propuesta no es válida o referencia una entidad inexistente en el tenant.",
                }
            session.add(action)
            session.flush()
            created_actions.append(action)
            return {
                "created": True,
                "action": _serialize_action(action),
            }

        if tool_name == "registrar_interaccion":
            channel = str(arguments.get("channel") or "").strip()
            entity_type = str(arguments.get("entity_type") or "").strip()
            raw_entity_id = arguments.get("entity_id")
            if raw_entity_id is None:
                return {"error": "Se requiere 'entity_id' entero para registrar_interaccion."}
            summary = str(arguments.get("summary") or "").strip()
            outcome = arguments.get("outcome")
            logged = log_interaction_for_tenant(
                session,
                tenant_id,
                actor_type=ActorType.AGENT.value,
                actor_name=COPILOT_AGENT_NAME,
                channel=channel,
                entity_type=entity_type,
                entity_id=int(raw_entity_id),
                summary=summary,
                outcome=str(outcome) if outcome is not None else None,
                user_id=user.id,
                model_used=model_used,
                commit=False,
            )
            return {"logged": True, "activity": logged}

        return {"error": f"Herramienta '{tool_name}' no reconocida."}
    except (ValueError, LookupError, TypeError, ValidationError) as exc:
        return {"error": str(exc)}


def _append_proposed_actions(
    session: Session,
    *,
    tenant_id: int,
    model_used: str,
    focus_org_id: Optional[int],
    raw_items: Any,
    created_actions: list[AgentAction],
) -> None:
    if not isinstance(raw_items, list):
        return
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        try:
            payload = dict(raw_item.get("payload") or {})
            action_type = str(raw_item.get("action_type") or "").strip()
            if (
                focus_org_id is not None
                and "organization_id" not in payload
                and action_type in {"create_task", "create_lead"}
            ):
                payload["organization_id"] = focus_org_id

            item = ProposedActionItem.model_validate(
                {
                    "action_type": action_type,
                    "target_entity_type": raw_item.get("target_entity_type"),
                    "target_entity_id": raw_item.get("target_entity_id"),
                    "payload": payload,
                }
            )
        except ValidationError:
            continue

        action = _build_validated_action(
            session,
            tenant_id=tenant_id,
            agent_name=COPILOT_AGENT_NAME,
            model_used=model_used,
            item=item,
            deduplicate=False,
        )
        if action is not None:
            session.add(action)
            created_actions.append(action)
    session.flush()


async def run_copilot_chat_for_tenant(
    session: Session,
    tenant_id: int,
    user: User,
    messages: list[dict[str, str]],
    *,
    organization_id: Optional[int] = None,
    context: Optional[dict[str, Any]] = None,
    gateway: Optional[AIGateway] = None,
) -> dict[str, Any]:
    """Ejecuta el Copiloto CRM conversacional con bucle de herramientas multi-tenant."""
    config = get_default_provider_config(session, tenant_id)
    if config is None:
        raise NoBYOKConfiguredError(
            "No hay ningún proveedor BYOK activo configurado en el tenant. Configúralo en Ajustes > IA (BYOK)."
        )

    cleaned_messages = [
        {"role": str(m.get("role") or "user"), "content": str(m.get("content") or "").strip()}
        for m in messages
        if str(m.get("content") or "").strip()
    ]
    if not cleaned_messages or cleaned_messages[-1]["role"] != "user":
        raise ValueError("El historial debe incluir al menos un mensaje de usuario no vacío al final.")

    llm_messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_copilot_system_prompt(organization_id, context=context)},
        *cleaned_messages,
    ]

    ai_gateway = gateway or AIGateway()
    tools_used: list[str] = []
    created_actions: list[AgentAction] = []
    last_model_used = config.model_name
    final_answer: Optional[str] = None

    for _iteration in range(MAX_TOOL_ITERATIONS):
        response = await ai_gateway.complete(config, llm_messages, temperature=0.2, max_tokens=1100)
        last_model_used = response.model
        raw_content = (response.content or "").strip()

        try:
            parsed = extract_json_object(raw_content)
        except ValueError:
            # Fallback resiliente: el modelo respondió texto plano legible
            final_answer = raw_content or "No he podido generar una respuesta."
            break

        raw_tool_calls = parsed.get("tool_calls")
        if isinstance(raw_tool_calls, list) and len(raw_tool_calls) > 0:
            tool_results: list[dict[str, Any]] = []
            for raw_call in raw_tool_calls[:6]:
                if not isinstance(raw_call, dict):
                    continue
                tool_name = str(raw_call.get("name") or "").strip()
                raw_args = raw_call.get("arguments")
                arguments = raw_args if isinstance(raw_args, dict) else {}
                if not tool_name:
                    continue

                result = _execute_copilot_tool(
                    session,
                    tenant_id=tenant_id,
                    user=user,
                    model_used=last_model_used,
                    focus_org_id=organization_id,
                    tool_name=tool_name,
                    arguments=arguments,
                    created_actions=created_actions,
                )
                if tool_name not in tools_used:
                    tools_used.append(tool_name)
                tool_results.append({"tool": tool_name, "arguments": arguments, "result": result})

            llm_messages.append({"role": "assistant", "content": raw_content})
            llm_messages.append(
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "tool_results": tool_results,
                            "instruction": (
                                "Usa estos resultados reales del CRM para responder al usuario en JSON "
                                "{\"answer\": \"...\", \"proposed_actions\": [...]} o llama a otra herramienta si hace falta."
                            ),
                        },
                        ensure_ascii=False,
                    ),
                }
            )
            continue

        _append_proposed_actions(
            session,
            tenant_id=tenant_id,
            model_used=last_model_used,
            focus_org_id=organization_id,
            raw_items=parsed.get("proposed_actions"),
            created_actions=created_actions,
        )

        answer_text = str(parsed.get("answer") or "").strip()
        if not answer_text:
            if created_actions:
                answer_text = (
                    f"He preparado {len(created_actions)} acción(es) en la bandeja HITL para tu aprobación."
                )
            else:
                answer_text = raw_content
        final_answer = answer_text
        break

    if final_answer is None:
        # Se agotaron las iteraciones de herramientas; pedimos cierre directo sin más tool_calls
        llm_messages.append(
            {
                "role": "user",
                "content": (
                    "Has alcanzado el límite de llamadas a herramientas. Responde ahora EXCLUSIVAMENTE con el JSON final "
                    "{\"answer\": \"resumen claro en español con los datos obtenidos\", \"proposed_actions\": [...]}."
                ),
            }
        )
        final_resp = await ai_gateway.complete(config, llm_messages, temperature=0.2, max_tokens=1100)
        last_model_used = final_resp.model
        final_raw = (final_resp.content or "").strip()
        try:
            final_parsed = extract_json_object(final_raw)
            _append_proposed_actions(
                session,
                tenant_id=tenant_id,
                model_used=last_model_used,
                focus_org_id=organization_id,
                raw_items=final_parsed.get("proposed_actions"),
                created_actions=created_actions,
            )
            final_answer = str(final_parsed.get("answer") or "").strip() or final_raw
        except ValueError:
            final_answer = final_raw or "He consultado el CRM, pero no pude estructurar la respuesta final."

    if tools_used or created_actions:
        log = ActivityLog(
            tenant_id=tenant_id,
            actor_type=ActorType.AGENT.value,
            actor_name=COPILOT_AGENT_NAME,
            user_id=user.id,
            model_used=last_model_used,
            action="proactive:copilot_chat",
            entity_type="organization" if organization_id is not None else "tenant",
            entity_id=organization_id if organization_id is not None else tenant_id,
            details_json=json.dumps(
                {
                    "tools_used": tools_used,
                    "created_actions_count": len(created_actions),
                    "user_prompt_excerpt": cleaned_messages[-1]["content"][:250],
                },
                ensure_ascii=False,
            ),
        )
        session.add(log)

    session.commit()
    for act in created_actions:
        session.refresh(act)

    return {
        "answer": final_answer,
        "tools_used": tools_used,
        "created_actions": [_serialize_action(act) for act in created_actions],
        "model_used": last_model_used,
    }
