'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import * as d3 from 'd3'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface TimelineData {
  years: number[]
  total: { year: number; value: number }[]
}

interface GraphNode {
  id: number
  name: string
  group: string
  color: string
  size: number
  peak: number
  keywords: string[]
}

interface GraphLink {
  source: number
  target: number
  weight: number
  shared: string[]
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export default function FacebookCorpusPage() {
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/data/phase8_3_timeline_data.json')
      .then((r) => r.json())
      .then((d) => setTimelineData(d))
      .catch(console.error)

    fetch('/data/phase8_3_graph_data.json')
      .then((r) => r.json())
      .then((d) => setGraphData(d))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!graphData || !graphRef.current) return

    const container = graphRef.current
    container.innerHTML = ''

    const width = container.clientWidth
    const height = 500

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    const simulation = d3
      .forceSimulation(graphData.nodes as any)
      .force(
        'link',
        d3
          .forceLink(graphData.links as any)
          .id((d: any) => d.id)
          .strength((d: any) => d.weight * 0.02)
      )
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2))

    const link = svg
      .append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter()
      .append('line')
      .attr('stroke', '#4a5568')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', (d) => Math.sqrt(d.weight))

    const node = svg
      .append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .enter()
      .append('g')
      .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended) as any)

    node
      .append('circle')
      .attr('r', (d) => Math.sqrt(d.size) * 2)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    node
      .append('text')
      .text((d) => d.name)
      .attr('x', 0)
      .attr('y', (d) => Math.sqrt(d.size) * 2 + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e0e0e0')
      .attr('font-size', '10px')
      .style('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event: any, d: any) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    return () => {
      simulation.stop()
    }
  }, [graphData])

  const chartData = timelineData
    ? {
        labels: timelineData.total.map((d) => d.year.toString()),
        datasets: [
          {
            label: 'Facebook Posts',
            data: timelineData.total.map((d) => d.value),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
          },
        ],
      }
    : null

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Facebook Corpus — Posts pro Jahr',
        color: '#e0e0e0',
      },
    },
    scales: {
      x: {
        ticks: { color: '#a0a0a0' },
        grid: { color: '#333' },
      },
      y: {
        ticks: { color: '#a0a0a0' },
        grid: { color: '#333' },
      },
    },
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-[#e0e0e0]">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">📘 Facebook Corpus</h1>
        <p className="text-gray-400 mb-8">
          Timeline und Topic-Netzwerk aus dem Facebook-Datenkorpus
        </p>

        {chartData && (
          <div className="mb-8 bg-[#16213e] p-4 rounded-lg">
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}

        <div className="bg-[#16213e] p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Topic-Netzwerk</h2>
          <div ref={graphRef} className="w-full" />
        </div>
      </div>
    </div>
  )
}
