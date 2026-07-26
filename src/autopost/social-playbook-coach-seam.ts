/**
 * Coach / Goal Cycle seam for Social Playbooks.
 * Import registry helpers from here (or directly from social-playbook-templates)
 * so LLM tooling selects locked template keys + validated atom overrides only.
 * Never invent free-form timelines — call applySocialPlaybook() to materialize.
 */

export {
  SOCIAL_PLAYBOOK_ACTION_KEYS,
  SOCIAL_PLAYBOOK_TEMPLATE_KEYS,
  SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
  isSocialPlaybookActionKey,
  isSocialPlaybookTemplateKey,
  resolvePlaybookDueAt,
  type ApplySocialPlaybookBody,
  type SocialPlaybookActionKey,
  type SocialPlaybookAtomDefinition,
  type SocialPlaybookTemplateKey,
  type SocialPlaybookTemplateWire
} from "./social-playbook-contract.js";

export {
  getSocialPlaybookTemplate,
  listSocialPlaybookTemplateDefinitions,
  listSocialPlaybookTemplatesWire,
  SOCIAL_PLAYBOOK_TEMPLATES
} from "./social-playbook-templates.js";

export {
  applySocialPlaybook,
  listSocialPlaybookTemplates,
  SOCIAL_PLAYBOOKS_FEATURE_ENV,
  isSocialPlaybooksFeatureEnabled
} from "./social-playbook-service.js";
