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
    logo: {
      src: "/assets/agent-skill-evals-nav-logo.png",
      alt: "Agent Skill Evals",
    },
    search: {
      provider: "local",
    },
    nav: [
      { text: "Start", link: "/guide/getting-started" },
      { text: "Reference", link: "/guide/reference" },
    ],
    sidebar: [
      {
        text: "Docs",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Reference", link: "/guide/reference" },
        ],
      },
    ],
  },
});
