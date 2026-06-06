#!/usr/bin/env python3
"""Generate a public-safe Hermes Memory Universe graph snapshot."""
from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERMES_HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))).expanduser()
OUT = ROOT / "public" / "data" / "graph.json"

BASE_NEBULAS = {
    "memory": {"label": "Memory Nebula", "color": "#a78bfa"},
    "skills": {"label": "Skill Nebula", "color": "#22d3ee"},
    "tools": {"label": "Tool Nebula", "color": "#94a3b8"},
    "aesthetic": {"label": "Aesthetic Nebula", "color": "#c08497"},
    "investment": {"label": "Investment Nebula", "color": "#d6b36a"},
    "automation": {"label": "Automation Nebula", "color": "#5eead4"},
    "sessions": {"label": "Session / Project Nebula", "color": "#93c5fd"},
}

KEYWORD_PALETTE = [
    "#b7c7ff", "#7dd3fc", "#c4b5fd", "#f0c987", "#8ee6d1", "#f2a8c2", "#a7f3d0", "#fca5a5", "#93c5fd",
]

STOPWORDS = {
    "and", "the", "for", "with", "from", "that", "this", "into", "when", "user", "users", "public", "safe",
    "summary", "node", "nodes", "raw", "private", "local", "system", "systems", "skill", "skills", "tool", "tools",
    "agent", "agents", "hermes", "memory", "index", "indexed", "data", "entry", "point", "profile", "runtime",
    "create", "read", "edit", "manage", "generate", "using", "workflow", "workflows", "supports", "support",
    "visual", "public-safe", "redacted", "exported", "static", "version", "default", "reference", "references",
    "apple", "github", "google", "browser", "terminal", "file", "web", "vision", "cron", "search", "summary",
    "creative", "design", "image", "video", "audio", "knowledge", "database", "deployment", "automation", "session",
    "via", "cli", "client", "server", "native", "built", "setup", "configure", "configured", "command", "commands",
    "development",
}

# Domain terms are intentionally allowed even if adjacent generic terms are stopped.
ALLOWLIST = {
    "investment", "aesthetic", "comfyui", "codex", "discord", "obsidian", "frontend", "diagram", "spatial",
    "newsletter", "kanban", "mcp", "llm", "research", "youtube", "email", "pdf", "powerpoint", "jupyter",
    "minecraft", "pokemon", "polymarket", "arxiv", "llama", "vllm", "dspy", "comfy", "kling", "tts",
    "workspace", "sheets", "drive", "oauth", "pages", "subagent", "debugging", "testing", "review", "planning",
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


def tokenize(*parts: object) -> list[str]:
    text = " ".join(str(part or "") for part in parts).lower().replace("-", " ").replace("_", " ")
    # Keep sanitized public words only.
    words = re.findall(r"[a-z][a-z0-9]{2,}", text)
    cleaned = []
    for word in words:
        word = word.strip("-")
        if not word or word in STOPWORDS:
            continue
        if len(word) < 3:
            continue
        if word not in ALLOWLIST and (word.endswith("ing") or word.endswith("ed")):
            word = re.sub(r"(ing|ed)$", "", word)
        if word not in STOPWORDS:
            cleaned.append(word)
    return cleaned


def infer_related_nebulas(lowered: str) -> list[str]:
    related = []
    if any(word in lowered for word in ["image", "video", "aesthetic", "visual", "comfy", "spatial", "design"]):
        related.append("aesthetic")
    if "investment" in lowered:
        related.append("investment")
    if any(word in lowered for word in ["cron", "ops", "hermes", "github", "automation"]):
        related.append("automation")
    if any(word in lowered for word in ["debug", "test", "review", "plan", "frontend", "code"]):
        related.append("software")
    return related


def build_keyword_layout(nodes: dict[str, dict], links: list[dict], max_keywords: int = 8) -> tuple[dict, list[dict]]:
    """Create keyword-core nebulas from public-safe node text and graph adjacency.

    The point is to avoid forcing layout by storage/type labels. Each visible node is scored against the
    most frequent meaningful terms across label + summary + tags + linked neighbors, then pulled toward
    the keyword core that best explains it.
    """
    node_tokens: dict[str, list[str]] = {}
    global_counts = Counter()
    degree = Counter()
    neighbors: dict[str, set[str]] = defaultdict(set)

    for link in links:
        source = str(link.get("source"))
        target = str(link.get("target"))
        degree[source] += 1
        degree[target] += 1
        neighbors[source].add(target)
        neighbors[target].add(source)

    for node_id, node in nodes.items():
        tokens = tokenize(node.get("label"), node.get("summary"), " ".join(node.get("tags", [])), node.get("type"), node.get("nebula"))
        # Tags are curated and concise, so give them a little extra weight.
        tokens += tokenize(" ".join(node.get("tags", [])))
        node_tokens[node_id] = tokens
        global_counts.update(set(tokens))

    # Promote meaningful domain words that appear in connected/high-degree nodes.
    weighted = Counter()
    for node_id, tokens in node_tokens.items():
        mult = 1.0 + min(1.4, degree[node_id] * 0.08)
        for token in tokens:
            weighted[token] += mult

    keyword_terms = []
    for term, _score in weighted.most_common(80):
        if term in STOPWORDS:
            continue
        if len(keyword_terms) >= max_keywords:
            break
        # Avoid near-duplicate plural/singular cores.
        root = term[:-1] if term.endswith("s") else term
        if any(existing == root or existing.rstrip("s") == root for existing in keyword_terms):
            continue
        keyword_terms.append(term)

    # If the automatic terms are sparse, seed from allowlist words that exist in nodes.
    for term in ["investment", "aesthetic", "frontend", "codex", "debugging", "research", "workspace", "automation"]:
        if len(keyword_terms) >= max_keywords:
            break
        if term not in keyword_terms and global_counts[term] > 0:
            keyword_terms.append(term)

    keyword_nebulas = {}
    keyword_cores = []
    for index, term in enumerate(keyword_terms):
        key = f"kw-{slug(term)}"
        color = KEYWORD_PALETTE[index % len(KEYWORD_PALETTE)]
        keyword_nebulas[key] = {"label": f"{term.title()} Core", "color": color, "keyword": term, "computed": True}
        keyword_cores.append({"key": key, "keyword": term, "label": f"{term.title()} Core", "color": color, "count": int(global_counts[term])})

    keyword_set = set(keyword_terms)
    for node_id, node in nodes.items():
        score = Counter(token for token in node_tokens[node_id] if token in keyword_set)
        # Neighbor boost: if a node is often connected to a term-rich group, let that shape the layout.
        for neighbor_id in neighbors[node_id]:
            for token in node_tokens.get(neighbor_id, []):
                if token in keyword_set:
                    score[token] += 0.38
        if score:
            term, term_score = score.most_common(1)[0]
        else:
            # Stable fallback: weakly orbit the least crowded keyword instead of old storage category.
            term = min(keyword_terms, key=lambda value: sum(1 for n in nodes.values() if n.get("keyword") == value)) if keyword_terms else "orbit"
            term_score = 0.1
        key = f"kw-{slug(term)}"
        node["keywordCore"] = key
        node["keyword"] = term
        node["keywordScore"] = round(float(term_score), 2)
        node["semanticKeywords"] = [term for term, _ in score.most_common(4)] if score else [term]

    # Add virtual keyword core stars. They are computed view nodes, not raw private data.
    for core in keyword_cores:
        core_id = f"keyword-core-{slug(core['keyword'])}"
        add_node(nodes, {
            "id": core_id,
            "label": core["label"],
            "type": "keyword_core",
            "nebula": core["key"],
            "keywordCore": core["key"],
            "keyword": core["keyword"],
            "size": 12,
            "summary": f"Computed semantic gravity center from the most frequent public-safe keyword: {core['keyword']}.",
            "visibility": "public-safe",
            "tags": ["computed-core", core["keyword"]],
            "semanticKeywords": [core["keyword"]],
        })
        for node_id, node in list(nodes.items()):
            if node_id == core_id or node.get("type") == "keyword_core":
                continue
            if node.get("keywordCore") == core["key"]:
                links.append({"source": core_id, "target": node_id, "type": "semantic-gravity", "strength": min(0.75, 0.25 + node.get("keywordScore", 0.1) * 0.08)})

    return keyword_nebulas, keyword_cores


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
            lowered = f"{name} {desc} {category}".lower()
            related = infer_related_nebulas(lowered)
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

    keyword_nebulas, keyword_cores = build_keyword_layout(nodes, links)

    snapshot = {
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "visibility": "public-safe",
        "source": "local Hermes export",
        "layoutMode": "keyword-core-semantic-gravity-v3",
        "health": [
            {"label": "Skills indexed", "status": "ok" if skill_count else "warn"},
            {"label": "Keyword cores computed", "status": "ok" if keyword_cores else "warn"},
            {"label": "Raw sessions redacted", "status": "ok"},
            {"label": "Secrets / IDs redacted", "status": "ok"},
            {"label": "Investment raw records private", "status": "ok"},
        ],
    }
    graph = {
        "snapshot": snapshot,
        "baseNebulas": BASE_NEBULAS,
        "nebulas": keyword_nebulas,
        "keywordCores": keyword_cores,
        "nodes": list(nodes.values()),
        "links": links,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} with {len(graph['nodes'])} nodes, {len(links)} links and {len(keyword_cores)} keyword cores")


if __name__ == "__main__":
    main()
