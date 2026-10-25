import type { CategoryId } from '../index.ts';
import { scoreFindings } from './is-agentic-checks.ts';
import type { Friction } from './shapes.ts';
import type { CategoryCheckResult, CheckFinding } from './types.ts';

export class CheckBuilder {
  readonly category: CategoryId;
  private readonly findings: CheckFinding[] = [];
  private readonly frictions: Friction[] = [];

  constructor(category: CategoryId) {
    this.category = category;
  }

  add(id: string, label: string, weight: number, passed: boolean, detail?: string): void {
    this.findings.push({ id, label, weight, passed, detail });
  }

  friction(severity: Friction['severity'], summary: string, evidence?: string): void {
    this.frictions.push({ severity, category: this.category, summary, evidence });
  }

  build(): CategoryCheckResult {
    return {
      category: this.category,
      score: scoreFindings(this.findings),
      findings: this.findings,
      frictions: this.frictions,
    };
  }
}
