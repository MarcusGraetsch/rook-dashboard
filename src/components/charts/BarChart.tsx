'use client'

interface BarChartProps {
  data: { date: string; tokens: number }[]
  maxValue: number
  height?: number
}

export function BarChart({ data, maxValue, height = 120 }: BarChartProps) {
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((item, i) => {
        const barHeight = maxValue > 0 ? (item.tokens / maxValue) * 100 : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col items-center justify-end" style={{ height: `${height - 24}px` }}>
              <div 
                className="w-full max-w-[40px] bg-highlight rounded-t transition-all hover:bg-highlight/80"
                style={{ height: `${Math.max(barHeight, 2)}%` }}
                title={item.tokens.toLocaleString()}
              />
            </div>
            <span className="text-xs text-gray-500">{item.date}</span>
          </div>
        )
      })}
    </div>
  )
}
