'use client'

import { useState, useEffect } from 'react'
import { Folder, File } from 'lucide-react'

interface MemoryFile {
  path: string
  size: string
  modified: string
}

interface MemoryResponse {
  agent: string
  files: MemoryFile[]
  memoryContent: string
}

const agents = ['main', 'coach', 'engineer', 'researcher', 'health']

export default function MemoryPage() {
  const [selectedAgent, setSelectedAgent] = useState('main')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSelectedFile(null)
    setContent('')
    loadMemory()
  }, [selectedAgent])

  async function loadMemory() {
    setLoading(true)
    try {
      const res = await fetch(`/api/memory?agent=${selectedAgent}`)
      if (res.ok) {
        const data: MemoryResponse = await res.json()
        setFiles(data.files || [])
        setContent(data.memoryContent || '')
      }
    } catch (e) {
      console.error('Failed to load memory:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadFile(path: string) {
    try {
      const res = await fetch(`/api/memory?agent=${selectedAgent}&path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json()
        setContent(data.content || '')
        setSelectedFile(path)
      }
    } catch (e) {
      console.error('Failed to load file:', e)
    }
  }

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
      
      {loading ? (
        <p className="text-gray-400">Laden...</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* File Tree */}
          <div className="bg-secondary rounded-lg border border-gray-700 p-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <Folder className="w-4 h-4" />
              Files
            </h3>
            <div className="space-y-1">
              {files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => loadFile(file.path)}
                  className={`w-full text-left px-2 py-1 rounded flex items-center gap-2 ${
                    selectedFile === file.path ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <File className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">{file.path}</span>
                  <span className="text-xs text-gray-500 ml-auto">{file.modified}</span>
                </button>
              ))}
              {files.length === 0 && (
                <p className="text-gray-500 text-sm">Keine Dateien gefunden</p>
              )}
            </div>
          </div>
          
          {/* Preview */}
          <div className="col-span-2 bg-secondary rounded-lg border border-gray-700 p-4">
            <h3 className="font-bold mb-3">Preview</h3>
            {content ? (
              <pre className="text-sm font-mono text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap">
                {content}
              </pre>
            ) : (
              <p className="text-gray-400">Wähle eine Datei zum Anzeigen</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}