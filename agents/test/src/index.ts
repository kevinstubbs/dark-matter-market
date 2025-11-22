import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

// Load environment variables - check multiple locations
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try test directory first, then project root
const testEnvPath = resolve(__dirname, '../.env.local');

if (existsSync(testEnvPath)) {
  config({ path: testEnvPath });
} else {
  // Fall back to default dotenv behavior (current directory + .env)
  config();
}

console.log('Environment variables loaded:', process.env);
import { scenarios, runScenario } from './scenarios.js';

async function runAllTests() {
  console.log('Starting Agent Negotiation Sandbox Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    console.log(`\nTest: ${scenario.name}`);
    console.log(`   Proposal: ${scenario.proposal.title}`);
    console.log(`   Expected: ${scenario.expectedOutcome}`);
    
    try {
      const result = await runScenario(scenario);
      
      if (result.passed) {
        console.log(`   PASSED - Actual: ${result.actualOutcome}`);
        passed++;
      } else {
        console.log(`   FAILED - Expected: ${scenario.expectedOutcome}, Actual: ${result.actualOutcome}`);
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
        failed++;
      }
    } catch (error) {
      console.log(`   ERROR: ${error}`);
      failed++;
    }
  }
  
  console.log(`\n\nTest Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${scenarios.length}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

