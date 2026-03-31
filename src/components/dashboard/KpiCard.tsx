'use client'

import { useEffect, useState, useRef } from 'react'
import { Activity } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  unit?: string
  live?: boolean
}

export default function KpiCard({ label, value, icon, trend = 'neutral', unit, live = false }: KpiCardProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) {
      setIsAnimating(true)
      setDisplayValue(value)
      prevValue.current = value
      setTimeout(() => setIsAnimating(false), 500)
    }
  }, [value])

  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-gray-400'
  }

  return (
    <div className="bg-secondary p-4 rounded-lg border border-gray-700 relative overflow-hidden">
      {live && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-highlight opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-highlight"></span>
          </span>
          <span className="text-xs text-gray-500">LIVE</span>
        </div>
      )}
      
      <div className="flex items-center gap-3">
        {icon && (
          <div className="text-highlight">
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className={`text-2xl font-bold transition-all duration-300 ${isAnimating ? 'scale-105 text-highlight' : ''}`}>
            {typeof displayValue === 'number' ? displayValue.toLocaleString() : displayValue}
            {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
          </p>
          {trend !== 'neutral' && (
            <p className={`text-xs ${trendColors[trend]}`}>
              {trend === 'up' ? '↑' : '↓'} trend
            </p>
          )}
        </div>
      </div>
    </div>
  )
}