import os
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.providers.skills import SkillProvider
from fastmcp.server.transforms import ResourcesAsTools


EXAMPLES_DIR = Path(os.environ.get("AGENT_SKILL_EVALS_EXAMPLES_DIR", os.getcwd()))
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
}

mcp = FastMCP(name=SERVER_NAME)


def selected_skills() -> list[str]:
    raw = os.environ.get("AGENT_SKILL_EVALS_MCP_SKILLS", "brand-deck,bugfix-workflow")
    return [skill.strip() for skill in raw.split(",") if skill.strip() in SKILLS]


def register_skill_provider(skill: str) -> None:
    spec = SKILLS[skill]
    mcp.add_provider(SkillProvider(EXAMPLES_DIR / spec["path"]))


def skill_markdown(skill: str) -> str:
    spec = SKILLS[skill]
    return (EXAMPLES_DIR / spec["path"] / "SKILL.md").read_text()


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
