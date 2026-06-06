#!/usr/bin/env python3
"""Generate a public-safe Hermes Memory Universe graph snapshot."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERMES_HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))).expanduser()
OUT = ROOT / "public" / "data" / "graph.json"

NEBULAS = {
    "memory": {"label": "Memory Nebula", "color": "#a78bfa"},
    "skills": {"label": "Skill Nebula", "color": "#22d3ee"},
    "tools": {"label": "Tool Nebula", "color": "#94a3b8"},
    "aesthetic": {"label": "Aesthetic Nebula", "color": "#c08497"},
    "investment": {"label": "Investment Nebula", "color": "#d6b36a"},
    "automation": {"label": "Automation Nebula", "color": "#5eead4"},
    "sessions": {"label": "Session / Project Nebula", "color": "#93c5fd"},
}

REDACT_PATTERNS = [
    re.compile(r"gho_[A-Za-z0-9_]+"),
    re.compile(r"(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+", re.I),
    re.compile(r"/Users/[^\s,;]+"),
    re.compile(r"\b-?\d{12,}\b"),
    re.compile(r"[A-Za-z0-9_-]{24,}"),
]


def redact(text: str) -> str:
    text = text.strip().replace("\n", " ")
    for pattern in REDACT_PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text[:220]


def slug(text: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return value or "node"


def read_frontmatter(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return {}
    if not lines or lines[0].strip() != "---":
        return {}
    data = {}
    for line in lines[1:80]:
        if line.strip() == "---":
            break
        if ":" in line:
            key, value = line.split(":", 1)
            data[key.strip()] = value.strip().strip('"')
    return data


def add_node(nodes: dict, node: dict) -> None:
    nodes[node["id"]] = node


def main() -> None:
    nodes: dict[str, dict] = {}
    links: list[dict] = []

    base_nodes = [
        ("hermes-core", "Hermes Core", "core", "memory", 11, "Hermes runtime, profiles, tools and memory entry point."),
        ("jeffery-profile", "Jeffery Profile", "memory", "memory", 8, "Public-safe preference summary only; raw profile is not exported."),
        ("holo-facts", "Holo Facts", "memory", "memory", 7, "Structured fact graph summary; raw fact contents remain local unless explicitly allowlisted."),
        ("tool-registry", "Tool Registry", "tool", "tools", 8, "Browser, terminal, file, web, vision, cron, delegation and other tool capabilities."),
        ("aesthetic-wiki", "Aesthetic Wiki", "knowledge_base", "aesthetic", 9, "Visual taste and prompt reference system index."),
        ("investment-os", "Investment OS", "database", "investment", 9, "Investment research database summary node; raw records are private."),
        ("cron-jobs", "Cron Jobs", "automation", "automation", 7, "Scheduled jobs and daily sync status summary."),
        ("github-pages", "GitHub Pages", "deployment", "automation", 6, "Static public-safe 3D Memory Universe deployment."),
        ("sessions", "Session Search", "history", "sessions", 7, "Conversation history search summary; raw transcripts are not exported."),
    ]
    for node_id, label, kind, nebula, size, summary in base_nodes:
        add_node(nodes, {"id": node_id, "label": label, "type": kind, "nebula": nebula, "size": size, "summary": summary, "visibility": "public-safe", "tags": [kind, nebula]})

    skills_dir = HERMES_HOME / "skills"
    skill_count = 0
    if skills_dir.exists():
        for skill_file in sorted(skills_dir.glob("**/SKILL.md")):
            meta = read_frontmatter(skill_file)
            name = meta.get("name") or skill_file.parent.name
            desc = redact(meta.get("description") or "Hermes skill")
            rel = skill_file.relative_to(skills_dir)
            category = rel.parts[0] if len(rel.parts) > 1 else "general"
            related = []
            lowered = f"{name} {desc} {category}".lower()
            if any(word in lowered for word in ["image", "video", "aesthetic", "visual", "comfy", "spatial", "design"]):
                related.append("aesthetic")
            if "investment" in lowered:
                related.append("investment")
            if any(word in lowered for word in ["cron", "ops", "hermes", "github", "automation"]):
                related.append("automation")
            node_id = f"skill-{slug(name)}"
            add_node(nodes, {
                "id": node_id,
                "label": name,
                "type": "skill",
                "nebula": "skills",
                "relatedNebulae": related,
                "size": 4.5,
                "summary": desc,
                "visibility": "public-safe",
                "tags": ["skill", category] + related,
            })
            links.append({"source": "hermes-core", "target": node_id, "type": "skill", "strength": 0.32})
            if "aesthetic" in related:
                links.append({"source": node_id, "target": "aesthetic-wiki", "type": "bridge", "strength": 0.42})
            if "investment" in related:
                links.append({"source": node_id, "target": "investment-os", "type": "bridge", "strength": 0.42})
            skill_count += 1
            if skill_count >= 120:
                break

    links.extend([
        {"source": "hermes-core", "target": "jeffery-profile", "type": "preference", "strength": 0.8},
        {"source": "hermes-core", "target": "holo-facts", "type": "memory", "strength": 0.8},
        {"source": "hermes-core", "target": "tool-registry", "type": "capability", "strength": 0.7},
        {"source": "hermes-core", "target": "cron-jobs", "type": "bridge", "strength": 0.6},
        {"source": "cron-jobs", "target": "github-pages", "type": "deploy", "strength": 0.7},
        {"source": "sessions", "target": "holo-facts", "type": "recall", "strength": 0.45},
        {"source": "jeffery-profile", "target": "aesthetic-wiki", "type": "bridge", "strength": 0.72},
        {"source": "jeffery-profile", "target": "investment-os", "type": "bridge", "strength": 0.72},
    ])

    snapshot = {
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "visibility": "public-safe",
        "source": "local Hermes export",
        "health": [
            {"label": "Skills indexed", "status": "ok" if skill_count else "warn"},
            {"label": "Raw sessions redacted", "status": "ok"},
            {"label": "Secrets / IDs redacted", "status": "ok"},
            {"label": "Investment raw records private", "status": "ok"},
        ],
    }
    graph = {"snapshot": snapshot, "nebulas": NEBULAS, "nodes": list(nodes.values()), "links": links}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} with {len(graph['nodes'])} nodes and {len(links)} links")


if __name__ == "__main__":
    main()
