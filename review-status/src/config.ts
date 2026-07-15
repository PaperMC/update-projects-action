import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

export type Octokit = ReturnType<typeof getOctokit>;
export type Context = typeof context;

export interface Config {
  org: string;
  projectNumber: number;
  statusField: string;
  fullApproval: string;
  delayedApproval: string;
  maintainerTeams: string[];
  developerTeams: string[];
  promoteAfterDays: number;
  pullRequestNumber?: number;
}

export function loadConfig(): Config {
  const { org, projectNumber } = parseProjectUrl(core.getInput('project-url', { required: true }));
  return {
    org,
    projectNumber,
    statusField: core.getInput('status-field'),
    fullApproval: core.getInput('full-approval-status'),
    delayedApproval: core.getInput('delayed-approval-status'),
    maintainerTeams: teamList('maintainer-teams'),
    developerTeams: teamList('developer-teams'),
    promoteAfterDays: positiveNumber('promote-after-days'),
    pullRequestNumber: optionalPositiveInt('pull-request-number'),
  };
}

function parseProjectUrl(input: string): { org: string; projectNumber: number } {
  const error = new Error(`project-url must look like https://github.com/orgs/<org>/projects/<number>, got: ${input}`);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw error;
  }
  const [orgs, org, projects, number] = url.pathname.split('/').filter(Boolean);
  const projectNumber = Number(number);
  if (orgs !== 'orgs' || !org || projects !== 'projects' || !Number.isInteger(projectNumber)) {
    throw error;
  }
  return { org, projectNumber };
}

// Actions inputs are always strings, so a "list" is a newline- or comma-separated scalar
function teamList(input: string): string[] {
  const teams = core.getInput(input, { required: true }).split(/[\n,]/).map(t => t.trim()).filter(Boolean);
  if (teams.length === 0) {
    throw new Error(`${input} must contain at least one team slug`);
  }
  return teams;
}

function positiveNumber(input: string): number {
  const value = Number(core.getInput(input));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${input} must be a positive number`);
  }
  return value;
}

function optionalPositiveInt(input: string): number | undefined {
  const raw = core.getInput(input);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${input} must be a positive integer, got: ${raw}`);
  }
  return value;
}
