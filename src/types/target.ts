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

export type TargetUserRole = 'SALES' | 'PRESALES';

export interface TargetRow {
  userId: number;
  userName: string;
  totalTarget: number;
  achieved: number;
  achievementPercent: number;
  totalDeals: number;
  incentivePercent: number;
  incentiveAmount: number;
  /**
   * Role for which this target row applies (SALES or PRESALES).
   * Optional to keep backwards compatibility with older backend responses.
   */
  userRole?: TargetUserRole;
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
  /**
   * Optional legacy/source fields that some backends may still send.
   * We keep them to improve divert vs direct attribution on the frontend.
   */
  source?: string;
  isDiverted?: boolean;
  phoneNumber?: string;
  venue?: string;
  eventDate?: string;
  organization?: string;
  /**
   * Optional date/time when the deal was marked as WON.
   * Newer backend versions may include this; older ones won't.
   */
  wonDate?: string;
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
  /**
   * Human‑readable source label for this deal (e.g. "Direct", "Divert", "Reference").
   *
   * Older backend versions exposed this as `source`, while newer reporting
   * payloads align with `DealSummary` and use `dealSource` / `personSource`.
   * We keep all three optional so that the UI can derive a single source
   * string regardless of which shape the API returns.
   */
  source?: string;
  dealSource?: string;
  personSource?: string;
  instagramId?: string;
  weddingDate?: string;
  weddingVenue?: string;
  phone?: string;
  /**
   * Optional date/time when the deal was marked as WON.
   * Backends that don't send this field will simply leave it undefined.
   */
  wonDate?: string;
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
  /**
   * List of won deals attributed to this user.
   *
   * Historically this endpoint returned a custom UserDealDetail shape that
   * already contained month/year fields. The backend has since been updated
   * to return DealSummary objects (same shape as the dashboard deals list)
   * under the "deals" field.
   *
   * To remain backwards compatible with older payloads while supporting the
   * new DealSummary-based response, we model this as a union type.
   */
  deals?: Array<UserDealDetail | DealSummary>;
  availableCategories?: CategoryOptionLike[];
  categories?: CategoryOptionLike[];
  availableOrganizationIds?: number[];
  organizationIds?: number[];
  availableOrganizations?: OrganizationSummary[];
  organizations?: OrganizationSummary[];
}
