"""Pure, offline inspection of the hand-authored v0.1.0 schema profile.

This module is not a service client. It never accesses credentials or the network.
Observations describe local validation behavior, not CALL-E server acceptance.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]


def load_contract(root: Path = ROOT) -> dict[str, Any]:
    """Read the working-copy contract without changing it."""
    value = yaml.safe_load(
        (root / "skills/callev2/references/openapi-calls.yaml").read_text(encoding="utf-8")
    )
    if not isinstance(value, dict):
        raise ValueError("OpenAPI input must be a mapping")
    return value


def resolve_pointer(document: dict[str, Any], pointer: str) -> Any:
    """Resolve local JSON Pointers only. Remote references are deliberately rejected."""
    if not pointer.startswith("#/"):
        raise ValueError("Offline checks allow only local JSON Pointers")
    current: Any = document
    for token in pointer[2:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        current = current[int(token)] if isinstance(current, list) else current[token]
    return current


def expand_local(document: dict[str, Any], node: Any, trail: tuple[str, ...] = ()) -> Any:
    """Expand the acyclic local references in this subset for JSON Schema checks.

    This is intentionally not a full OpenAPI/JSON Schema reference engine. The
    profile currently has no cyclic refs; fail clearly rather than guessing if one
    is introduced. Sibling annotations are retained; other siblings are unsupported.
    """
    if isinstance(node, dict):
        if "$ref" in node:
            pointer = node["$ref"]
            if pointer in trail:
                raise ValueError(f"Cyclic reference is outside this offline subset: {pointer}")
            expanded = expand_local(document, resolve_pointer(document, pointer), trail + (pointer,))
            siblings = {key: value for key, value in node.items() if key != "$ref"}
            if any(key not in {"description", "summary"} for key in siblings):
                raise ValueError("Non-annotation reference siblings require a full schema engine")
            if siblings and isinstance(expanded, dict):
                expanded = {**expanded, **siblings}
            return expanded
        return {key: expand_local(document, value, trail) for key, value in node.items()}
    if isinstance(node, list):
        return [expand_local(document, value, trail) for value in node]
    return node


def request_validator(root: Path = ROOT) -> Draft202012Validator:
    contract = load_contract(root)
    return Draft202012Validator(expand_local(contract, contract["components"]["schemas"]["CreateCall"]))


def synthetic_request(root: Path = ROOT) -> dict[str, Any]:
    payload = json.loads(
        (root / "skills/callev2/assets/hello-call.request.json").read_text(encoding="utf-8")
    )
    # Synthetic in-memory input ONLY. Never pass this object to a network client.
    payload["phone"] = "+12025550123"
    return payload


def collect_observations(root: Path = ROOT) -> dict[str, Any]:
    # Supplemental checks remain separate from the unchanged hand-authored schema.
    try:
        from .result_schema_checks import check_result_schema
        from .behavior.preparation import response_report
    except ImportError:  # plain unittest discovery with tests as the start directory
        from result_schema_checks import check_result_schema
        from behavior.preparation import response_report
    validator = request_validator(root)
    request = synthetic_request(root)
    required_gap = copy.deepcopy(request)
    required_gap["result_schema"]["required"] = ["field_not_declared_in_properties"]
    enum_gap = copy.deepcopy(request)
    enum_gap["result_schema"]["properties"]["heard_test"] = {"type": "boolean", "enum": ["yes"]}
    contract = load_contract(root)
    response_validator = Draft202012Validator(
        expand_local(contract, contract["components"]["schemas"]["Call"])
    )
    return {
        "scope": "offline_local_profile_only",
        "network_requests": 0,
        "service_acceptance_tested": False,
        "observations": [
            {
                "id": "G01",
                "description": "required references an undeclared property",
                "accepted_by_current_local_profile": validator.is_valid(required_gap),
                "accepted_by_client_semantic_check": not check_result_schema(required_gap["result_schema"]),
                "client_issues": check_result_schema(required_gap["result_schema"]),
                "classification": "local_semantic_validation_gap_if_accepted",
                "server_behavior": "NOT_TESTED",
            },
            {
                "id": "G02",
                "description": "boolean property with string-only enum",
                "accepted_by_current_local_profile": validator.is_valid(enum_gap),
                "accepted_by_client_semantic_check": not check_result_schema(enum_gap["result_schema"]),
                "client_issues": check_result_schema(enum_gap["result_schema"]),
                "classification": "local_semantic_validation_gap_if_accepted",
                "server_behavior": "NOT_TESTED",
            },
            {
                "id": "G03",
                "description": "empty object as Call response",
                "accepted_by_current_local_profile": response_validator.is_valid({}),
                "operation_report": response_report("read", 200, {}),
                "classification": "documented_loose_response_profile_not_integration_proof",
                "server_behavior": "NOT_TESTED",
            },
        ],
    }
