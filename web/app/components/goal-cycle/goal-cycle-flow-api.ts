/**
 * Live GoalCycleFlowApi adapter — frozen VS5 client methods only.
 */

import type { GoalCycleFlowApi } from "@/app/components/goal-cycle/GoalCycleFlow";
import {
  answerCreatorGoalCyclePlannerQuestions,
  fetchActiveCreatorGoalCycle,
  fetchCreatorGoalCycle,
  fetchCreatorGoalCycleResearch,
  generateCreatorGoalCyclePlan,
  manualEditCreatorGoalCyclePlan,
  patchCreatorGoalCycleCheckpoint,
  proposeCreatorGoalCyclePlannerQuestions,
  reviseCreatorGoalCyclePlan,
  startCreatorGoalCycle,
  startCreatorGoalCycleResearch
} from "@/lib/relay-api";

export function createGoalCycleFlowApi(): GoalCycleFlowApi {
  return {
    startCycle: (input) => startCreatorGoalCycle(input),
    patchCheckpoint: (cycleId, body) =>
      patchCreatorGoalCycleCheckpoint(cycleId, body),
    startResearch: (cycleId, body) =>
      startCreatorGoalCycleResearch(cycleId, body),
    getResearch: (cycleId, requestId) =>
      fetchCreatorGoalCycleResearch(cycleId, { requestId }),
    fetchCycle: (cycleId) => fetchCreatorGoalCycle(cycleId),
    proposeQuestions: (cycleId, body) =>
      proposeCreatorGoalCyclePlannerQuestions(cycleId, body ?? {}),
    answerQuestions: (cycleId, body) =>
      answerCreatorGoalCyclePlannerQuestions(cycleId, body),
    generatePlan: (cycleId, body) =>
      generateCreatorGoalCyclePlan(cycleId, body ?? {}),
    revisePlan: (cycleId, body) => reviseCreatorGoalCyclePlan(cycleId, body),
    manualEditPlan: (cycleId, body) =>
      manualEditCreatorGoalCyclePlan(cycleId, body)
  };
}

export { fetchActiveCreatorGoalCycle };
