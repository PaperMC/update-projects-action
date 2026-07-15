import * as core from "@actions/core";
import * as github from "@actions/github";
import { GetIssuePrProjectStatus, Labelled, MutateAddIssuePrToProject, OptionPair, Options } from "add-to-project";
import { parseOptions } from "./options";
import GET_ISSUE_PR_PROJECT_STATUS from "./query/getIssuePrProjectStatus.graphql";
import MUTATE_UPDATE_PROJECT_FIELD_VALUE from "./mutation/changeFieldValueOfItem.graphql";
import MUTATE_CLEAR_PROJECT_FIELD_VALUE from "./mutation/clearFieldValueOfItem.graphql";
import MUTATE_ADD_ISSUE_PR_TO_PROJECT from "./mutation/addIssuePrToProject.graphql";

async function run() {
  try {
    const issueNumbers = parseIssueNumbers(core.getInput("issue-numbers"));
    const options = await parseOptions();
    const octokit = options.octokit;

    const targets = issueNumbers.length > 0 ? await fetchTargets(octokit, issueNumbers) : targetsFromEvent();
    if (targets == null) {
      return;
    }

    let failures = 0;
    for (const target of targets) {
      core.startGroup(`Processing ${target.html_url}`);
      try {
        await processTarget(octokit, options, target);
      } catch (error) {
        failures++;
        core.error(`Failed to process ${target.html_url}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        core.endGroup();
      }
    }
    if (failures > 0) {
      core.setFailed(`Failed to process ${failures} issue(s)/pr(s).`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error : String(error));
  }
}

function parseIssueNumbers(input: string): number[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid issue/pr number in issue-numbers: ${s}`);
      }
      return n;
    });
}

async function fetchTargets(octokit: Options["octokit"], issueNumbers: number[]): Promise<Labelled[]> {
  return await Promise.all(
    issueNumbers.map(async (issueNumber) => {
      const { data } = await octokit.rest.issues.get({ ...github.context.repo, issue_number: issueNumber });
      return {
        html_url: data.html_url,
        labels: data.labels.map((l) => (typeof l == "string" ? { name: l } : { name: l.name ?? "" })),
      };
    }),
  );
}

function targetsFromEvent(): Labelled[] | null {
  if (github.context.eventName != "issues" && github.context.eventName != "pull_request") {
    core.setFailed(`Provide the issue-numbers input when not running on an 'issues' or 'pull_request' event.`);
    return null;
  }

  const target: Labelled | undefined = (github.context.payload.issue || github.context.payload.pull_request) as unknown as Labelled;
  if (!target || !target.html_url) {
    core.setFailed(`Invalid context`);
    core.debug(`Context: ${JSON.stringify(github.context, null, 2)}`);
    return null;
  }
  core.debug(`Target: ${JSON.stringify(target, null, 2)}`);
  core.debug(`Issue/PR: ${JSON.stringify(github.context.issue)}`);
  return [target];
}

async function processTarget(octokit: Options["octokit"], options: Options, target: Labelled) {
  const projectStatusRaw = await octokit.graphql<GetIssuePrProjectStatus>(GET_ISSUE_PR_PROJECT_STATUS, {
    resourceUrl: target.html_url,
    fieldName: options.field.name,
  });
  core.debug(`GET_ISSUE_PR_PROJECT_STATUS: ${JSON.stringify(projectStatusRaw, null, 2)}`);
  const currentItem = projectStatusRaw.resource.projectItems.nodes.find((n) => n.project.id == options.project.id);
  let itemId: string;
  if (currentItem) {
    itemId = currentItem.itemId;
  } else {
    itemId = await addToProject(octokit, options.project.id, projectStatusRaw.resource.id);
  }

  const projectStatus = {
    targetId: projectStatusRaw.resource.id,
    projectId: options.project.id,
    itemId: itemId,
    field: currentItem?.field || null, // can be null if the item isn't assigned a field option (No Status)
  };
  core.info(`Project Status: ${JSON.stringify(projectStatus, null, 2)}`);

  const optionPairs: OptionPair[] = [];
  for (const labelName in options.labelToOptionsMap) {
    const optionName = options.labelToOptionsMap[labelName];
    const option = options.field.options.find((f) => f.name == optionName);
    if (!option) {
      core.warning(`Could not find a field option on the project for ${options.field.name} named ${optionName}`);
      continue;
    }
    optionPairs.push({ option, label: labelName });
  }
  core.debug(`Final options: ${JSON.stringify(optionPairs, null, 2)}`);

  for (let i = optionPairs.length - 1; i >= 0; i--) {
    const pair = optionPairs[i];
    if (target.labels.some((l) => l.name == pair.label)) {
      // issue/pr has a label that matches to a project field option
      if (projectStatus.field && projectStatus.field.optionId == pair.option.id) {
        core.notice(`Already in correct project option ${pair.option.name}.`);
      } else {
        core.notice(`Moving to option ${pair.option.name}...`);
        await octokit.graphql(MUTATE_UPDATE_PROJECT_FIELD_VALUE, {
          projectId: projectStatus.projectId,
          fieldId: options.field.id,
          itemId: projectStatus.itemId,
          optionId: pair.option.id,
        });
      }
      return;
    }
  }
  if (options.clearOnNoMatch) {
    core.notice(`Doesn't have any labels matching an option. Clearing the field...`);
    await octokit.graphql(MUTATE_CLEAR_PROJECT_FIELD_VALUE, {
      projectId: projectStatus.projectId,
      itemId: projectStatus.itemId,
      fieldId: options.field.id,
    });
  } else {
    core.notice(`Doesn't have any labels matching an option. Doing nothing...`);
  }
}

async function addToProject(octokit: Options["octokit"], projectId: string, contentId: string): Promise<string> {
  // returns project item id
  const result = await octokit.graphql<MutateAddIssuePrToProject>(MUTATE_ADD_ISSUE_PR_TO_PROJECT, {
    projectId,
    contentId,
  });
  core.debug(`MUTATE_ADD_ISSUE_PR_TO_PROJECT: ${JSON.stringify(result, null, 2)}`);
  core.notice(`This issue/pr wasn't part of the project, adding it now.`);
  return result.addProjectV2ItemById.item.id;
}

// noinspection JSIgnoredPromiseFromCall
run();
