import type { AppView, UnitStatusFilter } from '../types';

export interface AppRoute {
  view: AppView;
  unitId?: string;
  issueId?: string;
  unitStatusFilter: UnitStatusFilter;
}

export interface NavigateOptions {
  unitStatusFilter?: UnitStatusFilter;
  issueId?: string;
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

  if (pathParts.length === 0) {
    return { ...defaultRoute };
  }

  const [viewOrResource, recordId] = pathParts;

  if ((viewOrResource === 'unit' || viewOrResource === 'units') && recordId) {
    return {
      view: 'unitDetail',
      unitId: recordId,
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

  if (viewOrResource === 'unitDetail' && recordId) {
    return {
      view: 'unitDetail',
      unitId: recordId,
      unitStatusFilter: 'All',
    };
  }

  if (topLevelViews.has(viewOrResource as AppView)) {
    return {
      view: viewOrResource as AppView,
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
  if (route.view === 'unitDetail' && route.unitId) {
    return `#/units/${encodePathPart(route.unitId)}`;
  }

  if (route.view === 'issues' && route.issueId) {
    return `#/issues/${encodePathPart(route.issueId)}`;
  }

  if (route.view === 'units' && route.unitStatusFilter !== 'All') {
    const params = new URLSearchParams({ status: route.unitStatusFilter });
    return `#/units?${params.toString()}`;
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

  return {
    view,
    unitId: view === 'unitDetail' ? unitId : undefined,
    unitStatusFilter: view === 'units' ? options?.unitStatusFilter ?? 'All' : 'All',
  };
};
