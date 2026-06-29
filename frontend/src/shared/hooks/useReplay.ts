// =====================================================================
// shared/hooks/useReplay.ts —— 幽灵回放（Ghost Replay）
// =====================================================================
// 进入应用时自动"演"一段录好的对话，让看 demo 的人立刻看到：
//   AI 流式打字 → K线图自动绘制 → 下单面板弹出 → 订单进左侧列表
//
// 原理：读 public/replay.json（真实后端录制的 SSE 事件流），
//   按时间戳重放给 useChat 的状态机。所有真实组件零改动地动起来。
//
// 状态机：
//   idle    初始 / 已清空，消息列表干净
//   playing 正在播放演示
//   done    演完了，演示消息仍保留（供回看），等待用户接管
// 任何 playing/done 状态下用户首次真实发送 → 调 reset() 清空演示。
//
// 节奏：SPEED < 1 放慢演示；关键交互（elicit/场景切换）有专门停顿。
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

// ── 节奏控制 ──────────────────────────────────────
// 演示减速因子：<1 放慢，>1 加快。0.7 ≈ 比真实流式慢 40%，看得清。
const SPEED = 0.7
// elicit（下单面板）弹出后停顿，让看的人看清确认交互
const ELICIT_PAUSE = 4000
// 场景之间停顿，让人消化每一幕
const SCENE_GAP = 2500

export type ReplayPhase = 'idle' | 'playing' | 'done'

export interface UseReplayResult {
  phase: ReplayPhase
  /** @deprecated 用 phase，保留向后兼容 */
  replaying: boolean
  sceneIndex: number              // 当前第几幕（0-based），-1 表示未开始
  sceneLabel: string              // 当前幕的能力名，如"自然语言下单"
  sceneCount: number
  start: () => void
  stop: () => void                // 停止播放，但保留 done 语义（不清消息）
  reset: () => void               // 彻底重置到 idle（清空由 useChat.clearMessages 负责）
}

export function useReplay(onEvent: (ev: SSEEvent) => void): UseReplayResult {
  const [phase, setPhase] = useState<ReplayPhase>('idle')
  const [sceneIndex, setSceneIndex] = useState(-1)
  const [sceneLabel, setSceneLabel] = useState('')

  const dataRef = useRef<ReplayData | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  // 停止播放。如果之前在播，进入 done（消息保留供回看）。
  const stop = useCallback(() => {
    clearTimers()
    setPhase((prev) => (prev === 'playing' ? 'done' : prev))
  }, [clearTimers])

  // 彻底重置到 idle。配合 useChat.clearMessages() 使用。
  const reset = useCallback(() => {
    clearTimers()
    setPhase('idle')
    setSceneIndex(-1)
    setSceneLabel('')
  }, [clearTimers])

  const schedule = useCallback((delay: number, fn: () => void) => {
    const t = setTimeout(fn, delay)
    timersRef.current.push(t)
  }, [])

  const playScene = useCallback(
    (scene: ReplayScene) => {
      const events = scene.events
      if (events.length === 0) return

      const firstT = events[0].t

      for (const e of events) {
        // 应用减速因子：事件在 (t-firstT)/SPEED 时触发
        const delay = Math.max(0, (e.t - firstT) / SPEED)
        schedule(delay, () => {
          const ev = { event: e.event, data: e.data } as SSEEvent
          onEventRef.current(ev)

          // elicit 事件：下单面板弹出后，停顿让看的人看清，再"自动确认"
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

    setPhase('playing')
    clearTimers()

    let cursor = 0
    scenes.forEach((scene, idx) => {
      const sceneDuration =
        scene.events.length > 0
          ? (scene.events[scene.events.length - 1].t - scene.events[0].t) / SPEED
          : 0
      const sceneStart = cursor

      // 场景开始：切标签 + 开槽位（user + streaming assistant）
      schedule(sceneStart, () => {
        setSceneIndex(idx)
        setSceneLabel(scene.label)
        onEventRef.current({
          event: '__replay_new_turn',
          data: { prompt: scene.prompt },
        } as unknown as SSEEvent)
      })
      // 稍后逐事件重放
      schedule(sceneStart + 400, () => playScene(scene))

      cursor += sceneDuration + ELICIT_PAUSE + SCENE_GAP
    })

    // 全部演完 → done（消息保留，等用户接管）
    schedule(cursor + 800, () => {
      setPhase('done')
      setSceneIndex(-1)
    })
  }, [clearTimers, playScene, schedule])

  // 卸载时清理
  useEffect(() => () => clearTimers(), [clearTimers])

  return {
    phase,
    replaying: phase === 'playing',
    sceneIndex,
    sceneLabel,
    sceneCount: dataRef.current?.scenes.length ?? 0,
    start,
    stop,
    reset,
  }
}
