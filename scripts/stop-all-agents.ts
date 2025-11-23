#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function stopAllAgents() {
  console.log('Stopping all agent processes...\n');

  try {
    // Find all node processes running agent index.js files
    // This matches processes like: node dist/index.js configs/buyer_1.json
    const { stdout } = await execAsync(
      "ps aux | grep 'node.*dist/index.js.*configs/' | grep -v grep"
    );

    if (!stdout.trim()) {
      console.log('No running agent processes found.');
      return;
    }

    const lines = stdout.trim().split('\n');
    const pids: number[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1], 10);
      if (!isNaN(pid)) {
        pids.push(pid);
        // Extract agent info from the command line
        const match = line.match(/configs\/(\w+_\d+)\.json/);
        const agentId = match ? match[1] : `pid-${pid}`;
        console.log(`Found agent: ${agentId} (PID: ${pid})`);
      }
    }

    if (pids.length === 0) {
      console.log('No valid agent processes found.');
      return;
    }

    console.log(`\nSending SIGTERM to ${pids.length} agent process(es)...`);

    // Send SIGTERM to all processes
    const killPromises = pids.map(async (pid) => {
      try {
        await execAsync(`kill -TERM ${pid}`);
        return { pid, success: true };
      } catch (error) {
        console.error(`Failed to terminate PID ${pid}:`, error);
        return { pid, success: false };
      }
    });

    await Promise.all(killPromises);

    // Wait a bit for graceful shutdown
    console.log('Waiting for graceful shutdown...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if any processes are still running and force kill if needed
    const { stdout: remainingStdout } = await execAsync(
      "ps aux | grep 'node.*dist/index.js.*configs/' | grep -v grep"
    );

    if (remainingStdout.trim()) {
      const remainingLines = remainingStdout.trim().split('\n');
      const remainingPids: number[] = [];

      for (const line of remainingLines) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1], 10);
        if (!isNaN(pid)) {
          remainingPids.push(pid);
        }
      }

      if (remainingPids.length > 0) {
        console.log(`\nForce killing ${remainingPids.length} process(es) that did not terminate gracefully...`);
        for (const pid of remainingPids) {
          try {
            await execAsync(`kill -KILL ${pid}`);
            console.log(`Force killed PID ${pid}`);
          } catch (error) {
            console.error(`Failed to force kill PID ${pid}:`, error);
          }
        }
      }
    }

    console.log('\nAll agent processes stopped.');
  } catch (error: any) {
    if (error.code === 1 && error.message.includes('grep')) {
      // grep returns exit code 1 when no matches found
      console.log('No running agent processes found.');
    } else {
      console.error('Error stopping agents:', error);
      process.exit(1);
    }
  }
}

stopAllAgents();


