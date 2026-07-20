import {
  Filter,
  ListChecks,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BulkUnitUpdatePanel } from '../components/BulkUnitUpdatePanel';
import { CompactUnitCard } from '../components/CompactUnitCard';
import { Button, Field, NumberInput } from '../components/FormControls';
import { ProgressBar } from '../components/ProgressBar';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toast-context';
import { createId, nowISO } from '../lib/constants';
import { addUnits } from '../lib/actions';
import {
  getBuildingSummary,
  getProjectBuildings,
  getProjectIssues,
  getProjectUnits,
  isBlockedUnit,
  isInProgressUnit,
  isInspectionUnit,
  isReadyUnit,
} from '../lib/metrics';
import type { AppNavigate } from '../lib/routing';
import { BULK_UNIT_UPDATE_LIMIT } from '../lib/unitBulkUpdate';
import { projectUnitCards } from '../lib/unitCardProjection';
import type { AppData, Building, Floor, Issue, Unit, UnitStatusFilter } from '../types';

interface UnitsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: AppNavigate;
  initialStatusFilter?: UnitStatusFilter;
}

const statusFilters: UnitStatusFilter[] = ['All', 'Blocked', 'Ready', 'Not Started', 'In Progress', 'Needs Inspection'];

const matchesStatusFilter = (unit: Unit, filter: UnitStatusFilter) => {
  if (filter === 'All') return true;
  if (filter === 'Blocked') return isBlockedUnit(unit);
  if (filter === 'Ready') return isReadyUnit(unit);
  if (filter === 'Not Started') return unit.overallStatus === 'Not Started';
  if (filter === 'In Progress') return isInProgressUnit(unit);
  return isInspectionUnit(unit);
};

const floorSort = (a: Floor, b: Floor) => a.name.localeCompare(b.name, undefined, { numeric: true });
const unitSort = (a: Unit, b: Unit) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
const UNIT_RENDER_STEP = 100;

const openIssueStatuses = new Set(['Open', 'In Progress', 'Waiting']);

const attentionRank = (unit: Unit, openIssues: Issue[]) => {
  if (isBlockedUnit(unit)) return 0;
  if (openIssues.some((issue) => ['Critical', 'High'].includes(issue.priority))) return 1;
  if (openIssues.length > 0) return 2;
  if (isInspectionUnit(unit)) return 3;
  if (isInProgressUnit(unit)) return 4;
  if (unit.overallStatus === 'Not Started') return 5;
  if (isReadyUnit(unit)) return 6;
  return 7;
};

export function UnitsView({ data, setData, onNavigate, initialStatusFilter = 'All' }: UnitsViewProps) {
  const { notify } = useToast();
  const [buildingFilter, setBuildingFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>(initialStatusFilter);
  const [query, setQuery] = useState('');
  const [visibleUnitLimit, setVisibleUnitLimit] = useState(UNIT_RENDER_STEP);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(() => new Set());
  const [quickBuilding, setQuickBuilding] = useState('Building B');
  const [quickFloors, setQuickFloors] = useState('1-2');
  const [quickStart, setQuickStart] = useState('101');
  const [quickCount, setQuickCount] = useState(4);
  const [quickBeds, setQuickBeds] = useState(3);
  const [quickBaths, setQuickBaths] = useState(2);

  const buildings = getProjectBuildings(data);
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data);
  const floors = data.floors;

  const visibleFloors = useMemo(() => {
    const buildingIds = buildingFilter === 'All' ? new Set(buildings.map((building) => building.id)) : new Set([buildingFilter]);
    return floors.filter((floor) => {
      const building = buildings.find((item) => item.id === floor.buildingId);
      return building ? buildingIds.has(building.id) : false;
    });
  }, [buildingFilter, buildings, floors]);

  const openIssuesByUnitId = useMemo(() => {
    const issueMap = new Map<string, Issue[]>();
    issues.forEach((issue) => {
      if (!issue.unitId || !openIssueStatuses.has(issue.status)) {
        return;
      }

      const unitIssues = issueMap.get(issue.unitId) ?? [];
      unitIssues.push(issue);
      issueMap.set(issue.unitId, unitIssues);
    });
    return issueMap;
  }, [issues]);

  const unitCardById = useMemo(
    () => new Map(projectUnitCards(data, units).map((projection) => [projection.unitId, projection])),
    [data, units],
  );

  const queryText = query.trim().toLowerCase();
  const unitsMatchingLocationAndSearch = units
    .filter((unit) => buildingFilter === 'All' || unit.buildingId === buildingFilter)
    .filter((unit) => floorFilter === 'All' || unit.floorId === floorFilter)
    .filter((unit) => (queryText ? unit.unitNumber.toLowerCase().includes(queryText) : true));

  const statusCounts = statusFilters.reduce(
    (counts, filter) => ({
      ...counts,
      [filter]: unitsMatchingLocationAndSearch.filter((unit) => matchesStatusFilter(unit, filter)).length,
    }),
    {} as Record<UnitStatusFilter, number>,
  );

  const filteredUnits = unitsMatchingLocationAndSearch
    .filter((unit) => matchesStatusFilter(unit, statusFilter))
    .sort((a, b) => {
      const rankDelta =
        attentionRank(a, openIssuesByUnitId.get(a.id) ?? []) - attentionRank(b, openIssuesByUnitId.get(b.id) ?? []);
      return rankDelta === 0 ? unitSort(a, b) : rankDelta;
    });
  const visibleUnits = filteredUnits.slice(0, visibleUnitLimit);
  const hiddenUnitCount = Math.max(filteredUnits.length - visibleUnits.length, 0);
  const selectedFilteredUnitIds = filteredUnits.filter((unit) => selectedUnitIds.has(unit.id)).map((unit) => unit.id);

  useEffect(() => {
    setVisibleUnitLimit(UNIT_RENDER_STEP);
    setSelectedUnitIds(new Set());
  }, [buildingFilter, floorFilter, statusFilter, query]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    setSelectedUnitIds(new Set());
    setIsBulkMode(false);
  }, [data.activeProjectId]);

  const toggleBulkMode = () => {
    setIsBulkMode((current) => !current);
    setSelectedUnitIds(new Set());
  };

  const toggleUnitSelection = (unitId: string) => {
    if (!selectedUnitIds.has(unitId) && selectedUnitIds.size >= BULK_UNIT_UPDATE_LIMIT) {
      notify(`Bulk updates are limited to ${BULK_UNIT_UPDATE_LIMIT.toLocaleString()} Units. Narrow the filters first.`, {
        tone: 'error',
      });
      return;
    }
    setSelectedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) {
        next.delete(unitId);
        return next;
      }
      next.add(unitId);
      return next;
    });
  };

  const selectShownUnits = () => {
    setSelectedUnitIds(new Set(visibleUnits.slice(0, BULK_UNIT_UPDATE_LIMIT).map((unit) => unit.id)));
  };

  const selectAllMatches = () => {
    if (filteredUnits.length > BULK_UNIT_UPDATE_LIMIT) {
      notify(`Narrow the board to ${BULK_UNIT_UPDATE_LIMIT.toLocaleString()} or fewer matching Units first.`, { tone: 'error' });
      return;
    }
    setSelectedUnitIds(new Set(filteredUnits.map((unit) => unit.id)));
  };

  const closeBulkMode = () => {
    setSelectedUnitIds(new Set());
    setIsBulkMode(false);
  };

  const quickCreate = () => {
    const now = nowISO();
    const [floorStartRaw, floorEndRaw] = quickFloors.split('-');
    const floorStart = Number.parseInt(floorStartRaw, 10);
    const floorEnd = floorEndRaw ? Number.parseInt(floorEndRaw, 10) : floorStart;
    const startingUnit = Number.parseInt(quickStart, 10);
    if (
      !Number.isFinite(floorStart) ||
      !Number.isFinite(floorEnd) ||
      floorEnd < floorStart ||
      !Number.isFinite(startingUnit) ||
      quickCount < 1
    ) {
      notify('Check Quick Unit Creation: use floors like "1" or "1-3" and enter a numeric first Unit.', { tone: 'error' });
      return;
    }
    const existingBuilding = data.buildings.find(
      (building) =>
        building.projectId === data.activeProjectId &&
        building.name.trim().toLowerCase() === quickBuilding.trim().toLowerCase(),
    );
    const buildingId = existingBuilding?.id ?? createId('building');
    const newBuilding: Building = {
      id: buildingId,
      projectId: data.activeProjectId,
      name: quickBuilding,
      notes: 'Created from quick unit setup.',
      createdAt: now,
      updatedAt: now,
    };
    const existingUnitNumbers = new Set(
      data.units.filter((unit) => unit.buildingId === buildingId).map((unit) => unit.unitNumber),
    );
    const newFloors: Floor[] = [];
    const newUnits: Unit[] = [];

    for (let floorNumber = floorStart; floorNumber <= floorEnd; floorNumber += 1) {
      const existingFloor = data.floors.find((floor) => floor.buildingId === buildingId && floor.name === `Floor ${floorNumber}`);
      const floorId = existingFloor?.id ?? createId(`floor_${floorNumber}`);
      if (!existingFloor) {
        newFloors.push({ id: floorId, buildingId, name: `Floor ${floorNumber}`, notes: '', createdAt: now, updatedAt: now });
      }

      for (let index = 0; index < quickCount; index += 1) {
        const unitNumber = String(startingUnit + (floorNumber - floorStart) * 100 + index);
        if (existingUnitNumbers.has(unitNumber)) {
          continue;
        }
        newUnits.push({
          id: createId(`unit_${unitNumber}`),
          projectId: data.activeProjectId,
          buildingId,
          floorId,
          unitNumber,
          bedCount: Number(quickBeds),
          bathroomCount: Number(quickBaths),
          hasCommonArea: true,
          overallStatus: 'Not Started',
          paintStatus: 'Not Started',
          cleanStatus: 'Not Started',
          repairStatus: 'Not Started',
          flooringStatus: 'Not Applicable',
          trashStatus: 'Not Started',
          inspectionStatus: 'Not Started',
          assignedCrewIds: [],
          notes: '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (newUnits.length === 0) {
      notify('Those Unit numbers already exist in this building. Nothing was created.', { tone: 'error' });
      return;
    }

    setData((current) =>
      addUnits(
        {
          ...current,
          buildings: existingBuilding ? current.buildings : [newBuilding, ...current.buildings],
          floors: [...newFloors, ...current.floors],
        },
        newUnits,
      ),
    );
    notify(`Created ${newUnits.length} Unit${newUnits.length === 1 ? '' : 's'} in ${newBuilding.name}.`, { tone: 'success' });
  };

  return (
    <div className="page turnboard-page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Los’s private field companion</span>
          <h1>TURNBOARD</h1>
          <p className="turnboard-safety-copy">Personal Unit view. Verify official work and marks on paper.</p>
        </div>
      </div>

      <section className="turnboard-find" aria-labelledby="turnboard-find-title">
        <div className="turnboard-find__search">
          <Field label="Search unit">
            <div className="input-with-icon">
              <Search size={17} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="101, 204..." />
            </div>
          </Field>
        </div>
        <details className="turnboard-filters">
          <summary id="turnboard-find-title"><Filter size={17} aria-hidden="true" /> Filters</summary>
          <div className="filter-panel">
            <Field label="Building">
              <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
                <option>All</option>
                {buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
              </select>
            </Field>
            <Field label="Floor">
              <select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)}>
                <option>All</option>
                {visibleFloors.sort(floorSort).map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
              </select>
            </Field>
            <Field label="Personal status">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UnitStatusFilter)}>
                {statusFilters.map((filter) => <option key={filter}>{filter}</option>)}
              </select>
            </Field>
          </div>
          <div className="status-chip-row" aria-label="Personal Unit status filters">
            {statusFilters.map((filter) => (
              <button aria-pressed={statusFilter === filter} className={`status-chip ${statusFilter === filter ? 'is-active' : ''}`} key={filter} onClick={() => setStatusFilter(filter)} type="button">
                <span>{filter}</span><strong>{statusCounts[filter]}</strong>
              </button>
            ))}
          </div>
        </details>
      </section>

      <Section
        title="Personal Units"
        kicker={`${visibleUnits.length} of ${filteredUnits.length} shown`}
        action={
          <Button aria-pressed={isBulkMode} onClick={toggleBulkMode} variant={isBulkMode ? 'ghost' : 'secondary'}>
            {isBulkMode ? <X size={18} aria-hidden="true" /> : <ListChecks size={18} aria-hidden="true" />}
            {isBulkMode ? 'Close bulk update' : 'Bulk update'}
          </Button>
        }
      >
        {isBulkMode ? (
          <div className="bulk-unit-workflow">
            <div className="bulk-unit-selection">
              <div>
                <strong>{selectedFilteredUnitIds.length.toLocaleString()} selected</strong>
                <p>
                  {filteredUnits.length.toLocaleString()} Unit{filteredUnits.length === 1 ? '' : 's'} match the current filters. Changing a filter clears selection.
                </p>
              </div>
              <div className="button-row">
                <Button disabled={visibleUnits.length === 0} onClick={selectShownUnits}>
                  {visibleUnits.length > BULK_UNIT_UPDATE_LIMIT
                    ? `Select first ${BULK_UNIT_UPDATE_LIMIT.toLocaleString()} shown`
                    : `Select shown (${visibleUnits.length.toLocaleString()})`}
                </Button>
                <Button disabled={filteredUnits.length === 0 || filteredUnits.length > BULK_UNIT_UPDATE_LIMIT} onClick={selectAllMatches}>
                  Select all matches ({filteredUnits.length.toLocaleString()})
                </Button>
                <Button disabled={selectedFilteredUnitIds.length === 0} onClick={() => setSelectedUnitIds(new Set())} variant="ghost">
                  Clear
                </Button>
              </div>
              {filteredUnits.length > BULK_UNIT_UPDATE_LIMIT ? (
                <small>Narrow the filters to {BULK_UNIT_UPDATE_LIMIT.toLocaleString()} or fewer Units before selecting all matches.</small>
              ) : null}
            </div>
            <BulkUnitUpdatePanel
              data={data}
              selectedUnitIds={selectedFilteredUnitIds}
              setData={setData}
              onComplete={closeBulkMode}
            />
          </div>
        ) : null}
        {hiddenUnitCount > 0 ? (
          <div className="unit-list-limit">
            <div>
              <strong>{hiddenUnitCount} more matched units are hidden for speed.</strong>
              <p>Use building, floor, status, or search filters to narrow the list before field updates.</p>
            </div>
            <Button onClick={() => setVisibleUnitLimit((current) => current + UNIT_RENDER_STEP)}>Show 100 more</Button>
          </div>
        ) : null}
        <div className="compact-unit-grid">
          {visibleUnits.map((unit) => {
            const projection = unitCardById.get(unit.id);
            if (!projection) return null;
            const isSelected = selectedUnitIds.has(unit.id);
            return (
              <CompactUnitCard
                key={unit.id}
                projection={projection}
                isBulkMode={isBulkMode}
                isSelected={isSelected}
                onOpen={() => onNavigate('unitDetail', unit.id)}
                onToggleSelection={() => toggleUnitSelection(unit.id)}
              />
            );
          })}
        </div>
      </Section>

      <details className="turnboard-tools">
        <summary><Filter size={18} aria-hidden="true" /> Board tools, overview, and setup</summary>
        <div className="turnboard-tools__content">
          <Section title="Building Overview" kicker="Personal progress by area">
            <div className="building-grid">
              {buildings.map((building) => {
                const summary = getBuildingSummary(building, data.floors, units, issues);
                return (
                  <article className="building-card" key={building.id}>
                    <div className="building-card__top">
                      <div><h3>{building.name}</h3><small>{summary.units.length} units</small></div>
                      <StatusBadge value={`${summary.percentComplete}%`} />
                    </div>
                    <ProgressBar value={summary.percentComplete} label="Personal Ready state" />
                    <div className="mini-metrics">
                      <span>{summary.ready} personal ready</span>
                      <span>{summary.inProgress} active</span>
                      <span>{summary.blocked} blocked</span>
                      <span>{summary.openIssues} issues</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>

      <Section title="Quick Unit Creation" kicker="Setup tool" action={<Filter size={18} aria-hidden="true" />}>
        <div className="form-card">
          <div className="grid three">
            <Field label="Building name">
              <input value={quickBuilding} onChange={(event) => setQuickBuilding(event.target.value)} />
            </Field>
            <Field label="Floors">
              <input value={quickFloors} onChange={(event) => setQuickFloors(event.target.value)} placeholder="1-5" />
            </Field>
            <Field label="First unit">
              <input inputMode="numeric" value={quickStart} onChange={(event) => setQuickStart(event.target.value)} />
            </Field>
            <Field label="Units per floor">
              <NumberInput min={1} value={quickCount} onValueChange={setQuickCount} />
            </Field>
            <Field label="Beds per unit">
              <NumberInput min={0} value={quickBeds} onValueChange={setQuickBeds} />
            </Field>
            <Field label="Baths per unit">
              <NumberInput min={0} value={quickBaths} onValueChange={setQuickBaths} />
            </Field>
          </div>
          <Button variant="primary" onClick={quickCreate}>
            <Plus size={18} aria-hidden="true" />
            Create Units
          </Button>
        </div>
      </Section>
        </div>
      </details>
    </div>
  );
}
