import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateJul28SourceCoverage } from '../src/features/jul28-turnboard/projections.ts';
import { jul28SyntheticTurnBoardRepository } from '../src/features/jul28-turnboard/syntheticRepository.ts';
import { projectBoardFirstBoard } from '../src/features/wave1r-board-first/projections.ts';

const shellPath = fileURLToPath(
  new URL('../src/features/wave1r-board-first/BoardFirstShell.tsx', import.meta.url),
);
const stylesheetPath = fileURLToPath(
  new URL('../src/features/wave1r-board-first/boardFirstShell.css', import.meta.url),
);

test('compact row model keeps Paint and Clean crew summaries separate without changing source coverage', () => {
  const units = jul28SyntheticTurnBoardRepository.listUnits();
  const projections = projectBoardFirstBoard(jul28SyntheticTurnBoardRepository);
  const unit602 = units.find((unit) => unit.unitNumber === '602');
  const row602 = projections.find((projection) => projection.unitNumber === '602');

  assert.ok(unit602);
  assert.ok(row602);
  assert.equal(validateJul28SourceCoverage(unit602).complete, true);
  assert.equal(row602.paint.trade, 'paint');
  assert.equal(row602.paint.crewLabel, 'Bluebird Paint');
  assert.equal(row602.paint.summaryLabel, '3/5 ready for me');
  assert.equal(row602.clean.trade, 'clean');
  assert.equal(row602.clean.crewLabel, 'Cedar Clean');
  assert.equal(row602.clean.summaryLabel, '0/5 inspected');
  assert.equal(row602.highestAttention?.blockerKind, 'occupied-or-restricted');
  assert.equal(row602.needsMe, true);
});

test('collapsed Unit component exposes one disclosure and defers section actions to expanded detail', () => {
  const shellSource = readFileSync(shellPath, 'utf8');
  const unitRowSource = shellSource.slice(
    shellSource.indexOf('const UnitRow = memo'),
    shellSource.indexOf('function TurnBoardSurface'),
  );

  assert.match(unitRowSource, /aria-label=\{`Open Unit \$\{projection\.unitNumber\}`\}/);
  assert.match(unitRowSource, /<TradeSummary trade=\{projection\.paint\} \/>/);
  assert.match(unitRowSource, /<TradeSummary trade=\{projection\.clean\} \/>/);
  assert.match(unitRowSource, />Waiting</);
  assert.match(unitRowSource, />Needs Me</);
  assert.doesNotMatch(unitRowSource, /onOpenSection|onOpenAssignment|sectionLabels|sections\.map/);

  assert.match(shellSource, /\{ id: 'blockers', label: 'Waiting' \}/);
  assert.match(shellSource, /<TradeDetail[\s\S]*onOpenSection=/);
  assert.match(shellSource, /<h3 id="w1r-blockers-title">Waiting<\/h3>/);
});

test('compact row stylesheet makes Unit brand-blue and preserves one full-width 44px-plus target', () => {
  const stylesheet = readFileSync(stylesheetPath, 'utf8');

  assert.match(stylesheet, /--w1r-blue:\s*#1268d3/);
  assert.match(
    stylesheet,
    /\.w1r-unit-row__unit strong\s*\{[\s\S]*?color:\s*var\(--w1r-blue\)/,
  );
  assert.match(
    stylesheet,
    /\.w1r-unit-row__identity\s*\{[\s\S]*?min-height:\s*96px[\s\S]*?width:\s*100%/,
  );
  assert.doesNotMatch(stylesheet, /\.w1r-unit-row__attention/);
  assert.doesNotMatch(stylesheet, /\.w1r-section-buttons/);
});
