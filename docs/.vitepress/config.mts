import { defineConfig } from "vitepress";

const base = process.env.AGENT_SKILL_EVALS_DOCS_BASE ?? "/";

export default defineConfig({
  title: "Agent Skill Evals",
  description: "Promptfoo-native evals for reusable agent skills.",
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcDir: ".",
  outDir: ".vitepress/dist",
  head: [["link", { rel: "icon", href: `${base}favicon.ico` }]],
  themeConfig: {
    logo: `${base}assets/agent-skill-evals-logo.png`,
    search: {
      provider: "local",
    },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Examples", link: "/examples/brand-deck-skill" },
      { text: "Runtime Checks", link: "/guide/runtime-checks" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Promptfoo Setup", link: "/guide/promptfoo-setup" },
          { text: "Core Concepts", link: "/guide/core-concepts" },
          { text: "Metrics", link: "/guide/metrics" },
          { text: "Runtime Checks", link: "/guide/runtime-checks" },
          { text: "Skill Loading Evals", link: "/guide/routing-evals" },
          { text: "Package Map", link: "/guide/package-map" },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Brand Deck Skill", link: "/examples/brand-deck-skill" },
          { text: "Bugfix Skill", link: "/examples/bugfix-skill" },
          { text: "Skill Checks", link: "/examples/static-checks" },
          { text: "File and Code Checks", link: "/examples/file-code-checks" },
          { text: "Tool Checks", link: "/examples/tool-checks" },
        ],
      },
    ],
  },
});
