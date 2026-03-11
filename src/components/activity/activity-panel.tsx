'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store/app-store'
import type { ActivityItem } from '@/lib/store/app-store'
import { X, Bell, AtSign, MessageSquare, Heart, CheckCheck, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 20

function ActivityItemRow({ item, onNavigate }: { item: ActivityItem; onNavigate: () => void }) {
  const { setCurrentChannelId, closeActivity, markActivityRead } = useAppStore()

  const senderName = item.message.sender?.display_name || 'Someone'
  const senderInitial = senderName[0]?.toUpperCase() || '?'
  const contentPreview = item.message.content
    .replace(/@[a-f0-9-]+/g, '@user')
    .slice(0, 120)

  function handleClick() {
    if (!item.read) markActivityRead(item.id)
    setCurrentChannelId(item.channelId)
    closeActivity()
    onNavigate()
  }

  const icon = {
    mention: <AtSign className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />,
    dm: <MessageSquare className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />,
    reaction: <Heart className="h-3.5 w-3.5" style={{ color: '#E55B5B' }} />,
    thread_reply: <MessageSquare className="h-3.5 w-3.5" style={{ color: '#7C5CFC' }} />,
  }[item.type]

  const label = {
    mention: 'mentioned you',
    dm: 'sent you a message',
    reaction: 'reacted to your message',
    thread_reply: 'replied to a thread',
  }[item.type]

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-4 py-3 transition-colors hover:bg-[#F5F2FF] group"
      style={{
        borderBottom: '1px solid #F0EBFF',
        background: !item.read ? '#EDE5FF' : undefined,
        borderLeft: !item.read ? '3px solid #7C5CFC' : '3px solid transparent',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {item.message.sender?.avatar_url ? (
          <img
            src={item.message.sender.avatar_url}
            alt={senderName}
            className="h-9 w-9 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: '#7C5CFC' }}
          >
            {senderInitial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {icon}
            <span
              className="text-[13px]"
              style={{ color: '#2D2B3D', fontWeight: !item.read ? 700 : 600 }}
            >
              {senderName}
            </span>
            <span className="text-[12px]" style={{ color: '#8E8EA0' }}>
              {label}
            </span>
          </div>

          <p
            className="text-[13px] truncate"
            style={{ color: !item.read ? '#2D2B3D' : '#4A4860' }}
          >
            {contentPreview}
          </p>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px]" style={{ color: '#8E8EA0' }}>
              #{item.channelName}
            </span>
            <span className="text-[11px]" style={{ color: '#C4C0D0' }}>
              &middot;
            </span>
            <span className="text-[11px]" style={{ color: '#8E8EA0' }}>
              {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
            </span>
          </div>
        </div>

        {!item.read && (
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0 mt-2"
            style={{ background: '#7C5CFC' }}
          />
        )}
      </div>
    </button>
  )
}

export function ActivityPanel() {
  const { activityOpen, activities, closeActivity, markAllActivitiesRead } = useAppStore()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Split into unread and read
  const { unreadItems, readItems } = useMemo(() => {
    const unread: ActivityItem[] = []
    const read: ActivityItem[] = []
    for (const a of activities) {
      if (!a.read) unread.push(a)
      else read.push(a)
    }
    return { unreadItems: unread, readItems: read }
  }, [activities])

  // Combined list: unread first, then read — with pagination
  const allOrdered = useMemo(() => [...unreadItems, ...readItems], [unreadItems, readItems])
  const visibleItems = allOrdered.slice(0, visibleCount)
  const hasMore = visibleCount < allOrdered.length
  const remainingCount = allOrdered.length - visibleCount

  if (!activityOpen) return null

  function handleShowMore() {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, allOrdered.length))
  }

  // Determine where the "Earlier" divider goes
  // It's the index where read items start within the visible list
  const unreadVisibleCount = Math.min(unreadItems.length, visibleCount)
  const showUnreadHeader = unreadItems.length > 0
  const showReadHeader = visibleCount > unreadItems.length && readItems.length > 0

  return (
    <div className="w-[380px] flex flex-col h-full" style={{ background: '#fff', borderRight: '1px solid #E5E1EE' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid #E5E1EE' }}>
        <div className="flex items-center gap-2">
          <Bell className="h-4.5 w-4.5" style={{ color: '#7C5CFC' }} />
          <h3 className="font-bold text-[16px]" style={{ color: '#2D2B3D' }}>Activity</h3>
          {unreadItems.length > 0 && (
            <span
              className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-white"
              style={{ background: '#7C5CFC' }}
            >
              {unreadItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadItems.length > 0 && (
            <button
              onClick={markAllActivitiesRead}
              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors hover:bg-[#F5F2FF]"
              style={{ color: '#7C5CFC' }}
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark read</span>
            </button>
          )}
          <button
            onClick={closeActivity}
            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F5F2FF]"
          >
            <X className="h-4 w-4" style={{ color: '#8E8EA0' }} />
          </button>
        </div>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: '#EDE5FF' }}
            >
              <Bell className="h-7 w-7" style={{ color: '#7C5CFC' }} />
            </div>
            <h4 className="text-[15px] font-semibold mb-1" style={{ color: '#2D2B3D' }}>
              No activity yet
            </h4>
            <p className="text-[13px]" style={{ color: '#8E8EA0' }}>
              When someone mentions you with @, sends you a DM, or reacts to your messages, it will show up here.
            </p>
          </div>
        ) : (
          <>
            {/* Unread section */}
            {showUnreadHeader && (
              <div
                className="px-4 py-2 flex items-center gap-2 sticky top-0 z-10"
                style={{ background: '#F5F2FF', borderBottom: '1px solid #E5E1EE' }}
              >
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#7C5CFC' }} />
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#7C5CFC' }}>
                  New ({unreadItems.length})
                </span>
              </div>
            )}

            {visibleItems.slice(0, unreadVisibleCount).map((item) => (
              <ActivityItemRow key={item.id} item={item} onNavigate={() => {}} />
            ))}

            {/* Read section */}
            {showReadHeader && (
              <div
                className="px-4 py-2 flex items-center gap-2"
                style={{ background: '#FAFAFA', borderBottom: '1px solid #F0EBFF', borderTop: '1px solid #F0EBFF' }}
              >
                <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: '#8E8EA0' }}>
                  Earlier
                </span>
              </div>
            )}

            {visibleItems.slice(unreadVisibleCount).map((item) => (
              <ActivityItemRow key={item.id} item={item} onNavigate={() => {}} />
            ))}

            {/* Show more button */}
            {hasMore && (
              <button
                onClick={handleShowMore}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium transition-colors hover:bg-[#F5F2FF]"
                style={{ color: '#7C5CFC', borderTop: '1px solid #F0EBFF' }}
              >
                <ChevronDown className="h-4 w-4" />
                Show more ({remainingCount} remaining)
              </button>
            )}

            {/* Bottom spacer for "all loaded" */}
            {!hasMore && allOrdered.length > PAGE_SIZE && (
              <div className="px-4 py-3 text-center">
                <span className="text-[12px]" style={{ color: '#C4C0D0' }}>
                  All {allOrdered.length} activities loaded
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
