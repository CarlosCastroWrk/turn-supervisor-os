import { AlertTriangle, CheckCircle2, Filter, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { ProgressBar } from '../components/ProgressBar';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { createId, nowISO } from '../lib/constants';
import { addUnits, unitTradesComplete, updateUnit } from '../lib/actions';
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
import type { AppData, AppView, Building, Floor, Unit } from '../types';

interface UnitsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: (view: AppView, unitId?: string) => void;
}

const statusFilters = ['All', 'Blocked', 'Ready', 'Not Started', 'In Progress', 'Needs Inspection'] as const;
type StatusFilter = (typeof statusFilters)[number];

const matchesStatusFilter = (unit: Unit, filter: StatusFilter) => {
  if (filter === 'All') return true;
  if (filter === 'Blocked') return isBlockedUnit(unit);
  if (filter === 'Ready') return isReadyUnit(unit);
  if (filter === 'Not Started') return unit.overallStatus === 'Not Started';
  if (filter === 'In Progress') return isInProgressUnit(unit);
  return isInspectionUnit(unit);
};

const floorSort = (a: Floor, b: Floor) => a.name.localeCompare(b.name, undefined, { numeric: true });
const unitSort = (a: Unit, b: Unit) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });

export function UnitsView({ data, setData, onNavigate }: UnitsViewProps) {
  const [buildingFilter, setBuildingFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [query, setQuery] = useState('');
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

  const filteredUnits = units
    .filter((unit) => buildingFilter === 'All' || unit.buildingId === buildingFilter)
    .filter((unit) => floorFilter === 'All' || unit.floorId === floorFilter)
    .filter((unit) => matchesStatusFilter(unit, statusFilter))
    .filter((unit) => unit.unitNumber.toLowerCase().includes(query.toLowerCase()))
    .sort(unitSort);

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
        newFloors.push({ id: floorId, buildingId, name: `Floor ${floorNumber}`, notes: '' });
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
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              {statusFilters.map((filter) => (
                <option key={filter}>{filter}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Units" kicker={`${filteredUnits.length} shown`}>
        <div className="unit-grid">
          {filteredUnits.map((unit) => {
            const unitIssues = issues.filter((issue) => issue.unitId === unit.id && !['Closed', 'Resolved'].includes(issue.status));
            return (
              <article className="unit-card" key={unit.id}>
                <button className="unit-card__main" type="button" onClick={() => onNavigate('unitDetail', unit.id)}>
                  <div>
                    <span className="quiet-label">Unit</span>
                    <h3>{unit.unitNumber}</h3>
                    <small>
                      {unit.bedCount} beds · {unit.bathroomCount} baths
                    </small>
                  </div>
                  <StatusBadge value={unit.overallStatus} />
                </button>

                <div className="unit-card__statuses">
                  <span>Paint: {unit.paintStatus}</span>
                  <span>Clean: {unit.cleanStatus}</span>
                  <span>Repair: {unit.repairStatus}</span>
                  <span>Inspect: {unit.inspectionStatus}</span>
                </div>

                <div className="unit-card__footer">
                  <span className={unitIssues.length > 0 ? 'issue-count issue-count--hot' : 'issue-count'}>
                    {unitIssues.length > 0 ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
                    {unitIssues.length} issue(s)
                  </span>
                  <small>{new Date(unit.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                </div>

                <div className="quick-status-row">
                  <Button
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
                    Paint done
                  </Button>
                  <Button
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
                    Clean done
                  </Button>
                  <Button
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
              <input min={1} type="number" value={quickCount} onChange={(event) => setQuickCount(Number(event.target.value))} />
            </Field>
            <Field label="Beds per unit">
              <input min={0} type="number" value={quickBeds} onChange={(event) => setQuickBeds(Number(event.target.value))} />
            </Field>
            <Field label="Baths per unit">
              <input min={0} type="number" value={quickBaths} onChange={(event) => setQuickBaths(Number(event.target.value))} />
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

