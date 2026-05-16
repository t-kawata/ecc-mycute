const path = require('path');
const {
  validateTicketId,
  resolveAllPaths,
  readFrontmatterFromFile,
} = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node resolve-ticket.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }
  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: true, exists: false, ticketId }));
    return;
  }
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  console.log(JSON.stringify({
    success: true,
    exists: true,
    ticketId,
    title: attrs?.title || null,
    slug: attrs?.slug || null,
    status: attrs?.status || null,
    specPath: paths.specPath,
    contextDir: paths.contextDir,
  }));
}

if (require.main === module) main();
module.exports = { main };
