// Los's standard: units read TOP FLOOR FIRST everywhere in the OS — highest
// floor at the top of any list, then in unit order within each floor (1501,
// 1502, … under floor 15; floor 15 sits above floor 14). One comparator so the
// whole app agrees; change the rule here and it changes everywhere.

const floorOf = (unitNumber: string): number => {
  const digits = unitNumber.replace(/\D/g, '');
  return digits.length >= 3 ? Number.parseInt(digits.slice(0, -2), 10) || 0 : 0;
};

export const compareUnitTopFloorFirst = (a: string, b: string): number => {
  const floorA = floorOf(a);
  const floorB = floorOf(b);
  if (floorA !== floorB) return floorB - floorA; // higher floor first
  return a.localeCompare(b, undefined, { numeric: true }); // unit order within a floor
};
