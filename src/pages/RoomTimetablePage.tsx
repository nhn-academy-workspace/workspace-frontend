import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { getRoomBookings, getRooms, type Room, type TimetableEntry } from '../api/rooms'
import { getMyTeamRoster, type TeamMember } from '../api/teams'
import { createBooking, BookingError } from '../api/bookings'
import { adjustBooking, cancelBooking, createLock, deleteLock, AdminActionError } from '../api/adminBookings'
import { useAuth } from '../context/AuthContext'
import './RoomTimetablePage.css'

const START_HOUR = 9
const END_HOUR = 18
const OPEN_HOUR = 8
const OPEN_MINUTE = 30
const SLOT_MINUTES = 15
const SLOT_HEIGHT = 48 // px per 15분 (15분 예약 블록에서 글씨가 잘리지 않도록 여유를 둠)
const HOUR_HEIGHT = SLOT_HEIGHT * (60 / SLOT_MINUTES)
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
const MINOR_TICKS = Array.from({ length: TOTAL_MINUTES / SLOT_MINUTES }, (_, i) => i * SLOT_MINUTES).filter(
  (m) => m % 60 !== 0,
)
const MAX_DURATION = 120 // 최대 2시간
const MIN_PARTICIPANTS = 4

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
  const h = Number(iso.slice(11, 13))
  const m = Number(iso.slice(14, 16))
  return h * 60 + m
}

function offsetFromStart(minutes: number): number {
  return minutes - START_HOUR * 60
}

function offsetToTop(offset: number): number {
  return (offset / 60) * HOUR_HEIGHT
}

function minutesToHHMM(absoluteMinutes: number): string {
  const h = Math.floor(absoluteMinutes / 60)
  const m = absoluteMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function entryLabel(entry: TimetableEntry): string {
  return entry.type === 'BOOKING' ? `${entry.teamName} 사용` : `TA 업무 · ${entry.reason ?? '사유 없음'}`
}

interface DraftRange {
  start: number // offset minutes (0 = START_HOUR)
  end: number
}

export default function RoomTimetablePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { user } = useAuth()

  const [date, setDate] = useState(() => new Date())
  const [room, setRoom] = useState<Room | null>(null)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)

  const confirmPanelRef = useRef<HTMLDivElement>(null)
  const [confirmPanelHeight, setConfirmPanelHeight] = useState(0)

  const [roster, setRoster] = useState<TeamMember[]>([])
  const [myMemberId, setMyMemberId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [actionSubmitting, setActionSubmitting] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [adjustingId, setAdjustingId] = useState<number | null>(null)
  const [adjustRange, setAdjustRange] = useState<DraftRange | null>(null)
  const [resizingEdge, setResizingEdge] = useState<'start' | 'end' | null>(null)
  const [lockReason, setLockReason] = useState('')
  const [deletingLockId, setDeletingLockId] = useState<number | null>(null)

  const dateKey = useMemo(() => toDateKey(date), [date])
  const isToday = dateKey === toDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const isBeforeOpen = now.getHours() < OPEN_HOUR || (now.getHours() === OPEN_HOUR && now.getMinutes() < OPEN_MINUTE)
  const canBook = user?.role === 'STUDENT' && isToday && !isBeforeOpen
  const canLock = user?.role === 'TA' && isToday
  const canDrag = canBook || canLock

  const fetchEntries = () => {
    if (!roomId) return Promise.resolve()
    setLoading(true)
    setError(null)
    return Promise.all([getRooms(), getRoomBookings(Number(roomId), dateKey)])
      .then(([rooms, bookings]) => {
        setRoom(rooms.find((r) => r.id === Number(roomId)) ?? null)
        setEntries([...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)))
      })
      .catch(() => {
        setError('예약 현황을 불러오지 못했습니다.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    setDraftRange(null)
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, dateKey])

  useEffect(() => {
    if (user?.role !== 'STUDENT') return
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
  }, [user?.role])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // 예약 확정 패널(fixed)이 타임라인 하단(17~18시 부근)을 가려서 그 아래로 스크롤할 방법이
  // 없어지는 문제를 막기 위해, 패널 높이만큼 콘텐츠 하단에 여백을 확보한다.
  useEffect(() => {
    if (!draftRange) {
      setConfirmPanelHeight(0)
      return
    }
    const el = confirmPanelRef.current
    if (!el) return
    const updateHeight = () => setConfirmPanelHeight(el.offsetHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(el)
    return () => observer.disconnect()
  }, [draftRange])

  const shiftDay = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  // 기존 예약/락을 offset-분 구간으로 변환
  // TA가 락을 걸 때는 예약을 무시하고 드래그할 수 있어야 하므로(겹치는 예약은 백엔드에서 자동 조정),
  // 락 걸기 모드에서는 다른 락만 충돌 대상으로 취급한다.
  const occupied = useMemo(
    () =>
      (canLock ? entries.filter((e) => e.type === 'LOCK') : entries).map((e) => ({
        start: offsetFromStart(minutesOfDay(e.startTime)),
        end: offsetFromStart(minutesOfDay(e.endTime)),
      })),
    [entries, canLock],
  )

  const isSlotFree = (start: number, end: number) =>
    occupied.every((o) => end <= o.start || start >= o.end)

  // start에서 시작해서 최대한 늘릴 수 있는 끝 지점(다음 예약/락, 2시간 상한, 마감시간 중 가장 빠른 것)
  const clampEnd = (start: number, candidateEnd: number) => {
    const durationCap = canLock ? TOTAL_MINUTES : MAX_DURATION
    let maxEnd = Math.min(candidateEnd, start + durationCap, TOTAL_MINUTES)
    for (const o of occupied) {
      if (o.start > start && o.start < maxEnd) maxEnd = o.start
    }
    return Math.max(maxEnd, start + SLOT_MINUTES)
  }

  const offsetFromPointer = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const relY = clientY - rect.top
    const minutes = (relY / HOUR_HEIGHT) * 60
    return Math.min(Math.max(Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES, 0), TOTAL_MINUTES - SLOT_MINUTES)
  }

  const isPastSlot = (start: number) => isToday && start + START_HOUR * 60 < nowMinutes

  // 조정 중인 예약 자신은 충돌 대상에서 제외한 다른 예약/락 목록
  const adjustOccupied = useMemo(
    () =>
      entries
        .filter((e) => !(e.type === 'BOOKING' && e.id === adjustingId))
        .map((e) => ({
          start: offsetFromStart(minutesOfDay(e.startTime)),
          end: offsetFromStart(minutesOfDay(e.endTime)),
        })),
    [entries, adjustingId],
  )

  const handleResizePointerDown = (e: React.PointerEvent, edge: 'start' | 'end') => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setResizingEdge(edge)
  }

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizingEdge) return
    e.stopPropagation()
    const slot = offsetFromPointer(e.clientY)
    setAdjustRange((prev) => {
      if (!prev) return prev
      if (resizingEdge === 'start') {
        let minStart = 0
        for (const o of adjustOccupied) {
          if (o.end <= prev.end && o.end > minStart) minStart = o.end
        }
        return { start: Math.min(Math.max(slot, minStart), prev.end - SLOT_MINUTES), end: prev.end }
      }
      let maxEnd = TOTAL_MINUTES
      for (const o of adjustOccupied) {
        if (o.start >= prev.start && o.start < maxEnd) maxEnd = o.start
      }
      return { start: prev.start, end: Math.max(Math.min(slot + SLOT_MINUTES, maxEnd), prev.start + SLOT_MINUTES) }
    })
  }

  const handleResizePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation()
    setResizingEdge(null)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDrag) return
    const slot = offsetFromPointer(e.clientY)
    if (isPastSlot(slot) || !isSlotFree(slot, slot + SLOT_MINUTES)) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragging(true)
    setSubmitError(null)
    setLockReason('')
    setDraftRange({ start: slot, end: slot + SLOT_MINUTES })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const slot = offsetFromPointer(e.clientY)
    if (!dragging) {
      setHoverSlot(canDrag && !isPastSlot(slot) && isSlotFree(slot, slot + SLOT_MINUTES) ? slot : null)
      return
    }
    setDraftRange((prev) => {
      if (!prev) return prev
      const candidateEnd = slot >= prev.start ? slot + SLOT_MINUTES : prev.start + SLOT_MINUTES
      return { start: prev.start, end: clampEnd(prev.start, candidateEnd) }
    })
  }

  const handlePointerUp = () => {
    if (dragging) setDragging(false)
  }

  const toggleMember = (memberId: number) => {
    if (memberId === myMemberId) return
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const cancelDraft = () => {
    setDraftRange(null)
    setSubmitError(null)
  }

  const confirmDraft = async () => {
    if (!draftRange || !roomId) return
    setSubmitting(true)
    setSubmitError(null)
    const startTime = `${dateKey}T${minutesToHHMM(draftRange.start + START_HOUR * 60)}:00`
    const endTime = `${dateKey}T${minutesToHHMM(draftRange.end + START_HOUR * 60)}:00`
    try {
      if (canLock) {
        await createLock({ roomId: Number(roomId), startTime, endTime, reason: lockReason || undefined })
      } else {
        await createBooking({ roomId: Number(roomId), startTime, endTime, memberIds: selectedIds })
      }
      setDraftRange(null)
      await fetchEntries()
    } catch (err) {
      const fallback = canLock ? '락 생성에 실패했습니다.' : '예약에 실패했습니다. 잠시 후 다시 시도해주세요.'
      setSubmitError(err instanceof BookingError || err instanceof AdminActionError ? err.message : fallback)
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

  const openAdjust = (entry: TimetableEntry) => {
    setAdjustingId(entry.id)
    setAdjustRange({
      start: offsetFromStart(minutesOfDay(entry.startTime)),
      end: offsetFromStart(minutesOfDay(entry.endTime)),
    })
    setActionError(null)
  }

  const closeAdjust = () => {
    setAdjustingId(null)
    setAdjustRange(null)
    setResizingEdge(null)
  }

  const submitAdjust = async (bookingId: number) => {
    if (!adjustRange) return
    setActionSubmitting(bookingId)
    setActionError(null)
    try {
      const startTime = `${dateKey}T${minutesToHHMM(adjustRange.start + START_HOUR * 60)}:00`
      const endTime = `${dateKey}T${minutesToHHMM(adjustRange.end + START_HOUR * 60)}:00`
      await adjustBooking(bookingId, startTime, endTime)
      closeAdjust()
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof AdminActionError ? err.message : '예약 조정에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleDeleteLock = async (lockId: number) => {
    if (!window.confirm('이 락을 취소할까요?')) return
    setDeletingLockId(lockId)
    setActionError(null)
    try {
      await deleteLock(lockId)
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof AdminActionError ? err.message : '락 취소에 실패했습니다.')
    } finally {
      setDeletingLockId(null)
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

  const canConfirm = canLock
    ? !!draftRange && !submitting
    : !!draftRange && selectedIds.length >= MIN_PARTICIPANTS && !submitting

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
        style={confirmPanelHeight ? { paddingBottom: confirmPanelHeight + 24 } : undefined}
      >
        <div className="date-nav">
          <button type="button" onClick={() => shiftDay(-1)} aria-label="이전 날짜">
            ‹
          </button>
          <span className="date-label">{formatDateLabel(date)}</span>
          <button type="button" onClick={() => shiftDay(1)} aria-label="다음 날짜">
            ›
          </button>
        </div>

        {currentCaption && <p className="current-caption">{currentCaption}</p>}
        {actionError && <p className="state-message is-error">{actionError}</p>}

        {user?.role === 'STUDENT' && isToday && isBeforeOpen && (
          <p className="state-message is-error">오늘 예약은 08:30부터 신청할 수 있습니다.</p>
        )}
        {user?.role === 'STUDENT' && canBook && (
          <p className="drag-hint">빈 시간대를 눌러서 아래로 드래그하면 예약 시간을 정할 수 있어요.</p>
        )}
        {canLock && adjustingId === null && (
          <p className="drag-hint">빈 시간대를 드래그하면 락을 걸 수 있어요. 락/취소 버튼은 각 블록에 있어요.</p>
        )}
        {adjustingId !== null && (
          <p className="drag-hint">블록 위아래 끝의 손잡이를 드래그해서 시간을 조정한 다음 저장을 눌러주세요.</p>
        )}

        {loading && <p className="state-message">불러오는 중...</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="timeline" style={{ height: TOTAL_HEIGHT }}>
              {HOURS.map((h, i) => (
                <div key={h} className="hour-row" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="hour-label">{h}:00</span>
                  <span className="hour-line" />
                </div>
              ))}

              {MINOR_TICKS.map((m) => (
                <div key={m} className="minor-line" style={{ top: offsetToTop(m) }} />
              ))}

              <div className="timeline-blocks">
                {entries.map((entry, i) => {
                  const isAdjustingThis = entry.type === 'BOOKING' && adjustingId === entry.id && !!adjustRange
                  const startOffset = isAdjustingThis
                    ? adjustRange!.start
                    : offsetFromStart(minutesOfDay(entry.startTime))
                  const endOffset = isAdjustingThis ? adjustRange!.end : offsetFromStart(minutesOfDay(entry.endTime))
                  const top = offsetToTop(startOffset)
                  const height = Math.max(offsetToTop(endOffset) - offsetToTop(startOffset), 20)
                  const isPast = new Date(entry.endTime).getTime() <= now.getTime()
                  const displayStart = isAdjustingThis
                    ? minutesToHHMM(adjustRange!.start + START_HOUR * 60)
                    : formatTime(entry.startTime)
                  const displayEnd = isAdjustingThis
                    ? minutesToHHMM(adjustRange!.end + START_HOUR * 60)
                    : formatTime(entry.endTime)
                  const submittingThis = actionSubmitting === entry.id

                  return (
                    <motion.div
                      key={`${entry.type}-${entry.id}`}
                      className={`timeline-block entry-${entry.type.toLowerCase()}${isPast ? ' is-past' : ''}${isAdjustingThis ? ' is-adjusting' : ''}`}
                      style={{ top, height }}
                      initial={{ opacity: 0, scaleY: reduceMotion ? 1 : 0.6 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
                    >
                      <span className="block-time">
                        {displayStart}–{displayEnd}
                      </span>
                      <span className="block-label">{entryLabel(entry)}</span>

                      {user?.role === 'TA' && entry.type === 'BOOKING' && (
                        <div className="admin-block-actions" onPointerDown={(e) => e.stopPropagation()}>
                          {adjustingId === entry.id ? (
                            <>
                              <button type="button" disabled={submittingThis} onClick={() => submitAdjust(entry.id)}>
                                저장
                              </button>
                              <button type="button" onClick={closeAdjust}>
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={submittingThis}
                                onClick={() => openAdjust(entry)}
                              >
                                조정
                              </button>
                              <button
                                type="button"
                                disabled={submittingThis}
                                onClick={() => handleCancelBooking(entry.id)}
                              >
                                취소
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {isAdjustingThis && !submittingThis && (
                        <>
                          <div
                            className="resize-handle resize-handle-top"
                            onPointerDown={(e) => handleResizePointerDown(e, 'start')}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                          />
                          <div
                            className="resize-handle resize-handle-bottom"
                            onPointerDown={(e) => handleResizePointerDown(e, 'end')}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                          />
                        </>
                      )}

                      {user?.role === 'TA' && entry.type === 'LOCK' && (
                        <div className="admin-block-actions" onPointerDown={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={deletingLockId === entry.id}
                            onClick={() => handleDeleteLock(entry.id)}
                          >
                            락 취소
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )
                })}

                {draftRange && (
                  <div
                    className="timeline-block draft-block"
                    style={{ top: offsetToTop(draftRange.start), height: offsetToTop(draftRange.end) - offsetToTop(draftRange.start) }}
                  >
                    <span className="block-time">
                      {minutesToHHMM(draftRange.start + START_HOUR * 60)}–
                      {minutesToHHMM(draftRange.end + START_HOUR * 60)}
                    </span>
                    <span className="block-label">{canLock ? '새 락' : '새 예약'}</span>
                  </div>
                )}
              </div>

              {hoverSlot !== null && !dragging && !draftRange && (
                <div
                  className="hover-slot"
                  style={{ top: offsetToTop(hoverSlot), height: offsetToTop(hoverSlot + SLOT_MINUTES) - offsetToTop(hoverSlot) }}
                />
              )}

              {nowTop !== null && (
                <div className="now-line" style={{ top: nowTop }}>
                  <span className="now-dot" />
                  <span className="now-time">
                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                  </span>
                </div>
              )}

              {canDrag && (
                <div
                  ref={trackRef}
                  className="drag-track"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={() => setHoverSlot(null)}
                />
              )}
            </div>

            {entries.length === 0 && <p className="empty-state">이 날짜엔 예약된 일정이 없습니다.</p>}
          </>
        )}
      </main>

      <AnimatePresence>
        {draftRange && (
          <motion.div
            ref={confirmPanelRef}
            className="confirm-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="confirm-panel-inner">
              <p className="confirm-range">
                {minutesToHHMM(draftRange.start + START_HOUR * 60)} ~ {minutesToHHMM(draftRange.end + START_HOUR * 60)}{' '}
                <span className="confirm-duration">({draftRange.end - draftRange.start}분)</span>
              </p>

              {canLock ? (
                <>
                  <p className="confirm-label">사유 (선택)</p>
                  <input
                    type="text"
                    className="lock-reason-input"
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    placeholder="예: 사무실 회의"
                  />
                </>
              ) : (
                <>
                  <p className="confirm-label">참여 인원 (최소 {MIN_PARTICIPANTS}명, 본인 포함)</p>
                  <div className="member-grid">
                    {roster.map((m) => {
                      const isMe = m.memberId === myMemberId
                      const checked = selectedIds.includes(m.memberId)
                      return (
                        <label
                          key={m.memberId}
                          className={`member-chip ${checked ? 'is-selected' : ''} ${isMe ? 'is-self' : ''}`}
                        >
                          <input type="checkbox" checked={checked} disabled={isMe} onChange={() => toggleMember(m.memberId)} />
                          {m.name}
                          {isMe && <span className="self-badge">본인</span>}
                        </label>
                      )
                    })}
                  </div>
                </>
              )}

              {submitError && <p className="form-error">{submitError}</p>}

              <div className="confirm-actions">
                <button type="button" className="cancel-button" onClick={cancelDraft} disabled={submitting}>
                  취소
                </button>
                <button type="button" className="confirm-button" onClick={confirmDraft} disabled={!canConfirm}>
                  {submitting ? '처리 중...' : canLock ? '락 걸기' : '확인'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
