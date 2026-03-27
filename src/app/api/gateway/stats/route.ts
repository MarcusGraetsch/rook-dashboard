import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    // Get system stats
    const uptime = execSync('uptime -p 2>/dev/null || uptime').toString().trim();
    const memInfo = execSync('free -h 2>/dev/null || echo "N/A"').toString().trim();
    const diskInfo = execSync('df -h / 2>/dev/null | tail -1 | awk \'{print $2" / "$3" / "$4}\' || echo "N/A"').toString().trim();
    
    // Parse memory
    const memMatch = memInfo.match(/Mem:\s+(\S+)\s+(\S+)\s+(\S+)/);
    const memory = memMatch ? {
      total: memMatch[1],
      used: memMatch[2],
      free: memMatch[3],
    } : { total: 'N/A', used: 'N/A', free: 'N/A' };
    
    // Get CPU usage (simple)
    const cpuLoad = execSync('cat /proc/loadavg 2>/dev/null | awk \'{print $1" "$2" "$3}\' || echo "N/A"').toString().trim();
    
    return NextResponse.json({
      uptime,
      cpu: cpuLoad,
      memory,
      disk: diskInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
