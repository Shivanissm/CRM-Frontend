const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'lead in': 'New Enquiry',
  'lead-in': 'New Enquiry',
  qualified: 'Number Received',
  contacted: 'Number Received',
  'contact made': 'Contact Made',
  'requirement shared': 'Contact Made',
  'follow up': 'Follow-up',
  'follow-up': 'Follow-up',
  'meeting scheduled': 'Proposal Sent',
  'meeting done': 'Contract Shared',
  'contract shared': 'Contract Shared',
  'booking confirmed': 'Contract Shared',
  diversion: 'Diversion',
  'not proceeding': 'Diversion',
};

export const getDisplayStageName = (stageName: string | null | undefined): string => {
  if (!stageName) return '';
  const key = stageName.toLowerCase().trim();
  return STAGE_DISPLAY_NAMES[key] || stageName;
};
