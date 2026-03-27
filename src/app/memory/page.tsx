'use client'

import { useState } from 'react'
import { Folder, File, ChevronRight, ChevronDown } from 'lucide-react'

const memoryFiles = [
  { path: 'MEMORY.md', size: '4.7KB', modified: '2026-03-27' },
  { path: 'memory/2026-03-27.md', size: '863B', modified: '2026-03-27' },
  { path: 'memory/2026-03-26.md', size: '2.1KB', modified: '2026-03-26' },
  { path: 'memory/2026-03-25.md', size: '1.5KB', modified: '2026-03-25' },
  { path: 'memory/2026-03-24.md', size: '928B', modified: '2026-03-24' },
]

const agents = ['main', 'coach', 'engineer', 'researcher', 'health']
const [selectedAgent, setSelectedAgent] = useState('main')
const [selectedFile, setSelectedFile] = useState<string | null>(null)

export default function MemoryPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Memory Browser</h2>
      
      {/* Agent Selector */}
      <div className="flex gap-2">
        {agents.map((agent) => (
          <button
            key={agent}
            onClick={() => setSelectedAgent(agent)}
            className={`px-4 py-2 rounded-lg ${
              selectedAgent === agent 
                ? 'bg-highlight text-white' 
                : 'bg-secondary hover:bg-accent'
            }`}
          >
            {agent}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {/* File Tree */}
        <div className="bg-secondary rounded-lg border border-gray-700 p-4">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Folder className="w-4 h-4" />
            Files
          </h3>
          <div className="space-y-1">
            {memoryFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`w-full text-left px-2 py-1 rounded flex items-center gap-2 ${
                  selectedFile === file.path ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <File className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{file.path}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* Preview */}
        <div className="col-span-2 bg-secondary rounded-lg border border-gray-700 p-4">
          <h3 className="font-bold mb-3">Preview</h3>
          {selectedFile ? (
            <pre className="text-sm font-mono text-gray-300 overflow-auto max-h-96">
              {`# MEMORY.md - Long-Term Memory

> Kuratierte Erinnerungen. Destilliert aus täglichen Notizen.

---

## Über Marcus

### Key Context
- **Name:** Marcus Grätsch, Berlin
- **Job:** Senior Consultant IT Management @ HiSolutions AG
- **Background:** Politikwissenschaft, Marxistische Theorie

### Preferences
- Spricht Deutsch, denkt oft auf Englisch
- "Arm wie eine Kirchenmaus"
- Musik und Bier als Entspannung

---

*Letzte Aktualisierung: 2026-03-27*`}
            </pre>
          ) : (
            <p className="text-gray-400">Select a file to preview</p>
          )}
        </div>
      </div>
    </div>
  )
}
