import { ChevronRight, Clock3, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { NativePageHeader, NativePageTransition } from './NativePage';
import {
  NATIVE_SEARCH_GROUPS,
  filterNativeSearchGroups,
  type NativeSearchGroup,
  type NativeSearchResult,
} from './model';

export interface NativeSearchPageProps {
  groups: readonly NativeSearchGroup[];
  onBack: () => void;
  onOpenResult: (result: NativeSearchResult) => void;
  onQueryChange: (query: string) => void;
  onSelectRecent: (query: string) => void;
  query: string;
  recentSearches: readonly string[];
}

export function NativeSearchPage({
  groups,
  onBack,
  onOpenResult,
  onQueryChange,
  onSelectRecent,
  query,
  recentSearches,
}: NativeSearchPageProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredGroups = useMemo(() => filterNativeSearchGroups(groups, query), [groups, query]);
  const resultCount = filteredGroups.reduce((total, group) => total + group.results.length, 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <NativePageTransition>
      <main className="w2a1-a-root w2a1-a-detail-page" data-testid="wave2a1-native-search">
        <NativePageHeader onBack={onBack} title="Search" />
        <div className="w2a1-a-detail-page__scroll">
          <label className="w2a1-a-search-field">
            <Search aria-hidden="true" size={21} />
            <span className="w2a1-a-visually-hidden">Search Turn OS</span>
            <input
              autoComplete="off"
              autoFocus
              enterKeyHint="search"
              inputMode="search"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              placeholder="Search Units, crews, or activity"
              ref={inputRef}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear search"
                onClick={() => onQueryChange('')}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            ) : null}
          </label>

          {!query && recentSearches.length > 0 ? (
            <section className="w2a1-a-section" aria-labelledby="w2a1-a-recent-searches">
              <h2 id="w2a1-a-recent-searches">Recent searches</h2>
              <div className="w2a1-a-inset-list">
                {recentSearches.map((recent) => (
                  <button
                    className="w2a1-a-inset-row"
                    key={recent}
                    onClick={() => onSelectRecent(recent)}
                    type="button"
                  >
                    <Clock3 aria-hidden="true" className="w2a1-a-row-leading" size={19} />
                    <span className="w2a1-a-row-content"><strong>{recent}</strong></span>
                    <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div aria-live="polite">
            {filteredGroups.map((group) => {
              const definition = NATIVE_SEARCH_GROUPS.find(({ id }) => id === group.id);
              return (
                <section
                  className="w2a1-a-section"
                  key={group.id}
                  aria-labelledby={`w2a1-a-search-group-${group.id}`}
                >
                  <h2 id={`w2a1-a-search-group-${group.id}`}>
                    {definition?.label ?? group.id}
                    <span>{group.results.length}</span>
                  </h2>
                  <div className="w2a1-a-inset-list">
                    {group.results.map((result) => (
                      <button
                        className="w2a1-a-inset-row"
                        key={result.id}
                        onClick={() => onOpenResult(result)}
                        type="button"
                      >
                        <span className="w2a1-a-row-content">
                          <strong>{result.title}</strong>
                          {result.meta ? <small>{result.meta}</small> : null}
                        </span>
                        <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {resultCount === 0 ? (
              <section className="w2a1-a-empty-state">
                <Search aria-hidden="true" size={24} />
                <h2>No matching personal records.</h2>
                <p>Search checks Units, crews, and Activity without changing any record.</p>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </NativePageTransition>
  );
}
