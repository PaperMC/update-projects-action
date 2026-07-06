import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig } from './config';
import { review } from './review';
import { promote } from './promote';

async function run(): Promise<void> {
  const config = loadConfig();
  const octokit = github.getOctokit(core.getInput('github-token', { required: true }));
  const mode = core.getInput('mode', { required: true });
  switch (mode) {
    case 'review':
      await review(octokit, github.context, config);
      break;
    case 'promote':
      await promote(octokit, github.context, config);
      break;
    default:
      throw new Error(`Unknown mode: ${mode} (expected "review" or "promote")`);
  }
}

run().catch(e => core.setFailed(e instanceof Error ? e : String(e)));
