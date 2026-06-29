// =====================================================================
// shared/hooks/useReplay.ts —— 幽灵回放（Ghost Replay）
// =====================================================================
// 进入应用时自动"演"一段录好的对话，让看 demo 的人立刻看到：
//   AI 流式打字 → K线图自动绘制 → 下单面板弹出 → 订单进左侧列表
//
// 原理：读 public/replay.json（真实后端录制的 SSE 事件流），
//   按时间戳重放给 useChat 的状态机。所有真实组件零改动地动起来。
//
// 交互：用户一打字/点"我来试试" → 调 stop()，回放立即停止，
//   清空演示消息，无缝切到真实交互。
//
// elicit（下单确认）特殊处理：录制时用户手动确认等了 60+ 秒，
//   回放时压缩成"用户思考 2 秒后自动接受"，避免干等。
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SSEEvent } from '@shared/types'

export interface ReplayScene {
  prompt: string
  label: string
  events: { t: number; event: string; data: unknown }[]
}

interface ReplayData {
  scenes: ReplayScene[]
}

// elicit 后模拟“用户思考”再确认的延迟（ms）
const ELICIT_PAUSE = 2500
// 场景之间的停顿（ms）
const SCENE_GAP = 1200

export interface UseReplayResult {
  replaying: boolean
  sceneIndex: number              // 当前第几幕（0-based），-1 表示未开始
  sceneCount: number
  start: () => void
  stop: () => void
}

export function useReplay(onEvent: (ev: SSEEvent) => void): UseReplayResult {
  const [replaying, setReplaying] = useState(false)
  const [sceneIndex, setSceneIndex] = useState(-1)

  const dataRef = useRef<ReplayData | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    setReplaying(false)
    setSceneIndex(-1)
  }, [clearTimers])

  const schedule = useCallback(
    (delay: number, fn: () => void) => {
      const t = setTimeout(fn, delay)
      timersRef.current.push(t)
    },
    [],
  )

  const playScene = useCallback(
    (scene: ReplayScene) => {
      const events = scene.events
      if (events.length === 0) return

      const firstT = events[0].t

      for (const e of events) {
        const delay = Math.max(0, e.t - firstT)
        schedule(delay, () => {
          const ev = { event: e.event, data: e.data } as SSEEvent
          onEventRef.current(ev)

          // elicit 事件：弹窗后模拟用户思考 → 自动点掉弹窗
          if (ev.event === 'elicit') {
            const pending = ev.data as { id: string }
            schedule(ELICIT_PAUSE, () => {
              onEventRef.current({
                event: '__replay_dismiss_elicit',
                data: { id: pending.id },
              } as unknown as SSEEvent)
            })
          }
        })
      }
    },
    [schedule],
  )

  const start = useCallback(async () => {
    // 加载回放数据（仅一次）
    if (!dataRef.current) {
      try {
        const resp = await fetch('/replay.json')
        dataRef.current = (await resp.json()) as ReplayData
      } catch {
        console.warn('[replay] 加载 replay.json 失败，跳过演示')
        return
      }
    }

    const scenes = dataRef.current.scenes
    if (scenes.length === 0) return

    setReplaying(true)
    clearTimers()

    let cursor = 0
    scenes.forEach((scene, idx) => {
      const sceneDuration =
        scene.events.length > 0
          ? scene.events[scene.events.length - 1].t - scene.events[0].t
          : 0
      const sceneStart = cursor

      // 场景开始：先开槽位（user + streaming assistant）
      schedule(sceneStart, () => {
        setSceneIndex(idx)
        onEventRef.current({
          event: '__replay_new_turn',
          data: { prompt: scene.prompt },
        } as unknown as SSEEvent)
      })
      // 然后逐事件重放
      schedule(sceneStart + 300, () => playScene(scene))

      cursor += sceneDuration + ELICIT_PAUSE + SCENE_GAP
    })

    // 全部演完后结束
    schedule(cursor + 1000, () => {
      setReplaying(false)
      setSceneIndex(-1)
    })
  }, [clearTimers, playScene, schedule])

  // 卸载时清理
  useEffect(() => () => clearTimers(), [clearTimers])

  return { replaying, sceneIndex, sceneCount: dataRef.current?.scenes.length ?? 0, start, stop }
}
