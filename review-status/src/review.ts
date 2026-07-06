import * as core from '@actions/core';
import type { Config, Context, Octokit } from './config';
import { createTeamChecker } from './teams';
import { addItemToProject, findOption, getProject, getPullRequestItem, sameStatus, setItemStatus } from './project';

export async function review(octokit: Octokit, context: Context, config: Config): Promise<void> {
  const review = context.payload.review as { state: string; user: { login: string } } | undefined;
  const pullRequest = context.payload.pull_request;
  if (!review || !pullRequest) {
    throw new Error('review mode must run on a pull_request_review event');
  }
  if (review.state.toLowerCase() !== 'approved') {
    core.info(`Review state is ${review.state}, nothing to do`);
    return;
  }

  const reviewer = review.user.login;
  const isTeamMember = createTeamChecker(octokit, config.org);
  let target: string;
  if (await isTeamMember(reviewer, config.maintainerTeams)) {
    target = config.fullApproval;
  } else if (await isTeamMember(reviewer, config.developerTeams)) {
    target = config.delayedApproval;
  } else {
    core.info(`${reviewer} is not a maintainer or developer, ignoring approval`);
    return;
  }

  const project = await getProject(octokit, config);
  const option = findOption(project, target);

  const pr = await getPullRequestItem(octokit, context.repo, pullRequest.number, config);
  const item = pr.item ?? await addItemToProject(octokit, project.id, pr.contentId);

  if (sameStatus(item.status, config.fullApproval)) {
    core.info(`PR #${pullRequest.number} already has full approval`);
    return;
  }
  if (sameStatus(item.status, target)) {
    core.info(`PR #${pullRequest.number} already set to ${target}`);
    return;
  }

  await setItemStatus(octokit, project, item.id, option);
  core.info(`Set PR #${pullRequest.number} to ${target} (approved by ${reviewer})`);
}
