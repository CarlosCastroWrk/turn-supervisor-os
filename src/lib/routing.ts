import type { AppView, UnitStatusFilter } from '../types';

export interface AppRoute {
  view: AppView;
  unitId?: string;
  unitSurface?: 'board' | 'personal';
  issueId?: string;
  crewId?: string;
  fieldWorkflow?: 'walk';
  walkSessionId?: string;
  homeSummary?: HomeSummaryFilter;
  unitStatusFilter: UnitStatusFilter;
}

export type HomeSummaryFilter =
  | 'working'
  | 'waiting'
  | 'callbacks'
  | 'ready-to-walk'
  | 'today-task';

export interface NavigateOptions {
  unitStatusFilter?: UnitStatusFilter;
  unitSurface?: 'board' | 'personal';
  issueId?: string;
  crewId?: string;
  fieldWorkflow?: 'walk';
  walkSessionId?: string;
  homeSummary?: HomeSummaryFilter;
}

export interface ResolvedAppHash {
  route: AppRoute;
  captureRequested: boolean;
}

export type AppNavigate = (view: AppView, unitId?: string, options?: NavigateOptions) => void;

const defaultRoute: AppRoute = {
  view: 'dashboard',
  unitStatusFilter: 'All',
};

const topLevelViews = new Set<AppView>([
  'dashboard',
  'activity',
  'more',
  'search',
  'notifications',
  'review',
  'sync',
  'setup',
  'units',
  'issues',
  'crews',
  'assignments',
  'daily',
  'reports',
  'copilot',
  'training',
  'export',
]);

const unitStatusFilters: UnitStatusFilter[] = ['All', 'Blocked', 'Ready', 'Not Started', 'In Progress', 'Needs Inspection'];
const homeSummaryFilters: HomeSummaryFilter[] = [
  'working',
  'waiting',
  'callbacks',
  'ready-to-walk',
  'today-task',
];

const decodePathPart = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const encodePathPart = (value: string) => encodeURIComponent(value);

export const isUnitStatusFilter = (value: string | null): value is UnitStatusFilter =>
  Boolean(value && unitStatusFilters.includes(value as UnitStatusFilter));

export const isHomeSummaryFilter = (value: string | null): value is HomeSummaryFilter =>
  Boolean(value && homeSummaryFilters.includes(value as HomeSummaryFilter));

export const parseAppHash = (hash: string): AppRoute => {
  const normalizedHash = hash.replace(/^#\/?/, '');
  const [rawPath, rawQuery = ''] = normalizedHash.split('?');
  const pathParts = rawPath
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(decodePathPart);
  const params = new URLSearchParams(rawQuery);
  const statusParam = params.get('status');
  const unitStatusFilter = isUnitStatusFilter(statusParam) ? statusParam : defaultRoute.unitStatusFilter;
  const summaryParam = params.get('summary');

  if (pathParts.length === 0) {
    return { ...defaultRoute };
  }

  const [viewOrResource, recordId] = pathParts;

  if ((viewOrResource === 'unit' || viewOrResource === 'units') && recordId) {
    return {
      view: 'unitDetail',
      unitId: recordId,
      unitSurface: viewOrResource === 'unit' ? 'personal' : 'board',
      unitStatusFilter: 'All',
    };
  }

  if ((viewOrResource === 'issue' || viewOrResource === 'issues') && recordId) {
    return {
      view: 'issues',
      issueId: recordId,
      unitStatusFilter: 'All',
    };
  }

  if (viewOrResource === 'crews' && recordId) {
    return {
      crewId: recordId,
      view: 'crews',
      unitStatusFilter: 'All',
    };
  }

  if (viewOrResource === 'walk') {
    return {
      fieldWorkflow: 'walk',
      ...(recordId ? { walkSessionId: recordId } : {}),
      view: 'units',
      unitStatusFilter: 'All',
    };
  }

  if (viewOrResource === 'unitDetail' && recordId) {
    return {
      view: 'unitDetail',
      unitId: recordId,
      unitSurface: 'personal',
      unitStatusFilter: 'All',
    };
  }

  if (topLevelViews.has(viewOrResource as AppView)) {
    const homeSummary = viewOrResource === 'dashboard' && isHomeSummaryFilter(summaryParam)
      ? summaryParam
      : undefined;
    return {
      view: viewOrResource as AppView,
      ...(homeSummary ? { homeSummary } : {}),
      unitStatusFilter,
    };
  }

  return { ...defaultRoute };
};

export const resolveAppHash = (hash: string): ResolvedAppHash => {
  const route = parseAppHash(hash);

  if (route.view === 'copilot') {
    return {
      route: { ...defaultRoute },
      captureRequested: true,
    };
  }

  return {
    route,
    captureRequested: false,
  };
};

export const buildAppHash = (route: AppRoute) => {
  if (route.fieldWorkflow === 'walk') {
    return route.walkSessionId
      ? `#/walk/${encodePathPart(route.walkSessionId)}`
      : '#/walk';
  }

  if (route.view === 'unitDetail' && route.unitId) {
    const resource = route.unitSurface === 'personal' ? 'unit' : 'units';
    return `#/${resource}/${encodePathPart(route.unitId)}`;
  }

  if (route.view === 'issues' && route.issueId) {
    return `#/issues/${encodePathPart(route.issueId)}`;
  }

  if (route.view === 'crews' && route.crewId) {
    return `#/crews/${encodePathPart(route.crewId)}`;
  }

  if (route.view === 'units' && route.unitStatusFilter !== 'All') {
    const params = new URLSearchParams({ status: route.unitStatusFilter });
    return `#/units?${params.toString()}`;
  }

  if (route.view === 'dashboard' && route.homeSummary) {
    const params = new URLSearchParams({ summary: route.homeSummary });
    return `#/dashboard?${params.toString()}`;
  }

  return `#/${route.view}`;
};

export const routeForNavigation = (
  view: AppView,
  unitId?: string,
  options?: NavigateOptions,
): AppRoute => {
  if (view === 'unitDetail' && !unitId) {
    return {
      view: 'units',
      unitStatusFilter: 'All',
    };
  }

  if (view === 'unitDetail' && unitId) {
    return {
      view,
      unitId,
      unitSurface: options?.unitSurface ?? 'board',
      unitStatusFilter: 'All',
    };
  }

  if (view === 'issues' && options?.issueId) {
    return {
      view,
      issueId: options.issueId,
      unitStatusFilter: 'All',
    };
  }

  if (view === 'crews' && options?.crewId) {
    return {
      crewId: options.crewId,
      view,
      unitStatusFilter: 'All',
    };
  }

  if (options?.fieldWorkflow === 'walk') {
    return {
      fieldWorkflow: 'walk',
      ...(options.walkSessionId ? { walkSessionId: options.walkSessionId } : {}),
      view: 'units',
      unitStatusFilter: 'All',
    };
  }

  return {
    view,
    unitId: view === 'unitDetail' ? unitId : undefined,
    unitSurface: view === 'unitDetail' ? options?.unitSurface ?? 'board' : undefined,
    ...(view === 'dashboard' && options?.homeSummary
      ? { homeSummary: options.homeSummary }
      : {}),
    unitStatusFilter: view === 'units' ? options?.unitStatusFilter ?? 'All' : 'All',
  };
};
