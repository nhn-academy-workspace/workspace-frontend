import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  createGameSession, submitScore, sendBeat,
  getTopScores, getTodayTopScores, getPlayCountRanking, getTeamRanking,
  type ScoreEntry, type PlayCountEntry, type TeamScoreEntry,
} from '../api/game'
import './DinoGamePage.css'

// ── Canvas ──────────────────────────────────────────────────────────
const W = 700
const H = 200
const GROUND_Y = 155

// ── Dino ────────────────────────────────────────────────────────────
const DINO_X = 70
const DINO_W = 38
const DINO_H = 60      // full sprite height (includes legs)
const DINO_HIT = 46    // hitbox height (body only, no legs)
const DINO_DUCK_H = 30
const DINO_DUCK_W = 56

// ── Physics ─────────────────────────────────────────────────────────
const GRAVITY = 0.65
const JUMP_V = -14.5
const MAX_VY = 14

// ── Speed (15단계) ──────────────────────────────────────────────────
const STAGE_FRAMES = 600  // 단계당 스텝 (STEP_HZ=75 기준 8초, 15단계 = 120초)
const STAGE_COUNT = 15
// 1~10단계: 기존 범위, 11~15단계: 하드 모드 (속도 10 이상)
const STAGE_SPEEDS = [
  4.0, 4.8, 5.5, 6.2, 6.9,
  7.5, 8.0, 8.5, 9.0, 10.0,
  11.0, 12.0, 12.8, 13.5, 14.0,
]

// ── Timing ──────────────────────────────────────────────────────────
// 논리 시뮬레이션을 고정 스텝으로 돌려 주사율(60/75/144Hz)과 무관하게 만든다.
// STEP_HZ가 실제 게임 속도를 정하는 유일한 기준값.
const STEP_HZ = 75
const STEP_MS = 1000 / STEP_HZ
// 랙 스파이크 시 따라잡기 폭주 방지. 저사양 기기에서 게임이 실시간보다 뒤처지면
// 서버의 점수 하한 검증에 걸리므로, 10fps까지는 따라잡을 수 있게 여유를 둔다.
const MAX_STEPS = 8
const MAX_DT = 250     // 탭 비활성 복귀 등 큰 시간 갭은 버림

// ── Score ───────────────────────────────────────────────────────────
// 초당 적립 5.4점(LV.1) → 8.1점(LV.15). 서버 검증 상한(9점/초) 대비 10% 여유를
// 플레이 시간과 무관하게 항상 확보 (누적 평균은 8.1을 넘지 못함)
const SCORE_RATE = 0.072
const SCORE_SPEED_BONUS = 0.2

type GameState = 'idle' | 'playing' | 'dead'

interface Cactus {
  kind: 'cactus'
  x: number
  w: number
  h: number
  style: 1 | 2 | 3
}

interface Ptero {
  kind: 'ptero'
  x: number
  y: number
}

type Obstacle = Cactus | Ptero

function getStage(frame: number): number {
  return Math.min(STAGE_COUNT, Math.floor(frame / STAGE_FRAMES) + 1)
}

function getSpeed(frame: number): number {
  // 단계 사이를 선형 보간해 속도가 부드럽게 오름
  const stageF = Math.min(frame / STAGE_FRAMES, STAGE_COUNT - 1)
  const s = Math.floor(stageF)
  const t = stageF - s
  return STAGE_SPEEDS[s] + (STAGE_SPEEDS[Math.min(s + 1, STAGE_COUNT - 1)] - STAGE_SPEEDS[s]) * t
}

function genCactus(): Cactus {
  const r = Math.random()
  const style: 1 | 2 | 3 = r < 0.5 ? 1 : r < 0.82 ? 2 : 3
  const h = 36 + Math.floor(Math.random() * 16)
  const w = style === 1 ? 20 : style === 2 ? 42 : 62
  return { kind: 'cactus', x: W + 20, w, h, style }
}

function genPtero(): Ptero {
  // LOW (y=99): must duck, HIGH (y=53): can run under
  const y = Math.random() < 0.55 ? GROUND_Y - 56 : GROUND_Y - 102
  return { kind: 'ptero', x: W + 20, y }
}

function nextObsDelay(frame: number): number {
  const spd = getSpeed(frame)
  const minPx = Math.max(400, 850 - frame * 0.25)
  // 후반부로 갈수록 extraPx 상한이 줄어 간격이 촘촘해짐 (최대 280 → 최소 80)
  const extraMax = Math.max(80, 280 - frame * 0.09)
  const r = Math.random()
  const extraPx = r < 0.35
    ? 30 + Math.random() * 60           // 35%: 빠른 연속
    : r < 0.85
      ? 70 + Math.random() * extraMax   // 50%: 보통 (후반엔 좁아짐)
      : extraMax + Math.random() * 100  // 15%: 짧은 숨돌리기
  return (minPx + extraPx) / spd
}

// ── Draw helpers ─────────────────────────────────────────────────────

function dc(dark: boolean) { return dark ? '#d1d5db' : '#535353' }
function bg(dark: boolean) { return dark ? '#111827' : '#ffffff' }
function gc(dark: boolean) { return dark ? '#374151' : '#e5e7eb' }

function drawGround(ctx: CanvasRenderingContext2D, offset: number, dark: boolean) {
  ctx.fillStyle = dc(dark)
  ctx.fillRect(0, GROUND_Y, W, 2)
  ctx.fillStyle = gc(dark)
  for (let i = -1; i <= W / 50 + 1; i++) {
    const x = ((i * 50 - offset % 50) + 150) % (W + 50) - 50
    const w1 = 12 + ((i * 7) % 8)
    const w2 = 8 + ((i * 5) % 6)
    ctx.fillRect(x, GROUND_Y + 6, w1, 2)
    ctx.fillRect(x + 24, GROUND_Y + 13, w2, 2)
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, dark: boolean) {
  ctx.fillStyle = dark ? '#1f2937' : '#f3f4f6'
  ctx.fillRect(x + 10, y, 28, 10)
  ctx.fillRect(x, y + 6, 48, 10)
  ctx.fillRect(x + 4, y + 2, 40, 13)
}

function drawDino(
  ctx: CanvasRenderingContext2D,
  dinoTop: number,
  ducking: boolean,
  frame: number,
  dead: boolean,
  dark: boolean,
) {
  const color = dc(dark)
  ctx.fillStyle = color

  if (ducking) {
    const Y = GROUND_Y - DINO_DUCK_H
    // flat body
    ctx.fillRect(DINO_X - 8, Y, DINO_DUCK_W - 10, DINO_DUCK_H - 6)
    // head right
    ctx.fillRect(DINO_X + 22, Y - 2, 26, DINO_DUCK_H)
    // snout
    ctx.fillRect(DINO_X + 46, Y + 11, 8, 8)
    // tail
    ctx.fillRect(DINO_X - 16, Y + 10, 12, 8)
    // eye
    ctx.fillStyle = '#fff'
    ctx.fillRect(DINO_X + 34, Y + 1, 12, 12)
    ctx.fillStyle = color
    ctx.fillRect(DINO_X + 38, Y + 4, 6, 6)
    // legs
    const p = Math.floor(frame / 5) % 2
    ctx.fillRect(DINO_X, GROUND_Y - 13, 13, 13)
    if (p === 0) {
      ctx.fillRect(DINO_X + 18, GROUND_Y - 16, 13, 16)
    } else {
      ctx.fillRect(DINO_X + 18, GROUND_Y - 10, 13, 10)
    }
    return
  }

  const Y = dinoTop
  const onGround = Y >= GROUND_Y - DINO_H - 2

  // lower body
  ctx.fillRect(DINO_X, Y + 22, DINO_W, DINO_H - 36)
  // head + neck
  ctx.fillRect(DINO_X + 8, Y, DINO_W + 4, 26)
  // snout
  ctx.fillRect(DINO_X + DINO_W + 10, Y + 10, 8, 10)
  // tail
  ctx.fillRect(DINO_X - 10, Y + 24, 14, 8)
  ctx.fillRect(DINO_X - 16, Y + 30, 10, 6)
  // tiny arm
  ctx.fillRect(DINO_X + 16, Y + 26, 10, 5)

  // eye
  ctx.fillStyle = '#fff'
  ctx.fillRect(DINO_X + 28, Y + 3, 13, 13)
  if (dead) {
    ctx.fillStyle = color
    // X eyes
    ctx.fillRect(DINO_X + 30, Y + 5, 3, 3)
    ctx.fillRect(DINO_X + 35, Y + 5, 3, 3)
    ctx.fillRect(DINO_X + 30, Y + 10, 3, 3)
    ctx.fillRect(DINO_X + 35, Y + 10, 3, 3)
    ctx.fillRect(DINO_X + 32, Y + 7, 4, 3)
    ctx.fillRect(DINO_X + 32, Y + 7, 3, 4)
  } else {
    ctx.fillStyle = color
    ctx.fillRect(DINO_X + 32, Y + 6, 7, 7)
  }

  // legs
  ctx.fillStyle = color
  if (!dead && onGround) {
    const p = Math.floor(frame / 5) % 2
    if (p === 0) {
      ctx.fillRect(DINO_X + 6, GROUND_Y - 14, 13, 14)
      ctx.fillRect(DINO_X + 22, GROUND_Y - 8, 13, 8)
    } else {
      ctx.fillRect(DINO_X + 6, GROUND_Y - 8, 13, 8)
      ctx.fillRect(DINO_X + 22, GROUND_Y - 14, 13, 14)
    }
  } else if (!dead) {
    // mid-air legs back
    ctx.fillRect(DINO_X + 6, GROUND_Y - 12, 13, 8)
    ctx.fillRect(DINO_X + 22, GROUND_Y - 8, 13, 5)
  } else {
    ctx.fillRect(DINO_X + 6, GROUND_Y - 14, 13, 14)
    ctx.fillRect(DINO_X + 22, GROUND_Y - 8, 13, 8)
  }
}

function drawCactus(ctx: CanvasRenderingContext2D, obs: Cactus, dark: boolean) {
  ctx.fillStyle = dc(dark)

  if (obs.style === 1) {
    ctx.fillRect(obs.x, GROUND_Y - obs.h, 16, obs.h)
    ctx.fillRect(obs.x - 9, GROUND_Y - obs.h + 10, 9, 10)
    ctx.fillRect(obs.x - 9, GROUND_Y - obs.h + 4, 26, 8)
  } else if (obs.style === 2) {
    ctx.fillRect(obs.x, GROUND_Y - obs.h, 14, obs.h)
    ctx.fillRect(obs.x + 22, GROUND_Y - obs.h + 14, 12, obs.h - 14)
    ctx.fillRect(obs.x - 7, GROUND_Y - obs.h + 12, 7, 10)
    ctx.fillRect(obs.x - 7, GROUND_Y - obs.h + 5, 23, 8)
    ctx.fillRect(obs.x + 26, GROUND_Y - obs.h + 22, 10, 8)
  } else {
    ctx.fillRect(obs.x, GROUND_Y - obs.h, 14, obs.h)
    ctx.fillRect(obs.x + 20, GROUND_Y - obs.h + 10, 12, obs.h - 10)
    ctx.fillRect(obs.x + 40, GROUND_Y - obs.h + 18, 12, obs.h - 18)
    ctx.fillRect(obs.x - 7, GROUND_Y - obs.h + 10, 7, 10)
    ctx.fillRect(obs.x - 7, GROUND_Y - obs.h + 4, 23, 8)
    ctx.fillRect(obs.x + 44, GROUND_Y - obs.h + 26, 10, 8)
  }
}

function drawPtero(ctx: CanvasRenderingContext2D, p: Ptero, frame: number, dark: boolean) {
  ctx.fillStyle = dc(dark)
  const wingUp = Math.floor(frame / 7) % 2 === 0
  // body
  ctx.fillRect(p.x + 10, p.y + 8, 22, 12)
  // head
  ctx.fillRect(p.x + 26, p.y, 14, 12)
  // beak
  ctx.fillRect(p.x + 38, p.y + 4, 10, 5)
  // eye
  ctx.fillStyle = bg(dark)
  ctx.fillRect(p.x + 30, p.y + 1, 7, 7)
  ctx.fillStyle = dc(dark)
  ctx.fillRect(p.x + 32, p.y + 3, 4, 4)
  // wings
  if (wingUp) {
    ctx.fillRect(p.x, p.y, 42, 6)
  } else {
    ctx.fillRect(p.x, p.y + 19, 42, 6)
  }
}

// ── Component ────────────────────────────────────────────────────────

export default function DinoGamePage() {
  const { user } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [gameState, setGameState] = useState<GameState>('idle')
  const [displayScore, setDisplayScore] = useState(0)
  const [bestScore, setBestScore] = useState(() =>
    parseInt(localStorage.getItem('dino-best') || '0', 10),
  )
  const [isNewBest, setIsNewBest] = useState(false)
  // 기록 저장 상태 — 세션이 무효화되면 저장되지 않음을 알려야 한다
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  type LbTab = 'all' | 'today' | 'playcount' | 'team'
  const [lbTab, setLbTab] = useState<LbTab>('all')
  const [allScores, setAllScores] = useState<ScoreEntry[]>([])
  const [todayScores, setTodayScores] = useState<ScoreEntry[]>([])
  const [playCounts, setPlayCounts] = useState<PlayCountEntry[]>([])
  const [teamScores, setTeamScores] = useState<TeamScoreEntry[]>([])
  const [lbLoading, setLbLoading] = useState(true)

  const [dark, setDark] = useState(() => {
    const t = document.documentElement.getAttribute('data-theme')
    return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const t = document.documentElement.getAttribute('data-theme')
      setDark(t === 'dark' || (!t && mq.matches))
    }
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', sync)
    return () => { mo.disconnect(); mq.removeEventListener('change', sync) }
  }, [])

  // mutable game state (lives inside animation loop)
  const gsRef = useRef<GameState>('idle')
  const dinoTopRef = useRef(GROUND_Y - DINO_H)
  const dinoVYRef = useRef(0)
  const duckKeyRef = useRef(false)
  const obstaclesRef = useRef<Obstacle[]>([])
  const frameRef = useRef(0)
  const scoreRef = useRef(0)
  const gOffsetRef = useRef(0)
  const nextObsRef = useRef(90)
  const cloudsRef = useRef([
    { x: 160, y: 26 },
    { x: 400, y: 44 },
    { x: 620, y: 16 },
  ])
  const darkRef = useRef(dark)
  useEffect(() => { darkRef.current = dark }, [dark])
  const sessionIdRef = useRef<string>('')

  // 고정 스텝 루프용
  const lastTimeRef = useRef(0)
  const accRef = useRef(0)
  const duckingRef = useRef(false)

  // 하트비트용
  const beatIntervalRef = useRef(5000)
  const beatAccRef = useRef(0)
  const sessionInvalidRef = useRef(false)

  const loadAllLb = useCallback(() => {
    return Promise.all([
      getTopScores(),
      getTodayTopScores(),
      getPlayCountRanking(),
      getTeamRanking(),
    ]).then(([all, today, plays, teams]) => {
      setAllScores(all)
      setTodayScores(today)
      setPlayCounts(plays)
      setTeamScores(teams)
    }).catch(() => {})
  }, [])

  const refreshLb = useCallback(() => { loadAllLb() }, [loadAllLb])

  useEffect(() => {
    loadAllLb().finally(() => setLbLoading(false))
  }, [loadAllLb])

  const doStart = useCallback(() => {
    // 세션 발급 (비동기, 게임 시작은 즉시)
    sessionIdRef.current = ''
    sessionInvalidRef.current = false
    beatAccRef.current = 0
    createGameSession()
      .then(s => {
        sessionIdRef.current = s.sessionId
        beatIntervalRef.current = s.beatIntervalMs
      })
      .catch(() => { sessionInvalidRef.current = true })

    setSaveState('idle')
    gsRef.current = 'playing'
    dinoTopRef.current = GROUND_Y - DINO_H
    dinoVYRef.current = JUMP_V
    obstaclesRef.current = []
    frameRef.current = 0
    scoreRef.current = 0
    gOffsetRef.current = 0
    nextObsRef.current = 90
    duckKeyRef.current = false
    duckingRef.current = false
    lastTimeRef.current = 0
    accRef.current = 0
    setDisplayScore(0)
    setIsNewBest(false)
    setGameState('playing')
  }, [])

  const doJump = useCallback(() => {
    if (dinoTopRef.current >= GROUND_Y - DINO_H - 2 && !duckKeyRef.current) {
      dinoVYRef.current = JUMP_V
    }
  }, [])

  const doInput = useCallback(() => {
    const s = gsRef.current
    if (s === 'idle' || s === 'dead') { doStart(); return }
    doJump()
  }, [doStart, doJump])

  // main game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    function handleDeath(finalScore: number) {
      gsRef.current = 'dead'
      const sc = Math.floor(finalScore)
      setDisplayScore(sc)
      setGameState('dead')
      setBestScore(prev => {
        if (sc > prev) {
          localStorage.setItem('dino-best', String(sc))
          setIsNewBest(true)
          return sc
        }
        return prev
      })
      // 세션이 무효화됐으면 제출해봐야 반려되므로 시도하지 않는다
      if (!sessionIdRef.current || sessionInvalidRef.current) {
        setSaveState('failed')
        return
      }

      setSaveState('saving')
      submitScore(sessionIdRef.current, sc)
        .then(() => {
          setSaveState('saved')
          refreshLb()            // 저장 완료 직후 refresh
        })
        .catch(() => setSaveState('failed'))
    }

    // ── 시뮬레이션 1스텝 (고정 1/STEP_HZ초). 충돌 시 true ──────────
    function stepSim(): boolean {
      const f = frameRef.current
      const spd = getSpeed(f)

      gOffsetRef.current += spd

      cloudsRef.current.forEach(c => {
        c.x -= 0.55
        if (c.x < -60) c.x = W + 60
      })

      // physics
      dinoVYRef.current = Math.min(dinoVYRef.current + GRAVITY, MAX_VY)
      dinoTopRef.current += dinoVYRef.current
      if (dinoTopRef.current >= GROUND_Y - DINO_H) {
        dinoTopRef.current = GROUND_Y - DINO_H
        dinoVYRef.current = 0
      }

      // duck: snap to ground with reduced height
      const onGround = dinoTopRef.current >= GROUND_Y - DINO_H - 1
      const ducking = duckKeyRef.current && onGround
      if (ducking) {
        dinoTopRef.current = GROUND_Y - DINO_DUCK_H
        dinoVYRef.current = 0
      }
      duckingRef.current = ducking

      // spawn obstacles
      nextObsRef.current -= 1
      if (nextObsRef.current <= 0) {
        // 속도 4.2부터 새 등장, 최대 55%까지 빠르게 비율 증가
        const pteroRatio = Math.min(0.55, 0.15 + (spd - 4.2) * 0.13)
        const usePtero = spd > 4.2 && Math.random() < pteroRatio
        obstaclesRef.current.push(usePtero ? genPtero() : genCactus())
        nextObsRef.current = nextObsDelay(f)
      }

      // dino hitbox
      const dLeft = ducking ? DINO_X - 8 + 6 : DINO_X + 4
      const dRight = ducking ? DINO_X - 8 + DINO_DUCK_W - 6 : DINO_X + DINO_W - 4
      const dTop = ducking ? GROUND_Y - DINO_DUCK_H + 2 : dinoTopRef.current + 2
      const dBottom = ducking ? GROUND_Y - 2 : dinoTopRef.current + DINO_HIT - 2

      let hit = false
      obstaclesRef.current = obstaclesRef.current.filter(obs => {
        obs.x -= spd

        if (obs.kind === 'cactus') {
          const cLeft = obs.x + 4
          const cRight = obs.x + obs.w - 4
          const cTop = GROUND_Y - obs.h + 4
          if (dLeft < cRight && dRight > cLeft && dBottom > cTop) hit = true
        } else {
          const pLeft = obs.x + 8
          const pRight = obs.x + 46
          const pTop = obs.y + 2
          const pBottom = obs.y + 22
          if (dLeft < pRight && dRight > pLeft && dTop < pBottom && dBottom > pTop) hit = true
        }

        return obs.x > -80
      })

      if (hit) return true

      scoreRef.current += SCORE_RATE * (1 + (spd - STAGE_SPEEDS[0]) / STAGE_SPEEDS[0] * SCORE_SPEED_BONUS)
      frameRef.current += 1
      return false
    }

    // ── 렌더 (매 rAF 1회) ─────────────────────────────────────────
    function render(isDark: boolean, wasPlaying: boolean, hit: boolean) {
      ctx.fillStyle = bg(isDark)
      ctx.fillRect(0, 0, W, H)

      cloudsRef.current.forEach(c => drawCloud(ctx, c.x, c.y, isDark))
      drawGround(ctx, gOffsetRef.current, isDark)

      if (wasPlaying) {
        const f = frameRef.current
        obstaclesRef.current.forEach(obs => {
          if (obs.kind === 'cactus') drawCactus(ctx, obs, isDark)
          else drawPtero(ctx, obs, f, isDark)
        })
        drawDino(ctx, dinoTopRef.current, duckingRef.current, f, hit, isDark)

        // milestone flash every 100pts
        const sc = Math.floor(scoreRef.current)
        if (sc > 0 && sc % 100 < 2) {
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
          ctx.fillRect(0, 0, W, H)
        }
        // 단계 전환 플래시
        if (f > 0 && f % STAGE_FRAMES < 4) {
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'
          ctx.fillRect(0, 0, W, H)
        }
      } else {
        // idle / dead: static dino
        const idleFrame = Math.floor(Date.now() / 80)
        drawDino(ctx, GROUND_Y - DINO_H, false, idleFrame, gsRef.current === 'dead', isDark)

        if (gsRef.current === 'idle') {
          ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af'
          ctx.font = '14px system-ui, -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('스페이스바 또는 클릭하여 시작', W / 2, H / 2 + 14)
        }
      }

      // ── canvas 우상단 스코어 ──────────────────────────────────
      const scoreColor = isDark ? '#9ca3af' : '#6b7280'
      const curScore = String(Math.floor(scoreRef.current)).padStart(5, '0')
      const hiScore = String(parseInt(localStorage.getItem('dino-best') || '0')).padStart(5, '0')
      ctx.font = 'bold 16px ui-monospace, "Courier New", monospace'
      ctx.fillStyle = scoreColor
      ctx.textAlign = 'left'
      ctx.fillText(`LV.${getStage(frameRef.current)}`, 16, 28)
      ctx.textAlign = 'right'
      ctx.fillText(`HI ${hiScore}  ${curScore}`, W - 16, 28)
    }

    function loop(now: number) {
      const isDark = darkRef.current
      const wasPlaying = gsRef.current === 'playing'
      let hit = false

      if (wasPlaying) {
        // 경과 실시간만큼 고정 스텝을 소비 → 주사율 무관
        const prev = lastTimeRef.current
        lastTimeRef.current = now
        let dt = prev === 0 ? STEP_MS : now - prev
        if (dt > MAX_DT) dt = STEP_MS
        accRef.current += dt

        let steps = 0
        while (accRef.current >= STEP_MS && steps < MAX_STEPS) {
          accRef.current -= STEP_MS
          steps++
          if (stepSim()) { hit = true; break }
        }
        if (steps >= MAX_STEPS) accRef.current = 0  // 밀린 시간은 버림

        if (hit) {
          accRef.current = 0
          handleDeath(scoreRef.current)
        } else {
          setDisplayScore(Math.floor(scoreRef.current))

          // 하트비트: 시뮬레이션이 실제로 진행된 만큼만 누적한다.
          // 게임이 멈추면 beat도 멈추므로 "살아서 플레이 중"이라는 신호가 된다.
          if (sessionIdRef.current && !sessionInvalidRef.current) {
            beatAccRef.current += steps * STEP_MS
            if (beatAccRef.current >= beatIntervalRef.current) {
              beatAccRef.current = 0
              sendBeat(sessionIdRef.current, Math.floor(scoreRef.current))
                .catch(() => { sessionInvalidRef.current = true })
            }
          }
        }
      } else {
        lastTimeRef.current = 0
        accRef.current = 0
      }

      render(isDark, wasPlaying, hit)
      raf = requestAnimationFrame(loop)
    }

    // 탭을 벗어나면 rAF가 멈춰 하트비트도 끊긴다. 조용히 세션이 무효화되면
    // 사용자에겐 원인 불명의 기록 소실로 보이므로, 명시적으로 라운드를 끝낸다.
    function onVisibilityChange() {
      if (document.hidden && gsRef.current === 'playing') {
        handleDeath(scoreRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [dark, refreshLb])

  // keyboard controls
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        doInput()
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        duckKeyRef.current = true
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'ArrowDown') duckKeyRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [doInput])

  return (
    <div className="dino-page">
      <header className="dino-header">
        <Link to="/main" className="dino-back">← 돌아가기</Link>
        <h1 className="dino-title">🦕 공룡 달리기</h1>
        <div className="dino-score-bar">
          <span className="dino-score-item">
            점수 <strong>{displayScore.toLocaleString()}</strong>
          </span>
          <span className="dino-score-item dino-score-best">
            최고 <strong>{bestScore.toLocaleString()}</strong>
          </span>
        </div>
      </header>

      <main className="dino-main">
        <div className="dino-canvas-area">
          <div className="dino-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="dino-canvas"
              onClick={doInput}
            />
            {gameState === 'dead' && (
              <div className="dino-overlay">
                <p className="dino-game-over">게임 오버</p>
                {isNewBest && <p className="dino-new-best">🎉 신기록!</p>}
                <p className="dino-final-score">점수: {displayScore.toLocaleString()}</p>
                {saveState === 'failed' && (
                  <p className="dino-save-failed">
                    기록이 저장되지 않았어요
                    <span>플레이 도중 연결이 끊겼거나 탭을 벗어났어요</span>
                  </p>
                )}
                <button className="dino-restart-btn" onClick={doStart}>
                  다시 시작
                </button>
                <p className="dino-restart-hint">스페이스바로도 재시작</p>
              </div>
            )}
          </div>
          <p className="dino-controls-hint">
            <kbd>Space</kbd> / <kbd>↑</kbd> 점프 &nbsp;·&nbsp; <kbd>↓</kbd> 엎드리기
          </p>
        </div>

        <aside className="dino-leaderboard">
          <div className="dino-lb-tabs">
            {([
              ['all', '전체'],
              ['today', '오늘'],
              ['playcount', '플레이'],
              ['team', '팀'],
            ] as [LbTab, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`dino-lb-tab${lbTab === key ? ' active' : ''}`}
                onClick={() => setLbTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {lbLoading ? (
            <p className="dino-lb-empty">불러오는 중…</p>
          ) : lbTab === 'all' ? (
            allScores.length === 0 ? (
              <p className="dino-lb-empty">아직 기록이 없어요</p>
            ) : (
              <ol className="dino-lb-list">
                {allScores.map((e, i) => (
                  <li key={i} className={`dino-lb-row${e.memberName === user?.name ? ' is-me' : ''}`}>
                    <span className="dino-lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <div className="dino-lb-info">
                      <span className="dino-lb-name">{e.memberName}</span>
                      <span className="dino-lb-team">{e.teamName}</span>
                    </div>
                    <span className="dino-lb-score">{e.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )
          ) : lbTab === 'today' ? (
            todayScores.length === 0 ? (
              <p className="dino-lb-empty">오늘 기록이 없어요</p>
            ) : (
              <ol className="dino-lb-list">
                {todayScores.map((e, i) => (
                  <li key={i} className={`dino-lb-row${e.memberName === user?.name ? ' is-me' : ''}`}>
                    <span className="dino-lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <div className="dino-lb-info">
                      <span className="dino-lb-name">{e.memberName}</span>
                      <span className="dino-lb-team">{e.teamName}</span>
                    </div>
                    <span className="dino-lb-score">{e.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )
          ) : lbTab === 'playcount' ? (
            playCounts.length === 0 ? (
              <p className="dino-lb-empty">아직 기록이 없어요</p>
            ) : (
              <ol className="dino-lb-list">
                {playCounts.map((e, i) => (
                  <li key={i} className={`dino-lb-row${e.memberName === user?.name ? ' is-me' : ''}`}>
                    <span className="dino-lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <div className="dino-lb-info">
                      <span className="dino-lb-name">{e.memberName}</span>
                      <span className="dino-lb-team">{e.teamName}</span>
                    </div>
                    <span className="dino-lb-score">{e.playCount.toLocaleString()}회</span>
                  </li>
                ))}
              </ol>
            )
          ) : (
            teamScores.length === 0 ? (
              <p className="dino-lb-empty">아직 기록이 없어요</p>
            ) : (
              <ol className="dino-lb-list">
                {teamScores.map((e, i) => (
                  <li key={i} className="dino-lb-row">
                    <span className="dino-lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                    <div className="dino-lb-info">
                      <span className="dino-lb-name">{e.teamName}</span>
                      <span className="dino-lb-team">팀 평균</span>
                    </div>
                    <span className="dino-lb-score">{Number(e.avgScore).toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )
          )}
        </aside>
      </main>
    </div>
  )
}
