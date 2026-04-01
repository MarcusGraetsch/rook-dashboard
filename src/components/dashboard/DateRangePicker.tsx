'use client'

import { useState, useEffect, useRef } from 'react'
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

export type Preset = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const presets: { label: string; value: Preset }[] = [
  { label: 'Letzte 7 Tage', value: '7d' },
  { label: 'Letzte 30 Tage', value: '30d' },
  { label: 'Letzte 90 Tage', value: '90d' },
  { label: 'Dieser Monat', value: 'this_month' },
  { label: 'Letzter Monat', value: 'last_month' },
  { label: 'Benutzerdefiniert', value: 'custom' },
]

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState<string>(value.from ? format(value.from, 'yyyy-MM-dd') : '')
  const [customTo, setCustomTo] = useState<string>(value.to ? format(value.to, 'yyyy-MM-dd') : '')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value.from && value.to) {
      const days = Math.ceil((value.to.getTime() - value.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (days === 7) setActivePreset('7d')
      else if (days === 30) setActivePreset('30d')
      else if (days === 90) setActivePreset('90d')
      else if (
        value.from.getMonth() === new Date().getMonth() &&
        value.from.getFullYear() === new Date().getFullYear()
      ) {
        setActivePreset('this_month')
      } else if (
        value.from.getMonth() === subMonths(new Date(), 1).getMonth() &&
        value.from.getFullYear() === subMonths(new Date(), 1).getFullYear()
      ) {
        setActivePreset('last_month')
      } else {
        setActivePreset('custom')
        setCustomFrom(format(value.from, 'yyyy-MM-dd'))
        setCustomTo(format(value.to, 'yyyy-MM-dd'))
      }
    }
  }, [value.from, value.to])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePresetClick = (preset: Preset) => {
    setActivePreset(preset)
    const today = new Date()
    
    switch (preset) {
      case '7d':
        onChange({ from: subDays(today, 6), to: today })
        break
      case '30d':
        onChange({ from: subDays(today, 29), to: today })
        break
      case '90d':
        onChange({ from: subDays(today, 89), to: today })
        break
      case 'this_month':
        onChange({ from: startOfMonth(today), to: endOfMonth(today) })
        break
      case 'last_month':
        onChange({
          from: startOfMonth(subMonths(today, 1)),
          to: endOfMonth(subMonths(today, 1))
        })
        break
      case 'custom':
        break
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const fromDate = new Date(customFrom)
      const toDate = new Date(customTo)
      if (fromDate <= toDate) {
        onChange({ from: fromDate, to: toDate })
        setIsOpen(false)
      }
    }
  }

  const formatDisplay = () => {
    if (!value.from || !value.to) return 'Zeitraum wählen'
    return `${format(value.from, 'dd.MM.yyyy')} - ${format(value.to, 'dd.MM.yyyy')}`
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-accent rounded-lg border border-gray-700 text-sm transition-colors"
      >
        <CalendarIcon className="w-4 h-4 text-gray-400" />
        <span>{formatDisplay()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-secondary rounded-lg border border-gray-700 shadow-xl p-4 min-w-[320px]">
          {/* Presets */}
          <div className="flex flex-col gap-1 mb-4">
            {presets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={`text-left px-3 py-2 rounded text-sm transition-colors ${
                  activePreset === preset.value
                    ? 'bg-highlight text-white'
                    : 'hover:bg-accent text-gray-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Range */}
          {activePreset === 'custom' && (
            <div className="border-t border-gray-700 pt-4 mt-2">
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Von</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    max={customTo || format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-3 py-2 bg-accent border border-gray-700 rounded text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Bis</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    min={customFrom}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-3 py-2 bg-accent border border-gray-700 rounded text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                className="mt-3 w-full px-3 py-2 bg-highlight hover:bg-highlight/80 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
              >
                Anwenden
              </button>
            </div>
          )}

          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-2 right-2 p-1 hover:bg-accent rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}