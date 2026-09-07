import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getRoomBookings, getRooms, type Room, type TimetableEntry } from '../api/rooms'
import { getMyTeamRoster, type TeamMember } from '../api/teams'
import { createBooking, BookingError } from '../api/bookings'
import {
  adjustBooking,
  cancelBooking,
  createLock,
  updateLock,
  deleteLock,
  AdminActionError,
} from '../api/adminBookings'
import { useAuth } from '../context/AuthContext'
import './RoomTimetablePage.css'

const START_HOUR = 9
const END_HOUR = 18
const OPEN_HOUR = 8
const OPEN_MINUTE = 30
const STEP = 5 // 예약/락 최소 조정 단위(분)
const HOUR_HEIGHT = 56 // px per hour — 하루(9시간)가 한 화면 가까이 들어오도록 압축
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60
const TOTAL_HEIGHT = (TOTAL_MINUTES / 60) * HOUR_HEIGHT
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
const HALF_TICKS = Array.from({ length: TOTAL_MINUTES / 30 }, (_, i) => i * 30).filter((m) => m % 60 !== 0)
const MAX_BOOKING_MINUTES = 120
const MIN_PARTICIPANTS = 4
const BOOKING_PRESETS = [30, 60, 90, 120]
const LOCK_PRESETS = [30, 60, 120, 180, 300]

const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const snap = (m: number) => Math.round(m / STEP) * STEP

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY[date.getDay()]})`
}

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

function minutesOfDay(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
}

const offsetFromStart = (minutes: number) => minutes - START_HOUR * 60
const offsetToTop = (offset: number) => (offset / 60) * HOUR_HEIGHT

function minutesToHHMM(absoluteMinutes: number): string {
  const h = Math.floor(absoluteMinutes / 60)
  const m = absoluteMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

function entryLabel(entry: TimetableEntry): string {
  if (entry.type === 'BOOKING') return `${entry.teamName} 사용`
  return entry.reason ? `TA 업무 · ${entry.reason}` : 'TA 업무'
}

type SheetKind = 'book' | 'lock' | 'adjust-booking' | 'adjust-lock'

interface Sheet {
  kind: SheetKind
  entryId: number | null
  start: number // offset minutes (0 = START_HOUR)
  end: number
}

interface Range {
  start: number
  end: number
}

const isFreeWith = (occ: Range[], start: number, end: number) =>
  occ.every((o) => end <= o.start || start >= o.end)

const SHEET_META: Record<SheetKind, { title: string; confirm: string }> = {
  book: { title: '새 예약', confirm: '예약하기' },
  lock: { title: '락 추가', confirm: '락 걸기' },
  'adjust-booking': { title: '예약 시간 조정', confirm: '저장' },
  'adjust-lock': { title: '락 시간·사유 조정', confirm: '저장' },
}

export default function RoomTimetablePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [date, setDate] = useState(() => new Date())
  const [room, setRoom] = useState<Room | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [lockReason, setLockReason] = useState('')
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [myMemberId, setMyMemberId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [actionSubmitting, setActionSubmitting] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [infoEntry, setInfoEntry] = useState<{ entry: TimetableEntry; x: number; y: number } | null>(null)

  const timelineRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetHeight, setSheetHeight] = useState(0)

  const dateKey = useMemo(() => toDateKey(date), [date])
  const isToday = dateKey === toDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const isBeforeOpen =
    now.getHours() < OPEN_HOUR || (now.getHours() === OPEN_HOUR && now.getMinutes() < OPEN_MINUTE)
  const isTA = user?.role === 'TA'
  const isStudent = user?.role === 'STUDENT'
  const canBook = isStudent && isToday && !isBeforeOpen
  const canLock = isTA // TA는 지난 날짜도 기록용으로 락 가능

  const fetchEntries = () => {
    if (!roomId) return Promise.resolve()
    setLoading(true)
    setError(null)
    return Promise.all([getRooms(), getRoomBookings(Number(roomId), dateKey)])
      .then(([rooms, bookings]) => {
        setRoom(rooms.find((r) => r.id === Number(roomId)) ?? null)
        setEntries([...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)))
      })
      .catch(() => setError('예약 현황을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setSheet(null)
    setInfoEntry(null)
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, dateKey])

  useEffect(() => {
    if (!isStudent) return
    let cancelled = false
    getMyTeamRoster()
      .then((data) => {
        if (cancelled) return
        setRoster(data.members)
        setMyMemberId(data.memberId)
        setSelectedIds([data.memberId])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isStudent])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // 하단 시트가 타임라인 아래쪽을 가리지 않도록 시트 높이만큼 여백 확보
  useEffect(() => {
    if (!sheet) {
      setSheetHeight(0)
      return
    }
    const el = sheetRef.current
    if (!el) return
    const update = () => setSheetHeight(el.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sheet])

  const shiftDay = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  // 락 모드에서는 겹치는 예약을 백엔드가 자동 조정하므로 다른 '락'만 충돌 대상으로 본다.
  const occupiedFor = (kind: SheetKind, entryId: number | null): Range[] => {
    const lockOnly = kind === 'lock' || kind === 'adjust-lock'
    const selfType = kind === 'adjust-lock' ? 'LOCK' : 'BOOKING'
    return entries
      .filter((e) => {
        if (entryId !== null && e.id === entryId && e.type === selfType) return false
        return lockOnly ? e.type === 'LOCK' : true
      })
      .map((e) => ({
        start: offsetFromStart(minutesOfDay(e.startTime)),
        end: offsetFromStart(minutesOfDay(e.endTime)),
      }))
  }

  const occupied = useMemo(
    () => (sheet ? occupiedFor(sheet.kind, sheet.entryId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, sheet],
  )

  const maxDuration =
    sheet && (sheet.kind === 'book') ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
  const presets = sheet?.kind === 'lock' || sheet?.kind === 'adjust-lock' ? LOCK_PRESETS : BOOKING_PRESETS

  // 학생 예약(book)은 오늘 날짜라도 이미 지난 시각을 시작으로 잡을 수 없다.
  // openSheet(최초 진입)뿐 아니라 nudgeStart(스텝퍼로 시작을 앞당기는 조작)에도 같은 하한을 적용해야
  // 스텝퍼로 과거 시각까지 밀어넣는 걸 막을 수 있다.
  const minStartOffset = (kind: SheetKind) =>
    kind === 'book' && isToday ? clampNum(snap(offsetFromStart(nowMinutes)), 0, TOTAL_MINUTES - STEP) : 0

  const defaultStartOffset = () => {
    if (isToday) return clampNum(snap(offsetFromStart(nowMinutes)), 0, TOTAL_MINUTES - STEP)
    return 0
  }

  const openSheet = (kind: SheetKind, rawStartOffset: number) => {
    const occ = occupiedFor(kind, null)
    const maxDur = kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
    let start = clampNum(snap(rawStartOffset), 0, TOTAL_MINUTES - STEP)
    start = Math.max(start, minStartOffset(kind))
    // 시작 지점이 이미 점유돼 있으면 그다음 빈 자리로 밀어준다
    for (const o of occ) if (start >= o.start && start < o.end) start = o.end
    start = clampNum(start, 0, TOTAL_MINUTES - STEP)

    let end = Math.min(start + 60, start + maxDur, TOTAL_MINUTES)
    for (const o of occ) if (o.start > start && o.start < end) end = o.start
    end = Math.max(end, start + STEP)

    setSubmitError(null)
    setLockReason('')
    setInfoEntry(null)
    setSheet({ kind, entryId: null, start, end })
  }

  const openAdjust = (entry: TimetableEntry) => {
    setSubmitError(null)
    setLockReason(entry.reason ?? '')
    setInfoEntry(null)
    setSheet({
      kind: entry.type === 'LOCK' ? 'adjust-lock' : 'adjust-booking',
      entryId: entry.id,
      start: offsetFromStart(minutesOfDay(entry.startTime)),
      end: offsetFromStart(minutesOfDay(entry.endTime)),
    })
  }

  // 시작을 앞당길 때 '예약(book)은 최대 2시간' 상한을 지켜야 한다 — end는 고정이므로
  // start가 (end - 최대허용시간)보다 앞으로는 못 가게 하한을 걸고, 지난 시각도 못 가게(minStartOffset) 같이 막는다.
  const startLowerBound = (s: Sheet) =>
    Math.max(minStartOffset(s.kind), s.end - (s.kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES))

  const nudgeStart = (delta: number) =>
    setSheet((s) => {
      if (!s) return s
      const ns = clampNum(s.start + delta, startLowerBound(s), s.end - STEP)
      return isFreeWith(occupied, ns, s.end) ? { ...s, start: ns } : s
    })

  // 시작 시각 직접 입력(<input type="time">). 지난 시각/2시간 상한/충돌은 startLowerBound + 점유 구간으로 클램프.
  const setStartTo = (rawOffset: number) =>
    setSheet((s) => {
      if (!s) return s
      let lo = startLowerBound(s)
      for (const o of occupied) if (o.start < s.end && o.end > lo) lo = o.end
      const ns = clampNum(snap(rawOffset), lo, s.end - STEP)
      return { ...s, start: ns }
    })

  const handleStartTimeInput = (value: string) => {
    if (!value) return
    const [hh, mm] = value.split(':').map(Number)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return
    setStartTo(offsetFromStart(hh * 60 + mm))
  }

  const setEndTo = (targetEnd: number) =>
    setSheet((s) => {
      if (!s) return s
      const hardMax = Math.min(s.start + maxDuration, TOTAL_MINUTES)
      let ne = clampNum(targetEnd, s.start + STEP, hardMax)
      if (!isFreeWith(occupied, s.start, ne)) {
        let bound = hardMax
        for (const o of occupied) if (o.start >= s.start && o.start < bound) bound = o.start
        ne = clampNum(bound, s.start + STEP, hardMax)
      }
      return { ...s, end: ne }
    })

  const nudgeEnd = (delta: number) => setEndTo((sheet?.end ?? 0) + delta)
  const setDuration = (mins: number) => setEndTo((sheet?.start ?? 0) + mins)

  const presetFits = (mins: number) => {
    if (!sheet) return false
    const end = sheet.start + mins
    return end <= Math.min(sheet.start + maxDuration, TOTAL_MINUTES) && isFreeWith(occupied, sheet.start, end)
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    setInfoEntry(null)
    if (sheet || (!canBook && !canLock)) return
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    const offset = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60
    openSheet(canLock ? 'lock' : 'book', offset)
  }

  // 예약 블록을 누르면 그 예약을 잡은 팀원 명단을 보여준다 (학생/TA 모두).
  // 락은 사유가 라벨에 이미 보이므로 대상 아님.
  const handleBlockClick = (e: React.MouseEvent, entry: TimetableEntry) => {
    e.stopPropagation()
    if (entry.type !== 'BOOKING') return
    setInfoEntry((prev) => (prev?.entry.id === entry.id ? null : { entry, x: e.clientX, y: e.clientY }))
  }

  const toggleMember = (memberId: number) => {
    if (memberId === myMemberId) return
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const allSelected = roster.length > 0 && roster.every((m) => selectedIds.includes(m.memberId))
  const toggleAllMembers = () =>
    setSelectedIds(allSelected ? (myMemberId !== null ? [myMemberId] : []) : roster.map((m) => m.memberId))

  const confirmSheet = async () => {
    if (!sheet || !roomId) return
    setSubmitting(true)
    setSubmitError(null)
    const startTime = `${dateKey}T${minutesToHHMM(sheet.start + START_HOUR * 60)}:00`
    const endTime = `${dateKey}T${minutesToHHMM(sheet.end + START_HOUR * 60)}:00`
    try {
      if (sheet.kind === 'book') {
        await createBooking({ roomId: Number(roomId), startTime, endTime, memberIds: selectedIds })
      } else if (sheet.kind === 'lock') {
        await createLock({ roomId: Number(roomId), startTime, endTime, reason: lockReason || undefined })
      } else if (sheet.kind === 'adjust-booking') {
        await adjustBooking(sheet.entryId!, startTime, endTime)
      } else {
        await updateLock(sheet.entryId!, {
          roomId: Number(roomId),
          startTime,
          endTime,
          reason: lockReason || undefined,
        })
      }
      setSheet(null)
      await fetchEntries()
    } catch (err) {
      setSubmitError(
        err instanceof BookingError || err instanceof AdminActionError
          ? err.message
          : '요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelBooking = async (bookingId: number) => {
    if (!window.confirm('이 예약을 취소할까요?')) return
    setActionSubmitting(bookingId)
    setActionError(null)
    try {
      await cancelBooking(bookingId)
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof AdminActionError ? err.message : '예약 취소에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleDeleteLock = async (lockId: number) => {
    if (!window.confirm('이 락을 취소할까요?')) return
    setActionSubmitting(lockId)
    setActionError(null)
    try {
      await deleteLock(lockId)
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof AdminActionError ? err.message : '락 취소에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const nowInRange = isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60
  const nowTop = nowInRange ? offsetToTop(offsetFromStart(nowMinutes)) : null

  const currentEntry = nowInRange
    ? entries.find((e) => {
        const s = offsetFromStart(minutesOfDay(e.startTime))
        const en = offsetFromStart(minutesOfDay(e.endTime))
        return offsetFromStart(nowMinutes) >= s && offsetFromStart(nowMinutes) < en
      })
    : undefined
  const currentCaption = !nowInRange ? null : currentEntry ? `지금 ${entryLabel(currentEntry)} 중` : '지금 비어있음'

  const durationMins = sheet ? sheet.end - sheet.start : 0
  const canConfirm =
    !!sheet &&
    !submitting &&
    durationMins >= STEP &&
    (sheet.kind !== 'book' || selectedIds.length >= MIN_PARTICIPANTS)

  return (
    <div className="timetable-page">
      <header className="timetable-header">
        <button type="button" className="back-button" onClick={() => navigate('/main')}>
          ← 뒤로
        </button>
        <h1>{room?.name ?? `회의실 ${roomId}`}</h1>
      </header>

      <main
        className="timetable-content"
        style={sheetHeight ? { paddingBottom: sheetHeight + 24 } : undefined}
      >
        <div className="date-nav">
          <button type="button" onClick={() => shiftDay(-1)} aria-label="이전 날짜">
            ‹
          </button>
          <label className="date-label">
            {formatDateLabel(date)}
            <input
              type="date"
              value={dateKey}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, d] = e.target.value.split('-').map(Number)
                setDate(new Date(y, m - 1, d))
              }}
            />
          </label>
          <button type="button" onClick={() => shiftDay(1)} aria-label="다음 날짜">
            ›
          </button>
        </div>

        {currentCaption && <p className="current-caption">{currentCaption}</p>}
        {actionError && <p className="state-message is-error">{actionError}</p>}

        {isStudent && isToday && isBeforeOpen && (
          <p className="state-message is-error">오늘 예약은 08:30부터 신청할 수 있습니다.</p>
        )}
        {isStudent && !isToday && (
          <p className="drag-hint">예약은 오늘 날짜에만 가능합니다. 다른 날짜는 조회만 됩니다.</p>
        )}

        {!loading && !error && (canBook || canLock) && !sheet && (
          <button type="button" className="add-cta" onClick={() => openSheet(canLock ? 'lock' : 'book', defaultStartOffset())}>
            {canLock ? '＋ 락 추가' : '＋ 예약 추가'}
          </button>
        )}
        {(canBook || canLock) && (
          <p className="drag-hint">
            빈 시간을 눌러 {canLock ? '락을 추가' : '예약을 시작'}하거나, 위 버튼을 사용하세요.
          </p>
        )}

        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <>
            <div
              ref={timelineRef}
              className={`timeline${canBook || canLock ? ' is-tappable' : ''}`}
              style={{ height: TOTAL_HEIGHT }}
              onClick={handleTimelineClick}
            >
              {HOURS.map((h, i) => (
                <div key={h} className="hour-row" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="hour-label">{h}:00</span>
                  <span className="hour-line" />
                </div>
              ))}

              {HALF_TICKS.map((m) => (
                <div key={m} className="minor-line" style={{ top: offsetToTop(m) }} />
              ))}

              <div className="timeline-blocks">
                {entries.map((entry) => {
                  const startOffset = offsetFromStart(minutesOfDay(entry.startTime))
                  const endOffset = offsetFromStart(minutesOfDay(entry.endTime))
                  const top = offsetToTop(startOffset)
                  const height = Math.max(offsetToTop(endOffset) - offsetToTop(startOffset), 22)
                  const isPast = isToday && new Date(entry.endTime).getTime() <= now.getTime()
                  const busy = actionSubmitting === entry.id
                  const dim = height < 44

                  return (
                    <div
                      key={`${entry.type}-${entry.id}`}
                      className={`timeline-block entry-${entry.type.toLowerCase()}${isPast ? ' is-past' : ''}${dim ? ' is-compact' : ''}${entry.type === 'BOOKING' ? ' is-clickable' : ''}`}
                      style={{ top, height }}
                      onClick={(e) => handleBlockClick(e, entry)}
                    >
                      <span className="block-time">
                        {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                      </span>
                      <span className="block-label">{entryLabel(entry)}</span>

                      {isTA && (
                        <div className="admin-block-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" disabled={busy || !!sheet} onClick={() => openAdjust(entry)}>
                            조정
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              entry.type === 'LOCK' ? handleDeleteLock(entry.id) : handleCancelBooking(entry.id)
                            }
                          >
                            {entry.type === 'LOCK' ? '락 취소' : '예약 취소'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {sheet && (
                  <div
                    className="timeline-block draft-block"
                    style={{
                      top: offsetToTop(sheet.start),
                      height: Math.max(offsetToTop(sheet.end) - offsetToTop(sheet.start), 22),
                    }}
                  >
                    <span className="block-time">
                      {minutesToHHMM(sheet.start + START_HOUR * 60)}–{minutesToHHMM(sheet.end + START_HOUR * 60)}
                    </span>
                    <span className="block-label">{SHEET_META[sheet.kind].title}</span>
                  </div>
                )}
              </div>

              {nowTop !== null && (
                <div className="now-line" style={{ top: nowTop }}>
                  <span className="now-dot" />
                  <span className="now-time">
                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {entries.length === 0 && <p className="empty-state">이 날짜엔 예약된 일정이 없습니다.</p>}
          </>
        )}
      </main>

      <AnimatePresence>
        {sheet && (
          <motion.div
            ref={sheetRef}
            className="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className="sheet-inner">
              <p className="sheet-title">{SHEET_META[sheet.kind].title}</p>

              <div className="field-row">
                <span className="field-label">시작</span>
                <div className="stepper">
                  <button type="button" onClick={() => nudgeStart(-STEP)} aria-label="시작 5분 앞">
                    −
                  </button>
                  <input
                    type="time"
                    className="stepper-input"
                    step={STEP * 60}
                    value={minutesToHHMM(sheet.start + START_HOUR * 60)}
                    onChange={(e) => handleStartTimeInput(e.target.value)}
                    aria-label="시작 시각 직접 입력"
                  />
                  <button type="button" onClick={() => nudgeStart(STEP)} aria-label="시작 5분 뒤">
                    ＋
                  </button>
                </div>
              </div>

              <div className="field-row">
                <span className="field-label">이용 시간</span>
                <div className="stepper">
                  <button type="button" onClick={() => nudgeEnd(-STEP)} aria-label="5분 줄이기">
                    −
                  </button>
                  <span className="stepper-value">{formatDuration(durationMins)}</span>
                  <button type="button" onClick={() => nudgeEnd(STEP)} aria-label="5분 늘리기">
                    ＋
                  </button>
                </div>
              </div>

              <div className="preset-row">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`preset${durationMins === p ? ' is-active' : ''}`}
                    disabled={!presetFits(p)}
                    onClick={() => setDuration(p)}
                  >
                    {formatDuration(p)}
                  </button>
                ))}
              </div>

              <p className="sheet-range">
                {minutesToHHMM(sheet.start + START_HOUR * 60)} – {minutesToHHMM(sheet.end + START_HOUR * 60)}
                <span className="sheet-date"> · {formatDateLabel(date)}</span>
              </p>

              {(sheet.kind === 'lock' || sheet.kind === 'adjust-lock') && (
                <input
                  type="text"
                  className="lock-reason-input"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="사유 (선택) — 예: 사무실 회의"
                />
              )}

              {sheet.kind === 'book' && (
                <>
                  <div className="confirm-label-row">
                    <p className="confirm-label">참여 인원 (최소 {MIN_PARTICIPANTS}명, 본인 포함)</p>
                    <button type="button" className="select-all-button" onClick={toggleAllMembers}>
                      {allSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="member-grid">
                    {roster.map((m) => {
                      const isMe = m.memberId === myMemberId
                      const checked = selectedIds.includes(m.memberId)
                      return (
                        <label
                          key={m.memberId}
                          className={`member-chip ${checked ? 'is-selected' : ''} ${isMe ? 'is-self' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isMe}
                            onChange={() => toggleMember(m.memberId)}
                          />
                          {m.name}
                          {isMe && <span className="self-badge">본인</span>}
                        </label>
                      )
                    })}
                  </div>
                </>
              )}

              {submitError && <p className="form-error">{submitError}</p>}

              <div className="sheet-actions">
                <button type="button" className="cancel-button" onClick={() => setSheet(null)} disabled={submitting}>
                  취소
                </button>
                <button type="button" className="confirm-button" onClick={confirmSheet} disabled={!canConfirm}>
                  {submitting ? '처리 중…' : SHEET_META[sheet.kind].confirm}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {infoEntry && (
        <div
          className="entry-popover"
          style={{
            left: `min(${infoEntry.x + 14}px, calc(100vw - 220px))`,
            top: `min(${infoEntry.y - 12}px, calc(100vh - 140px))`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="popover-team">{infoEntry.entry.teamName}</p>
          <p className="popover-time">
            {formatTime(infoEntry.entry.startTime)} – {formatTime(infoEntry.entry.endTime)}
          </p>
          {infoEntry.entry.memberNames && infoEntry.entry.memberNames.length > 0 ? (
            <p className="popover-members">{infoEntry.entry.memberNames.join(' · ')}</p>
          ) : (
            <p className="popover-members is-empty">참여자 정보 없음</p>
          )}
          <button type="button" className="popover-close" onClick={() => setInfoEntry(null)}>
            닫기
          </button>
        </div>
      )}
    </div>
  )
}
