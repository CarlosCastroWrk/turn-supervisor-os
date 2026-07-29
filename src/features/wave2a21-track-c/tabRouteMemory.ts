export const TRACK_C_PRIMARY_TABS = [
  'home',
  'turnboard',
  'activity',
  'more',
] as const;

export type TrackCPrimaryTab = (typeof TRACK_C_PRIMARY_TABS)[number];

export interface TrackCTabRoutePosition {
  readonly routeKey: string;
  readonly scrollTop: number;
}

export interface TrackCTabRouteStack {
  readonly entries: readonly TrackCTabRoutePosition[];
  readonly rootRouteKey: string;
}

export interface TrackCTabRouteMemory {
  readonly activeTab: TrackCPrimaryTab;
  readonly tabs: Readonly<Record<TrackCPrimaryTab, TrackCTabRouteStack>>;
}

export type TrackCTabNavigationReason =
  | 'active-tab-retap'
  | 'back'
  | 'switch-tab';

export interface TrackCTabNavigationDecision {
  readonly historyMode: 'push' | 'replace';
  readonly reason: TrackCTabNavigationReason;
  readonly state: TrackCTabRouteMemory;
  readonly target: TrackCTabRoutePosition;
}

export type TrackCTransientSurface = 'notifications' | 'search';

export interface TrackCTransientOriginSnapshot {
  readonly originStack: TrackCTabRouteStack;
  readonly originTab: TrackCPrimaryTab;
  readonly surface: TrackCTransientSurface;
}

const MAX_STACK_DEPTH = 32;

const normalizedScrollTop = (scrollTop: number) =>
  Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;

const routePosition = (
  routeKey: string,
  scrollTop = 0,
): TrackCTabRoutePosition => ({
  routeKey,
  scrollTop: normalizedScrollTop(scrollTop),
});

const replaceTabStack = (
  state: TrackCTabRouteMemory,
  tab: TrackCPrimaryTab,
  stack: TrackCTabRouteStack,
  activeTab = state.activeTab,
): TrackCTabRouteMemory => ({
  activeTab,
  tabs: {
    ...state.tabs,
    [tab]: stack,
  },
});

const boundedEntries = (
  rootRouteKey: string,
  entries: readonly TrackCTabRoutePosition[],
) => {
  if (entries.length <= MAX_STACK_DEPTH) return entries;
  const root = entries.find((entry) => entry.routeKey === rootRouteKey)
    ?? routePosition(rootRouteKey);
  return [
    root,
    ...entries.slice(-(MAX_STACK_DEPTH - 1)),
  ];
};

export const createTrackCTabRouteMemory = (
  roots: Readonly<Record<TrackCPrimaryTab, string>>,
  activeTab: TrackCPrimaryTab = 'home',
): TrackCTabRouteMemory => ({
  activeTab,
  tabs: {
    activity: {
      entries: [routePosition(roots.activity)],
      rootRouteKey: roots.activity,
    },
    home: {
      entries: [routePosition(roots.home)],
      rootRouteKey: roots.home,
    },
    more: {
      entries: [routePosition(roots.more)],
      rootRouteKey: roots.more,
    },
    turnboard: {
      entries: [routePosition(roots.turnboard)],
      rootRouteKey: roots.turnboard,
    },
  },
});

export const getTrackCCurrentTabRoute = (
  state: TrackCTabRouteMemory,
  tab = state.activeTab,
) => {
  const entries = state.tabs[tab].entries;
  return entries[entries.length - 1]
    ?? routePosition(state.tabs[tab].rootRouteKey);
};

export const rememberTrackCTabRoute = (
  state: TrackCTabRouteMemory,
  tab: TrackCPrimaryTab,
  routeKey: string,
  options: {
    readonly historyMode?: 'push' | 'replace';
    readonly scrollTop?: number;
  } = {},
): TrackCTabRouteMemory => {
  const stack = state.tabs[tab];
  const entries = [...stack.entries];
  const nextPosition = routePosition(routeKey, options.scrollTop);
  const current = entries[entries.length - 1];

  if (
    options.historyMode === 'replace'
    || current?.routeKey === routeKey
  ) {
    entries.splice(Math.max(0, entries.length - 1), 1, nextPosition);
  } else {
    entries.push(nextPosition);
  }

  return replaceTabStack(state, tab, {
    ...stack,
    entries: boundedEntries(stack.rootRouteKey, entries),
  });
};

export const rememberTrackCTabScroll = (
  state: TrackCTabRouteMemory,
  tab: TrackCPrimaryTab,
  routeKey: string,
  scrollTop: number,
): TrackCTabRouteMemory => {
  const stack = state.tabs[tab];
  const entries = [...stack.entries];
  const current = entries[entries.length - 1];
  if (!current || current.routeKey !== routeKey) return state;
  entries[entries.length - 1] = routePosition(routeKey, scrollTop);
  return replaceTabStack(state, tab, { ...stack, entries });
};

export const selectTrackCPrimaryTab = (
  state: TrackCTabRouteMemory,
  tab: TrackCPrimaryTab,
): TrackCTabNavigationDecision => {
  const stack = state.tabs[tab];
  if (tab === state.activeTab) {
    const target = routePosition(stack.rootRouteKey);
    return {
      historyMode: 'replace',
      reason: 'active-tab-retap',
      state: replaceTabStack(
        state,
        tab,
        { ...stack, entries: [target] },
        tab,
      ),
      target,
    };
  }

  return {
    historyMode: 'push',
    reason: 'switch-tab',
    state: { ...state, activeTab: tab },
    target: getTrackCCurrentTabRoute(state, tab),
  };
};

export const restoreTrackCTabBack = (
  state: TrackCTabRouteMemory,
  tab = state.activeTab,
): TrackCTabNavigationDecision | null => {
  const stack = state.tabs[tab];
  if (stack.entries.length <= 1) return null;
  const entries = stack.entries.slice(0, -1);
  const target = entries[entries.length - 1]
    ?? routePosition(stack.rootRouteKey);
  return {
    historyMode: 'replace',
    reason: 'back',
    state: replaceTabStack(state, tab, { ...stack, entries }, tab),
    target,
  };
};

export const captureTrackCTransientOrigin = (
  state: TrackCTabRouteMemory,
  surface: TrackCTransientSurface,
): TrackCTransientOriginSnapshot => {
  const originStack = state.tabs[state.activeTab];
  return {
    originStack: {
      ...originStack,
      entries: originStack.entries.map((entry) => ({ ...entry })),
    },
    originTab: state.activeTab,
    surface,
  };
};

export const restoreTrackCTransientOrigin = (
  state: TrackCTabRouteMemory,
  snapshot: TrackCTransientOriginSnapshot,
): TrackCTabNavigationDecision => ({
  historyMode: 'replace',
  reason: 'back',
  state: replaceTabStack(
    state,
    snapshot.originTab,
    snapshot.originStack,
    snapshot.originTab,
  ),
  target: snapshot.originStack.entries[snapshot.originStack.entries.length - 1]
    ?? routePosition(snapshot.originStack.rootRouteKey),
});
