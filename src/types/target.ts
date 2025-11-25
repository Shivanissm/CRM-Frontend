export type TargetCategory = 'PHOTOGRAPHY' | 'MAKEUP' | 'PLANNING_AND_DECOR';
export type PeriodType = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type TimePreset = 
  | 'THIS_MONTH' 
  | 'PREVIOUS_MONTH' 
  | 'NEXT_MONTH' 
  | 'THIS_QUARTER' 
  | 'HALF_YEAR' 
  | 'THIS_YEAR' 
  | 'CUSTOM_MONTH' 
  | 'CUSTOM_RANGE';

export interface CategoryOption {
  code: TargetCategory;
  label: string;
}

export interface TimePresetOption {
  code: TimePreset;
  label: string;
}

export interface FiltersResponse {
  categories: CategoryOption[];
  presets: TimePresetOption[];
  minYear: number;
}

export interface OrganizationSummary {
  id: number;
  name: string;
  category: string;
}

export interface TargetResponse {
  id: number;
  userId: number;
  userName: string;
  category: TargetCategory;
  month?: number;
  year: number;
  quarter?: number;
  halfYear?: number;
  organizationIds: number[];
  organizations: OrganizationSummary[];
  targetAmount: number;
  editable: boolean;
}

export interface TargetUpsertRequest {
  userId: number;
  category: TargetCategory;
  periodType: PeriodType;
  month?: number;
  monthStart?: number; // Backend expects monthStart (camelCase) which maps to month_start in DB
  year: number;
  quarter?: number;
  halfYear?: number;
  organizationIds?: number[];
  targetAmount: number;
}

export interface AppliedFilters {
  timePreset?: TimePreset;
  month?: number;
  year?: number;
  fromMonth?: number;
  fromYear?: number;
  toMonth?: number;
  toYear?: number;
  category?: TargetCategory;
  editableForCurrentUser: boolean;
}

export interface TargetRow {
  userId: number;
  userName: string;
  totalTarget: number;
  achieved: number;
  achievementPercent: number;
  totalDeals: number;
  incentivePercent: number;
  incentiveAmount: number;
}

export interface CategoryMonthlyBreakdownMonth {
  month: number;
  year: number;
  totalTarget: number;
  achieved: number;
  achievementPercent: number;
  totalDeals: number;
  incentivePercent: number;
  incentiveAmount: number;
  users: TargetRow[];
}

export interface CategoryMonthlyBreakdownTotals {
  totalTarget: number;
  achieved: number;
  achievementPercent: number;
  totalDeals: number;
  incentivePercent: number;
  incentiveAmount: number;
}

export interface CategoryMonthlyBreakdownResponse {
  months: CategoryMonthlyBreakdownMonth[];
  totals: CategoryMonthlyBreakdownTotals;
}

export interface CategoryTable {
  category: TargetCategory;
  categoryLabel: string;
  rows: TargetRow[];
}

export interface MonthBlock {
  month: number;
  year: number;
  editable: boolean;
  categories: CategoryTable[];
}

export interface DealSummary {
  dealId: number;
  dealName: string;
  instagramId?: string;
  dealValue: number;
  commissionAmount: number;
  dealSource?: string;
  personSource?: string;
  phoneNumber?: string;
  venue?: string;
  eventDate?: string;
  organization?: string;
  category: TargetCategory;
  userId: number;
  userName: string;
}

export interface DashboardResponse {
  filters: AppliedFilters;
  months: MonthBlock[];
  deals: DealSummary[];
}

export interface SalesUserWithOrganizations {
  userId: number;
  userName: string;
  organizations: OrganizationSummary[];
}

export interface SalesUserOrganizationsResponse {
  userId: number;
  userName: string;
  organizationsByMonth: Record<string, OrganizationSummary[]>;
}

export interface UserMonthlyData {
  month: number;
  year: number;
  target: number | null;
  achieved: number;
  achievementPercent: number;
  totalDeals: number;
  incentive: number;
  diversionDeals: number;
  instaDeals: number;
  referenceDeals: number;
  plannerDeals: number;
}

export interface UserDealDetail {
  dealId: number;
  dealName: string;
  dealValue: number;
  organization?: string;
  commission: number;
  source?: string;
  instagramId?: string;
  weddingDate?: string;
  weddingVenue?: string;
  phone?: string;
  month: number;
  year: number;
}

interface CategoryOptionLegacy {
  category?: TargetCategory;
  label?: string;
}

type CategoryOptionLike = CategoryOption | TargetCategory | CategoryOptionLegacy;

export interface UserTargetDetailResponse {
  userId: number;
  userName: string;
  year: number;
  monthlyData: UserMonthlyData[];
  deals?: UserDealDetail[];
  availableCategories?: CategoryOptionLike[];
  categories?: CategoryOptionLike[];
  availableOrganizationIds?: number[];
  organizationIds?: number[];
  availableOrganizations?: OrganizationSummary[];
  organizations?: OrganizationSummary[];
}
