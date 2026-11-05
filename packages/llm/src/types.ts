export interface CardText {
  title: string;
  body: string;
  why_now: string;
}

export interface ExplainCardInput {
  ref: string;
  ruleCode: string;
  actionType: string;
  confidence: 'low' | 'medium' | 'high';
  facts: Readonly<Record<string, string>>;
  /** The rule's static template, already filled: used whenever the model's card fails validation. */
  fallback: CardText;
}

export interface ExplainInput {
  category: string | null;
  cards: readonly ExplainCardInput[];
}

export type CallValidation = 'passed' | 'failed_placeholder' | 'failed_schema' | 'refused' | 'error';

export interface LlmCallLog {
  purpose: 'explain';
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  latencyMs: number;
  costUsd: number | null;
  validation: CallValidation;
  fallbackCards: number;
}

export interface ExplainedCard {
  ref: string;
  text: CardText;
  source: 'llm' | 'template';
  failure: CardFailure | null;
}

export type CardFailure = 'missing' | 'unknown_placeholder' | 'stray_digit' | 'banned_phrase' | 'markup' | 'not_vietnamese' | 'too_long';

export interface ExplainResult {
  cards: ExplainedCard[];
  call: LlmCallLog | null;
}

export interface LlmClient {
  explainRecommendations(input: ExplainInput): Promise<ExplainResult>;
}
