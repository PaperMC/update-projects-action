import type { Octokit } from './config';

export type TeamChecker = (login: string, teams: string[]) => Promise<boolean>;

export function createTeamChecker(octokit: Octokit, org: string): TeamChecker {
  const cache = new Map<string, boolean>();
  return async (login, teams) => {
    for (const team of teams) {
      const key = `${team}:${login}`;
      let member = cache.get(key);
      if (member === undefined) {
        member = await fetchMembership(octokit, org, team, login);
        cache.set(key, member);
      }
      if (member) return true;
    }
    return false;
  };
}

async function fetchMembership(octokit: Octokit, org: string, team: string, login: string): Promise<boolean> {
  try {
    const res = await octokit.rest.teams.getMembershipForUserInOrg({ org, team_slug: team, username: login });
    return res.data.state === 'active';
  } catch (e) {
    if ((e as { status?: number }).status === 404) return false;
    throw e;
  }
}
