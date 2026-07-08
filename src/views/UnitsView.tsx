import { AlertTriangle, Brush, CheckCircle2, Filter, Hammer, Plus, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, NumberInput } from '../components/FormControls';
import { ProgressBar } from '../components/ProgressBar';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { createId, nowISO } from '../lib/constants';
import { addUnits, unitTradesComplete, updateUnit } from '../lib/actions';
import {
  getBuildingSummary,
  getProjectBuildings,
  getProjectCrewMembers,
  getProjectIssues,
  getProjectUnits,
  isBlockedUnit,
  isInProgressUnit,
  isInspectionUnit,
  isReadyUnit,
} from '../lib/metrics';
import type { AppData, AppView, Building, CrewMember, Floor, Issue, Unit, UnitStatusFilter } from '../types';

interface UnitsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: (view: AppView, unitId?: string) => void;
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
const issuePriorityWeight: Record<Issue['priority'], number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

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

const sortIssuesByFieldPriority = (a: Issue, b: Issue) => {
  const priorityDelta = issuePriorityWeight[b.priority] - issuePriorityWeight[a.priority];
  if (priorityDelta !== 0) return priorityDelta;
  return b.updatedAt.localeCompare(a.updatedAt);
};

const latestActivityAt = (unit: Unit, openIssues: Issue[]) =>
  [unit.updatedAt, ...openIssues.map((issue) => issue.updatedAt)].sort().slice(-1)[0] ?? unit.updatedAt;

const formatFieldTime = (dateTime: string) =>
  new Date(dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const blockerSummaryFor = (unit: Unit, openIssues: Issue[]) => {
  const topIssue = [...openIssues].sort(sortIssuesByFieldPriority)[0];
  if (topIssue) {
    return topIssue.title;
  }

  if (unit.overallStatus.includes('Blocked')) {
    return unit.overallStatus;
  }

  const blockedTrades = [
    unit.paintStatus === 'Blocked' ? 'paint' : undefined,
    unit.cleanStatus === 'Blocked' ? 'clean' : undefined,
    unit.repairStatus === 'Blocked' ? 'repair' : undefined,
    unit.trashStatus === 'Blocked' ? 'trash' : undefined,
  ].filter(Boolean);

  return blockedTrades.length > 0 ? `${blockedTrades.join(', ')} blocked` : 'No open issue';
};

const crewSummaryFor = (unit: Unit, crewById: Map<string, CrewMember>) => {
  const names = unit.assignedCrewIds.map((crewId) => crewById.get(crewId)?.name).filter((name): name is string => Boolean(name));
  if (names.length === 0) return 'No crew assigned';
  if (names.length === 1) return names[0];
  return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
};

export function UnitsView({ data, setData, onNavigate, initialStatusFilter = 'All' }: UnitsViewProps) {
  const [buildingFilter, setBuildingFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>(initialStatusFilter);
  const [query, setQuery] = useState('');
  const [visibleUnitLimit, setVisibleUnitLimit] = useState(UNIT_RENDER_STEP);
  const [quickBuilding, setQuickBuilding] = useState('Building B');
  const [quickFloors, setQuickFloors] = useState('1-2');
  const [quickStart, setQuickStart] = useState('101');
  const [quickCount, setQuickCount] = useState(4);
  const [quickBeds, setQuickBeds] = useState(3);
  const [quickBaths, setQuickBaths] = useState(2);

  const buildings = getProjectBuildings(data);
  const units = getProjectUnits(data);
  const issues = getProjectIssues(data);
  const crewMembers = getProjectCrewMembers(data);
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

  const crewById = useMemo(() => new Map(crewMembers.map((crew) => [crew.id, crew])), [crewMembers]);

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

  useEffect(() => {
    setVisibleUnitLimit(UNIT_RENDER_STEP);
  }, [buildingFilter, floorFilter, statusFilter, query]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

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
      window.alert('Check the quick-create inputs: Floors should look like "1" or "1-3" and First unit should be a number.');
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
      window.alert('All of those unit numbers already exist in that building. Nothing was created.');
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
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Buildings / Floors / Units</span>
          <h1>Unit Command</h1>
        </div>
      </div>

      <Section title="Building Overview" kicker="Progress by area">
        <div className="building-grid">
          {buildings.map((building) => {
            const summary = getBuildingSummary(building, data.floors, units, issues);
            return (
              <article className="building-card" key={building.id}>
                <div className="building-card__top">
                  <div>
                    <h3>{building.name}</h3>
                    <small>{summary.units.length} units</small>
                  </div>
                  <StatusBadge value={`${summary.percentComplete}%`} />
                </div>
                <ProgressBar value={summary.percentComplete} label="Ready" />
                <div className="mini-metrics">
                  <span>{summary.ready} ready</span>
                  <span>{summary.inProgress} active</span>
                  <span>{summary.blocked} blocked</span>
                  <span>{summary.openIssues} issues</span>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Filters" kicker="Find fast">
        <div className="filter-panel">
          <Field label="Search unit">
            <div className="input-with-icon">
              <Search size={17} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="101, 204..." />
            </div>
          </Field>
          <Field label="Building">
            <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
              <option>All</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor">
            <select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)}>
              <option>All</option>
              {visibleFloors.sort(floorSort).map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UnitStatusFilter)}>
              {statusFilters.map((filter) => (
                <option key={filter}>{filter}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="status-chip-row" aria-label="Unit status filters">
          {statusFilters.map((filter) => (
            <button
              aria-pressed={statusFilter === filter}
              className={`status-chip ${statusFilter === filter ? 'is-active' : ''}`}
              key={filter}
              onClick={() => setStatusFilter(filter)}
              type="button"
            >
              <span>{filter}</span>
              <strong>{statusCounts[filter]}</strong>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Units" kicker={`${visibleUnits.length} of ${filteredUnits.length} shown`}>
        {hiddenUnitCount > 0 ? (
          <div className="unit-list-limit">
            <div>
              <strong>{hiddenUnitCount} more matched units are hidden for speed.</strong>
              <p>Use building, floor, status, or search filters to narrow the list before field updates.</p>
            </div>
            <Button onClick={() => setVisibleUnitLimit((current) => current + UNIT_RENDER_STEP)}>Show 100 more</Button>
          </div>
        ) : null}
        <div className="unit-grid">
          {visibleUnits.map((unit) => {
            const unitIssues = openIssuesByUnitId.get(unit.id) ?? [];
            const hasAttention = unitIssues.length > 0 || isBlockedUnit(unit) || isInspectionUnit(unit);
            const blockerSummary = blockerSummaryFor(unit, unitIssues);
            const crewSummary = crewSummaryFor(unit, crewById);
            const latestActivity = formatFieldTime(latestActivityAt(unit, unitIssues));
            return (
              <article className={`unit-card ${hasAttention ? 'unit-card--attention' : ''}`} key={unit.id}>
                <button className="unit-card__open" type="button" onClick={() => onNavigate('unitDetail', unit.id)}>
                  <div className="unit-card__main">
                    <div>
                      <span className="quiet-label">Unit</span>
                      <h3>{unit.unitNumber}</h3>
                      <small>
                        {unit.bedCount} beds · {unit.bathroomCount} baths
                      </small>
                    </div>
                    <StatusBadge value={unit.overallStatus} />
                  </div>

                  <div className="unit-card__summary">
                    <span className={unitIssues.length > 0 || isBlockedUnit(unit) ? 'unit-card__signal is-hot' : 'unit-card__signal'}>
                      {unitIssues.length > 0 || isBlockedUnit(unit) ? (
                        <AlertTriangle size={15} aria-hidden="true" />
                      ) : (
                        <CheckCircle2 size={15} aria-hidden="true" />
                      )}
                      {blockerSummary}
                    </span>
                    <span>{crewSummary}</span>
                    <span>Updated {latestActivity}</span>
                  </div>

                  <div className="unit-card__statuses">
                    <span>Paint: {unit.paintStatus}</span>
                    <span>Clean: {unit.cleanStatus}</span>
                    <span>Repair: {unit.repairStatus}</span>
                    <span>Inspect: {unit.inspectionStatus}</span>
                  </div>

                  <div className="unit-card__footer">
                    <span className={unitIssues.length > 0 ? 'issue-count issue-count--hot' : 'issue-count'}>
                      {unitIssues.length > 0 ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
                      {unitIssues.length === 1 ? '1 open issue' : `${unitIssues.length} open issues`}
                    </span>
                    <small>Open unit</small>
                  </div>
                </button>

                <div className="quick-status-row">
                  <Button
                    className="button--compact"
                    onClick={() =>
                      setData((current) =>
                        updateUnit(
                          current,
                          unit.id,
                          { paintStatus: 'Complete', overallStatus: unit.cleanStatus === 'Complete' ? 'Inspection Needed' : 'Cleaning Ready' },
                          'Marked paint complete.',
                        ),
                      )
                    }
                  >
                    <Brush size={15} aria-hidden="true" />
                    Paint
                  </Button>
                  <Button
                    className="button--compact"
                    onClick={() =>
                      setData((current) =>
                        updateUnit(
                          current,
                          unit.id,
                          unitTradesComplete({ ...unit, cleanStatus: 'Complete' })
                            ? { cleanStatus: 'Complete', overallStatus: 'Inspection Needed', inspectionStatus: 'Ready' }
                            : { cleanStatus: 'Complete' },
                          'Marked clean complete.',
                        ),
                      )
                    }
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    Clean
                  </Button>
                  <Button
                    className="button--compact"
                    onClick={() =>
                      setData((current) =>
                        updateUnit(
                          current,
                          unit.id,
                          { repairStatus: 'Needed', overallStatus: 'Maintenance Needed' },
                          'Marked maintenance needed.',
                        ),
                      )
                    }
                  >
                    <Hammer size={15} aria-hidden="true" />
                    Repair
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Quick Unit Creation" kicker="Editable anytime" action={<Filter size={18} aria-hidden="true" />}>
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
  );
}
