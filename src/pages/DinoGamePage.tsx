import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { submitScore, getTopScores, type ScoreEntry } from '../api/game'
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

// ── Speed ───────────────────────────────────────────────────────────
const BASE_SPEED = 4.5
const MAX_SPEED = 12
const SPEED_RATE = 0.00065

// ── Score ───────────────────────────────────────────────────────────
const SCORE_RATE = 0.1

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

function getSpeed(frame: number) {
  return Math.min(BASE_SPEED + frame * SPEED_RATE, MAX_SPEED)
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
  const min = Math.max(55, 100 - frame * 0.04)
  const range = Math.max(40, 80 - frame * 0.03)
  return (min + Math.random() * range) / spd * 4.5
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
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([])
  const [lbLoading, setLbLoading] = useState(true)
  const [isNewBest, setIsNewBest] = useState(false)

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

  const refreshLb = useCallback(() => {
    getTopScores().then(setLeaderboard).catch(() => {})
  }, [])

  useEffect(() => {
    getTopScores()
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false))
  }, [])

  const doStart = useCallback(() => {
    gsRef.current = 'playing'
    dinoTopRef.current = GROUND_Y - DINO_H
    dinoVYRef.current = JUMP_V
    obstaclesRef.current = []
    frameRef.current = 0
    scoreRef.current = 0
    gOffsetRef.current = 0
    nextObsRef.current = 90
    duckKeyRef.current = false
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
      submitScore(sc).catch(() => {})
      setTimeout(refreshLb, 700)
    }

    function loop() {
      const isDark = darkRef.current
      const state = gsRef.current

      ctx.fillStyle = bg(isDark)
      ctx.fillRect(0, 0, W, H)

      // clouds
      cloudsRef.current.forEach(c => {
        drawCloud(ctx, c.x, c.y, isDark)
        if (state === 'playing') c.x -= 0.55
        if (c.x < -60) c.x = W + 60
      })

      drawGround(ctx, gOffsetRef.current, isDark)

      if (state === 'playing') {
        const f = frameRef.current
        const spd = getSpeed(f)

        gOffsetRef.current += spd

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

        // spawn obstacles
        nextObsRef.current -= 1
        if (nextObsRef.current <= 0) {
          const usePtero = spd > 6.5 && Math.random() < 0.35
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
            drawCactus(ctx, obs, isDark)
            const cLeft = obs.x + 4
            const cRight = obs.x + obs.w - 4
            const cTop = GROUND_Y - obs.h + 4
            if (dLeft < cRight && dRight > cLeft && dBottom > cTop) hit = true
          } else {
            drawPtero(ctx, obs, f, isDark)
            const pLeft = obs.x + 8
            const pRight = obs.x + 46
            const pTop = obs.y + 2
            const pBottom = obs.y + 22
            if (dLeft < pRight && dRight > pLeft && dTop < pBottom && dBottom > pTop) hit = true
          }

          return obs.x > -80
        })

        drawDino(ctx, dinoTopRef.current, ducking, f, hit, isDark)

        if (hit) {
          handleDeath(scoreRef.current)
          raf = requestAnimationFrame(loop)
          return
        }

        scoreRef.current += SCORE_RATE * (1 + (spd - BASE_SPEED) / BASE_SPEED * 0.25)
        setDisplayScore(Math.floor(scoreRef.current))
        frameRef.current += 1

        // milestone flash every 100pts
        const sc = Math.floor(scoreRef.current)
        if (sc > 0 && sc % 100 < 2) {
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
          ctx.fillRect(0, 0, W, H)
        }

      } else {
        // idle / dead: static dino
        const idleFrame = Math.floor(Date.now() / 80)
        drawDino(ctx, GROUND_Y - DINO_H, false, idleFrame, state === 'dead', isDark)

        if (state === 'idle') {
          ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af'
          ctx.font = '14px system-ui, -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('스페이스바 또는 클릭하여 시작', W / 2, H / 2 + 14)
        }
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
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
          <h2 className="dino-lb-title">🏆 전체 랭킹</h2>
          {lbLoading ? (
            <p className="dino-lb-empty">불러오는 중…</p>
          ) : leaderboard.length === 0 ? (
            <p className="dino-lb-empty">아직 기록이 없어요</p>
          ) : (
            <ol className="dino-lb-list">
              {leaderboard.map((entry, i) => (
                <li
                  key={i}
                  className={`dino-lb-row ${entry.memberName === user?.name ? 'is-me' : ''}`}
                >
                  <span className="dino-lb-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <div className="dino-lb-info">
                    <span className="dino-lb-name">{entry.memberName}</span>
                    <span className="dino-lb-team">{entry.teamName}</span>
                  </div>
                  <span className="dino-lb-score">{entry.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  )
}
