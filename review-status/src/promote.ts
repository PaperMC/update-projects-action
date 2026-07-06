import * as core from '@actions/core';
import type { Config, Context, Octokit } from './config';
import { createTeamChecker } from './teams';
import { findOption, getProject, listPullRequestsWithStatus, setItemStatus } from './project';

interface Review {
  id: number;
  state: string;
  submitted_at?: string | null;
  user: { login: string } | null;
}

interface ReviewDismissedEvent {
  event: string;
  created_at: string;
  dismissed_review?: { state: string; review_id: number };
}

type ReviewAnalysis =
  | { blocked: true }
  | { blocked: false; approvalTimes: number[]; clockRestarts: number[] };

function submittedAt(review: Review): number {
  return review.submitted_at ? Date.parse(review.submitted_at) : 0;
}

// The clock starts at the earliest active approval, but restarts whenever a change request is resolved
// via the reviewer approving later or by the review being dismissed.
async function analyzeReviews(reviews: Review[], isTeamReviewer: (login: string) => Promise<boolean>): Promise<ReviewAnalysis> {
  // Latest active (non-dismissed) approval/request per reviewer
  const activeByUser = new Map<string, Review>();
  for (const review of reviews) {
    if (!review.user || (review.state !== 'APPROVED' && review.state !== 'CHANGES_REQUESTED')) continue;
    activeByUser.set(review.user.login, review);
  }

  const approvalTimes = [];
  const clockRestarts = [];
  for (const review of reviews) {
    if (!review.user || !await isTeamReviewer(review.user.login)) continue;

    const active = activeByUser.get(review.user.login);
    if (review.state === 'CHANGES_REQUESTED') {
      if (active?.id === review.id) return { blocked: true };
      if (active?.state === 'APPROVED') clockRestarts.push(submittedAt(active));
    }
    if (review.state === 'APPROVED' && active?.id === review.id) {
      approvalTimes.push(submittedAt(review));
    }
  }
  return { blocked: false, approvalTimes, clockRestarts };
}

export async function promote(octokit: Octokit, context: Context, config: Config): Promise<void> {
  const isTeamMember = createTeamChecker(octokit, config.org);
  const isTeamReviewer = async (login: string) =>
    await isTeamMember(login, config.maintainerTeams) || await isTeamMember(login, config.developerTeams);

  const project = await getProject(octokit, config);
  const fullOption = findOption(project, config.fullApproval);
  const promoteAfterMs = config.promoteAfterDays * 24 * 60 * 60 * 1000;

  const delayed = await listPullRequestsWithStatus(octokit, project, config.delayedApproval, context.repo, config);
  core.info(`${delayed.length} open PR(s) in ${config.delayedApproval}`);

  for (const { itemId, number } of delayed) {
    const reviews: Review[] = await octokit.paginate(octokit.rest.pulls.listReviews, {
      ...context.repo, pull_number: number,
    });

    const analysis = await analyzeReviews(reviews, isTeamReviewer);
    if (analysis.blocked) {
      core.info(`PR #${number}: changes are currently requested, skipping`);
      continue;
    }
    const { approvalTimes, clockRestarts } = analysis;
    if (approvalTimes.length === 0) {
      core.info(`PR #${number}: no active team approval, skipping`);
      continue;
    }

    // Dismissals of change requests restart the clock
    const reviewById = new Map(reviews.map(r => [r.id, r]));
    const timeline = await octokit.paginate(octokit.rest.issues.listEventsForTimeline, {
      ...context.repo, issue_number: number,
    });
    for (const event of timeline as ReviewDismissedEvent[]) {
      if (event.event !== 'review_dismissed' || event.dismissed_review?.state !== 'changes_requested') continue;
      const dismissed = reviewById.get(event.dismissed_review.review_id);
      if (dismissed?.user && await isTeamReviewer(dismissed.user.login)) {
        clockRestarts.push(Date.parse(event.created_at));
      }
    }

    const clockStart = Math.max(Math.min(...approvalTimes), ...clockRestarts);
    if (Date.now() - clockStart < promoteAfterMs) {
      core.info(`PR #${number}: approval is newer than ${config.promoteAfterDays} days, skipping`);
      continue;
    }

    await setItemStatus(octokit, project, itemId, fullOption);
    core.info(`Promoted PR #${number} to ${config.fullApproval}`);
  }
}
