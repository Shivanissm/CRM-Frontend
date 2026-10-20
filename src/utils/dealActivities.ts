import { activitiesApi, type Activity } from '../services/activities';

export function areAllActivitiesDone(
  activities: Activity[],
  justMarkedId?: number,
  justMarkedDone?: boolean,
): boolean {
  if (!activities.length) return false;
  return activities.every((activity) => {
    if (justMarkedId != null && activity.id === justMarkedId) {
      return justMarkedDone === true;
    }
    return activity.done === true;
  });
}

export async function fetchDealActivities(dealId: number): Promise<Activity[]> {
  const response = await activitiesApi.list({ page: 0, size: 10000 });
  return (response.content || []).filter((activity) => activity.dealId === dealId);
}

export async function shouldPromptNewActivityAfterDone(
  dealId: number | null | undefined,
  justMarkedId: number,
): Promise<boolean> {
  if (!dealId) return false;
  const dealActivities = await fetchDealActivities(dealId);
  return areAllActivitiesDone(dealActivities, justMarkedId, true);
}
