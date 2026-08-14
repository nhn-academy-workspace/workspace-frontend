import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import './GamePage.css'

// ── Canvas ─────────────────────────────────────────────────────────
const W = 320
const H = 480
const GROUND_H = 56

// ── Physics ────────────────────────────────────────────────────────
const GRAVITY = 0.42
const FLAP_V = -7.8
const MAX_VY = 10

// ── Pipe ───────────────────────────────────────────────────────────
const PIPE_W = 52
const PIPE_GAP = 132
const PIPE_SPEED = 2.5
const PIPE_SPACING = 195
const PIPE_CAP_H = 14
const PIPE_CAP_PAD = 6 // cap extends beyond body on each side

// ── Bird ───────────────────────────────────────────────────────────
const BIRD_R = 13
const BIRD_X = 80

// ── First pipe appears after this many frames ──────────────────────
const FIRST_PIPE_DELAY = 90

type GameState = 'idle' | 'playing' | 'dead'

interface Pipe {
  x: number
  gapY: number
  passed: boolean
}

// ──────────────────────────────────────────────────────────────────
// Drawing helpers
// ──────────────────────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H - GROUND_H)
  g.addColorStop(0, '#4EC0CA')
  g.addColorStop(1, '#B8E9F0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H - GROUND_H)
}

function drawGround(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.fillStyle = '#C0A832'
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H)
  ctx.fillStyle = '#DED895'
  ctx.fillRect(0, H - GROUND_H, W, 20)
  ctx.fillStyle = '#C5B640'
  ctx.fillRect(0, H - GROUND_H + 20, W, 3)
  // scrolling dirt detail
  ctx.fillStyle = '#A88C1A'
  const seg = 36
  for (let i = -1; i < Math.ceil(W / seg) + 2; i++) {
    const x = ((i * seg) - (offset * 1.1) % seg + seg * 2) % (W + seg) - seg
    ctx.fillRect(x, H - GROUND_H + 28, 14, 3)
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, pipe: Pipe) {
  const topH = pipe.gapY - PIPE_GAP / 2
  const botY = pipe.gapY + PIPE_GAP / 2
  const botH = H - GROUND_H - botY
  const cx = pipe.x - PIPE_CAP_PAD
  const cw = PIPE_W + PIPE_CAP_PAD * 2

  // top pipe
  if (topH > 0) {
    ctx.fillStyle = '#5EBE18'
    ctx.fillRect(pipe.x, 0, PIPE_W, topH - PIPE_CAP_H)
    ctx.fillStyle = '#4A9A10'
    ctx.fillRect(pipe.x + PIPE_W - 9, 0, 9, topH - PIPE_CAP_H)
    // cap
    ctx.fillStyle = '#6DD420'
    ctx.fillRect(cx, topH - PIPE_CAP_H, cw, PIPE_CAP_H)
    ctx.fillStyle = '#4A9A10'
    ctx.fillRect(cx + cw - 9, topH - PIPE_CAP_H, 9, PIPE_CAP_H)
    ctx.fillStyle = '#2A6E00'
    ctx.fillRect(cx, topH - 2, cw, 2)
  }

  // bottom pipe
  if (botH > 0) {
    ctx.fillStyle = '#2A6E00'
    ctx.fillRect(cx, botY, cw, 2)
    ctx.fillStyle = '#6DD420'
    ctx.fillRect(cx, botY + 2, cw, PIPE_CAP_H - 2)
    ctx.fillStyle = '#4A9A10'
    ctx.fillRect(cx + cw - 9, botY + 2, 9, PIPE_CAP_H - 2)
    ctx.fillStyle = '#5EBE18'
    ctx.fillRect(pipe.x, botY + PIPE_CAP_H, PIPE_W, botH - PIPE_CAP_H)
    ctx.fillStyle = '#4A9A10'
    ctx.fillRect(pipe.x + PIPE_W - 9, botY + PIPE_CAP_H, 9, botH - PIPE_CAP_H)
  }
}

function drawBird(ctx: CanvasRenderingContext2D, y: number, vy: number, wingPhase: number) {
  const rot = Math.max(-25, Math.min(80, vy * 5.5)) * (Math.PI / 180)

  ctx.save()
  ctx.translate(BIRD_X, y)
  ctx.rotate(rot)

  // wing (flapping)
  ctx.beginPath()
  ctx.ellipse(-2, 3 + Math.sin(wingPhase) * 4, 9, 5, -0.3, 0, Math.PI * 2)
  ctx.fillStyle = '#E0B000'
  ctx.fill()

  // body
  ctx.beginPath()
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2)
  ctx.fillStyle = '#F5C800'
  ctx.fill()

  // belly highlight
  ctx.beginPath()
  ctx.ellipse(2, 3, 7, 6, 0.2, 0, Math.PI * 2)
  ctx.fillStyle = '#F8E35A'
  ctx.fill()

  // eye white
  ctx.beginPath()
  ctx.arc(5, -4.5, 5.5, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  // pupil
  ctx.beginPath()
  ctx.arc(6.5, -4.5, 2.8, 0, Math.PI * 2)
  ctx.fillStyle = '#2A2A2A'
  ctx.fill()

  // pupil highlight
  ctx.beginPath()
  ctx.arc(7.5, -5.5, 1, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  // upper beak
  ctx.fillStyle = '#F4982B'
  ctx.beginPath()
  ctx.moveTo(8, -2)
  ctx.lineTo(17, 0.5)
  ctx.lineTo(8, 2.5)
  ctx.closePath()
  ctx.fill()

  // lower beak
  ctx.fillStyle = '#D4761A'
  ctx.beginPath()
  ctx.moveTo(8, 2.5)
  ctx.lineTo(16, 3)
  ctx.lineTo(8, 5.5)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawScore(ctx: CanvasRenderingContext2D, score: number) {
  const text = String(score)
  ctx.textAlign = 'center'
  ctx.font = 'bold 40px Arial'
  ctx.fillStyle = '#444'
  ctx.fillText(text, W / 2 + 2, 63)
  ctx.fillStyle = 'white'
  ctx.fillText(text, W / 2, 61)
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export default function GamePage() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const stateRef = useRef<GameState>('idle')
  const birdYRef = useRef(H / 2)
  const birdVYRef = useRef(0)
  const pipesRef = useRef<Pipe[]>([])
  const scoreRef = useRef(0)
  const groundOffRef = useRef(0)
  const wingPhaseRef = useRef(0)
  const ticksRef = useRef(0)
  const rafRef = useRef<number>(0)
  const tokenRef = useRef<string | null>(null)

  const [displayState, setDisplayState] = useState<GameState>('idle')
  const [finalScore, setFinalScore] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const fetchToken = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/game/sessions', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        tokenRef.current = data.token
      }
    } catch {
      // non-fatal: score submission will just fail later
    }
  }, [])

  const spawnPipe = useCallback(() => {
    const margin = 80 + PIPE_GAP / 2
    const gapY = margin + Math.random() * (H - GROUND_H - margin * 2)
    pipesRef.current.push({ x: W + PIPE_CAP_PAD + 4, gapY, passed: false })
  }, [])

  const die = useCallback(() => {
    stateRef.current = 'dead'
    setDisplayState('dead')
    setFinalScore(scoreRef.current)
  }, [])

  const startGame = useCallback(() => {
    birdYRef.current = H / 2
    birdVYRef.current = FLAP_V
    pipesRef.current = []
    scoreRef.current = 0
    groundOffRef.current = 0
    ticksRef.current = 0
    tokenRef.current = null
    stateRef.current = 'playing'
    setDisplayState('playing')
    setSubmitted(false)
    setSubmitError('')
    fetchToken()
  }, [fetchToken])

  const flap = useCallback(() => {
    if (stateRef.current === 'dead') return
    if (stateRef.current === 'idle') { startGame(); return }
    birdVYRef.current = FLAP_V
    wingPhaseRef.current = 0
  }, [startGame])

  const retry = useCallback(() => {
    birdYRef.current = H / 2
    birdVYRef.current = 0
    pipesRef.current = []
    scoreRef.current = 0
    groundOffRef.current = 0
    ticksRef.current = 0
    tokenRef.current = null
    stateRef.current = 'idle'
    setDisplayState('idle')
    setSubmitted(false)
    setSubmitError('')
  }, [])

  const submitScore = useCallback(async () => {
    if (!tokenRef.current) {
      setSubmitError('세션 토큰이 없습니다. 다시 게임을 시작해주세요.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/v1/game/scores', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, score: finalScore }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setSubmitError('점수 제출에 실패했습니다.')
      }
    } catch {
      setSubmitError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }, [finalScore])

  // ── Game loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const loop = () => {
      const state = stateRef.current
      let y = birdYRef.current
      let vy = birdVYRef.current

      if (state === 'idle') {
        y = H / 2 + Math.sin(Date.now() / 380) * 7
        vy = 0
        wingPhaseRef.current += 0.12
      }

      if (state === 'playing') {
        wingPhaseRef.current += 0.25
        vy = Math.min(vy + GRAVITY, MAX_VY)
        y += vy
        groundOffRef.current += PIPE_SPEED
        ticksRef.current += 1

        // pipe movement
        for (const p of pipesRef.current) p.x -= PIPE_SPEED
        pipesRef.current = pipesRef.current.filter(
          (p) => p.x > -(PIPE_W + PIPE_CAP_PAD * 2 + 10),
        )

        // pipe spawning
        const rightmost =
          pipesRef.current.length > 0
            ? Math.max(...pipesRef.current.map((p) => p.x))
            : -Infinity
        if (
          (pipesRef.current.length === 0 && ticksRef.current > FIRST_PIPE_DELAY) ||
          (pipesRef.current.length > 0 && rightmost < W - PIPE_SPACING)
        ) {
          spawnPipe()
        }

        // scoring
        for (const p of pipesRef.current) {
          if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.passed = true
            scoreRef.current += 1
          }
        }

        // collision: ceiling / ground
        if (y - BIRD_R < 0 || y + BIRD_R >= H - GROUND_H) {
          y = Math.min(y, H - GROUND_H - BIRD_R)
          birdYRef.current = y
          birdVYRef.current = vy
          die()
          drawSky(ctx)
          for (const p of pipesRef.current) drawPipe(ctx, p)
          drawGround(ctx, groundOffRef.current)
          drawBird(ctx, y, MAX_VY, wingPhaseRef.current)
          drawScore(ctx, scoreRef.current)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        // collision: pipes (shrink hitbox slightly for fairness)
        const bL = BIRD_X - BIRD_R + 3
        const bR = BIRD_X + BIRD_R - 3
        const bT = y - BIRD_R + 3
        const bB = y + BIRD_R - 3
        for (const p of pipesRef.current) {
          const capX = p.x - PIPE_CAP_PAD
          const capW = PIPE_W + PIPE_CAP_PAD * 2
          if (bR > capX && bL < capX + capW) {
            const topBot = p.gapY - PIPE_GAP / 2
            const botTop = p.gapY + PIPE_GAP / 2
            if (bT < topBot || bB > botTop) {
              birdYRef.current = y
              birdVYRef.current = vy
              die()
              drawSky(ctx)
              for (const pp of pipesRef.current) drawPipe(ctx, pp)
              drawGround(ctx, groundOffRef.current)
              drawBird(ctx, y, MAX_VY, wingPhaseRef.current)
              drawScore(ctx, scoreRef.current)
              rafRef.current = requestAnimationFrame(loop)
              return
            }
          }
        }
      }

      // dead: bird falls to ground
      if (state === 'dead') {
        if (y + BIRD_R < H - GROUND_H) {
          vy = Math.min(vy + GRAVITY, MAX_VY)
          y = Math.min(y + vy, H - GROUND_H - BIRD_R)
        }
      }

      birdYRef.current = y
      birdVYRef.current = vy

      // ── Draw ─────────────────────────────────────────────────────
      drawSky(ctx)
      for (const p of pipesRef.current) drawPipe(ctx, p)
      drawGround(ctx, groundOffRef.current)
      drawBird(ctx, y, state === 'idle' ? 0 : vy, wingPhaseRef.current)
      if (state !== 'idle') drawScore(ctx, scoreRef.current)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [die, spawnPipe])

  // ── Keyboard ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap])

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="game-back-btn" onClick={() => navigate('/main')}>
          ← 돌아가기
        </button>
        <h1>Floppy Bird</h1>
      </div>

      <div className="game-area">
        <div className="game-canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="game-canvas"
            onClick={flap}
          />

          {displayState === 'idle' && (
            <div className="game-overlay">
              <div className="game-card">
                <p className="game-card-title">Floppy Bird</p>
                <p className="game-card-hint">클릭 또는 스페이스바로 시작</p>
              </div>
            </div>
          )}

          {displayState === 'dead' && (
            <div className="game-overlay">
              <div className="game-card dead-card">
                <p className="dead-over-label">Game Over</p>
                <p className="dead-score-display">{finalScore}</p>
                <div className="dead-actions">
                  {!submitted ? (
                    <button className="game-submit-btn" onClick={submitScore} disabled={submitting}>
                      {submitting ? '등록 중...' : '점수 등록'}
                    </button>
                  ) : (
                    <p className="game-submitted-msg">✓ 등록 완료!</p>
                  )}
                  {submitError && <p className="game-submit-error">{submitError}</p>}
                  <button className="game-retry-btn" onClick={retry}>
                    다시 하기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
