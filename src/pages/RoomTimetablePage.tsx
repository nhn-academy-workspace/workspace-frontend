import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getRoomBookings, getRooms, type Room, type TimetableEntry } from '../api/rooms'
import { getMyTeamRoster, type TeamMember } from '../api/teams'
import {
  createBooking,
  extendBooking,
  earlyReturnBooking,
  cancelBooking as cancelMyBooking,
  BookingError,
} from '../api/bookings'
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
const HOUR_HEIGHT = 72 // px per hour
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60
const TOTAL_HEIGHT = (TOTAL_MINUTES / 60) * HOUR_HEIGHT
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
// 15분 간격 보조선 (정시 제외). :30 은 조금 진하게(is-half).
const MINOR_TICKS = Array.from({ length: TOTAL_MINUTES / 15 }, (_, i) => i * 15).filter(
  (m) => m % 60 !== 0,
)
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
  if (entry.type === 'BOOKING') return `${entry.teamName}`
  // 락 블록은 색(amber)으로 이미 TA 업무임이 구분되므로, 좁은 칸에서는 사유만 보여준다
  return entry.reason || 'TA 업무'
}

type SheetKind = 'book' | 'lock' | 'adjust-booking' | 'adjust-lock' | 'extend'

interface Sheet {
  kind: SheetKind
  entryId: number | null
  start: number // offset minutes (0 = START_HOUR)
  end: number
  minEnd?: number // extend: 원래 종료 시각 — 그보다 앞으로는 못 당김
}

interface Range {
  start: number
  end: number
}

const isFreeWith = (occ: Range[], start: number, end: number) =>
  occ.every((o) => end <= o.start || start >= o.end)

const SHEET_META: Record<SheetKind, { title: string; confirm: string }> = {
  book: { title: '새 예약', confirm: '예약' },
  lock: { title: 'TA 업무 등록', confirm: '등록' },
  'adjust-booking': { title: '예약 시간 조정', confirm: '저장' },
  'adjust-lock': { title: 'TA 업무 조정', confirm: '저장' },
  extend: { title: '예약 연장', confirm: '연장' },
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
  const [sheetClosing, setSheetClosing] = useState(false)
  const sheetCloseTimer = useRef<number | null>(null)
  // 드래그로 시간대를 그려 예약: 진행 중 범위 미리보기 + 제스처 상태
  const [dragRange, setDragRange] = useState<Range | null>(null)
  const dragInfo = useRef<{ startOffset: number; kind: SheetKind; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [lockReason, setLockReason] = useState('')
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [myMemberId, setMyMemberId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [actionSubmitting, setActionSubmitting] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // pinned=false: 마우스 hover로 잠깐 뜬 상태(정보만) / pinned=true: 클릭으로 고정(조작 버튼까지)
  const [infoEntry, setInfoEntry] = useState<{
    entry: TimetableEntry
    x: number
    y: number
    pinned: boolean
  } | null>(null)

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

  // 시트를 슬라이드다운시킨 뒤(약 190ms) 실제로 언마운트한다. 갑자기 사라지지 않게.
  const closeSheet = () => {
    setSheetClosing(true)
    if (sheetCloseTimer.current) window.clearTimeout(sheetCloseTimer.current)
    sheetCloseTimer.current = window.setTimeout(() => {
      setSheet(null)
      setSheetClosing(false)
      sheetCloseTimer.current = null
    }, 190)
  }
  const cancelPendingClose = () => {
    if (sheetCloseTimer.current) {
      window.clearTimeout(sheetCloseTimer.current)
      sheetCloseTimer.current = null
    }
    setSheetClosing(false)
  }

  useEffect(
    () => () => {
      if (sheetCloseTimer.current) window.clearTimeout(sheetCloseTimer.current)
    },
    [],
  )

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
    cancelPendingClose()
    setInfoEntry(null)
    setDragRange(null)
    dragInfo.current = null
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

  const presets =
    sheet?.kind === 'lock' || sheet?.kind === 'adjust-lock' ? LOCK_PRESETS : BOOKING_PRESETS

  // 학생 예약(book)은 오늘 날짜라도 이미 지난 시각을 시작으로 잡을 수 없다.
  // openSheet(최초 진입)뿐 아니라 nudgeStart(스텝퍼로 시작을 앞당기는 조작)에도 같은 하한을 적용해야
  // 스텝퍼로 과거 시각까지 밀어넣는 걸 막을 수 있다.
  const minStartOffset = (kind: SheetKind) =>
    kind === 'book' && isToday
      ? clampNum(snap(offsetFromStart(nowMinutes)), 0, TOTAL_MINUTES - STEP)
      : 0

  const defaultStartOffset = () => {
    if (isToday) return clampNum(snap(offsetFromStart(nowMinutes)), 0, TOTAL_MINUTES - STEP)
    return 0
  }

  // 시작 시각 이후 가장 먼저 시작하는 일정(예약·락 모두)의 시각.
  // draft 종료 기본값을 여기까지로 제한해서, 뒤 일정을 밀고 들어가는 제안을 하지 않는다.
  const nextEntryStartAfter = (startOffset: number, selfId: number | null) => {
    let bound = TOTAL_MINUTES
    for (const e of entries) {
      if (selfId !== null && e.id === selfId) continue
      const s = offsetFromStart(minutesOfDay(e.startTime))
      if (s > startOffset && s < bound) bound = s
    }
    return bound
  }

  const DEFAULT_DURATION = 60

  // rawEndOffset 를 주면(드래그) 그 길이로, 없으면 기본 1시간으로 종료를 잡는다.
  const openSheet = (kind: SheetKind, rawStartOffset: number, rawEndOffset?: number) => {
    const occ = occupiedFor(kind, null)
    const maxDur = kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
    let start = clampNum(snap(rawStartOffset), 0, TOTAL_MINUTES - STEP)
    start = Math.max(start, minStartOffset(kind))
    // 시작 지점이 이미 점유돼 있으면 그다음 빈 자리로 밀어준다
    for (const o of occ) if (start >= o.start && start < o.end) start = o.end
    start = clampNum(start, 0, TOTAL_MINUTES - STEP)

    // 다음 일정 시작 전까지(30분 뒤에 예약이 있으면 30분)로 자름
    const hardEnd = Math.min(start + maxDur, TOTAL_MINUTES, nextEntryStartAfter(start, null))
    let end =
      rawEndOffset != null
        ? clampNum(snap(rawEndOffset), start + STEP, hardEnd)
        : Math.min(start + DEFAULT_DURATION, hardEnd)
    end = Math.max(end, start + STEP)

    cancelPendingClose()
    setSubmitError(null)
    setLockReason('')
    setInfoEntry(null)
    setSheet({ kind, entryId: null, start, end })
  }

  const openAdjust = (entry: TimetableEntry) => {
    cancelPendingClose()
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

  const openExtend = (entry: TimetableEntry) => {
    cancelPendingClose()
    setSubmitError(null)
    setInfoEntry(null)
    const end = offsetFromStart(minutesOfDay(entry.endTime))
    setSheet({
      kind: 'extend',
      entryId: entry.id,
      start: offsetFromStart(minutesOfDay(entry.startTime)),
      end,
      minEnd: end,
    })
  }

  const parseHHMM = (v: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
    if (!m) return null
    const h = Number(m[1])
    const mm = Number(m[2])
    if (h > 23 || mm > 59) return null
    return h * 60 + mm
  }

  // 원하는 시작/종료(분 offset)를 받아 격자(5분)·운영시간·2시간 상한·충돌·지난 시각까지 반영한 값으로 보정한다.
  const resolveStart = (s: Sheet, rawOffset: number) => {
    let lo = Math.max(
      minStartOffset(s.kind),
      s.end - (s.kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES),
    )
    for (const o of occupiedFor(s.kind, s.entryId)) if (o.start < s.end && o.end > lo) lo = o.end
    return clampNum(snap(rawOffset), lo, s.end - STEP)
  }

  const resolveEnd = (s: Sheet, rawOffset: number) => {
    const floor = s.kind === 'extend' ? (s.minEnd ?? s.start + STEP) : s.start + STEP
    // 예약(book)·연장(extend)은 시작으로부터 최대 2시간. 연장은 다음 일정 전까지도 제한.
    const bookingCap =
      s.kind === 'book' || s.kind === 'extend' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
    const hardMax = Math.min(
      s.start + bookingCap,
      TOTAL_MINUTES,
      s.kind === 'extend' ? nextEntryStartAfter(s.start, s.entryId) : TOTAL_MINUTES,
    )
    const occ = occupiedFor(s.kind, s.entryId)
    let ne = clampNum(snap(rawOffset), floor, hardMax)
    if (!isFreeWith(occ, s.start, ne)) {
      let bound = hardMax
      for (const o of occ) if (o.start >= s.start && o.start < bound) bound = o.start
      ne = clampNum(bound, floor, hardMax)
    }
    return ne
  }

  const setDuration = (mins: number) =>
    setSheet((s) => (s ? { ...s, end: resolveEnd(s, s.start + mins) } : s))
  const presetFits = (mins: number) =>
    !!sheet && resolveEnd(sheet, sheet.start + mins) === sheet.start + mins

  // 시각을 클릭하면 뜨는 드롭다운의 선택지 = 5분 격자 중 그 자리에 실제로 지정 가능한 값만.
  // resolve*(sheet, m) === m 인지로 걸러서 격자·운영시간·최대길이·충돌 규칙을 그대로 재사용한다.
  const startOptions = useMemo(() => {
    if (!sheet || sheet.kind === 'extend') return []
    const out: number[] = []
    for (let m = 0; m <= TOTAL_MINUTES - STEP; m += STEP) {
      if (resolveStart(sheet, m) === m) out.push(m)
    }
    if (!out.includes(sheet.start)) out.push(sheet.start)
    return out.sort((a, b) => a - b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, entries, isToday, nowMinutes])

  const endOptions = useMemo(() => {
    if (!sheet) return []
    const out: number[] = []
    for (let m = STEP; m <= TOTAL_MINUTES; m += STEP) {
      if (resolveEnd(sheet, m) === m) out.push(m)
    }
    if (!out.includes(sheet.end)) out.push(sheet.end)
    return out.sort((a, b) => a - b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, entries, isToday, nowMinutes])

  const pickStart = (hhmm: string) => {
    const p = parseHHMM(hhmm)
    if (p != null) setSheet((s) => (s ? { ...s, start: resolveStart(s, offsetFromStart(p)) } : s))
  }
  const pickEnd = (hhmm: string) => {
    const p = parseHHMM(hhmm)
    if (p != null) setSheet((s) => (s ? { ...s, end: resolveEnd(s, offsetFromStart(p)) } : s))
  }

  // 시트가 열린 상태에서 타임라인을 누르면 draft를 그 시각으로 옮긴다 = '시작 지점을 다시 고르는' 동작.
  // 새 예약/락(entryId 없음)이면 기본 1시간으로 다시 잡고(이전에 충돌로 30분이었어도 리셋),
  // 기존 예약 조정(entryId 있음)이면 원래 길이를 유지한다. 둘 다 다음 일정 전까지로 자른다.
  const moveSheetTo = (rawOffset: number) =>
    setSheet((s) => {
      if (!s) return s
      const dur = s.entryId === null ? DEFAULT_DURATION : s.end - s.start
      const maxDur = s.kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
      const occ = occupiedFor(s.kind, s.entryId)
      const lo = minStartOffset(s.kind)
      let start = clampNum(snap(rawOffset), lo, TOTAL_MINUTES - STEP)
      for (const o of occ) if (start >= o.start && start < o.end) start = o.end
      start = clampNum(start, lo, TOTAL_MINUTES - STEP)
      const end = Math.max(
        Math.min(start + dur, start + maxDur, TOTAL_MINUTES, nextEntryStartAfter(start, s.entryId)),
        start + STEP,
      )
      return { ...s, start, end }
    })

  const offsetFromPointer = (clientY: number) => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return null
    return ((clientY - rect.top) / HOUR_HEIGHT) * 60
  }

  // 드래그로 그린 두 지점을 격자·운영시간·최대길이·충돌(다음 블록 앞에서 멈춤) 반영한 범위로 보정
  const clampDragRange = (kind: SheetKind, a: number, b: number): Range => {
    const lo = minStartOffset(kind)
    const occ = occupiedFor(kind, null)
    let start = clampNum(snap(Math.min(a, b)), lo, TOTAL_MINUTES - STEP)
    for (const o of occ) if (start >= o.start && start < o.end) start = o.end
    start = clampNum(start, lo, TOTAL_MINUTES - STEP)
    const maxDur = kind === 'book' ? MAX_BOOKING_MINUTES : TOTAL_MINUTES
    let end = clampNum(snap(Math.max(a, b)), start + STEP, Math.min(start + maxDur, TOTAL_MINUTES))
    for (const o of occ) if (o.start >= start && o.start < end) end = o.start
    return { start, end }
  }

  const handleTimelinePointerDown = (e: React.PointerEvent) => {
    if (sheet || (!canBook && !canLock)) return
    if ((e.target as HTMLElement).closest('.timeline-block:not(.draft-block)')) return
    const off = offsetFromPointer(e.clientY)
    if (off == null) return
    dragInfo.current = {
      startOffset: clampNum(snap(off), 0, TOTAL_MINUTES - STEP),
      kind: canLock ? 'lock' : 'book',
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const handleTimelinePointerMove = (e: React.PointerEvent) => {
    const d = dragInfo.current
    if (!d) return
    const off = offsetFromPointer(e.clientY)
    if (off == null) return
    if (Math.abs(off - d.startOffset) >= STEP) d.moved = true
    if (d.moved) setDragRange(clampDragRange(d.kind, d.startOffset, off))
  }

  const endTimelineDrag = (e: React.PointerEvent) => {
    const d = dragInfo.current
    dragInfo.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (d?.moved) {
      const off = offsetFromPointer(e.clientY)
      const r = off != null ? clampDragRange(d.kind, d.startOffset, off) : dragRange
      suppressClick.current = true // 이어서 오는 click(=탭 예약)이 덧붙지 않도록
      if (r) openSheet(d.kind, r.start, r.end)
    }
    setDragRange(null)
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setInfoEntry(null)
    const offset = offsetFromPointer(e.clientY)
    if (offset == null) return
    if (sheet) {
      moveSheetTo(offset)
      return
    }
    if (!canBook && !canLock) return
    openSheet(canLock ? 'lock' : 'book', offset)
  }

  // 블록 위에 마우스를 올리면 정보만 잠깐 띄운다(고정 아님).
  const handleBlockHover = (e: React.MouseEvent, entry: TimetableEntry) => {
    setInfoEntry((prev) =>
      prev?.pinned ? prev : { entry, x: e.clientX, y: e.clientY, pinned: false },
    )
  }
  const handleBlockLeave = (entry: TimetableEntry) => {
    setInfoEntry((prev) => (prev && !prev.pinned && prev.entry.id === entry.id ? null : prev))
  }

  // 블록을 클릭하면 팝오버를 고정(조작 버튼 노출). 시트가 열려 있으면 먼저 자연스럽게 닫는다.
  const handleBlockClick = (e: React.MouseEvent, entry: TimetableEntry) => {
    e.stopPropagation()
    if (sheet) closeSheet()
    setInfoEntry((prev) =>
      prev?.pinned && prev.entry.id === entry.id
        ? null
        : { entry, x: e.clientX, y: e.clientY, pinned: true },
    )
  }

  const toggleMember = (memberId: number) => {
    if (memberId === myMemberId) return
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    )
  }

  const allSelected = roster.length > 0 && roster.every((m) => selectedIds.includes(m.memberId))
  const toggleAllMembers = () =>
    setSelectedIds(
      allSelected ? (myMemberId !== null ? [myMemberId] : []) : roster.map((m) => m.memberId),
    )

  const confirmSheet = async () => {
    if (!sheet || !roomId) return
    setSubmitting(true)
    setSubmitError(null)
    const startTime = `${dateKey}T${minutesToHHMM(sheet.start + START_HOUR * 60)}:00`
    const endTime = `${dateKey}T${minutesToHHMM(sheet.end + START_HOUR * 60)}:00`
    try {
      if (sheet.kind === 'book') {
        await createBooking({
          roomId: Number(roomId),
          startTime,
          endTime,
          memberIds: selectedIds,
        })
      } else if (sheet.kind === 'lock') {
        await createLock({
          roomId: Number(roomId),
          startTime,
          endTime,
          reason: lockReason || undefined,
        })
      } else if (sheet.kind === 'adjust-booking') {
        await adjustBooking(sheet.entryId!, startTime, endTime)
      } else if (sheet.kind === 'extend') {
        await extendBooking(sheet.entryId!, endTime)
      } else {
        await updateLock(sheet.entryId!, {
          roomId: Number(roomId),
          startTime,
          endTime,
          reason: lockReason || undefined,
        })
      }
      closeSheet()
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
    if (!window.confirm('이 예약을 취소하시겠습니까?')) return
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
    if (!window.confirm('이 TA 업무를 삭제하시겠습니까?')) return
    setActionSubmitting(lockId)
    setActionError(null)
    try {
      await deleteLock(lockId)
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof AdminActionError ? err.message : 'TA 업무 삭제에 실패했습니다.')
    } finally {
      setActionSubmitting(null)
    }
  }

  // 학생: 본인 팀 예약 조기 반납 / 취소 (연장은 sheet로)
  const runMyBookingAction = async (
    bookingId: number,
    fn: () => Promise<unknown>,
    fallback: string,
  ) => {
    setActionSubmitting(bookingId)
    setActionError(null)
    setInfoEntry(null)
    try {
      await fn()
      await fetchEntries()
    } catch (err) {
      setActionError(err instanceof BookingError ? err.message : fallback)
    } finally {
      setActionSubmitting(null)
    }
  }

  const handleMyEarlyReturn = (bookingId: number) => {
    if (!window.confirm('지금 조기 반납하시겠습니까?')) return
    runMyBookingAction(bookingId, () => earlyReturnBooking(bookingId), '조기 반납에 실패했습니다.')
  }

  const handleMyCancel = (bookingId: number) => {
    if (!window.confirm('이 예약을 취소하시겠습니까?')) return
    runMyBookingAction(bookingId, () => cancelMyBooking(bookingId), '예약 취소에 실패했습니다.')
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
  const currentCaption = !nowInRange
    ? null
    : !currentEntry
      ? '현재 비어 있음'
      : currentEntry.type === 'BOOKING'
        ? `${currentEntry.teamName} 사용 중`
        : currentEntry.reason
          ? `TA 업무 중 · ${currentEntry.reason}`
          : 'TA 업무 중'

  const durationMins = sheet ? sheet.end - sheet.start : 0
  const canConfirm =
    !!sheet &&
    !submitting &&
    durationMins >= STEP &&
    (sheet.kind !== 'book' || selectedIds.length >= MIN_PARTICIPANTS) &&
    (sheet.kind !== 'extend' || sheet.end > (sheet.minEnd ?? 0))

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
          <p className="state-message is-error">예약은 08:30부터 신청할 수 있습니다.</p>
        )}
        {isStudent && !isToday && <p className="drag-hint">예약은 당일만 가능합니다.</p>}

        {!loading && !error && (canBook || canLock) && !sheet && (
          <button
            type="button"
            className="add-cta"
            onClick={() => openSheet(canLock ? 'lock' : 'book', defaultStartOffset())}
          >
            {canLock ? 'TA 업무 등록' : '예약 추가'}
          </button>
        )}
        {(canBook || canLock) && (
          <p className="drag-hint">
            빈 시간대를 누르거나 드래그해서 지정{isTA ? ', 블록을 눌러 상세·조정' : ''}할 수 있습니다.
          </p>
        )}

        {loading && <p className="state-message">불러오는 중</p>}
        {error && <p className="state-message is-error">{error}</p>}

        {!loading && !error && (
          <>
            <div
              ref={timelineRef}
              className={`timeline${canBook || canLock ? ' is-tappable' : ''}`}
              style={{ height: TOTAL_HEIGHT }}
              onClick={handleTimelineClick}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={endTimelineDrag}
              onPointerCancel={endTimelineDrag}
            >
              {HOURS.map((h, i) => (
                <div key={h} className="hour-row" style={{ top: i * HOUR_HEIGHT }}>
                  <span className="hour-label">{h}:00</span>
                  <span className="hour-line" />
                </div>
              ))}

              {MINOR_TICKS.map((m) => (
                <div
                  key={m}
                  className={`minor-line${m % 30 === 0 ? ' is-half' : ''}`}
                  style={{ top: offsetToTop(m) }}
                />
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
                      className={`timeline-block entry-${entry.type.toLowerCase()}${isPast ? ' is-past' : ''}${dim ? ' is-compact' : ''}${busy ? ' is-busy' : ''}${infoEntry?.entry.id === entry.id ? ' is-hovered' : ''} is-clickable`}
                      style={{ top, height }}
                      onClick={(e) => handleBlockClick(e, entry)}
                      onMouseEnter={(e) => handleBlockHover(e, entry)}
                      onMouseLeave={() => handleBlockLeave(entry)}
                    >
                      <span className="block-time">
                        {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                      </span>
                      <span className="block-label">{entryLabel(entry)}</span>
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
                      {minutesToHHMM(sheet.start + START_HOUR * 60)}–
                      {minutesToHHMM(sheet.end + START_HOUR * 60)}
                    </span>
                    <span className="block-label">{SHEET_META[sheet.kind].title}</span>
                  </div>
                )}

                {dragRange && !sheet && (
                  <div
                    className="timeline-block draft-block"
                    style={{
                      top: offsetToTop(dragRange.start),
                      height: Math.max(offsetToTop(dragRange.end) - offsetToTop(dragRange.start), 20),
                    }}
                  >
                    <span className="block-time">
                      {minutesToHHMM(dragRange.start + START_HOUR * 60)}–
                      {minutesToHHMM(dragRange.end + START_HOUR * 60)}
                    </span>
                    <span className="block-label">{canLock ? 'TA 업무' : '새 예약'}</span>
                  </div>
                )}
              </div>

              {nowTop !== null && (
                <div className="now-line" style={{ top: nowTop }}>
                  <span className="now-dot" />
                  <span className="now-time">
                    {String(now.getHours()).padStart(2, '0')}:
                    {String(now.getMinutes()).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {entries.length === 0 && <p className="empty-state">예약이 없습니다.</p>}
          </>
        )}
      </main>

      {sheet && (
        <div ref={sheetRef} className={`sheet${sheetClosing ? ' is-closing' : ''}`}>
          <div className="sheet-inner">
            <p className="sheet-title">{SHEET_META[sheet.kind].title}</p>

            <div className="field-row">
              <span className="field-label">시작</span>
              {sheet.kind === 'extend' ? (
                <span className="field-static">{minutesToHHMM(sheet.start + START_HOUR * 60)}</span>
              ) : (
                <select
                  className="time-select"
                  value={minutesToHHMM(sheet.start + START_HOUR * 60)}
                  onChange={(e) => pickStart(e.target.value)}
                  aria-label="시작 시각"
                >
                  {startOptions.map((m) => {
                    const t = minutesToHHMM(m + START_HOUR * 60)
                    return (
                      <option key={m} value={t}>
                        {t}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            <div className="field-row">
              <span className="field-label">{sheet.kind === 'extend' ? '새 종료' : '종료'}</span>
              <select
                className="time-select"
                value={minutesToHHMM(sheet.end + START_HOUR * 60)}
                onChange={(e) => pickEnd(e.target.value)}
                aria-label="종료 시각"
              >
                {endOptions.map((m) => {
                  const t = minutesToHHMM(m + START_HOUR * 60)
                  return (
                    <option key={m} value={t}>
                      {t}
                    </option>
                  )
                })}
              </select>
            </div>

            {sheet.kind !== 'extend' && (
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
            )}

            <p className="sheet-range">
              {sheet.kind === 'extend' && sheet.minEnd !== undefined ? (
                <>
                  {minutesToHHMM(sheet.minEnd + START_HOUR * 60)} →{' '}
                  {minutesToHHMM(sheet.end + START_HOUR * 60)}
                  <span className="sheet-date">
                    {' '}
                    · {formatDuration(sheet.end - sheet.minEnd)} 연장
                  </span>
                </>
              ) : (
                <>
                  {minutesToHHMM(sheet.start + START_HOUR * 60)}–
                  {minutesToHHMM(sheet.end + START_HOUR * 60)}
                  <span className="sheet-date">
                    {' '}
                    · {formatDuration(durationMins)} · {formatDateLabel(date)}
                  </span>
                </>
              )}
            </p>

            {(sheet.kind === 'lock' || sheet.kind === 'adjust-lock') && (
              <input
                type="text"
                className="lock-reason-input"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="사유 (선택)"
              />
            )}

            {sheet.kind === 'book' && (
              <>
                <div className="confirm-label-row">
                  <p className="confirm-label">참여 인원 · 본인 포함 {MIN_PARTICIPANTS}명 이상</p>
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
              <button
                type="button"
                className="cancel-button"
                onClick={closeSheet}
                disabled={submitting}
              >
                취소
              </button>
              <button
                type="button"
                className="confirm-button"
                onClick={confirmSheet}
                disabled={!canConfirm}
              >
                {submitting ? '처리 중' : SHEET_META[sheet.kind].confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {infoEntry && (
        <div
          className={`entry-popover${infoEntry.pinned ? ' is-pinned' : ''}`}
          style={{
            left: `min(${infoEntry.x + 14}px, calc(100vw - 220px))`,
            top: `min(${infoEntry.y - 12}px, calc(100vh - 140px))`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="popover-team">
            {infoEntry.entry.type === 'BOOKING' ? infoEntry.entry.teamName : 'TA 업무'}
          </p>
          <p className="popover-time">
            {formatTime(infoEntry.entry.startTime)} – {formatTime(infoEntry.entry.endTime)}
          </p>
          {infoEntry.entry.type === 'BOOKING' ? (
            infoEntry.entry.memberNames && infoEntry.entry.memberNames.length > 0 ? (
              <p className="popover-members">{infoEntry.entry.memberNames.join(' · ')}</p>
            ) : (
              <p className="popover-members is-empty">참여자 정보 없음</p>
            )
          ) : (
            <p className={`popover-members${infoEntry.entry.reason ? '' : ' is-empty'}`}>
              {infoEntry.entry.reason || '사유 없음'}
            </p>
          )}

          {infoEntry.pinned &&
            (() => {
              const e = infoEntry.entry
              const busy = actionSubmitting === e.id
              const nowMs = now.getTime()
              const startMs = new Date(e.startTime).getTime()
              const endMs = new Date(e.endTime).getTime()
              const phase = nowMs < startMs ? 'upcoming' : nowMs < endMs ? 'ongoing' : 'past'

              if (isTA) {
                return (
                  <div className="popover-actions">
                    <button type="button" disabled={!!sheet || busy} onClick={() => openAdjust(e)}>
                      조정
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={busy}
                      onClick={() => {
                        setInfoEntry(null)
                        if (e.type === 'LOCK') handleDeleteLock(e.id)
                        else handleCancelBooking(e.id)
                      }}
                    >
                      {e.type === 'LOCK' ? '삭제' : '취소'}
                    </button>
                  </div>
                )
              }

              const own =
                isStudent &&
                e.type === 'BOOKING' &&
                e.teamName === user?.teamName &&
                phase !== 'past'
              if (!own) {
                return (
                  <button
                    type="button"
                    className="popover-close"
                    onClick={() => setInfoEntry(null)}
                  >
                    닫기
                  </button>
                )
              }

              // 예약을 아직 늘릴 여지가 있는지: 최대 2시간 / 다음 일정 / 운영시간(18:00) 안에서
              const eStart = offsetFromStart(minutesOfDay(e.startTime))
              const eEnd = offsetFromStart(minutesOfDay(e.endTime))
              const extendCeil = Math.min(
                eStart + MAX_BOOKING_MINUTES,
                TOTAL_MINUTES,
                nextEntryStartAfter(eStart, e.id),
              )
              const canExtend = eEnd < extendCeil

              return (
                <div className="popover-actions">
                  {canExtend && (
                    <button type="button" disabled={busy || !!sheet} onClick={() => openExtend(e)}>
                      연장
                    </button>
                  )}
                  {phase === 'ongoing' && (
                    <button type="button" disabled={busy} onClick={() => handleMyEarlyReturn(e.id)}>
                      조기 반납
                    </button>
                  )}
                  {phase === 'upcoming' && (
                    <button
                      type="button"
                      className="is-danger"
                      disabled={busy}
                      onClick={() => handleMyCancel(e.id)}
                    >
                      예약 취소
                    </button>
                  )}
                </div>
              )
            })()}
        </div>
      )}
    </div>
  )
}
