# Tool selection and exact setup actions

Discover the current tool inventory at the start of a project. The same product can be built with different tool combinations; recommend only capabilities that materially help this user and task. Verify current provider setup details in official documentation before giving version-specific or account-specific instructions.

| Capability | Use it when | If unavailable, tell the user exactly |
|---|---|---|
| Browser control / Playwright / CUA | Need to walk a reference or validate the local preview, including visual states | Open the reference in a desktop browser and a narrow mobile viewport; record top-to-bottom screenshots and demonstrate menus, hover/focus, forms and interactions. For implementation verification, start the local preview and share its URL. Keep reference actions read-only. |
| UI/UX Pro Max | Need searchable design-system, visual style, UX, chart or stack guidance | Check whether it is installed and read its own instructions. If installed, use full design-system recommendations for a new project, domain search for a focused concern, stack search for the actual framework; persist master and page overrides when supported. If absent, make the same artifact manually and use official docs. Do not copy unsupported commands. |
| Figma MCP / Figma app | Existing Figma files or a requested prototype/handoff | In Figma, open the correct file/page/frame, copy the frame URL, and share it. If no MCP connection, provide frame screenshots or exports plus component/variable panel details; state whether the agent may edit the file. Do not require Figma for code-first work. Current official Figma docs describe reading design context and, for supported clients, writing native Figma content: [MCP overview](https://developers.figma.com/docs/figma-mcp-server/) and [tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/). |
| Image generation | Need original art direction for hero imagery, illustration, texture, editorial visual or concept exploration | Use user-owned assets or select licensed stock assets; provide file, source, license/attribution and crop intent. Do not generate text, logos, fake UI screenshots or fake evidence. |
| Framework/API docs connector | Framework, database or provider API is involved | Share the repository manifest or exact framework/provider/version. The agent will use that verified version's official docs; no documentation plugin is mandatory. |
| GitHub/version control | Need reviewable commits, collaboration or preview CI | Provide the repository or make a Git repo available. The agent should inspect its instructions before changing code and use a branch/PR workflow if configured. |
| Preview hosting such as Vercel | Need a shareable review URL for a compatible project | User opens Vercel, imports the intended repository, checks framework preset/root/build/output, configures required environment variables in provider settings, and shares a Preview URL. Keep secrets in provider settings. Vercel documents per-push and PR preview deployment for linked Git repositories: [Git deployments](https://vercel.com/docs/git). Production publishing requires explicit authorization. |
| Database/auth/storage (Supabase, Firebase or equivalent) | Accounts, durable/shared data, roles, uploads or admin operations are required | Open the chosen provider dashboard, create/select the project, enable only required services, set allowed domains/callbacks and least-privilege roles, then store credentials in the project's approved secret manager. Share project identifiers/config metadata only; never paste secret values in chat. |
| Payments/email/SMS/analytics | User explicitly asks for those capabilities | Create/select the provider project and use test credentials/sandbox first. Configure verified callbacks/domains, event handling, opt-in/consent and retention. Keep secret values in approved secret storage. If unavailable, build an explicit non-live placeholder adapter and do not claim it sends or charges. |
| CMS | Nontechnical editors need regular content changes | Select a CMS based on editing roles, structured content, preview and hosting constraints. Create the content types and editor roles; provide only required read/write credentials through the secret manager. Do not add CMS to static content without a real editing need. |

## Tool routing sequence

1. Inspect installed tools/plugins and project files. Record available, missing, optional and user-authorized capabilities.
2. Map each tool to an explicit task and deliverable. If the benefit is unclear, don't connect it.
3. When documentation is needed, use the actual current framework/provider docs. Prefer official sources. For unstable features, browse; do not memorize old flags/API names.
4. If account access is required, prepare the concrete integration contract first and ask the user for the precise safe action only when blocked. Never request secrets in chat.
5. Continue independent work using mocks or local prototypes while waiting, with simulated behavior labeled.
6. Ask for approval before publishing, sending, charging, changing account settings, using production data or affecting third parties.

## Current reference sources

- UI/UX Pro Max upstream repository and current workflow: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Playwright MCP overview and structured accessibility snapshots: https://playwright.dev/mcp/introduction
- Figma MCP overview and tools: https://developers.figma.com/docs/figma-mcp-server/ and https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Vercel Git-based preview deployments: https://vercel.com/docs/git

These links are starting points, not claims that a tool is connected or that every feature is supported in a given account/client. Recheck the provider's official setup documentation during use.
