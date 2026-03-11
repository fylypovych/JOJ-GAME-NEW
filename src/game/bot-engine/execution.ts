import type { BotPlan } from './planner';

export const executeBestBotPlan = <TPlan extends BotPlan>(
  plans: readonly TPlan[],
  executePlan: (plan: TPlan) => boolean,
): { acted: boolean; executedPlan?: TPlan } => {
  for (const plan of plans) {
    if (executePlan(plan)) return { acted: true, executedPlan: plan };
  }
  return { acted: false };
};

export const executeBotPlanSequence = <TPlan extends BotPlan>(args: {
  getPlans: () => readonly TPlan[];
  executePlan: (plan: TPlan) => boolean;
  maxIterations?: number;
  shouldStop?: () => boolean;
  onExecuted?: (plan: TPlan) => void;
}): { acted: boolean; executedPlans: TPlan[] } => {
  const {
    getPlans,
    executePlan,
    maxIterations = 16,
    shouldStop,
    onExecuted,
  } = args;
  const executedPlans: TPlan[] = [];
  let guard = 0;
  while (guard < maxIterations) {
    guard += 1;
    if (shouldStop?.()) break;
    const { acted, executedPlan } = executeBestBotPlan(getPlans(), executePlan);
    if (!acted || !executedPlan) break;
    executedPlans.push(executedPlan);
    onExecuted?.(executedPlan);
  }
  return { acted: executedPlans.length > 0, executedPlans };
};
