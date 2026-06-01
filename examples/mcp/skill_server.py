import os
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.providers.skills import SkillProvider
from fastmcp.server.transforms import ResourcesAsTools


EXAMPLES_DIR = Path(os.environ.get("AGENT_SKILL_EVALS_EXAMPLES_DIR", os.getcwd()))
REPO_ROOT = EXAMPLES_DIR.parent
SERVER_NAME = os.environ.get("AGENT_SKILL_EVALS_MCP_SERVER", "agent_skill_evals")

SKILLS = {
    "brand-deck": {
        "path": "skills/brand-deck",
        "tool": "load_brand_deck_skill",
        "description": (
            "Load the brand-deck Agent Skill Evals skill for creating a brand deck, "
            "launch deck, or brand deck outline from a product brief and "
            "brand guidelines."
        ),
    },
    "bugfix-workflow": {
        "path": "skills/bugfix-workflow",
        "tool": "load_bugfix_workflow_skill",
        "description": (
            "Load the bugfix-workflow Agent Skill Evals skill for fixing a concrete bug "
            "in an existing application with a verifier."
        ),
    },
    "agent-eval-skills": {
        "path": "../skills/agent-eval-skills",
        "tool": "load_agent_eval_skills_skill",
        "description": (
            "Load the agent-eval-skills meta skill for adding Promptfoo-native "
            "Agent Skill Evals coverage to an existing agent skill."
        ),
    },
}

mcp = FastMCP(name=SERVER_NAME)


def selected_skills() -> list[str]:
    raw = os.environ.get(
        "AGENT_SKILL_EVALS_MCP_SKILLS",
        "brand-deck,bugfix-workflow,agent-eval-skills",
    )
    return [skill.strip() for skill in raw.split(",") if skill.strip() in SKILLS]


def skill_path(skill: str) -> Path:
    spec = SKILLS[skill]
    path = Path(spec["path"])
    if path.parts[:1] == ("..",):
        return REPO_ROOT / Path(*path.parts[1:])
    return EXAMPLES_DIR / path


def register_skill_provider(skill: str) -> None:
    mcp.add_provider(SkillProvider(skill_path(skill)))


def skill_markdown(skill: str) -> str:
    return (skill_path(skill) / "SKILL.md").read_text()


def register_skill_loader(skill: str) -> None:
    spec = SKILLS[skill]

    def load_skill() -> str:
        return skill_markdown(skill)

    mcp.tool(
        name=spec["tool"],
        description=spec["description"],
    )(load_skill)


for skill_name in selected_skills():
    register_skill_provider(skill_name)
    register_skill_loader(skill_name)

mcp.add_transform(ResourcesAsTools(mcp))


if __name__ == "__main__":
    mcp.run()
