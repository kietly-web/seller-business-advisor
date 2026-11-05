export const ENGINE_VERSION = '1.0.0';

export * from './metrics';
export * from './plan';
export * from './rules/types';
export { RULES, ELASTICITY_BOUNDS_BP, PRICE_RULE_MIN_UNITS_28D } from './rules/library';
export { CHECKLISTS, COST_MISSING_TEMPLATE, TEMPLATES, fillTemplate, placeholdersOf, renderCard, type CardText } from './rules/templates';
