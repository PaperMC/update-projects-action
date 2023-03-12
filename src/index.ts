import * as core from "@actions/core";
import * as github from "@actions/github";
import { readFileSync } from "node:fs";
import { GetIssuePrProjectStatus, Labelled, MutateAddIssuePrToProject, OptionPair, Options } from "add-to-project";
import { parseOptions } from "./options";

const GET_ISSUE_PR_PROJECT_STATUS = readFileSync(__dirname + "/query/getIssuePrProjectStatus.graphql", { encoding: "utf-8" });

const MUTATE_UPDATE_PROJECT_FIELD_VALUE = readFileSync(__dirname + "/mutation/changeFieldValueOfItem.graphql", { encoding: "utf-8" });
const MUTATE_CLEAR_PROJECT_FIELD_VALUE = readFileSync(__dirname + "/mutation/clearFieldValueOfItem.graphql", { encoding: "utf-8" });
const MUTATE_ADD_ISSUE_PR_TO_PROJECT = readFileSync(__dirname + "/mutation/addIssuePrToProject.graphql", { encoding: "utf-8" });

async function run() {
  try {
    if (github.context.eventName != "issues" && github.context.eventName != "pull_request") {
      core.setFailed(`This action only works on 'issues' and 'pull_request' events.`);
      return;
    }

    const target: Labelled | undefined = (github.context.payload.issue || github.context.payload.pull_request) as unknown as Labelled;
    if (!target || !target.html_url) {
      core.setFailed(`Invalid context`);
      core.debug(`Context: ${JSON.stringify(github.context, null, 2)}`);
      return;
    }
    core.debug(`Target: ${JSON.stringify(target, null, 2)}`);
    core.debug(`Issue/PR: ${JSON.stringify(github.context.issue)}`);

    const options = await parseOptions();
    const octokit = options.octokit;

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
  } catch (error: any) {
    core.setFailed(error.message);
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
