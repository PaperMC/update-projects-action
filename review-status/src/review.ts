import * as core from '@actions/core';
import type { Config, Context, Octokit } from './config';
import { createTeamChecker, type TeamChecker } from './teams';
import { latestActiveByUser, type Review } from './reviews';
import { addItemToProject, findOption, getProject, getPullRequestItem, sameStatus, setItemStatus, type Project } from './project';

// Sets each affected PR's status from its current reviews, never downgrading an existing status.
// Review data is always re-read from the API rather than taken from the triggering event, so the
// mode can safely run from a workflow_run relay where the original review event is untrusted.
export async function review(octokit: Octokit, context: Context, config: Config): Promise<void> {
  const prNumbers = await resolvePullRequests(octokit, context, config);
  if (prNumbers.length === 0) return;

  const isTeamMember = createTeamChecker(octokit, config.org);
  const project = await getProject(octokit, config);
  for (const number of prNumbers) {
    await reviewPullRequest(octokit, context, config, project, isTeamMember, number);
  }
}

async function resolvePullRequests(octokit: Octokit, context: Context, config: Config): Promise<number[]> {
  if (config.pullRequestNumber !== undefined) {
    return [config.pullRequestNumber];
  }
  const pullRequest = context.payload.pull_request;
  if (pullRequest) {
    return [pullRequest.number];
  }
  const workflowRun = context.payload.workflow_run as { head_sha: string } | undefined;
  if (!workflowRun) {
    throw new Error(
      'review mode must run on a pull_request_review or workflow_run event, or be given an explicit pull-request-number',
    );
  }
  // The workflow_run payload's pull_requests array is empty for PRs from forks and its
  // head_repository is unreliable for pull_request_review runs, so search by the head commit
  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:pr is:open ${workflowRun.head_sha}`,
  });
  const numbers = data.items.map(item => item.number);
  if (numbers.length === 0) {
    core.info(`No open PR found containing commit ${workflowRun.head_sha}`);
  }
  return numbers;
}

async function reviewPullRequest(
  octokit: Octokit,
  context: Context,
  config: Config,
  project: Project,
  isTeamMember: TeamChecker,
  number: number,
): Promise<void> {
  const reviews: Review[] = await octokit.paginate(octokit.rest.pulls.listReviews, {
    ...context.repo, pull_number: number,
  });

  let target: string | null = null;
  for (const review of latestActiveByUser(reviews).values()) {
    if (review.state !== 'APPROVED' || !review.user) continue;
    if (await isTeamMember(review.user.login, config.maintainerTeams)) {
      target = config.fullApproval;
      break;
    }
    if (await isTeamMember(review.user.login, config.developerTeams)) {
      target = config.delayedApproval;
    }
  }
  if (!target) {
    core.info(`PR #${number}: no active team approval, nothing to do`);
    return;
  }

  const option = findOption(project, target);
  const pr = await getPullRequestItem(octokit, context.repo, number, config);
  const item = pr.item ?? await addItemToProject(octokit, project.id, pr.contentId);

  if (sameStatus(item.status, config.fullApproval)) {
    core.info(`PR #${number} already has full approval`);
    return;
  }
  if (sameStatus(item.status, target)) {
    core.info(`PR #${number} already set to ${target}`);
    return;
  }

  await setItemStatus(octokit, project, item.id, option);
  core.info(`Set PR #${number} to ${target}`);
}
