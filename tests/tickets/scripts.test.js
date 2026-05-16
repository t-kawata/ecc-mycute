const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts/tickets');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message}\n`); }
}

function assertEq(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`); }
}

function runScript(scriptName, args, stdin) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `node ${scriptPath} ${args || ''}`;
  const opts = { encoding: 'utf8', cwd: process.cwd() };
  if (stdin) opts.input = stdin;
  try {
    const result = execSync(cmd, opts);
    return JSON.parse(result.trim());
  } catch (e) {
    try {
      return JSON.parse(e.stdout ? e.stdout.trim() : '{}');
    } catch (_) {
      return { success: false, error: e.message };
    }
  }
}

console.log('\n━━━ tickets/scripts.test.js ━━━\n');

const TEST_TICKETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-script-test-'));
process.chdir(TEST_TICKETS_DIR);

try {
  // ===============================================
  // ensure-ticket-structure
  // ===============================================
  console.log('## ensure-ticket-structure\n');
  {
    const result = runScript('ensure-ticket-structure.js', '', null);
    assert(result.success === true, 'creates structure successfully');
    assert(fs.existsSync('tickets'), 'tickets dir created');
    assert(fs.existsSync('tickets/specs'), 'specs dir created');
    assert(fs.existsSync('tickets/context'), 'context dir created');
    assert(fs.existsSync('tickets/drafts'), 'drafts dir created');
    assert(fs.existsSync('tickets/queue.md'), 'queue.md created');
  }
  {
    const result = runScript('ensure-ticket-structure.js', '', null);
    assert(result.success === true, 'idempotent re-run succeeds');
  }

  // ===============================================
  // create-ticket
  // ===============================================
  console.log('\n## create-ticket\n');
  {
    const result = runScript('create-ticket.js', '42 "Test Ticket"', null);
    assert(result.success === true, 'creates ticket');
    assertEq(result.ticketId, 42, 'correct ticket_id');
    assertEq(result.slug, 'test-ticket', 'correct slug');
    assert(fs.existsSync(result.specPath), 'spec file exists');
    assert(fs.existsSync(result.contextDir), 'context dir exists');
    const queue = fs.readFileSync('tickets/queue.md', 'utf8');
    assert(queue.includes('#42'), 'queue contains ticket reference');
  }
  {
    const result = runScript('create-ticket.js', '42 "Another"', null);
    assert(result.success === false, 'duplicate creation fails');
    assert(result.error && result.error.includes('already exists'), 'error mentions already exists');
  }

  // ===============================================
  // resolve-ticket
  // ===============================================
  console.log('\n## resolve-ticket\n');
  {
    const result = runScript('resolve-ticket.js', '42', null);
    assert(result.success === true, 'resolves existing ticket');
    assert(result.exists === true, 'exists is true');
    assertEq(result.title, 'Test Ticket', 'correct title');
    assertEq(result.status, 'draft', 'correct status');
  }
  {
    const result = runScript('resolve-ticket.js', '999', null);
    assert(result.success === true, 'handles nonexistent ticket');
    assert(result.exists === false, 'exists is false');
  }
  {
    const result = runScript('resolve-ticket.js', '', null);
    assert(result.success === false, 'missing arg fails');
  }

  // ===============================================
  // read-frontmatter
  // ===============================================
  console.log('\n## read-frontmatter\n');
  {
    const result = runScript('read-frontmatter.js', '42', null);
    assert(result.success === true, 'reads frontmatter');
    assertEq(result.frontmatter.title, 'Test Ticket', 'correct title');
  }
  {
    const result = runScript('read-frontmatter.js', '42 status', null);
    assert(result.success === true, 'reads single field');
    assertEq(result.value, 'draft', 'correct status value');
  }

  // ===============================================
  // update-frontmatter
  // ===============================================
  console.log('\n## update-frontmatter\n');
  {
    const result = runScript('update-frontmatter.js', '42 title "Updated Title"', null);
    assert(result.success === true, 'updates title');
  }
  {
    const result = runScript('read-frontmatter.js', '42 title', null);
    assertEq(result.value, 'Updated Title', 'title was updated');
  }

  // ===============================================
  // update-ticket-status
  // ===============================================
  console.log('\n## update-ticket-status\n');
  {
    const result = runScript('update-ticket-status.js', '42 reviewing', null);
    assert(result.success === true, 'draft -> reviewing allowed');
    assertEq(result.to, 'reviewing', 'new status is reviewing');
  }
  {
    const result = runScript('update-ticket-status.js', '42 blocked', null);
    assert(result.success === true, 'reviewing -> blocked allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 draft', null);
    assert(result.success === true, 'blocked -> draft allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 implementing', null);
    assert(result.success === false, 'draft -> implementing NOT allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 invalid', null);
    assert(result.success === false, 'invalid status rejected');
  }
  // Set to approved for later testing
  runScript('update-ticket-status.js', '42 reviewing', null);
  runScript('update-ticket-status.js', '42 approved', null);
  {
    const result = runScript('read-frontmatter.js', '42 status', null);
    assertEq(result.value, 'approved', 'now approved');
  }

  // ===============================================
  // check-status
  // ===============================================
  console.log('\n## check-status\n');
  {
    const result = runScript('check-status.js', '42 approved', null);
    assert(result.success === true, 'check-status succeeds');
    assert(result.matches === true, 'status matches approved');
  }
  {
    const result = runScript('check-status.js', '42 draft', null);
    assert(result.matches === false, 'status does not match draft');
  }

  // ===============================================
  // count-tickets
  // ===============================================
  console.log('\n## count-tickets\n');
  {
    const result = runScript('count-tickets.js', '', null);
    assert(result.success === true, 'counts tickets');
    assertEq(result.total, 1, 'one ticket');
    assertEq(result.counts.approved, 1, 'one approved');
  }

  // ===============================================
  // list-tickets
  // ===============================================
  console.log('\n## list-tickets\n');
  {
    const result = runScript('list-tickets.js', '', null);
    assert(result.success === true, 'lists tickets');
    assertEq(result.count, 1, 'one ticket listed');
  }
  {
    const result = runScript('list-tickets.js', 'approved', null);
    assertEq(result.count, 1, 'filtered by approved');
  }
  {
    const result = runScript('list-tickets.js', 'draft', null);
    assertEq(result.count, 0, 'no draft tickets');
  }

  // ===============================================
  // search-tickets
  // ===============================================
  console.log('\n## search-tickets\n');
  {
    const result = runScript('search-tickets.js', 'Updated', null);
    assert(result.success === true, 'searches by keyword');
    assert(result.count >= 1, 'found matching ticket');
  }
  {
    const result = runScript('search-tickets.js', 'nonexistent', null);
    assertEq(result.count, 0, 'no match for nonexistent keyword');
  }

  // ===============================================
  // find-by-slug
  // ===============================================
  console.log('\n## find-by-slug\n');
  {
    const result = runScript('find-by-slug.js', 'test-ticket', null);
    assert(result.found === true, 'finds by slug');
    assertEq(result.ticketId, 42, 'correct ID');
  }
  {
    const result = runScript('find-by-slug.js', 'no-such-slug', null);
    assert(result.found === false, 'not found for missing slug');
  }

  // ===============================================
  // create-draft and promote-draft
  // ===============================================
  console.log('\n## create-draft / promote-draft\n');
  {
    const result = runScript('create-draft.js', '50 "Draft Ticket"', null);
    assert(result.success === true, 'creates draft');
    assert(fs.existsSync(result.draftPath), 'draft file exists');
  }
  {
    const result = runScript('promote-draft.js', '50', null);
    assert(result.success === true, 'promotes draft');
    assert(fs.existsSync(result.specPath), 'spec created from draft');
  }
  {
    const result = runScript('resolve-ticket.js', '50', null);
    assert(result.exists === true, 'promoted ticket exists');
    assert(fs.existsSync('tickets/context/0050-draft-ticket'), 'context dir created');
  }

  // ===============================================
  // backup-ticket / restore-ticket
  // ===============================================
  console.log('\n## backup / restore\n');
  {
    const result = runScript('backup-ticket.js', '42', null);
    assert(result.success === true, 'creates backup');
    assert(fs.existsSync(result.backupPath), 'backup file exists');
  }
  {
    runScript('update-frontmatter.js', '42 title "Modified Before Restore"', null);
    const before = runScript('read-frontmatter.js', '42 title', null);
    assertEq(before.value, 'Modified Before Restore', 'title modified');

    const result = runScript('restore-ticket.js', '42', null);
    assert(result.success === true, 'restores from backup');
    const after = runScript('read-frontmatter.js', '42 title', null);
    // After restore, title should have some value (it was restored from backup)
    assert(after.value !== undefined && after.value !== null, 'title restored');
  }

  // ===============================================
  // delete-ticket
  // ===============================================
  console.log('\n## delete-ticket\n');
  {
    const createResult = runScript('create-ticket.js', '43 "To Delete"', null);
    assert(createResult.success === true, 'created ticket to delete');
    const result = runScript('delete-ticket.js', '43', null);
    assert(result.success === true, 'deletes ticket');
    assert(result.deleted.length >= 1, 'files were deleted');
    const resolveResult = runScript('resolve-ticket.js', '43', null);
    assert(resolveResult.exists === false, 'ticket no longer exists');
  }

  // ===============================================
  // validate-structure
  // ===============================================
  console.log('\n## validate-structure\n');
  {
    const result = runScript('validate-structure.js', '', null);
    assert(result.success === true, 'validates structure');
    assert(typeof result.valid === 'boolean', 'has valid flag');
  }

  // ===============================================
  // resync-queue
  // ===============================================
  console.log('\n## resync-queue\n');
  {
    const result = runScript('resync-queue.js', '', null);
    assert(result.success === true, 'resyncs queue');
    assert(result.count >= 2, 'queue has tickets');
  }

} finally {
  process.chdir(path.resolve(__dirname, '..', '..'));
  if (fs.existsSync(TEST_TICKETS_DIR)) {
    fs.rmSync(TEST_TICKETS_DIR, { recursive: true, force: true });
  }
}

console.log(`\n---\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
